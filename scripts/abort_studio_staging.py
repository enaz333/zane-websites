"""Close one reviewed Studio staging task using D1's rollback-on-failure SQL import."""
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, build_opener

from release_studio_staging import DISPATCH, ROOT, StagingWorker, cli_env, require_inert_dispatcher
from release_studio import NoRedirect, StudioCloudflare, record

TASK = "d8220ea5-6e14-4397-9fec-0e866f8c13d7"
DATABASE = "zane-studio-staging"
STAGING = "b034fcf2-2420-4ddc-8adc-3a88a649d37d"
LOCK = "bf05d72c-20bc-47ed-9fa1-0ff597de445b"
LOCK_UNTIL = "2026-11-13T22:01:48.694Z"
DEADLINE = "2026-11-13T23:22:48.787Z"
BASE = "9392762a0d3ef6e07bf1e3a6f221d4188e4b5265"
SQL = ROOT / "scripts/studio_staging_abort.sql"

SNAPSHOT = f"""
SELECT e.state, e.failure_code, e.pr_number, e.check_status, e.finished_at,
       d.phase, d.attempts, d.lock_id, d.lock_until, d.deadline, d.base_sha, d.month,
       d.reserved_micros, d.input_tokens, d.output_tokens,
       d.replacement IS NULL AS no_replacement, d.check_summary IS NULL AS no_check,
       d.lock_until <= strftime('%Y-%m-%dT%H:%M:%fZ','now') AS lock_expired,
       (SELECT staging_id FROM studio_dispatch_environment WHERE id=1) AS marker,
       (SELECT SUM(reserved_micros) FROM execution_dispatch WHERE month='2026-11') AS total,
       (SELECT COUNT(*) FROM execution_dispatch WHERE phase<>'done') AS active
FROM task_executions e JOIN execution_dispatch d ON e.task_id=d.task_id
WHERE e.task_id='{TASK}'
"""
AUDIT = f"SELECT * FROM execution_events WHERE task_id='{TASK}' ORDER BY id"


def d1(env, config, *args):
    result = subprocess.run(
        ["npx", "--no-install", "wrangler", "d1", "execute", DATABASE,
         "--remote", "--config", str(config), "--json", "--yes", *args],
        cwd=ROOT, env=env, timeout=180, capture_output=True,
    )
    if result.returncode:
        raise ValueError("D1 command did not confirm success")
    (query,) = json.loads(result.stdout)
    if query["success"] is not True:
        raise ValueError("D1 did not confirm success")
    results = query["results"]
    if not isinstance(results, list):
        raise ValueError("Invalid D1 results")
    return results


def import_and_verify(query, before, audit):
    """Run the import once and determine its outcome from read-only evidence."""
    confirmed = False
    try:
        (result,) = query("--file", str(SQL))
        confirmed = result["Total queries executed"] == 4
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        pass

    try:
        (after,) = query("--command", SNAPSHOT)
        events = query("--command", AUDIT)
        finished = after["finished_at"]
        expected = dict(before, state="failed", failure_code="execution_failed", phase="done",
                        lock_id=None, lock_until=None, lock_expired=None, active=0, finished_at=finished)
        terminal = (after == expected and isinstance(finished, str)
                    and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", finished)
                    and len(events) == len(audit) + 1 and events[:-1] == audit
                    and events[-1]["task_id"] == TASK and events[-1]["state"] == "failed"
                    and events[-1]["occurred_at"] == finished and events[-1]["id"] > audit[-1]["id"])
    except (OSError, ValueError, KeyError, IndexError, TypeError, subprocess.SubprocessError):
        raise ValueError("recovery_verification_unavailable: D1 outcome unverified. Inspect before retrying.") from None

    if terminal:
        return "recovery_import_confirmed" if confirmed else "recovery_import_verified_after_unclear_response"
    if not confirmed and after == before and events == audit:
        raise ValueError("recovery_original_state_observed: D1 still shows the reviewed starting state. Inspect before retrying.")
    raise ValueError("recovery_state_mismatch: D1 differs from the reviewed terminal state. Inspect before retrying.")


