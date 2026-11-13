#!/usr/bin/env python3
"""Validate, scaffold, and select Workers from the repository registry."""

import argparse
from graphlib import TopologicalSorter
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SLUG = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?")
RESERVED = {"all", "acl", "coachella", "www", "mail", "api", "admin", "autodiscover"}
FIELDS = {"enabled", "subdomain", "depends_on", "watch"}
CONFIG_FIELDS = {"name", "main", "compatibility_date", "workers_dev", "preview_urls",
                 "assets", "vars", "services"}


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def parse(raw):
    return json.loads(raw, object_pairs_hook=unique_keys)


def string_list(value):
    return (isinstance(value, list) and all(isinstance(item, str) for item in value)
            and len(set(value)) == len(value))


def config_path(slug):
    return Path("sites", slug, "wrangler.json")


def ordered(projects):
    graph = {slug: entry["depends_on"] for slug, entry in sorted(projects.items())}
    return list(TopologicalSorter(graph).static_order())


def load(root=ROOT):
    projects = parse((root / "projects.json").read_text())
    if not isinstance(projects, dict) or not projects:
        raise ValueError("projects.json must be a nonempty object keyed by project slug")
    configs = {p.parent.name for p in (root / "sites").glob("*/wrangler.json")}
    if configs != projects.keys():
        raise ValueError("Registry keys must match sites/*/wrangler.json")
    domains = set()
    for slug, entry in projects.items():
        if slug == "all" or not SLUG.fullmatch(slug) or not isinstance(entry, dict) or entry.keys() != FIELDS:
            raise ValueError(f"Invalid project entry: {slug}")
        if type(entry["enabled"]) is not bool:
            raise ValueError(f"{slug}: enabled must be a boolean")
        subdomain = entry["subdomain"]
        if subdomain is not None:
            if (not isinstance(subdomain, str) or not SLUG.fullmatch(subdomain)
                    or subdomain in RESERVED or subdomain in domains):
                raise ValueError(f"{slug}: invalid, reserved or duplicate subdomain")
            domains.add(subdomain)
        for field in ("depends_on", "watch"):
            if not string_list(entry[field]):
                raise ValueError(f"{slug}: {field} must be a list of unique strings")
        if slug in entry["depends_on"] or not set(entry["depends_on"]) <= projects.keys():
            raise ValueError(f"{slug}: unknown or self dependency")
        for path in entry["watch"]:
            file = root / path
            if (not path.startswith("workers/") or file.relative_to(root).as_posix() != path
                    or not file.is_file() or not file.resolve().is_relative_to(root / "workers")):
                raise ValueError(f"{slug}: watch path must be an existing file under workers/")
        check_config(root, slug, entry)
    for slug in ordered(projects):
        if projects[slug]["enabled"]:
            for dependency in projects[slug]["depends_on"]:
                if not projects[dependency]["enabled"]:
                    raise ValueError(f"{slug}: dependency {dependency} is disabled")
    return projects


def check_config(root, slug, entry):
    path = root / config_path(slug)
    public = path.parent / "public"
    if (path.resolve() != path or not (public / "index.html").is_file()
            or not (public / ".assetsignore").is_file()
            or any(file.is_symlink() for file in public.rglob("*")) or public.is_symlink()):
        raise ValueError(f"{slug}: expected regular config and public files with .assetsignore")
    config = parse(path.read_text())
    if not isinstance(config, dict) or config.keys() - CONFIG_FIELDS:
        raise ValueError(f"{slug}: unsupported Wrangler config fields (routing is managed separately)")
    if (config.get("name") != f"zane-{slug}" or config.get("workers_dev") is not False
            or config.get("preview_urls") is not False
            or config.get("assets", {}).get("directory") != "./public"):
        raise ValueError(f"{slug}: invalid Worker name, assets directory, or preview settings")
    main = config.get("main")
    if main is not None:
        script = (path.parent / main).resolve()
        if not script.is_file() or not (
            script.is_relative_to(path.parent / "src")
            or script.is_relative_to(root / "workers")
            and script.relative_to(root).as_posix() in entry["watch"]
        ):
            raise ValueError(f"{slug}: main must be in the project src/ or its shared watch list")
    for binding in config.get("services", []):
        if (set(binding) != {"binding", "service"}
                or binding["service"] not in {f"zane-{dep}" for dep in entry["depends_on"]}):
            raise ValueError(f"{slug}: each service binding must target a registered dependency")


def git(*args, root=ROOT):
    return subprocess.check_output(["git", *args], cwd=root)


def affected(projects, before, after, root=ROOT):
    if re.fullmatch(r"0{40}", before):
        return {slug for slug, project in projects.items() if project["enabled"]}
    paths = set(git("diff", "--no-renames", "--name-only", "-z", before, after, "--",
                    root=root).decode().split("\0"))
    previous, merged = (parse(git("show", f"{rev}:projects.json", root=root))
                        if subprocess.run(["git", "cat-file", "-e", f"{rev}:projects.json"],
                                          cwd=root, capture_output=True).returncode == 0 else {}
                        for rev in (before, after))
    return {
        slug for slug, entry in projects.items()
        if entry["enabled"] and (
            previous.get(slug) != merged.get(slug)
            or any(path.startswith(f"sites/{slug}/") for path in paths)
            or paths.intersection(set(entry["watch"]) | set(previous.get(slug, {}).get("watch", [])))
        )
    }


def scaffold(slug, root=ROOT):
    projects = load(root)
    if not SLUG.fullmatch(slug) or slug in RESERVED or slug in projects:
        raise ValueError(f"Invalid, reserved or existing slug: {slug}")
    if any(project["subdomain"] == slug for project in projects.values()):
        raise ValueError(f"Subdomain already in registry: {slug}")
    destination = root / "sites" / slug
    if destination.exists() or destination.is_symlink():
        raise ValueError(f"Path already exists: {destination}")
    projects[slug] = {"enabled": False, "subdomain": slug, "depends_on": [], "watch": []}
    with tempfile.TemporaryDirectory(dir=root) as work:
        temp = Path(work)
        site = temp / slug
        shutil.copytree(root / "templates/static-worker", site)
        config = parse((site / "wrangler.json").read_text())
        config["name"] = f"zane-{slug}"
        (site / "wrangler.json").write_text(json.dumps(config, indent=2) + "\n")
        registry = temp / "projects.json"
        registry.write_text(json.dumps(projects, indent=2, sort_keys=True) + "\n")
        site.rename(destination)
        try:
            registry.replace(root / "projects.json")
        except OSError:
            destination.rename(site)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate")
    commands.add_parser("configs")
    new = commands.add_parser("new")
    new.add_argument("slug")
    args = parser.parse_args()
    try:
        if args.command == "new":
            scaffold(args.slug)
            print(f"Created sites/{args.slug} with deployment disabled.")
            return
        projects = load()
        if args.command == "configs":
            for slug in ordered(projects):
                print(config_path(slug))
        else:
            print(f"Validated {len(projects)} projects.")
    except (ValueError, TypeError, AttributeError, OSError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
