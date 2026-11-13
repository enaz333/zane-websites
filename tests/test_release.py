import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import deploy_workers as release
from projects import load


class ReleaseTests(unittest.TestCase):
    def test_missing_credentials_stop_before_api_calls(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(release, "Cloudflare") as api:
            with self.assertRaisesRegex(ValueError, "account ID and Worker deploy token"):
                release.publish(load(), {"personal"})
            api.assert_not_called()

    def test_applies_dependencies_and_restores_in_reverse_order(self):
        projects = load()
        selected = {"photo-notes", "personal", "club", "acl", "coachella"}
        versions = dict.fromkeys(selected, "prior")
        operations = []

        def wrangler(command, **kwargs):
            if command[3] == "deploy":
                slug = Path(command[-1]).parent.name
                versions[slug] = "candidate"
            else:
                slug = command[6].removeprefix("zane-")
                versions[slug] = "prior"
            operations.append((command[3], slug))
            self.assertNotIn("CLOUDFLARE_DOMAIN_API_TOKEN", kwargs["env"])

        with (
            patch.dict(os.environ, {"CLOUDFLARE_ACCOUNT_ID": "a" * 32,
                                    "CLOUDFLARE_API_TOKEN": "test",
                                    "CLOUDFLARE_DOMAIN_API_TOKEN": "test-domain"}, clear=True),
            patch.object(release, "active_version", side_effect=lambda a, b, slug, **kw: versions[slug]),
            patch.object(release, "check_project_routes"),
            patch.object(release, "check"),
            patch.object(release, "record"),
            patch.object(release, "verify_legacy", side_effect=ValueError("route regression")),
            patch.object(release.subprocess, "run", side_effect=wrangler),
        ):
            with self.assertRaisesRegex(ValueError, "route regression"):
                release.publish(projects, selected)
        deployed = [slug for action, slug in operations if action == "deploy"]
        restored = [slug for action, slug in operations if action == "rollback"]
        self.assertLess(deployed.index("photo-notes"), deployed.index("personal"))
        self.assertLess(deployed.index("personal"), deployed.index("club"))
        self.assertEqual(restored, deployed[::-1])
        self.assertEqual(set(versions.values()), {"prior"})

    def test_invalid_credentials_cannot_be_mistaken_for_a_missing_worker(self):
        with patch.object(release.Cloudflare, "request",
                          side_effect=release.CloudflareError("GET", "/settings", 403, {10000})):
            with self.assertRaises(release.CloudflareError):
                release.active_version(release.Cloudflare("test"), "a" * 32, "example",
                                       allow_missing=True)

    def test_split_traffic_stops_publish(self):
        response = {"deployments": [{"created_on": "2026-11-12", "versions": [
            {"percentage": 90}, {"percentage": 10},
        ]}]}
        with patch.object(release.Cloudflare, "request", side_effect=[{}, response]):
            with self.assertRaisesRegex(ValueError, "split traffic"):
                release.active_version(release.Cloudflare("test"), "a" * 32, "personal")
