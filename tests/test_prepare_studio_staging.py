import argparse
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.prepare_studio_staging import prepare


class StudioStagingTests(unittest.TestCase):
    def test_configs_have_only_staging_database_and_dispatch_is_inert(self):
        base = "a" * 40
        with tempfile.TemporaryDirectory() as directory:
            args = argparse.Namespace(database="11111111-1111-4111-8111-111111111111",
                                      production_database="22222222-2222-4222-8222-222222222222",
                                      base=base, out=Path(directory) / "plan")
            with patch("scripts.prepare_studio_staging.subprocess.check_output", return_value=base + "\n"):
                prepare(args)
            web = json.loads((args.out / "web.json").read_text())
            dispatch = json.loads((args.out / "dispatcher.json").read_text())
            for config in (web, dispatch):
                self.assertEqual(config["d1_databases"][0]["database_id"], args.database)
                self.assertFalse(config["workers_dev"])
                self.assertFalse(config["preview_urls"])
                self.assertNotIn("routes", config)
                self.assertNotIn("triggers", config)
            self.assertEqual(dispatch["vars"]["STUDIO_EXECUTION_ENABLED"], "false")
            self.assertEqual(dispatch["vars"]["STUDIO_RUN_MICROS"], "262548")
            self.assertEqual(dispatch["vars"]["STUDIO_MONTH_MICROS"], "262548")
            self.assertNotIn("STUDIO_TEST_TASK_ID", dispatch["vars"])
            self.assertIn(args.database, (args.out / "marker.sql").read_text())
            args.database = args.production_database
            with self.assertRaisesRegex(ValueError, "must differ"):
                prepare(args)
