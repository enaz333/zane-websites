#!/usr/bin/env python3
"""Release the private Studio Worker. No command in this module attaches a domain."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener

from deploy_workers import record
from projects import ROOT, load, parse
from stage_workers import NoRedirect, USER_AGENT

WORKER = "zane-studio"
HOST = "studio.zanegiordano.com"
ORIGIN = f"https://{HOST}"
CONFIG = ROOT / "sites/studio/wrangler.json"
UUID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")
SHA = re.compile(r"[a-f0-9]{40}")
SETTINGS = ("ACCESS_TEAM_ORIGIN", "ACCESS_AUD", "STUDIO_OWNER_EMAIL", "STUDIO_ORIGIN")
FIXTURE = {
    "STUDIO_D1_DATABASE_ID": "00000000-0000-4000-8000-000000000002",
    "ACCESS_TEAM_ORIGIN": "https://studio-fixture.cloudflareaccess.com",
    "ACCESS_AUD": "a" * 64,
    "STUDIO_OWNER_EMAIL": "owner@example.com",
    "STUDIO_ORIGIN": ORIGIN,
}


def release_config(env):
    studio = load()["studio"]
    base = parse(CONFIG.read_text())
    if studio["enabled"] or studio["subdomain"] is not None or set(base) != {
        "name", "compatibility_date", "workers_dev", "preview_urls", "assets", "main",
    } or base["name"] != WORKER or base["workers_dev"] is not False or base["preview_urls"] is not False or (
        base["assets"] != {"directory": "./public", "binding": "ASSETS", "run_worker_first": True}
        or base["main"] != "../../workers/studio.mjs"
    ):
        raise ValueError("Studio release config must be private, route-free and Worker-first")

    db = env.get("STUDIO_D1_DATABASE_ID", "")
    if not UUID.fullmatch(db):
        raise ValueError("Configure STUDIO_D1_DATABASE_ID with the dedicated Studio database UUID")
    runtime = {key: env.get(key, "") for key in SETTINGS}
    if (not re.fullmatch(r"https://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com",
                         runtime["ACCESS_TEAM_ORIGIN"])
            or not re.fullmatch(r"[0-9a-f]{64}", runtime["ACCESS_AUD"])
            or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", runtime["STUDIO_OWNER_EMAIL"])
            or runtime["STUDIO_ORIGIN"] != ORIGIN):
        raise ValueError("Configure all four Studio runtime settings as documented")
    # Absolute paths resolve from a private temporary directory, outside Static Assets.
    base["main"] = str((CONFIG.parent / base["main"]).resolve())
    base["assets"]["directory"] = str(CONFIG.parent / "public")
    base["d1_databases"] = [{
        "binding": "DB", "database_name": WORKER, "database_id": db,
        "migrations_dir": str(CONFIG.parent / "migrations"),
    }]
    return base, runtime


def wrangler(*args, env, quiet=True):
    result = subprocess.run(
        ["npx", "--no-install", "wrangler", *args], cwd=ROOT, env=env, timeout=240,
        stdout=subprocess.DEVNULL if quiet else None, stderr=subprocess.DEVNULL if quiet else None,
    )
    if result.returncode:
        raise ValueError(f"Wrangler {args[0]} failed (exit {result.returncode})")


class StudioCloudflare:
    """Read-only API checks. Wrangler performs the approved mutations."""

    def __init__(self, account, token):
        self.account = account
        self.token = token
        self.opener = build_opener(NoRedirect())

    def get(self, path, *, missing_worker=False):
        request = Request("https://api.cloudflare.com/client/v4/accounts/" + self.account + path,
                          headers={"Authorization": "Bearer " + self.token})
        try:
            with self.opener.open(request, timeout=30) as response:
                data = json.load(response)
        except HTTPError as err:
            if missing_worker and err.code == 404:
                errors = json.load(err).get("errors", [])
                if any(item.get("code") == 10007 for item in errors):
                    return None
            raise ValueError(f"Studio Cloudflare preflight failed (HTTP {err.code})") from None
        if data.get("success") is not True or "result" not in data:
            raise ValueError("Studio Cloudflare verification failed")
        return data["result"]

    def script(self, suffix, **kwargs):
        return self.get(f"/workers/scripts/{WORKER}/{suffix}", **kwargs)

    def active(self):
        if self.script("settings", missing_worker=True) is None:
            return None
        try:
            latest = max(self.script("deployments")["deployments"], key=lambda item: item["created_on"])
            versions = latest["versions"]
            if len(versions) == 1 and versions[0]["percentage"] == 100:
                version = versions[0]["version_id"]
                if UUID.fullmatch(version):
                    return version
        except (KeyError, TypeError, ValueError):
            pass
        raise ValueError("Studio must have one active version at 100%; check Deployments")

    def require_private_endpoints(self):
        subdomain = self.script("subdomain")
        if subdomain.get("enabled") is not False or subdomain.get("previews_enabled") is not False:
            raise ValueError("Disable Studio workers.dev and preview URLs before proceeding")

    def hostname_attached(self):
        results = self.get("/workers/domains?" + urlencode({"hostname": HOST}))
        if results == []:
            return False
        if not isinstance(results, list) or len(results) != 1 or not all(
            results[0].get(key) == value for key, value in {
                "hostname": HOST, "service": WORKER, "zone_name": "zanegiordano.com",
                "enabled": True,
            }.items()
        ):
            raise ValueError("Studio hostname is assigned elsewhere or disabled")
        if results[0].get("previews_enabled") is not False:
            raise ValueError("Disable preview URLs on the Studio custom domain")
        return True

    def verify_database(self, db):
        database = self.get(f"/d1/database/{db}")
        if database.get("name") != WORKER or database.get("uuid") != db:
            raise ValueError("D1 database must be the dedicated zane-studio database")

    def verify_version(self, version, db):
        info = self.script(f"versions/{version}")
        try:
            bindings = info["resources"]["bindings"]
            by_name = {item["name"]: item for item in bindings}
            database = by_name["DB"]
            if (info["id"] != version or database["type"] != "d1"
                    or (database.get("database_id") or database.get("id")) != db
                    or any(by_name[key]["type"] != "secret_text" for key in SETTINGS)):
                raise ValueError("Unexpected bindings")
        except (KeyError, TypeError, ValueError):
            raise ValueError("Studio version has unexpected runtime bindings") from None


def verify_access_redirect(issuer):
    opener = build_opener(NoRedirect())
    for path in ("/", "/index.html", "/studio.js", "/studio.css", "/api/projects", "/api/tasks"):
        request = Request(ORIGIN + path, headers={"User-Agent": USER_AGENT})
        try:
            with opener.open(request, timeout=20) as response:
                status, headers = response.status, response.headers
        except HTTPError as err:
            status, headers = err.code, err.headers
            err.close()
        except OSError:
            raise ValueError(f"Could not reach Studio at {path}") from None
        try:
            dest = urlsplit(headers.get("Location") or "")
        except ValueError:
            raise ValueError(f"Studio returned an invalid redirect at {path} (HTTP {status})") from None
        challenged = headers.get("cf-mitigated") == "challenge"
        if (challenged or status not in (302, 303, 307, 308)
                or f"{dest.scheme}://{dest.netloc}" != issuer
                or dest.path != f"/cdn-cgi/access/login/{HOST}"):
            detail = ", Cloudflare challenge" if challenged else ""
            raise ValueError(
                f"Studio did not return the expected anonymous Access challenge at {path} "
                f"(HTTP {status}{detail})"
            )


def uploaded_version(output):
    """Correlate the active version with the version emitted by the pinned Wrangler."""
    try:
        entries = [json.loads(line) for line in output.read_text().splitlines()]
        (deployment,) = [entry for entry in entries if entry["type"] == "deploy"]
        version = deployment["version_id"]
        if deployment["worker_name"] == WORKER and UUID.fullmatch(version):
            return version
    except (OSError, KeyError, TypeError, ValueError):
        pass
    raise ValueError("Wrangler did not report an identifiable Studio deployment")


def apply(api, config, runtime, directory, env, mode, expected, source, target=None):
    database = config["d1_databases"][0]["database_id"]
    before = api.active()
    attached = api.hostname_attached()
    if before != expected or (before is None and attached):
        raise ValueError("Studio release baseline changed, or hostname is attached before initial deployment")
    if before:
        api.require_private_endpoints()
        api.verify_version(before, database)
    if attached:
        verify_access_redirect(runtime["ACCESS_TEAM_ORIGIN"])

    record(f"Reviewed workflow commit: `{source}`. Prior Studio version: `{before or 'none'}`.")
    cfg = Path(directory) / "wrangler.json"
    cfg.write_text(json.dumps(config))
    flags = ("--config", str(cfg))
    api.verify_database(database)
    if mode == "rollback":
        if not before or not target or target == before:
            raise ValueError("Rollback requires a different, recorded Studio version")
        api.verify_version(target, database)
        if api.active() != before or api.hostname_attached() != attached:
            raise ValueError("Studio deployment or hostname changed after preflight")
        wrangler("rollback", target, *flags, "--yes", "--message", f"Approved Studio rollback ({source})", env=env)
    else:
        secrets = Path(directory) / "runtime.json"
        secrets.write_text(json.dumps(runtime))
        wrangler("d1", "migrations", "apply", "DB", "--remote", *flags, env=env)
        record("Studio D1 migrations applied or already current.")
        if api.active() != before or api.hostname_attached() != attached:
            raise ValueError("Studio deployment or hostname changed after preflight")
        output = Path(directory) / "deployment.jsonl"
        wrangler("deploy", *flags, "--strict", "--no-autoconfig", "--secrets-file", str(secrets),
                 "--tag", source, "--message", f"Studio {source}",
                 env=env | {"WRANGLER_OUTPUT_FILE_PATH": str(output)})
        target = uploaded_version(output)

    after = api.active()
    if not after or after == before or (target and after != target):
        raise ValueError("Expected Studio version did not become active")
    record(f"Active Studio version: `{after}`. Previous version: `{before or 'none'}`.")
    api.require_private_endpoints()
    api.verify_version(after, database)
    if api.hostname_attached() != attached:
        raise ValueError("Studio hostname changed during release")
    if attached:
        verify_access_redirect(runtime["ACCESS_TEAM_ORIGIN"])
        record("Anonymous Access challenge verified for Studio assets and API. Owner smoke test remains manual.")
    else:
        record("Studio hostname is unattached. No public Worker or preview URL is enabled.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("dry-run", "deploy", "rollback"))
    args = parser.parse_args()
    try:
        with tempfile.TemporaryDirectory(prefix="studio-release-") as directory:
            if args.mode == "dry-run":
                config, runtime = release_config(FIXTURE)
                cfg = Path(directory) / "wrangler.json"
                cfg.write_text(json.dumps(config))
                secrets = Path(directory) / "runtime.json"
                secrets.write_text(json.dumps(runtime))
                offline = {"PATH": os.environ["PATH"], "WRANGLER_SEND_METRICS": "false",
                           "WRANGLER_LOG_PATH": directory, "CI": "true"}
                wrangler("d1", "migrations", "apply", "DB", "--local", "--config", str(cfg),
                         "--persist-to", directory, env=offline, quiet=False)
                wrangler("deploy", "--dry-run", "--no-autoconfig", "--config", str(cfg),
                         "--outdir", str(Path(directory) / "bundle"), "--secrets-file", str(secrets),
                         env=offline, quiet=False)
                return
            env = os.environ
            source, expected = env.get("GITHUB_SHA", ""), env.get("STUDIO_EXPECTED_VERSION", "")
            target = env.get("STUDIO_ROLLBACK_VERSION", "")
            account, token = env.get("CLOUDFLARE_ACCOUNT_ID", ""), env.get("CLOUDFLARE_API_TOKEN", "")
            if (env.get("STUDIO_RELEASE_ENABLED") != "true" or env.get("GITHUB_ACTIONS") != "true"
                    or env.get("GITHUB_REF_PROTECTED") != "true"
                    or env.get("GITHUB_REPOSITORY") != "enaz333/zane-websites"
                    or env.get("GITHUB_REF") != "refs/heads/main" or not SHA.fullmatch(source)
                    or not (expected == "none" or UUID.fullmatch(expected))
                    or (args.mode == "rollback" and (expected == "none" or not UUID.fullmatch(target)))
                    or (args.mode == "deploy" and target)
                    or not re.fullmatch(r"[0-9a-f]{32}", account) or not token):
                raise ValueError("Studio release requires protected main, opt-in, scoped credentials and reviewed version IDs")
            if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() != source:
                raise ValueError("Studio checkout does not match reviewed commit")
            config, runtime = release_config(env)
            cli_env = {key: env[key] for key in ("PATH", "HOME", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN")}
            cli_env.update(CI="true", WRANGLER_SEND_METRICS="false", WRANGLER_LOG_PATH=directory)
            apply(StudioCloudflare(account, token), config, runtime, directory, cli_env, args.mode,
                  None if expected == "none" else expected, source, target or None)
    except (ValueError, OSError, TypeError, AttributeError, subprocess.SubprocessError):
        # Never emit raw API responses, subprocess arguments, or runtime setting values.
        if args.mode != "dry-run":
            record("Release stopped. Check the active Studio version in Cloudflare before retrying. "
                   "If a deployment occurred, use the recorded prior version and the recovery checklist.")
        raise


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        # Only emit known operational messages; JSON errors may embed remote data.
        raise SystemExit(str(error) if type(error) is ValueError else "Studio release validation failed") from None
    except (OSError, TypeError, AttributeError, subprocess.SubprocessError):
        raise SystemExit("Studio release command or verification failed") from None
