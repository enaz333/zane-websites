import json
from urllib.error import HTTPError
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import release_studio as studio


SOURCE = "b" * 40
BEFORE = "a0000000-0000-4000-8000-000000000000"
AFTER = "b0000000-0000-4000-8000-000000000000"
DB = studio.FIXTURE["STUDIO_D1_DATABASE_ID"]


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.config, self.runtime = studio.release_config(studio.FIXTURE)
        self.api = Mock(spec=studio.StudioCloudflare)
        self.api.hostname_attached.return_value = False
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cli = self.enterContext(patch.object(studio, "wrangler"))
        self.record = self.enterContext(patch.object(studio, "record"))
        self.verify_access_redirect = studio.verify_access_redirect
        self.probe = self.enterContext(patch.object(studio, "verify_access_redirect"))

    def run_release(self, mode="deploy", expected=None, target=None):
        studio.apply(self.api, self.config, self.runtime, self.tmp.name, {}, mode, expected, SOURCE, target)

    def test_generated_config_has_only_the_private_worker_and_dedicated_db(self):
        self.assertEqual(self.config["name"], "zane-studio")
        self.assertFalse(self.config["workers_dev"])
        self.assertFalse(self.config["preview_urls"])
        self.assertTrue(self.config["assets"]["run_worker_first"])
        self.assertFalse({"routes", "route", "triggers", "vars", "services"} & self.config.keys())
        self.assertEqual(set(self.runtime), set(studio.SETTINGS))
        (binding,) = self.config["d1_databases"]
        self.assertEqual((binding["binding"], binding["database_name"], binding["database_id"]),
                         ("DB", "zane-studio", DB))
        self.assertTrue((Path(binding["migrations_dir"]) / "0001_tasks.sql").is_file())
        for key, value in (("STUDIO_D1_DATABASE_ID", ""), ("ACCESS_AUD", "x"), ("STUDIO_OWNER_EMAIL", ""),
                           ("ACCESS_TEAM_ORIGIN", "https://other.example"), ("STUDIO_ORIGIN", "https://example.com")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                studio.release_config(studio.FIXTURE | {key: value})

    def test_config_changes_cannot_enable_unsafe_surfaces(self):
        base = json.loads(studio.CONFIG.read_text())
        for update in ({"routes": [{"pattern": "example.com"}]}, {"preview_urls": True}, {"workers_dev": True},
                       {"assets": base["assets"] | {"run_worker_first": False}}, {"main": "./local/worker.mjs"}):
            with self.subTest(update=update), patch.object(studio, "CONFIG") as path, self.assertRaises(ValueError):
                path.read_text.return_value = json.dumps(base | update)
                studio.release_config(studio.FIXTURE)

    def test_first_deploy_migrates_before_upload_and_uses_private_runtime_file(self):
        self.api.active.side_effect = [None, None, AFTER]
        def report_upload(*args, env):
            if args[0] == "deploy":
                Path(env["WRANGLER_OUTPUT_FILE_PATH"]).write_text(json.dumps({
                    "type": "deploy", "worker_name": studio.WORKER, "version_id": AFTER,
                }))
        self.cli.side_effect = report_upload
        self.run_release()
        calls = [call.args for call in self.cli.call_args_list]
        self.assertEqual([call[0] for call in calls], ["d1", "deploy"])
        self.assertEqual(calls[0][:5], ("d1", "migrations", "apply", "DB", "--remote"))
        self.assertIn("--no-autoconfig", calls[1])
        self.assertEqual(calls[1][calls[1].index("--tag") + 1], SOURCE)
        self.assertEqual(json.loads(Path(calls[1][calls[1].index("--secrets-file") + 1]).read_text()), self.runtime)
        self.api.verify_version.assert_called_once_with(AFTER, DB)
        self.probe.assert_not_called()

    def test_refuses_wrong_baseline_or_already_attached_first_release(self):
        self.api.active.return_value = BEFORE
        with self.assertRaisesRegex(ValueError, "baseline"):
            self.run_release()
        self.api.active.return_value = None
        self.api.hostname_attached.return_value = True
        with self.assertRaisesRegex(ValueError, "hostname"):
            self.run_release()
        self.cli.assert_not_called()

    def test_migration_failure_never_uploads(self):
        self.api.active.return_value = None
        self.cli.side_effect = ValueError("migration failed")
        with self.assertRaisesRegex(ValueError, "migration failed"):
            self.run_release()
        self.cli.assert_called_once()
        self.assertEqual(self.cli.call_args.args[0], "d1")

    def test_attached_updates_require_anonymous_access_checks_before_and_after(self):
        self.api.active.side_effect = [BEFORE, BEFORE, AFTER]
        self.api.hostname_attached.return_value = True
        with patch.object(studio, "uploaded_version", return_value=AFTER):
            self.run_release(expected=BEFORE)
        self.assertEqual(self.probe.call_count, 2)

    def test_rollback_only_restores_requested_version_and_does_not_migrate(self):
        self.api.active.side_effect = [BEFORE, BEFORE, AFTER]
        self.run_release(mode="rollback", expected=BEFORE, target=AFTER)
        self.cli.assert_called_once()
        self.assertEqual(self.cli.call_args.args[:2], ("rollback", AFTER))
        self.api.verify_version.assert_any_call(AFTER, DB)

    def test_rollback_refuses_unverified_target_or_unexpected_result(self):
        self.api.active.side_effect = [BEFORE, BEFORE, BEFORE]
        self.api.verify_version.side_effect = [None, ValueError("bad rollback bindings")]
        with self.assertRaisesRegex(ValueError, "bad rollback"):
            self.run_release(mode="rollback", expected=BEFORE, target=AFTER)
        self.cli.assert_not_called()
        self.api.active.side_effect = [BEFORE, BEFORE, BEFORE]
        self.api.verify_version.side_effect = None
        with self.assertRaisesRegex(ValueError, "did not become active"):
            self.run_release(mode="rollback", expected=BEFORE, target=AFTER)

    def test_remote_checks_refuse_preview_urls_wrong_database_and_split_traffic(self):
        api = studio.StudioCloudflare("a" * 32, "fixture-token")
        with patch.object(api, "get") as get:
            get.return_value = {"enabled": False, "previews_enabled": True}
            with self.assertRaisesRegex(ValueError, "preview"):
                api.require_private_endpoints()
            get.return_value = {"name": "not-studio", "uuid": DB}
            with self.assertRaisesRegex(ValueError, "dedicated"):
                api.verify_database(DB)
            get.side_effect = [{}, {"deployments": [{"created_on": "x",
                                "versions": [{"percentage": 50, "version_id": BEFORE}]}]}]
            with self.assertRaisesRegex(ValueError, "100%"):
                api.active()

    def test_remote_checks_refuse_wrong_access_or_database_bindings(self):
        api = studio.StudioCloudflare("a" * 32, "fixture-token")
        bindings = [{"name": "DB", "type": "d1", "database_id": DB}] + [
            {"name": key, "type": "secret_text"} for key in studio.SETTINGS]
        info = {"id": AFTER, "resources": {"bindings": bindings}}
        with patch.object(api, "script", return_value=info):
            api.verify_version(AFTER, DB)
        bindings[1]["type"] = "plain_text"
        with patch.object(api, "script", return_value=info), self.assertRaisesRegex(ValueError, "bindings"):
            api.verify_version(AFTER, DB)

    def test_deploy_fails_if_the_active_version_is_not_the_uploaded_version(self):
        self.api.active.side_effect = [BEFORE, BEFORE, AFTER]
        with patch.object(studio, "uploaded_version", return_value=BEFORE):
            with self.assertRaisesRegex(ValueError, "did not become active"):
                self.run_release(expected=BEFORE)

    def test_anonymous_probe_checks_assets_and_api_and_does_not_follow_redirect(self):
        issuer = self.runtime["ACCESS_TEAM_ORIGIN"]
        login = issuer + "/cdn-cgi/access/login/" + studio.HOST
        opener = MagicMock()

        def redirect(request, timeout):
            self.assertEqual(request.get_header("User-agent"), studio.USER_AGENT)
            self.assertIsNone(request.get_header("Cookie"))
            self.assertIsNone(request.get_header("Authorization"))
            raise HTTPError(request.full_url, 302, "", {"Location": login + "?opaque=fixture"}, None)

        opener.open.side_effect = redirect
        with patch.object(studio, "build_opener", return_value=opener) as build:
            self.verify_access_redirect(issuer)
            self.assertIsInstance(build.call_args.args[0], studio.NoRedirect)
            paths = [call.args[0].full_url.removeprefix(studio.ORIGIN) for call in opener.open.call_args_list]
            self.assertEqual(paths, ["/", "/index.html", "/studio.js", "/studio.css", "/api/projects", "/api/tasks"])

    def test_anonymous_probe_rejects_blocks_challenges_and_unrelated_redirects(self):
        issuer = self.runtime["ACCESS_TEAM_ORIGIN"]
        login = issuer + "/cdn-cgi/access/login/" + studio.HOST
        opener = MagicMock()
        with patch.object(studio, "build_opener", return_value=opener):
            for status, headers in [
                (200, {}),
                (403, {}),
                (403, {"cf-mitigated": "challenge"}),
                (302, {"Location": login, "cf-mitigated": "challenge"}),
                (302, {"Location": issuer + "/cdn-cgi/access/login/other.example?opaque=fixture"}),
                (302, {"Location": "https://other.example/cdn-cgi/access/login/" + studio.HOST}),
            ]:
                with self.subTest(status=status, headers=headers):
                    opener.open.side_effect = HTTPError(studio.ORIGIN, status, "", headers, None)
                    with self.assertRaisesRegex(ValueError, f"Access challenge.*HTTP {status}") as err:
                        self.verify_access_redirect(issuer)
                    self.assertNotIn("opaque", str(err.exception))
