"""Prepare a source-pinned, disabled Worker patch from a verified local artifact."""
import argparse
import difflib
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
from scripts.projects import scaffold, load
from scripts.studio_paths import inventory
from .engine import Engine, FILES, ROOT, digest, validate_files


def prepare(engine, slug, version, base, repository=ROOT):
    if not re.fullmatch(r"[a-f0-9]{40}", base) or type(version) is not int or version < 1:
        raise ValueError("invalid_export_revision")
    run = engine.db.execute(
        "SELECT * FROM runs WHERE slug=? AND parent=? AND state='review_ready'",
        (slug, version - 1)).fetchone()
    if not run:
        raise ValueError("version_not_ready")
    spec = json.loads(run["request"])
    public = engine.directory / slug / str(version) / "public"
    if public.is_symlink() or any((public / name).is_symlink() for name in FILES):
        raise ValueError("artifact_symlink")
    files = {name: (public / name).read_text() for name in FILES}
    if digest(files) != run["digest"]:
        raise ValueError("artifact_changed")
    validate_files(files, spec)
    archive = subprocess.check_output(["git", "archive", base], cwd=repository, timeout=30)
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary).resolve()
        with tarfile.open(fileobj=io.BytesIO(archive)) as source:
            if any(not (member.isfile() or member.isdir()) for member in source.getmembers()):
                raise ValueError("source_special_file")
            source.extractall(root, filter="data")
        projects = load(root)
        prefix = f"sites/{slug}/"
        if slug in projects:
            if projects[slug]["enabled"] or projects[slug]["depends_on"] or projects[slug]["watch"]:
                raise ValueError("project_requires_separate_approval")
        else:
            scaffold(slug, root)
        changes = {}
        candidates = {prefix + "public/" + name: content for name, content in files.items()}
        for relative in ("wrangler.json", "AGENTS.md", "public/.assetsignore"):
            path = root / prefix / relative
            candidates[prefix + relative] = path.read_text()
        candidates["projects.json"] = (root / "projects.json").read_text()
        for path, content in candidates.items():
            (root / path).write_text(content)
        load(root)
        candidates["workers/studio-paths.json"] = json.dumps(inventory(root), indent=2) + "\n"
        for path, content in candidates.items():
            result = subprocess.run(["git", "show", base + ":" + path], cwd=repository,
                                    capture_output=True, timeout=10)
            before = result.stdout.decode() if result.returncode == 0 else ""
            if before != content:
                changes[path] = {"before": before, "after": content}
        patch = "".join("".join(difflib.unified_diff(
            value["before"].splitlines(keepends=True), value["after"].splitlines(keepends=True),
            fromfile="a/" + path if value["before"] else "/dev/null", tofile="b/" + path))
            for path, value in sorted(changes.items()))
        return {"source_sha": base, "artifact_digest": run["digest"], "project": slug,
                "version": version, "enabled": False, "capabilities": spec["capabilities"],
                "files": changes, "patch": patch,
                "patch_sha256": hashlib.sha256(patch.encode()).hexdigest(),
                "branch": "studio/app-" + hashlib.sha256((base + run["digest"] + slug).encode()).hexdigest()[:24]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--version", required=True, type=int)
    parser.add_argument("--base", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    engine = Engine(args.workspace)
    try:
        package = prepare(engine, args.slug, args.version, args.base)
        # Exclusive creation prevents silently replacing reviewed evidence.
        with Path(args.output).open("x") as output:
            json.dump(package, output, indent=2)
            output.write("\n")
        print("Prepared disabled project patch " + package["patch_sha256"])
    finally:
        engine.close()
