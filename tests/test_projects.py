import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from deploy_workers import attach_domain, check_domain, required_dependencies, select
from projects import ROOT, affected, load, ordered, parse, scaffold


class RegistryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        shutil.copy(ROOT / "projects.json", self.root)
        for name in ("sites", "templates", "workers"):
            shutil.copytree(ROOT / name, self.root / name)

    def save(self, registry):
        (self.root / "projects.json").write_text(json.dumps(registry))

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root).decode().strip()

    def commit(self):
        self.git("add", ".")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "-qm", "test fixture")
        return self.git("rev-parse", "HEAD")

    def test_template_adds_a_disabled_project(self):
        scaffold("new-site", self.root)
        entry = load(self.root)["new-site"]
        self.assertFalse(entry["enabled"])
        self.assertEqual(entry["subdomain"], "new-site")
        self.assertEqual(entry["short_path"], "/new-site")
        self.assertEqual(entry["canonical_url"], "https://new-site.zanegiordano.com/")
        with self.assertRaisesRegex(ValueError, "disabled"):
            select(load(self.root), argparse.Namespace(project="new-site"))
        for slug in ("new-site", "all", "www", "../outside"):
            with self.assertRaises(ValueError):
                scaffold(slug, self.root)

    def test_dependency_order_and_missing_prerequisites(self):
        registry = load(self.root)
        order = ordered(registry)
        self.assertLess(order.index("photo-notes"), order.index("personal"))
        self.assertLess(order.index("personal"), order.index("club"))
        self.assertEqual(required_dependencies(registry, {"personal"}), {"photo-notes"})
        self.assertEqual(required_dependencies(registry, {"personal", "photo-notes"}), set())
        registry["photo-notes"]["depends_on"] = ["personal"]
        self.save(registry)
        with self.assertRaisesRegex(ValueError, "cycle"):
            load(self.root)

    def test_rejects_routes_and_duplicate_json_keys(self):
        path = self.root / "sites/personal/wrangler.json"
        config = parse(path.read_text())
        config["routes"] = [{"pattern": "zanegiordano.com", "custom_domain": True}]
        path.write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, "unsupported"):
            load(self.root)
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            parse('{"test": 1, "test": 2}')

    def test_route_collisions_and_personal_loops_are_rejected(self):
        for path, destination, reason in (
            ("/PhotoNotes", "https://acl.zanegiordano.com/acl/", "reserved"),
            ("/thanks", "https://acl.zanegiordano.com/acl/", "reserved"),
            ("/coachella", "https://acl.zanegiordano.com/acl/", "match its slug"),
            ("/acl", "https://www.zanegiordano.com/coachella", "point back"),
        ):
            with self.subTest(path=path, destination=destination):
                registry = json.loads((ROOT / "projects.json").read_text())
                registry["acl"].update(short_path=path, canonical_url=destination)
                self.save(registry)
                with self.assertRaisesRegex(ValueError, reason):
                    load(self.root)

    def test_project_documentation_does_not_select_workers(self):
        self.git("init", "-q")
        before = self.commit()
        for slug in load(self.root):
            site = self.root / "sites" / slug
            (site / "AGENTS.md").write_text("Updated instructions")
            (site / "README.md").write_text("Updated overview")
            (site / "docs").mkdir(exist_ok=True)
            (site / "docs/operations.md").write_text("Internal runbook")
        self.assertEqual(affected(load(self.root), before, self.commit(), self.root), set())

    def test_runtime_inputs_select_workers_even_with_documentation_changes(self):
        self.git("init", "-q")
        before = self.commit()
        (self.root / "sites/acl/public/README.md").write_text("Published markdown asset")
        runtime = self.commit()
        self.assertEqual(affected(load(self.root), before, runtime, self.root), {"acl"})

        (self.root / "sites/acl/AGENTS.md").write_text("Updated instructions")
        site = self.root / "sites/coachella"
        (site / "src").mkdir()
        (site / "src/message.md").write_text("Text consumed by the Worker")
        config = parse((site / "wrangler.json").read_text())
        config["compatibility_date"] = "2026-11-11"
        (site / "wrangler.json").write_text(json.dumps(config))
        self.assertEqual(affected(load(self.root), runtime, self.commit(), self.root), {"coachella"})

    def test_root_toolchain_change_selects_enabled_workers(self):
        self.git("init", "-q")
        before = self.commit()
        (self.root / "package-lock.json").write_text("{}")
        registry = load(self.root)
        self.assertEqual(affected(registry, before, self.commit(), self.root),
                         {slug for slug, entry in registry.items() if entry["enabled"]})

    def test_changes_select_only_affected_enabled_projects(self):
        self.git("init", "-q")
        before = self.commit()
        scaffold("new-site", self.root)
        (self.root / "sites/acl/public/index.html").write_text("changed")
        after = self.commit()
        self.assertEqual(affected(load(self.root), before, after, self.root), {"acl"})
        registry = load(self.root)
        registry["new-site"]["enabled"] = True
        self.save(registry)
        after_approval = self.commit()
        self.assertEqual(affected(registry, after, after_approval, self.root), {"new-site", "personal"})
        registry["acl"]["canonical_url"] = "https://acl.zanegiordano.com/new/"
        self.save(registry)
        route_change = self.commit()
        self.assertEqual(affected(registry, after_approval, route_change, self.root), {"acl", "personal"})
        with (self.root / "workers/prefixed-site.mjs").open("a") as shared:
            shared.write("\n// shared change\n")
        final = self.commit()
        self.assertEqual(affected(registry, route_change, final, self.root),
                         {"acl", "coachella", "photo-notes"})


class DomainTests(unittest.TestCase):
    hostname = "new-site.zanegiordano.com"
    worker = "zane-new-site"
    account = "a" * 32
    zone = "b" * 32

    def test_existing_matching_domain_is_left_alone(self):
        api = Mock()
        api.request.return_value = [{"hostname": self.hostname, "service": self.worker,
                                     "zone_id": self.zone, "enabled": True}]
        attach_domain(api, self.account, self.zone, self.hostname, self.worker)
        api.request.assert_called_once()

    def test_refuses_another_worker_exact_or_wildcard_dns(self):
        for responses in ([ [{"service": "another"}] ],
                          [[], [{"type": "CNAME"}]], [[], [], [{"type": "A"}]]):
            api = Mock()
            api.request.side_effect = responses
            with self.assertRaisesRegex(ValueError, "conflict"):
                check_domain(api, self.account, self.zone, self.hostname, self.worker)
            self.assertTrue(all(len(call.args) == 1 for call in api.request.call_args_list))

    def test_attachment_disables_overwrites(self):
        api = Mock()
        api.request.side_effect = [[], [], [], {}, [{"hostname": self.hostname,
                                    "service": self.worker, "zone_id": self.zone, "enabled": True}]]
        attach_domain(api, self.account, self.zone, self.hostname, self.worker)
        _, body = api.request.call_args_list[3].args
        for flag in ("override_scope", "override_existing_origin", "override_existing_dns_record"):
            self.assertIs(body[flag], False)
        self.assertEqual(body["origins"][0]["hostname"], self.hostname)


if __name__ == "__main__":
    unittest.main()
