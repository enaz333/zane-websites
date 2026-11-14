"""Durable local application builds with an independently checked artifact boundary."""
import html
import hashlib
import json
import re
import shutil
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from typing import Protocol

ROOT = Path(__file__).resolve().parents[1]
CAPABILITIES = {"interactive": "review", "worker-api": "approval", "database": "approval",
                "storage": "approval", "authentication": "approval", "external-api": "approval",
                "payments": "approval", "scheduled-work": "approval", "realtime": "approval",
                "mapping": "approval", "media": "approval", "ai": "approval", "webxr": "review"}
FILES = {"index.html", "style.css", "app.mjs", "model.mjs"}
VERSION = "studio-local-2"
NODE = shutil.which("node")


class Provider(Protocol):
    identity: str

    def generate(self, specification: dict, previous: dict[str, str]) -> dict[str, str]:
        """Return a complete proposed file map. Never receives credentials or filesystem access."""


class FixtureProvider:
    identity = "deterministic-collection-1"

    def generate(self, specification, previous):
        template = specification.get("template", "collection")
        if template not in {"collection", "habits"}:
            raise ValueError("unsupported_template")
        files = {name: (ROOT / "studio_engine/fixtures" / template / name).read_text()
                 for name in FILES}
        if "name" in specification:
            heading = "Collected" if template == "collection" else "Daily practice"
            files["index.html"] = files["index.html"].replace(
                "<h1>" + heading + "</h1>", "<h1>" + html.escape(specification["name"]) + "</h1>")
        return files


