"""Write staging-only Wrangler configs and marker SQL to a new directory."""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://studio-staging.zanegiordano.com"
DATABASE = "zane-studio-staging"
BUDGET = "262548"
DISPATCH_OBSERVABILITY = {
    "enabled": True,
    "logs": {"enabled": True, "invocation_logs": False, "head_sampling_rate": 1},
}
DISPATCH_CONNECTION = {
    "STUDIO_CHECK_ORIGIN": "https://studio-validator-staging-7a3kki4cka-uc.a.run.app",
    "STUDIO_GITHUB_APP_ID": "5741231",
    "STUDIO_GITHUB_INSTALLATION_ID": "181522020",
}


def prepare(args):
    for value in (args.database, args.production_database):
        if not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", value):
            raise ValueError("Supply both database UUIDs")
    if args.database == args.production_database:
        raise ValueError("Staging and production database UUIDs must differ")
    if not re.fullmatch(r"[a-f0-9]{40}", args.base):
        raise ValueError("Supply the full reviewed main SHA")
    main = subprocess.check_output(["git", "rev-parse", "origin/main"], cwd=ROOT, text=True).strip()
    if args.base != main:
        raise ValueError("Fetch origin/main and use its reviewed head")
    binding = [{"binding": "DB", "database_name": DATABASE, "database_id": args.database,
                "migrations_dir": str(ROOT / "sites/studio/migrations")}]
    web = json.loads((ROOT / "sites/studio/wrangler.json").read_text())
    web.update(name=DATABASE, main=str(ROOT / "workers/studio-staging.mjs"), d1_databases=binding,
               vars={"STUDIO_ORIGIN": ORIGIN, "STUDIO_QUEUE_ENABLED": "true"})
    web["assets"]["directory"] = str(ROOT / "sites/studio/public")
    dispatcher = json.loads((ROOT / "sites/studio/executor/wrangler.json").read_text())
    dispatcher.update(name="zane-studio-dispatch-staging", observability=DISPATCH_OBSERVABILITY,
                      main=str(ROOT / "workers/studio-dispatch-worker.mjs"), d1_databases=binding,
                      vars={**DISPATCH_CONNECTION, "STUDIO_STAGING_ID": args.database, "STUDIO_BASE_SHA": args.base,
                            "STUDIO_EXECUTION_ENABLED": "false",
                            "STUDIO_RUN_MICROS": BUDGET, "STUDIO_MONTH_MICROS": BUDGET})
    args.out.mkdir(parents=True)
    for name, config in (("web", web), ("dispatcher", dispatcher)):
        (args.out / f"{name}.json").write_text(json.dumps(config, indent=2) + "\n")
    (args.out / "marker.sql").write_text(
        "INSERT INTO studio_dispatch_environment (id, staging_id) VALUES "
        f"(1, '{args.database}') ON CONFLICT(id) DO NOTHING;\n"
        "SELECT staging_id FROM studio_dispatch_environment WHERE id = 1;\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    parser.add_argument("--production-database", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    try:
        prepare(args)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(2, f"{error}\n")


if __name__ == "__main__":
    main()
