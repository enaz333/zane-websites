"""Generate Studio's conservative apex collision inventory from repository source."""
import argparse
import json

if __package__:
    from .projects import ROOT, RESERVED_PATHS, load
else:
    from projects import ROOT, RESERVED_PATHS, load

OUTPUT = ROOT / "workers/studio-paths.json"


def inventory(root=ROOT):
    projects = load(root)
    paths = set(RESERVED_PATHS) | set(projects)
    paths.update(entry["subdomain"] for entry in projects.values() if entry["subdomain"])
    for slug, entry in projects.items():
        paths.add(entry["short_path"].split("/")[1].lower())
        # The Club tree also contains the historical aliases.
        for item in (root / "sites" / slug / "public").iterdir():
            if not item.name.startswith((".", "_")):
                paths.add(item.name.lower())
    return sorted(paths - {""})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = json.dumps(inventory(), indent=2) + "\n"
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text() != expected:
            parser.exit(1, "Studio route inventory is stale; run python3 scripts/studio_paths.py\n")
    else:
        OUTPUT.write_text(expected)