def validate_spec(spec):
    if not isinstance(spec, dict) or set(spec) - {"slug", "name", "description", "capabilities", "template"} or not {"slug", "name", "description", "capabilities"} <= set(spec):
        raise ValueError("invalid_specification")
    if not isinstance(spec["slug"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{2,39}", spec["slug"]):
        raise ValueError("invalid_slug")
    reserved = json.loads((ROOT / "workers/studio-paths.json").read_text())
    if spec["slug"] in reserved or spec["slug"].startswith("stage-"):
        raise ValueError("reserved_slug")
    for field, limit in (("name", 100), ("description", 4000)):
        if not isinstance(spec[field], str) or not 1 <= len(spec[field].strip()) <= limit:
            raise ValueError("invalid_specification")
    if spec.get("template", "collection") not in {"collection", "habits"}:
        raise ValueError("unsupported_template")
    caps = spec["capabilities"]
    if not isinstance(caps, list) or not caps or any(not isinstance(c, str) or c not in CAPABILITIES for c in caps):
        raise ValueError("invalid_capabilities")
    if set(caps) != {"interactive"}:
        raise ValueError("capability_requires_adapter_and_approval")


def validate_files(files, specification=None):
    if not isinstance(files, dict) or set(files) != FILES:
        raise ValueError("invalid_artifact_paths")
    if any(not isinstance(value, str) or len(value.encode()) > 100_000 for value in files.values()):
        raise ValueError("artifact_size_limit")
    # This local executor only accepts the reviewed fixture. Arbitrary code requires a sandbox adapter.
    approved = FixtureProvider().generate(specification or {}, {})
    if files != approved:
        raise ValueError("unreviewed_executable_artifact")


def digest(files):
    return hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()


class Engine:
    def __init__(self, directory):
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.directory / "studio.sqlite")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS projects(
            slug TEXT PRIMARY KEY, specification TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS runs(
            id TEXT PRIMARY KEY, slug TEXT NOT NULL, parent INTEGER NOT NULL,
            state TEXT NOT NULL, diagnostic TEXT, provider TEXT NOT NULL, digest TEXT,
            request TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
          CREATE UNIQUE INDEX IF NOT EXISTS one_active ON runs(slug) WHERE state='running';
          CREATE TABLE IF NOT EXISTS events(
            run_id TEXT NOT NULL, phase TEXT NOT NULL, occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        """)

        columns = {row["name"] for row in self.db.execute("PRAGMA table_info(runs)")}
        if "message" not in columns:
            self.db.execute("ALTER TABLE runs ADD COLUMN message TEXT NOT NULL DEFAULT ''")
        self.db.commit()

    def close(self):
        self.db.close()

    def event(self, run_id, phase):
        with self.db:
            self.db.execute("INSERT INTO events(run_id,phase) VALUES (?,?)", (run_id, phase))

    def build(self, spec, request_id, parent=0, provider=None, message=""):
        validate_spec(spec)
        if not isinstance(message, str) or len(message) > 4000:
            raise ValueError("invalid_message")
        if not re.fullmatch(r"[a-zA-Z0-9-]{1,80}", request_id):
            raise ValueError("invalid_request_id")
        if type(parent) is not int or parent < 0:
            raise ValueError("invalid_parent")
        provider = provider or FixtureProvider()
        payload = json.dumps(spec, sort_keys=True)
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            existing = self.db.execute("SELECT * FROM runs WHERE id=?", (request_id,)).fetchone()
            if existing:
                if existing["request"] != payload or existing["parent"] != parent or existing["provider"] != provider.identity or existing["message"] != message:
                    raise ValueError("idempotency_conflict")
                return dict(existing)
            self.db.execute("INSERT OR IGNORE INTO projects(slug,specification) VALUES (?,?)", (spec["slug"], payload))
            project = self.db.execute("SELECT * FROM projects WHERE slug=?", (spec["slug"],)).fetchone()
            if project["version"] != parent:
                raise ValueError("stale_project_version")
            self.db.execute("INSERT INTO runs(id,slug,parent,state,provider,request,message) VALUES (?,?,?,'running',?,?,?)",
                            (request_id, spec["slug"], parent, provider.identity, payload, message))
        try:
            self.event(request_id, "generating")
            previous = {}
            if parent:
                prior = self.directory / spec["slug"] / str(parent)
                previous = {name: (prior / "public" / name).read_text() for name in FILES}
                recorded = self.db.execute(
                    "SELECT digest FROM runs WHERE slug=? AND parent=? AND state='review_ready'",
                    (spec["slug"], parent - 1)).fetchone()
                if not recorded or digest(previous) != recorded["digest"]:
                    raise ValueError("prior_artifact_changed")
            files = provider.generate(spec, previous)
            validate_files(files, spec)
            self.event(request_id, "building")
            with tempfile.TemporaryDirectory(dir=self.directory) as temporary:
                folder = Path(temporary)
                public = folder / "public"
                public.mkdir()
                for name, content in files.items():
                    (public / name).write_text(content)
                for name in ("app.mjs", "model.mjs"):
                    subprocess.run([NODE, "--check", str(public / name)], check=True,
                                   timeout=10, capture_output=True, env={"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"})
                self.event(request_id, "testing")
                shutil.copy(ROOT / "studio_engine/fixtures" / spec.get("template", "collection") / "model.test.mjs", folder / "model.test.mjs")
                subprocess.run([NODE, "--test", str(folder / "model.test.mjs")], check=True,
                               timeout=15, capture_output=True, env={"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"})
                artifact = digest(files)
                manifest = dict(run_id=request_id, specification=spec, parent=parent, version=parent + 1,
                                artifact=artifact, provider=provider.identity, validator=VERSION,
                                publisher="review-only", enabled=False, estimated_cost_micros=0,
                                actual_provider_charge=None, proposed_url="/" + spec["slug"])
                (folder / "review.json").write_text(json.dumps(manifest, indent=2) + "\n")
                destination = self.directory / spec["slug"] / str(parent + 1)
                destination.parent.mkdir(exist_ok=True)
                # An interrupted write is retained for inspection; never overwrite a version.
                if destination.exists():
                    raise ValueError("artifact_requires_reconciliation")
                folder.rename(destination)
            with self.db:
                self.db.execute("UPDATE projects SET version=?, specification=? WHERE slug=? AND version=?",
                                (parent + 1, payload, spec["slug"], parent))
                self.db.execute("UPDATE runs SET state='review_ready',digest=? WHERE id=?", (artifact, request_id))
                self.db.execute("INSERT INTO events(run_id,phase) VALUES (?,'review_ready')", (request_id,))
        except Exception as error:
            code = str(error) if isinstance(error, ValueError) else "build_or_test_failed"
            if code not in {"invalid_artifact_paths", "artifact_size_limit", "unreviewed_executable_artifact",
                            "artifact_requires_reconciliation", "prior_artifact_changed"}:
                code = "build_or_test_failed"
            with self.db:
                self.db.execute("UPDATE runs SET state='failed',diagnostic=? WHERE id=?", (code, request_id))
            self.event(request_id, "failed")
        return dict(self.db.execute("SELECT * FROM runs WHERE id=?", (request_id,)).fetchone())
