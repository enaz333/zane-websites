"""Initialize the two private Studio staging Workers from protected main."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener

from prepare_studio_staging import BUDGET, DATABASE, ORIGIN, ROOT, prepare
from release_studio import NoRedirect, SHA, UUID, StudioCloudflare, record, wrangler

DISPATCH = "zane-studio-dispatch-staging"
MIGRATIONS = {"0001_tasks.sql", "0002_execution.sql", "0003_dispatch.sql"}
ACCESS = ("ACCESS_TEAM_ORIGIN", "ACCESS_AUD", "STUDIO_OWNER_EMAIL")


def verify_owner_approval(env):
    run_id = env.get("GITHUB_RUN_ID", "")
    token = env.get("GITHUB_TOKEN")
    if not re.fullmatch(r"[0-9]+", run_id) or env.get("GITHUB_RUN_ATTEMPT") != "1" or not token:
        raise ValueError("Require a fresh workflow dispatch and owner approval")
    url = f"https://api.github.com/repos/enaz333/zane-websites/actions/runs/{run_id}/approvals"
    request = Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    with build_opener(NoRedirect()).open(request, timeout=30) as response:
        reviews = json.load(response)
    if not any(review["state"] == "approved" and review["user"]["login"] == "enaz333"
               and any(item["name"] == "cloudflare-studio-staging" for item in review["environments"])
               for review in reviews):
        raise ValueError("No recorded owner approval for cloudflare-studio-staging")


def settings(env):
    base = env.get("REVIEWED_SHA", "")
    if (env.get("GITHUB_ACTIONS") != "true" or env.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
            or env.get("GITHUB_REPOSITORY") != "enaz333/zane-websites"
            or env.get("GITHUB_REF") != "refs/heads/main" or env.get("GITHUB_REF_PROTECTED") != "true"
            or env.get("STUDIO_STAGING_RELEASE_ENABLED") != "true"
            or not SHA.fullmatch(base) or base != env.get("GITHUB_SHA")):
        raise ValueError("Require manual dispatch on protected main with reviewed SHA and owner opt-in")
    account = env.get("CLOUDFLARE_ACCOUNT_ID", "")
    staging, production = (env.get(key, "") for key in ("STUDIO_STAGING_D1_ID", "STUDIO_PRODUCTION_D1_ID"))
    if (not re.fullmatch(r"[0-9a-f]{32}", account) or not UUID.fullmatch(staging)
            or not UUID.fullmatch(production) or staging == production):
        raise ValueError("Require a Cloudflare account and distinct staging and production D1 UUIDs")
    deploy, d1 = (env.get(key, "") for key in ("STUDIO_STAGING_DEPLOY_TOKEN", "STUDIO_STAGING_D1_TOKEN"))
    if not deploy or not d1 or deploy == d1:
        raise ValueError("Require separate Worker deployment and D1 migration tokens")
    runtime = {key: env.get(key, "") for key in ACCESS}
    if (not re.fullmatch(r"https://[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com", runtime[ACCESS[0]])
            or not re.fullmatch(r"[0-9a-f]{64}", runtime[ACCESS[1]])
            or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", runtime[ACCESS[2]])):
        raise ValueError("Require the staging Access team origin, application audience, and owner email")
    return base, account, staging, production, deploy, d1, runtime


def validate_plan(plan, staging, base):
    migration_dir = ROOT / "sites/studio/migrations"
    if {path.name for path in migration_dir.glob("*.sql")} != MIGRATIONS:
        raise ValueError("Initial staging release permits only migrations 0001–0003")
    common = {
        "compatibility_date": "2026-11-12", "workers_dev": False, "preview_urls": False,
        "d1_databases": [{"binding": "DB", "database_name": DATABASE, "database_id": staging,
                          "migrations_dir": str(migration_dir)}],
    }
    web = common | {
        "name": DATABASE, "main": str(ROOT / "workers/studio-staging.mjs"),
        "assets": {"directory": str(ROOT / "sites/studio/public"), "binding": "ASSETS", "run_worker_first": True},
        "vars": {"STUDIO_ORIGIN": ORIGIN, "STUDIO_QUEUE_ENABLED": "true"},
    }
    dispatcher = common | {
        "name": DISPATCH, "main": str(ROOT / "workers/studio-dispatch-worker.mjs"),
        "compatibility_flags": ["nodejs_compat"],
        "vars": {"STUDIO_STAGING_ID": staging, "STUDIO_BASE_SHA": base, "STUDIO_EXECUTION_ENABLED": "false",
                 "STUDIO_RUN_MICROS": BUDGET, "STUDIO_MONTH_MICROS": BUDGET},
    }
    for filename, expected in (("web.json", web), ("dispatcher.json", dispatcher)):
        actual = json.loads((plan / filename).read_text())
        if actual != expected or actual["workers_dev"] is not False or actual["preview_urls"] is not False:
            raise ValueError(f"Unexpected Studio staging configuration in {filename}")


class StagingWorker(StudioCloudflare):
    def __init__(self, account, token, worker):
        super().__init__(account, token)
        if worker not in (DATABASE, DISPATCH):
            raise ValueError("Unexpected staging Worker name")
        self.worker = worker

    def script(self, suffix, **kwargs):
        return self.get(f"/workers/scripts/{self.worker}/{suffix}", **kwargs)


def verify_databases(api, staging, production):
    for uuid, name in ((staging, DATABASE), (production, "zane-studio")):
        db = api.get(f"/d1/database/{uuid}")
        if (db.get("uuid"), db.get("name")) != (uuid, name):
            raise ValueError(f"D1 identity does not match {name}")


def cli_env(env, account, token, directory):
    return {"PATH": env["PATH"], "HOME": env["HOME"], "CI": "true",
            "WRANGLER_SEND_METRICS": "false", "WRANGLER_LOG_PATH": str(directory),
            "CLOUDFLARE_ACCOUNT_ID": account, "CLOUDFLARE_API_TOKEN": token}


def require_unattached(api):
    for params in ({"hostname": urlsplit(ORIGIN).hostname}, {"service": DATABASE}, {"service": DISPATCH}):
        if api.get("/workers/domains?" + urlencode(params)) != []:
            raise ValueError("Initial Studio staging deployment requires an unattached hostname and Workers")


def migrate(plan, env, staging):
    flags = ("DB", "--remote", "--config", str(plan / "web.json"))
    wrangler("d1", "migrations", "apply", *flags, env=env)
    wrangler("d1", "execute", *flags, "--file", str(plan / "marker.sql"), env=env)
    result = subprocess.check_output(
        ["npx", "--no-install", "wrangler", "d1", "execute", *flags, "--json",
         "--command", "SELECT staging_id FROM studio_dispatch_environment WHERE id = 1"],
        cwd=ROOT, env=env, timeout=60, stderr=subprocess.DEVNULL,
    )
    (query,) = json.loads(result)
    if query.get("success") is not True or query.get("results") != [{"staging_id": staging}]:
        raise ValueError("Staging D1 marker verification failed")


def deploy_worker(worker, config, env, base, staging, runtime=None):
    output = config.with_suffix(".jsonl")
    flags = []
    if runtime is not None:
        path = config.with_name("runtime.json")
        path.touch(mode=0o600)
        path.write_text(json.dumps(runtime))
        flags = ["--secrets-file", str(path)]
    wrangler("deploy", "--config", str(config), "--strict", "--no-autoconfig", "--tag", base,
             *flags, env=env | {"WRANGLER_OUTPUT_FILE_PATH": str(output)})
    (entry,) = [item for line in output.read_text().splitlines() if (item := json.loads(line))["type"] == "deploy"]
    version = entry["version_id"]
    if entry["worker_name"] != worker.worker or not UUID.fullmatch(version):
        raise ValueError("Unexpected Wrangler deployment result")
    record(f"{worker.worker}: uploaded version `{version}`.")
    if worker.active() != version:
        raise ValueError("Uploaded version is not the sole active version")
    worker.require_private_endpoints()
    info = worker.script(f"versions/{version}")
    bindings = info["resources"]["bindings"]
    databases = [binding for binding in bindings if binding["type"] == "d1"]
    if (info["id"] != version or len(databases) != 1 or databases[0]["name"] != "DB"
            or (databases[0].get("database_id") or databases[0].get("id")) != staging):
        raise ValueError("Deployed Worker does not bind exclusively to staging D1")
    secrets = {binding["name"] for binding in bindings if binding["type"] == "secret_text"}
    if secrets != (set(ACCESS) if runtime is not None else set()):
        raise ValueError("Deployed Worker has unexpected secret bindings")
    record(f"{worker.worker}: version `{version}` active at 100%; workers.dev and previews disabled.")


def initialize(env):
    base, account, staging, production, deploy, d1, runtime = settings(env)
    if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() != base:
        raise ValueError("Checkout does not match the reviewed workflow SHA")
    with tempfile.TemporaryDirectory(prefix="studio-staging-") as temp:
        directory = Path(temp)
        plan = directory / "plan"
        prepare(argparse.Namespace(database=staging, production_database=production, base=base, out=plan))
        validate_plan(plan, staging, base)
        workers = [StagingWorker(account, deploy, name) for name in (DATABASE, DISPATCH)]
        require_unattached(workers[0])
        if any(worker.active() is not None for worker in workers):
            raise ValueError("Initial deployment requires both staging Workers to be absent")
        verify_databases(StudioCloudflare(account, d1), staging, production)
        record(f"Reviewed SHA `{base}`; verified staging D1 `{staging}` and production D1 `{production}`.")
        record("Prior staging Worker versions: none. On partial failure, keep the hostname unattached, "
               "retain staging D1 and the marker, and inspect recorded versions before any recovery.")
        migrate(plan, cli_env(env, account, d1, directory), staging)
        record(f"Staging migrations 0001–0003 and marker `{staging}` verified.")
        require_unattached(workers[0])
        if any(worker.active() is not None for worker in workers):
            raise ValueError("Staging Workers appeared during migration")
        worker_env = cli_env(env, account, deploy, directory)
        deploy_worker(workers[0], plan / "web.json", worker_env, base, staging, runtime)
        deploy_worker(workers[1], plan / "dispatcher.json", worker_env, base, staging)
        require_unattached(workers[0])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-approval", action="store_true")
    args = parser.parse_args()
    try:
        if args.verify_approval:
            verify_owner_approval(os.environ)
        else:
            initialize(os.environ)
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        # Subprocess errors may include response data. Do not print their contents.
        raise SystemExit(str(error) if type(error) is ValueError else "Studio staging initialization failed") from None
