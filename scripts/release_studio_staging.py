"""Initialize the two private Studio staging Workers from protected main."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener

from prepare_studio_staging import BUDGET, DATABASE, DISPATCH_CONNECTION, DISPATCH_OBSERVABILITY, ORIGIN, ROOT, prepare
from release_studio import NoRedirect, SHA, UUID, StudioCloudflare, record, wrangler

DISPATCH = "zane-studio-dispatch-staging"
MIGRATIONS = {"0001_tasks.sql", "0002_execution.sql", "0003_dispatch.sql"}
DISPATCH_SECRETS = {"STUDIO_OPENAI_KEY", "STUDIO_GITHUB_PRIVATE_KEY", "STUDIO_CHECK_SECRET"}
ACCESS = ("ACCESS_TEAM_ORIGIN", "ACCESS_AUD", "STUDIO_OWNER_EMAIL")
RECOVERY_WEB_VERSION = "427e7aff-6a11-4ce0-a6b0-f3d89ff8f735"
RECOVERY_WEB_SHA = "c8465075f889f7cb4db2e243f4ebac48d0ebcccf"
LUNA_RATE_CARD = "gpt-6-luna:standard:0.10:0.01:0.125:0.50:0.20:0.02:0.25:0.75"


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
        "observability": DISPATCH_OBSERVABILITY,
        "vars": {**DISPATCH_CONNECTION, "STUDIO_STAGING_ID": staging, "STUDIO_BASE_SHA": base, "STUDIO_EXECUTION_ENABLED": "false",
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

    def exists(self):
        return self.script("settings", missing_worker=True) is not None

    def active(self):
        if not self.exists():
            return None
        deployments = self.script("deployments")["deployments"]
        if not deployments:
            return None
        versions = deployments[0]["versions"]
        if len(versions) != 1 or versions[0]["percentage"] != 100 or not UUID.fullmatch(versions[0]["version_id"]):
            raise ValueError(f"{self.worker} has an unexpected traffic allocation")
        return versions[0]["version_id"]


def wait_for_version(worker, version, previous=None):
    for attempt in range(10):
        active = worker.active()
        if active == version:
            return
        if active is not None and active != previous:
            raise ValueError(f"{worker.worker} is serving a different version; inspect Deployments")
        if attempt < 9:
            time.sleep(2)
    raise ValueError(f"{worker.worker} version {version} was uploaded but no active deployment became visible")


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


def verify_marker(plan, env, staging):
    flags = ("DB", "--remote", "--config", str(plan / "web.json"))
    result = subprocess.check_output(
        ["npx", "--no-install", "wrangler", "d1", "execute", *flags, "--json",
         "--command", "SELECT staging_id FROM studio_dispatch_environment WHERE id = 1"],
        cwd=ROOT, env=env, timeout=60, stderr=subprocess.DEVNULL,
    )
    (query,) = json.loads(result)
    if query.get("success") is not True or query.get("results") != [{"staging_id": staging}]:
        raise ValueError("Staging D1 marker verification failed")


def deploy_worker(worker, config, env, base, staging, runtime=None, *, previous=None, rate_card=None, retained_secrets=()):
    output = config.with_suffix(".jsonl")
    flags = []
    if runtime is not None:
        path = config.with_name("runtime.json")
        path.touch(mode=0o600)
        path.write_text(json.dumps(runtime))
        flags = ["--secrets-file", str(path)]
    # Refresh validates the exact active configuration and allows the reviewed
    # base SHA update after dashboard changes. Other releases stay strict.
    strict = () if worker.worker == DISPATCH and previous is not None else ("--strict",)
    wrangler("deploy", "--config", str(config), *strict, "--no-autoconfig", "--tag", base,
             *flags, env=env | {"WRANGLER_OUTPUT_FILE_PATH": str(output)})
    (entry,) = [item for line in output.read_text().splitlines() if (item := json.loads(line))["type"] == "deploy"]
    version = entry["version_id"]
    if entry["worker_name"] != worker.worker or not UUID.fullmatch(version):
        raise ValueError("Unexpected Wrangler deployment result")
    record(f"{worker.worker}: uploaded version `{version}`.")
    wait_for_version(worker, version, previous)
    verify_worker_version(worker, version, base, staging, runtime, rate_card=rate_card,
                          retained_secrets=retained_secrets)
    record(f"{worker.worker}: version `{version}` active at 100%; workers.dev and previews disabled.")


def verify_worker_version(worker, version, base, staging, runtime=None, *, rate_card=None, retained_secrets=()):
    worker.require_private_endpoints()
    info = worker.script(f"versions/{version}")
    if info.get("annotations", {}).get("workers/tag") != base:
        raise ValueError("Worker version does not match the reviewed source tag")
    bindings = info["resources"]["bindings"]
    databases = [binding for binding in bindings if binding["type"] == "d1"]
    if (info["id"] != version or len(databases) != 1 or databases[0]["name"] != "DB"
            or (databases[0].get("database_id") or databases[0].get("id")) != staging):
        raise ValueError("Deployed Worker does not bind exclusively to staging D1")
    secrets = {binding["name"] for binding in bindings if binding["type"] == "secret_text"}
    if secrets != (set(ACCESS) if runtime is not None else set(retained_secrets)):
        raise ValueError("Deployed Worker has unexpected secret bindings")
    expected_vars = ({"STUDIO_ORIGIN": ORIGIN, "STUDIO_QUEUE_ENABLED": "true"} if runtime is not None else
                     {**DISPATCH_CONNECTION, "STUDIO_STAGING_ID": staging, "STUDIO_BASE_SHA": base,
                      "STUDIO_EXECUTION_ENABLED": "false",
                      "STUDIO_RUN_MICROS": BUDGET, "STUDIO_MONTH_MICROS": BUDGET})
    if rate_card is not None:
        expected_vars["STUDIO_RATE_CARD"] = rate_card
    if {binding["name"]: binding["text"] for binding in bindings if binding["type"] == "plain_text"} != expected_vars:
        raise ValueError("Deployed Worker has unexpected runtime variables")


def recover_dispatcher(workers, plan, d1_env, worker_env, base, staging, runtime):
    web, dispatcher = workers
    if web.active() != RECOVERY_WEB_VERSION or dispatcher.exists():
        raise ValueError("Recovery requires the recorded web version at 100% and an absent dispatcher")
    verify_worker_version(web, RECOVERY_WEB_VERSION, RECOVERY_WEB_SHA, staging, runtime)
    verify_marker(plan, d1_env, staging)
    require_unattached(web)
    if web.active() != RECOVERY_WEB_VERSION or dispatcher.exists():
        raise ValueError("Staging changed during recovery preflight")
    record(f"Verified staging marker `{staging}`; preserving web version `{RECOVERY_WEB_VERSION}` at 100%.")
    deploy_worker(dispatcher, plan / "dispatcher.json", worker_env, base, staging)
    require_unattached(web)
    if web.active() != RECOVERY_WEB_VERSION:
        raise ValueError("Web deployment changed during recovery")


def require_inert_dispatcher(worker):
    worker.require_private_endpoints()
    if (worker.get("/workers/domains?" + urlencode({"service": DISPATCH})) != []
            or worker.get(f"/workers/services/{DISPATCH}/environments/production/routes") != []
            or worker.script("schedules")["schedules"] != []):
        raise ValueError("Dispatcher must have no routes, custom domains, or cron")


def refresh_dispatcher(worker, plan, d1_env, worker_env, staging, expected, base):
    if not UUID.fullmatch(expected) or worker.active() != expected:
        raise ValueError("Active dispatcher version does not match the reviewed baseline")
    require_inert_dispatcher(worker)
    bindings = worker.script(f"versions/{expected}")["resources"]["bindings"]
    db = [item for item in bindings if item["type"] == "d1"]
    variables = {item["name"]: item["text"] for item in bindings if item["type"] == "plain_text"}
    secrets = {item["name"] for item in bindings if item["type"] == "secret_text"}
    if not secrets <= DISPATCH_SECRETS:
        raise ValueError("Existing dispatcher has unexpected secret bindings")
    if (len(db) != 1 or db[0]["name"] != "DB" or (db[0].get("database_id") or db[0].get("id")) != staging
            or variables.get("STUDIO_STAGING_ID") != staging or variables.get("STUDIO_EXECUTION_ENABLED") != "false"
            or "STUDIO_TEST_TASK_ID" in variables
            or any(item["type"] not in {"d1", "plain_text", "secret_text"} for item in bindings)):
        raise ValueError("Existing dispatcher is not disabled with only staging bindings")
    verify_marker(plan, d1_env, staging)
    config = plan / "dispatcher.json"
    dispatcher = json.loads(config.read_text())
    if dispatcher["vars"]["STUDIO_BASE_SHA"] != base:
        raise ValueError("Dispatcher config must match the reviewed main SHA")
    dispatcher["vars"]["STUDIO_RATE_CARD"] = LUNA_RATE_CARD
    # Only the base pin may differ on a connected dispatcher. Also accept the
    # original disabled deployment, before the connection settings were added.
    prior_base = variables.get("STUDIO_BASE_SHA", "")
    prior = dispatcher["vars"] | {"STUDIO_BASE_SHA": prior_base}
    legacy = {key: value for key, value in prior.items()
              if key not in DISPATCH_CONNECTION and key != "STUDIO_RATE_CARD"}
    legacy.update(STUDIO_RUN_MICROS="419440", STUDIO_MONTH_MICROS="419440")
    if not SHA.fullmatch(prior_base) or variables not in (prior, legacy):
        raise ValueError("Existing dispatcher variables differ from the reviewed refresh baseline")

    config.write_text(json.dumps(dispatcher))
    require_inert_dispatcher(worker)
    if worker.active() != expected:
        raise ValueError("Dispatcher changed during refresh preflight")
    record(f"Prior dispatcher version: `{expected}`. Verified D1 marker `{staging}` and reviewed source `{base}`.")
    deploy_worker(worker, config, worker_env, base, staging, previous=expected, rate_card=LUNA_RATE_CARD,
                  retained_secrets=secrets)
    require_inert_dispatcher(worker)


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
        refresh = env.get("STUDIO_REFRESH_DISPATCHER_VERSION", "")
        recovery = env.get("STUDIO_RECOVER_DISPATCHER", "false")
        if refresh and recovery != "false":
            raise ValueError("Choose only one staging release mode")
        if not refresh:
            require_unattached(workers[0])
        verify_databases(StudioCloudflare(account, d1), staging, production)
        record(f"Reviewed SHA `{base}`; verified staging D1 `{staging}` and production D1 `{production}`.")
        d1_env = cli_env(env, account, d1, directory)
        worker_env = cli_env(env, account, deploy, directory)
        if refresh:
            refresh_dispatcher(workers[1], plan, d1_env, worker_env, staging, refresh, base)
            return
        if recovery == "true":
            recover_dispatcher(workers, plan, d1_env, worker_env, base, staging, runtime)
            return
        if recovery != "false" or any(worker.exists() for worker in workers):
            raise ValueError("Initial deployment requires both staging Workers to be absent")
        record("Prior staging Worker versions: none. On partial failure, keep the hostname unattached, "
               "retain staging D1 and the marker, and inspect recorded versions before any recovery.")
        migrate(plan, d1_env, staging)
        verify_marker(plan, d1_env, staging)
        record(f"Staging migrations 0001–0003 and marker `{staging}` verified.")
        require_unattached(workers[0])
        if any(worker.exists() for worker in workers):
            raise ValueError("Staging Workers appeared during migration")
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
