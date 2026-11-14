import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from studio_engine.engine import Engine, FixtureProvider, ROOT


class AppEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.engine = Engine(self.temp.name)
        self.addCleanup(self.engine.close)
        self.spec = json.loads((ROOT / "studio_engine/fixtures/spec.json").read_text())

    def test_build_retry_and_iteration(self):
        first = self.engine.build(self.spec, "first")
        self.assertEqual(first["state"], "review_ready")
        self.assertEqual(self.engine.build(self.spec, "first")["digest"], first["digest"])
        self.assertEqual(self.engine.db.execute("SELECT COUNT(*) FROM runs").fetchone()[0], 1)
        self.assertEqual(self.engine.build(self.spec, "second", 1)["state"], "review_ready")
        self.assertTrue((Path(self.temp.name) / self.spec["slug"] / "2/review.json").is_file())
        with self.assertRaisesRegex(ValueError, "stale_project_version"):
            self.engine.build(self.spec, "stale", 0)

    def test_rejects_path_escape_and_retains_version(self):
        class BadProvider:
            identity = "bad-fixture"
            def generate(self, specification, previous):
                return {"../../outside": "bad"}
        result = self.engine.build(self.spec, "bad", provider=BadProvider())
        self.assertEqual(result["diagnostic"], "invalid_artifact_paths")
        self.assertEqual(self.engine.db.execute("SELECT version FROM projects").fetchone()[0], 0)

    def test_build_failure_has_no_ready_artifact(self):
        with patch("studio_engine.engine.subprocess.run", side_effect=TimeoutError("private-data")):
            result = self.engine.build(self.spec, "failure")
        self.assertEqual(result["diagnostic"], "build_or_test_failed")
        self.assertFalse((Path(self.temp.name) / self.spec["slug"] / "1").exists())

    def test_reservations_capabilities_and_idempotency(self):
        for changed in (dict(slug="photo-notes"), dict(capabilities=["database"]),
                        dict(capabilities=["unknown"]), dict(slug="../escape")):
            with self.assertRaises(ValueError):
                self.engine.build(self.spec | changed, "invalid")
        self.engine.build(self.spec, "one")
        with self.assertRaisesRegex(ValueError, "idempotency_conflict"):
            self.engine.build(self.spec | {"description": "different"}, "one")

    def test_different_projects_are_isolated(self):
        self.engine.build(self.spec, "one")
        other = self.spec | {"slug": "another-demo"}
        self.assertEqual(self.engine.build(other, "two")["state"], "review_ready")
        self.assertEqual(self.engine.db.execute("SELECT COUNT(*) FROM projects").fetchone()[0], 2)

    def test_unreviewed_code_is_never_executed(self):
        class BadProvider(FixtureProvider):
            identity = "modified"
            def generate(self, specification, previous):
                files = super().generate(specification, previous)
                files["app.mjs"] = "fetch('https://example.com')"
                return files
        with patch("studio_engine.engine.subprocess.run") as execute:
            result = self.engine.build(self.spec, "untrusted", provider=BadProvider())
        execute.assert_not_called()
        self.assertEqual(result["diagnostic"], "unreviewed_executable_artifact")

class WorkspaceHttpTests(unittest.TestCase):
    def setUp(self):
        import io
        from studio_engine.server import handler
        self.io = io
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.handler = handler

    def request(self, path, *, preview=False, method="GET", body=None, origin=None, host=None):
        port = 8795 if preview else 8794
        instance = object.__new__(self.handler(self.temp.name, preview))
        instance.path = path
        encoded = json.dumps(body).encode() if body is not None else b""
        instance.headers = {"Host": host or f"127.0.0.1:{port}",
                            "Content-Type": "application/json", "Content-Length": str(len(encoded)),
                            "Origin": origin}
        instance.rfile = self.io.BytesIO(encoded)
        responses = []
        instance.reply = lambda *args: responses.append(args)
        getattr(instance, "do_" + method)()
        return responses[0]

    def test_origin_and_host_checks(self):
        self.assertEqual(self.request("/api/projects", host="evil.example")[0], 403)
        self.assertEqual(self.request("/api/build", method="POST", body={}, origin="https://evil.example")[0], 403)
        self.assertEqual(self.request("/api/build", preview=True, method="POST", body={})[0], 403)

    def test_build_list_preview_and_tamper(self):
        spec = json.loads((ROOT / "studio_engine/fixtures/spec.json").read_text())
        result = self.request("/api/build", method="POST", origin="http://127.0.0.1:8794",
                              body={"specification": spec, "request_id": "http-one", "parent": 0})
        self.assertEqual(result[1]["state"], "review_ready")
        projects = self.request("/api/projects")[1]
        self.assertEqual(projects[0]["version"], 1)
        path = "/collected-demo/1/index.html"
        self.assertEqual(self.request(path, preview=True)[0], 200)
        (Path(self.temp.name) / "collected-demo/1/public/app.mjs").write_text("tampered")
        self.assertEqual(self.request(path, preview=True)[0], 409)
        self.assertEqual(self.request("/../studio.sqlite", preview=True)[0], 404)

class PriorArtifactTests(AppEngineTests):
    def test_tampered_prior_cannot_seed_iteration(self):
        self.engine.build(self.spec, "original")
        (Path(self.temp.name) / self.spec["slug"] / "1/public/app.mjs").write_text("tampered")
        result = self.engine.build(self.spec, "iteration", 1)
        self.assertEqual(result["diagnostic"], "prior_artifact_changed")

class ContrastingFixtureTests(unittest.TestCase):
    def test_habits_and_renamed_collection_preserve_history(self):
        with tempfile.TemporaryDirectory() as folder:
            engine = Engine(folder)
            self.addCleanup(engine.close)
            spec = json.loads((ROOT / "studio_engine/fixtures/spec.json").read_text())
            first = engine.build(spec, "first")
            second = engine.build(spec | {"name": "Objects worth keeping"}, "second", 1,
                                  message="Rename heading")
            self.assertNotEqual(first["digest"], second["digest"])
            self.assertIn("Collected", (Path(folder) / spec["slug"] / "1/public/index.html").read_text())
            habits = spec | {"slug": "daily-habits", "template": "habits", "name": "Daily practice"}
            result = engine.build(habits, "habits")
            self.assertEqual(result["state"], "review_ready")
            self.assertNotEqual(result["digest"], first["digest"])
            self.assertEqual(engine.db.execute("SELECT message FROM runs WHERE id='second'").fetchone()[0],
                             "Rename heading")
