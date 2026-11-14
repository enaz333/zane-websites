import json
import shutil
import subprocess
import tempfile
from pathlib import Path
import unittest
from studio_engine.engine import Engine, ROOT
from studio_engine.export import prepare


class ExportTests(unittest.TestCase):
    def test_disabled_patch_is_bound_to_source_and_artifact(self):
        with tempfile.TemporaryDirectory() as folder:
            engine = Engine(folder)
            self.addCleanup(engine.close)
            spec = json.loads((ROOT / "studio_engine/fixtures/spec.json").read_text())
            engine.build(spec, "export")
            repository = Path(folder) / "repository"
            repository.mkdir()
            for name in ("sites", "workers", "templates"):
                shutil.copytree(ROOT / name, repository / name)
            shutil.copy(ROOT / "projects.json", repository)
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            subprocess.run(["git", "add", "."], cwd=repository, check=True)
            subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                            "commit", "-qm", "fixture"], cwd=repository, check=True)
            base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repository).decode().strip()
            first = prepare(engine, spec["slug"], 1, base, repository)
            self.assertEqual(first, prepare(engine, spec["slug"], 1, base, repository))
            registry = json.loads(first["files"]["projects.json"]["after"])
            self.assertFalse(registry[spec["slug"]]["enabled"])
            self.assertEqual(first["source_sha"], base)
            self.assertIn("sites/collected-demo/public/index.html", first["files"])
            self.assertNotIn(".github/workflows/deploy.yml", first["files"])
            (Path(folder) / spec["slug"] / "1/public/app.mjs").write_text("tampered")
            with self.assertRaisesRegex(ValueError, "artifact_changed"):
                prepare(engine, spec["slug"], 1, base, repository)
