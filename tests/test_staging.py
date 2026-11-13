import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import stage_workers as stage
from projects import load, scaffold


class StagingTests(unittest.TestCase):
    def setUp(self):
        self.prefix = "zane-stage-123-2-"
        self.names = {slug: self.prefix + slug for slug in load()}
        self.origins = {slug: f"https://{name}.example.workers.dev"
                        for slug, name in self.names.items()}
        self.config = stage.staging_config("personal", self.names, self.origins, self.prefix)

    def validate(self, config, names=None):
        stage.validate_staging_config("personal", config, names or self.names,
                                      self.origins, self.prefix)

    def test_permanent_names_are_rejected_even_if_in_plan(self):
        for name in ("zane-personal", "zane-photo-notes", "zane-acl", "zane-coachella", "zane-club"):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Worker name"):
                self.validate(dict(self.config, name=name), dict(self.names, personal=name))

    def test_custom_domains_routes_and_production_bindings_are_rejected(self):
        forbidden = [
            {"routes": [{"pattern": "zanegiordano.com", "custom_domain": True}]},
            {"route": "zanegiordano.com/*"},
            {"env": {"production": {}}},
            {"d1_databases": [{"binding": "DATA", "database_id": "fixture"}]},
            {"services": [{"binding": "PHOTO_NOTES", "service": "zane-photo-notes"}]},
            {"vars": {"PRIVATE_API_TOKEN": "synthetic-fixture"}},
        ]
        for fields in forbidden:
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                self.validate(dict(self.config, **fields))

    def test_generated_config_uses_only_test_bindings_and_variables(self):
        self.assertEqual(self.config["services"], [
            {"binding": "PHOTO_NOTES", "service": self.names["photo-notes"]},
        ])
        self.assertEqual(self.config["vars"], {"STAGING_PROJECT_ORIGINS": self.origins})
        self.assertTrue(self.config["workers_dev"])
        self.assertFalse(self.config["preview_urls"])
        modified = copy.deepcopy(self.config)
        modified["vars"]["STAGING_PROJECT_ORIGINS"]["acl"] = "https://acl.zanegiordano.com"
        with self.assertRaisesRegex(ValueError, "test-only"):
            self.validate(modified)

    def test_entire_plan_is_checked_before_first_upload(self):
        generate = stage.staging_config

        def fail_late(slug, *args):
            if slug == "club":
                raise ValueError("bad staging configuration")
            return generate(slug, *args)

        with (patch.object(sys, "argv", ["stage_workers.py", "--subdomain", "example",
                                       "--run-id", "123"]),
              patch.object(stage, "staging_config", side_effect=fail_late),
              patch.object(stage.subprocess, "run") as run):
            with self.assertRaisesRegex(ValueError, "bad staging"):
                stage.main()
            run.assert_not_called()

    def test_permanent_scaffolds_cannot_use_staging_namespace(self):
        with self.assertRaisesRegex(ValueError, "reserved"):
            scaffold("stage-123-2-personal")
