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
