import argparse
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import release_studio_staging as release

BASE = "a" * 40
STAGING = "11111111-1111-4111-8111-111111111111"
PRODUCTION = "22222222-2222-4222-8222-222222222222"
ENV = {
    "GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch",
    "GITHUB_REPOSITORY": "enaz333/zane-websites", "GITHUB_REF": "refs/heads/main",
    "GITHUB_REF_PROTECTED": "true", "GITHUB_SHA": BASE, "REVIEWED_SHA": BASE,
    "STUDIO_STAGING_RELEASE_ENABLED": "true", "CLOUDFLARE_ACCOUNT_ID": "b" * 32,
    "STUDIO_STAGING_D1_ID": STAGING, "STUDIO_PRODUCTION_D1_ID": PRODUCTION,
    "STUDIO_STAGING_DEPLOY_TOKEN": "worker-fixture", "STUDIO_STAGING_D1_TOKEN": "d1-fixture",
    "ACCESS_TEAM_ORIGIN": "https://team.cloudflareaccess.com", "ACCESS_AUD": "c" * 64,
    "STUDIO_OWNER_EMAIL": "owner@example.com", "PATH": "/usr/bin", "HOME": "/tmp",
}


class StudioStagingReleaseTests(unittest.TestCase):
    def test_missing_opt_in_or_wrong_ref_stops_before_api(self):
        for key, value in (("STUDIO_STAGING_RELEASE_ENABLED", ""), ("GITHUB_REF_PROTECTED", "false"),
                           ("GITHUB_EVENT_NAME", "push"), ("REVIEWED_SHA", "f" * 40)):
            with self.subTest(key=key), patch.object(release, "StudioCloudflare") as api:
                with self.assertRaisesRegex(ValueError, "owner opt-in"):
                    release.initialize(ENV | {key: value})
                api.assert_not_called()

    def test_workflow_write_job_requires_dedicated_environment(self):
        workflow = (release.ROOT / ".github/workflows/studio-staging.yml").read_text()
        self.assertIn("    environment: cloudflare-studio-staging\n", workflow)
        self.assertIn("github.ref_protected", workflow)
        self.assertLess(workflow.index('test "$STUDIO_STAGING_RELEASE_ENABLED" = true'),
                        workflow.index("secrets.STUDIO_STAGING_DEPLOY_TOKEN"))
        self.assertLess(workflow.index("--verify-approval"), workflow.index("secrets.STUDIO_STAGING_DEPLOY_TOKEN"))

    def test_requires_recorded_owner_approval_for_this_environment(self):
        approval = {"state": "approved", "user": {"login": "enaz333"},
                    "environments": [{"name": "cloudflare-studio-staging"}]}
        env = {"GITHUB_RUN_ID": "42", "GITHUB_RUN_ATTEMPT": "1", "GITHUB_TOKEN": "fixture"}
        with patch.object(release, "build_opener") as opener:
            for reviews in ([], [approval | {"user": {"login": "someone-else"}}],
                            [approval | {"environments": [{"name": "cloudflare-staging"}]}],
                            [approval | {"state": "rejected"}]):
                opener.return_value.open.return_value = io.StringIO(json.dumps(reviews))
                with self.assertRaisesRegex(ValueError, "No recorded owner approval"):
                    release.verify_owner_approval(env)
            opener.return_value.open.return_value = io.StringIO(json.dumps([approval]))
            release.verify_owner_approval(env)
        with self.assertRaisesRegex(ValueError, "fresh workflow"):
            release.verify_owner_approval(env | {"GITHUB_RUN_ATTEMPT": "2"})

    def test_tokens_are_distinct_and_each_mutation_receives_only_its_token(self):
        with self.assertRaisesRegex(ValueError, "separate"):
            release.settings(ENV | {"STUDIO_STAGING_D1_TOKEN": ENV["STUDIO_STAGING_DEPLOY_TOKEN"]})
        with (patch.object(release.subprocess, "check_output", return_value=BASE + "\n"),
              patch.object(release, "StagingWorker") as worker,
              patch.object(release, "require_unattached"),
              patch.object(release, "verify_databases"),
              patch.object(release, "record"),
              patch.object(release, "verify_marker"),
              patch.object(release, "migrate") as migrate,
              patch.object(release, "deploy_worker") as deploy):
            worker.return_value.exists.return_value = False
            release.initialize(ENV)
        d1_env = migrate.call_args.args[1]
        self.assertEqual(d1_env["CLOUDFLARE_API_TOKEN"], "d1-fixture")
        self.assertNotIn("worker-fixture", d1_env.values())
        for call in deploy.call_args_list:
            worker_env = call.args[2]
            self.assertEqual(worker_env["CLOUDFLARE_API_TOKEN"], "worker-fixture")
            self.assertNotIn("d1-fixture", worker_env.values())
            self.assertNotIn("ACCESS_AUD", worker_env)
        self.assertEqual(len(deploy.call_args_list[0].args), 6)
        self.assertEqual(len(deploy.call_args_list[1].args), 5)

    def test_active_uses_api_order_and_handles_empty_history(self):
        worker = release.StagingWorker("account", "token", release.DATABASE)
        def deployment(version, percentage=100):
            return {"versions": [{"version_id": version, "percentage": percentage}]}
        with patch.object(worker, "script", side_effect=[{}, {"deployments": []}]):
            self.assertIsNone(worker.active())
        with patch.object(worker, "script", side_effect=[
            {}, {"deployments": [deployment(release.RECOVERY_WEB_VERSION), deployment(STAGING)]},
        ]):
            self.assertEqual(worker.active(), release.RECOVERY_WEB_VERSION)
        with patch.object(worker, "script", side_effect=[{}, {"deployments": [deployment(STAGING, 50)]}]):
            with self.assertRaisesRegex(ValueError, "traffic allocation"):
                worker.active()

    def test_wait_retries_only_missing_deployment(self):
        worker = Mock()
        worker.active.side_effect = [None, release.RECOVERY_WEB_VERSION]
        with patch.object(release.time, "sleep"):
            release.wait_for_version(worker, release.RECOVERY_WEB_VERSION)
        worker.active.side_effect = [STAGING]
        with self.assertRaisesRegex(ValueError, "different version"):
            release.wait_for_version(worker, release.RECOVERY_WEB_VERSION)

    def test_refresh_requires_reviewed_active_version(self):
        worker = Mock()
        worker.active.return_value = STAGING
        with patch.object(release, "deploy_worker") as deploy:
            with self.assertRaisesRegex(ValueError, "reviewed baseline"):
                release.refresh_dispatcher(worker, Path("/tmp/plan"), {}, {}, STAGING, PRODUCTION, BASE)
            deploy.assert_not_called()

    def test_refresh_uses_reviewed_base_and_deploys_only_disabled_dispatcher(self):
        worker = Mock()
        worker.active.return_value = PRODUCTION
        worker.script.return_value = {"resources": {"bindings": [
            {"type": "d1", "name": "DB", "database_id": STAGING},
            {"type": "plain_text", "name": "STUDIO_STAGING_ID", "text": STAGING},
            {"type": "plain_text", "name": "STUDIO_EXECUTION_ENABLED", "text": "false"},
        ]}}
        with tempfile.TemporaryDirectory() as directory:
            plan = Path(directory) / "plan"
            args = argparse.Namespace(base=BASE, database=STAGING, production_database=PRODUCTION, out=plan)
            with patch.object(release.subprocess, "check_output", return_value=BASE):
                release.prepare(args)
            with (patch.object(release, "require_inert_dispatcher"),
                  patch.object(release, "verify_marker") as marker,
                  patch.object(release, "record"),
                  patch.object(release, "deploy_worker") as deploy):
                release.refresh_dispatcher(worker, plan, {}, {}, STAGING, PRODUCTION, BASE)
                marker.assert_called_once_with(plan, {}, STAGING)
                deploy.assert_called_once_with(worker, plan / "dispatcher.json", {}, BASE, STAGING,
                                               previous=PRODUCTION, rate_card=release.LUNA_RATE_CARD)
            config = json.loads((plan / "dispatcher.json").read_text())
            self.assertEqual(config["vars"], {
                "STUDIO_BASE_SHA": BASE, "STUDIO_STAGING_ID": STAGING, "STUDIO_EXECUTION_ENABLED": "false",
                "STUDIO_RUN_MICROS": "262548", "STUDIO_MONTH_MICROS": "262548",
                "STUDIO_RATE_CARD": release.LUNA_RATE_CARD,
            })

    def test_refresh_waits_for_new_version_while_baseline_is_visible(self):
        worker = Mock()
        worker.active.side_effect = [STAGING, PRODUCTION]
        with patch.object(release.time, "sleep"):
            release.wait_for_version(worker, PRODUCTION, STAGING)

    def test_recovery_deploys_only_dispatcher_after_marker_and_baseline(self):
        web, dispatcher = Mock(), Mock()
        web.active.return_value = release.RECOVERY_WEB_VERSION
        dispatcher.exists.return_value = False
        plan = Path("/tmp/plan")
        with (patch.object(release, "verify_worker_version") as verify,
              patch.object(release, "verify_marker") as marker,
              patch.object(release, "require_unattached"),
              patch.object(release, "record"),
              patch.object(release, "deploy_worker") as deploy):
            release.recover_dispatcher([web, dispatcher], plan, {}, {}, BASE, STAGING, {})
            verify.assert_called_once_with(web, release.RECOVERY_WEB_VERSION, release.RECOVERY_WEB_SHA, STAGING, {})
            marker.assert_called_once_with(plan, {}, STAGING)
            deploy.assert_called_once_with(dispatcher, plan / "dispatcher.json", {}, BASE, STAGING)
            deploy.reset_mock()
            marker.side_effect = ValueError("marker mismatch")
            with self.assertRaisesRegex(ValueError, "marker mismatch"):
                release.recover_dispatcher([web, dispatcher], plan, {}, {}, BASE, STAGING, {})
            deploy.assert_not_called()
            dispatcher.exists.return_value = True
            with self.assertRaisesRegex(ValueError, "absent dispatcher"):
                release.recover_dispatcher([web, dispatcher], plan, {}, {}, BASE, STAGING, {})
            deploy.assert_not_called()

    def test_wrong_database_uuid_or_name_is_rejected(self):
        for uuid in (STAGING, "invalid"):
            with self.assertRaisesRegex(ValueError, "distinct"):
                release.settings(ENV | {"STUDIO_PRODUCTION_D1_ID": uuid})
        api = Mock()
        for db in ({"uuid": PRODUCTION, "name": release.DATABASE},
                   {"uuid": STAGING, "name": "zane-studio"}):
            api.get.return_value = db
            with self.assertRaisesRegex(ValueError, "D1 identity"):
                release.verify_databases(api, STAGING, PRODUCTION)

    def test_unexpected_worker_names_and_routes_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            plan = Path(directory) / "plan"
            args = argparse.Namespace(base=BASE, database=STAGING, production_database=PRODUCTION, out=plan)
            with patch.object(release.subprocess, "check_output", return_value=BASE):
                release.prepare(args)
            release.validate_plan(plan, STAGING, BASE)
            for file in ("web.json", "dispatcher.json"):
                path = plan / file
                valid = json.loads(path.read_text())
                for override in ({"name": "zane-studio"}, {"route": "studio.zanegiordano.com/*"},
                                 {"routes": []}, {"triggers": {"crons": ["*/2 * * * *"]}},
                                 {"workers_dev": True}):
                    with self.subTest(file=file, override=override):
                        path.write_text(json.dumps(valid | override))
                        with self.assertRaisesRegex(ValueError, "Unexpected"):
                            release.validate_plan(plan, STAGING, BASE)
                path.write_text(json.dumps(valid))