def require_no_publication():
    branch = "studio/copy-" + TASK
    result = subprocess.run(["git", "ls-remote", "--exit-code", "origin", "refs/heads/" + branch],
                            cwd=ROOT, capture_output=True, timeout=20)
    if result.returncode != 2:
        raise ValueError("Task branch exists or could not be checked")
    query = urlencode({"state": "all", "head": "enaz333:" + branch})
    request = Request("https://api.github.com/repos/enaz333/zane-websites/pulls?" + query,
                      headers={"Accept": "application/vnd.github+json", "User-Agent": "Zane-Studio-Recovery"})
    with build_opener(NoRedirect()).open(request, timeout=20) as response:
        if json.load(response) != []:
            raise ValueError("A matching task PR exists")


def require_disabled(worker):
    version = worker.active()
    if not version:
        raise ValueError("No active staging dispatcher version")
    require_inert_dispatcher(worker)
    bindings = worker.script(f"versions/{version}")["resources"]["bindings"]
    db = [item for item in bindings if item["type"] == "d1"]
    variables = {item["name"]: item["text"] for item in bindings if item["type"] == "plain_text"}
    if (len(db) != 1 or db[0]["name"] != "DB" or (db[0].get("database_id") or db[0].get("id")) != STAGING
            or variables.get("STUDIO_STAGING_ID") != STAGING
            or variables.get("STUDIO_EXECUTION_ENABLED") != "false"
            or "STUDIO_TEST_TASK_ID" in variables or worker.active() != version):
        raise ValueError("Staging dispatcher binding, disabled state, or active version changed")
    return version


def abort(env):
    account = env["CLOUDFLARE_ACCOUNT_ID"]
    token, deploy = env["STUDIO_STAGING_D1_TOKEN"], env["STUDIO_STAGING_DEPLOY_TOKEN"]
    if (not re.fullmatch(r"[0-9a-f]{32}", account) or env["STUDIO_STAGING_D1_ID"] != STAGING
            or not token or not deploy or token == deploy):
        raise ValueError("Require the exact staging D1 and separate staging credentials")
    db = StudioCloudflare(account, token).get(f"/d1/database/{STAGING}")
    if (db["uuid"], db["name"]) != (STAGING, DATABASE):
        raise ValueError("Staging D1 identity mismatch")
    worker = StagingWorker(account, deploy, DISPATCH)
    version = require_disabled(worker)
    with tempfile.TemporaryDirectory(prefix="studio-abort-") as tmp:
        directory = Path(tmp)
        config = directory / "wrangler.json"
        config.write_text(json.dumps({"d1_databases": [
            {"binding": "DB", "database_name": DATABASE, "database_id": STAGING}]}))
        db_env = cli_env(env, account, token, directory)
        (before,) = d1(db_env, config, "--command", SNAPSHOT)
        audit = d1(db_env, config, "--command", AUDIT)
        expected = dict(state="running", failure_code=None, pr_number=None, check_status=None, finished_at=None,
                        phase="prepare", attempts=3, lock_id=LOCK, lock_until=LOCK_UNTIL, deadline=DEADLINE,
                        base_sha=BASE, month="2026-11", reserved_micros=262548, input_tokens=None,
                        output_tokens=None, no_replacement=1, no_check=1, lock_expired=1,
                        marker=STAGING, total=262548, active=1)
        if before != expected or [event["state"] for event in audit] != ["queued", "running"]:
            raise ValueError("Task or audit history differs from the reviewed preconditions")
        require_no_publication()
        if require_disabled(worker) != version:
            raise ValueError("Dispatcher changed during the recovery preflight")
        # --file uses D1 import with rollback on failure.
        outcome = import_and_verify(lambda *args: d1(db_env, config, *args), before, audit)
        record(outcome + ": D1 terminal state and reservation verified.")
        try:
            require_no_publication()
            if require_disabled(worker) != version:
                raise ValueError("Dispatcher version changed")
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            raise ValueError("recovery_postflight_unverified: D1 terminal state verified. "
                             "GitHub or dispatcher verification failed. Inspect before retrying.") from None
        record("Original staging task failed with execution_failed. Dispatch done, lock cleared, "
               "zero active dispatches, November reservation 262548, prior audit preserved, "
               "no token usage or matching GitHub publication. Dispatcher disabled with no cron.")


if __name__ == "__main__":
    try:
        abort(os.environ)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error) if type(error) is ValueError else "Studio staging abort failed") from None
