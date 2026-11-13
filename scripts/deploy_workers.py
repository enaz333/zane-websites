#!/usr/bin/env python3
"""Plan and publish selected Workers from a reviewed main branch."""

import argparse
import json
import os
import re
import subprocess
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, urlopen

from projects import ROOT, affected, config_path, load, ordered
from check_club_launch import candidate
from stage_workers import NoRedirect, check, check_project_routes

ZONE = "zanegiordano.com"
SHA = re.compile(r"[a-f0-9]{40}")


class CloudflareError(ValueError):
    def __init__(self, method, path, status, codes):
        super().__init__(f"Cloudflare {method} {path}: HTTP {status}")
        self.codes = codes


class Cloudflare:
    def __init__(self, token):
        self.token = token

    def request(self, path, payload=None):
        request = Request(
            "https://api.cloudflare.com/client/v4" + path,
            data=None if payload is None else json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            method="GET" if payload is None else "PUT",
        )
        try:
            with urlopen(request, timeout=30) as response:
                data = json.load(response)
        except HTTPError as error:
            try:
                codes = {item["code"] for item in json.load(error).get("errors", [])}
            except (ValueError, KeyError, TypeError):
                codes = set()
            raise CloudflareError(request.method, path, error.code, codes) from None
        if data.get("success") is not True or "result" not in data:
            raise ValueError(f"Cloudflare {request.method} {path} failed")
        return data["result"]


def check_domain(api, account, zone, hostname, worker):
    base = f"/accounts/{account}/workers"
    existing = api.request(f"{base}/domains?" + urlencode({"hostname": hostname}))
    if not isinstance(existing, list):
        raise ValueError(f"{hostname}: invalid Custom Domain lookup response")
    if existing:
        if len(existing) == 1 and all(existing[0].get(key) == value for key, value in {
            "hostname": hostname, "service": worker, "zone_id": zone, "enabled": True,
        }.items()):
            return False
        raise ValueError(f"{hostname}: conflicting Cloudflare Custom Domain")
    for name in (hostname, f"*.{ZONE}"):
        records = api.request(f"/zones/{zone}/dns_records?" + urlencode({"name.exact": name}))
        if not isinstance(records, list) or records:
            raise ValueError(f"{hostname}: DNS conflict or invalid lookup for {name}")
    return True


def attach_domain(api, account, zone, hostname, worker):
    if check_domain(api, account, zone, hostname, worker):
        # Same endpoint used by Wrangler 4.161.0, with all overwrite controls off.
        api.request(f"/accounts/{account}/workers/scripts/{worker}/domains/records", {
            "override_scope": False,
            "override_existing_origin": False,
            "override_existing_dns_record": False,
            "origins": [{"hostname": hostname, "zone_id": zone,
                         "enabled": True, "previews_enabled": False}],
        })
        if check_domain(api, account, zone, hostname, worker):
            raise ValueError(f"{hostname}: Cloudflare did not confirm attachment")


def select(projects, args):
    if args.project is not None:
        if args.project == "all":
            return {slug for slug, project in projects.items() if project["enabled"]}
        if not projects.get(args.project, {}).get("enabled"):
            raise ValueError(f"Unknown or disabled project: {args.project}")
        return {args.project}
    if not args.before or not args.after or not all(SHA.fullmatch(sha) for sha in (args.before, args.after)):
        raise ValueError("Provide --project or both full commit SHAs (--before and --after)")
    return affected(projects, args.before, args.after)


def required_dependencies(projects, selected):
    needed = set()
    for slug in reversed(ordered(projects)):
        if slug in selected or slug in needed:
            needed.update(projects[slug]["depends_on"])
    return needed - selected


def active_version(api, account, slug, *, allow_missing=False):
    script = f"/accounts/{account}/workers/scripts/zane-{slug}"
    try:
        api.request(script + "/settings")
    except CloudflareError as error:
        if allow_missing and 10007 in error.codes:
            return None
        raise
    result = api.request(script + "/deployments")
    try:
        latest = max(result["deployments"], key=lambda item: item["created_on"])
        versions = latest["versions"]
    except (KeyError, ValueError, TypeError) as error:
        raise ValueError(f"{slug}: could not determine active deployment") from error
    if len(versions) != 1 or versions[0]["percentage"] != 100:
        raise ValueError(f"{slug}: resolve split traffic before publishing")
    version = versions[0].get("version_id", "")
    if not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", version):
        raise ValueError(f"{slug}: invalid prior version")
    return version


def record(message):
    print(message, flush=True)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a") as report:
            report.write(message + "\n\n")


def verify_legacy():
    club = "https://coolstrangersclub.com"
    personal = "https://zanegiordano.com"
    opener = build_opener(NoRedirect())
    check(opener, "https://www.coolstrangersclub.com", "/photo-notes/?card=probe%2B1",
          301, location=club + "/photo-notes/?card=probe%2B1")
    check(opener, personal, "/unregistered-release-check", 404)
    candidate(club, personal, "https://acl.zanegiordano.com", "https://coachella.zanegiordano.com")


def publish(projects, selected, *, provision=False):
    if not selected:
        return
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not re.fullmatch(r"[a-f0-9]{32}", account) or not token:
        raise ValueError("Configure the Cloudflare account ID and Worker deploy token")
    worker_api = Cloudflare(token)
    for slug in sorted(required_dependencies(projects, selected)):
        worker_api.request(f"/accounts/{account}/workers/scripts/zane-{slug}/settings")

    domains = {slug: f"{projects[slug]['subdomain']}.{ZONE}" for slug in selected
               if projects[slug]["subdomain"] is not None}
    zone = os.environ.get("CLOUDFLARE_ZONE_ID", "")
    if provision:
        domain_token = os.environ.get("CLOUDFLARE_DOMAIN_API_TOKEN", "")
        if not re.fullmatch(r"[a-f0-9]{32}", zone) or not domain_token:
            raise ValueError("Configure the Cloudflare zone ID and Custom Domain token")
        domain_api = Cloudflare(domain_token)
    else:
        domain_api = worker_api
    new_domains = set()
    if domains:
        for slug, hostname in sorted(domains.items()):
            if provision:
                if check_domain(domain_api, account, zone, hostname, f"zane-{slug}"):
                    new_domains.add(slug)
            else:
                # Read only. Routine releases can update an already attached Worker.
                matches = domain_api.request(f"/accounts/{account}/workers/domains?" +
                                             urlencode({"hostname": hostname}))
                if not isinstance(matches, list) or len(matches) != 1 or not all(
                    matches[0].get(key) == value for key, value in {
                        "hostname": hostname, "service": f"zane-{slug}", "enabled": True,
                    }.items()
                ):
                    raise ValueError(f"{slug}: approve provisioning before publishing")

    order = [slug for slug in ordered(projects) if slug in selected]
    before = {
        slug: active_version(worker_api, account, slug,
                             allow_missing=provision and slug in domains)
        for slug in order
    }
    if any(before[slug] is None and slug not in new_domains for slug in order):
        raise ValueError("Expected an unclaimed hostname for each new Worker")
    for slug, version in before.items():
        record(f"Prior version for {slug}: {version or 'new Worker'}")

    env = dict(os.environ)
    env.pop("CLOUDFLARE_DOMAIN_API_TOKEN", None)
    attempted = []
    try:
        for slug in order:
            if slug == "personal":
                check_project_routes(projects, "https://zanegiordano.com", check_redirects=False)
            if active_version(worker_api, account, slug, allow_missing=before[slug] is None) != before[slug]:
                raise ValueError(f"{slug}: deployed version changed after preflight")
            attempted.append(slug)
            subprocess.run(["npx", "--no-install", "wrangler", "deploy", "--config", str(config_path(slug))],
                           cwd=ROOT, env=env, check=True, timeout=180)
            record(f"Published {slug}: {active_version(worker_api, account, slug)}")
            if provision and slug in domains:
                attach_domain(domain_api, account, zone, domains[slug], f"zane-{slug}")
                if slug in new_domains:
                    record(f"Domain attachment verified for {slug}: {domains[slug]}")
            if slug in domains:
                destination = urlsplit(projects[slug]["canonical_url"])
                check(build_opener(NoRedirect()), f"https://{domains[slug]}", destination.path, 200)

            if slug in {"acl", "coachella"}:
                origin = f"https://{slug}.zanegiordano.com"
                marker = b"ACL" if slug == "acl" else b"Coachella"
                check(build_opener(NoRedirect()), origin, f"/{slug}/", 200, marker=marker)
                check(build_opener(NoRedirect()), origin, f"/{slug}/app.js", 200)
        if "personal" in selected:
            check_project_routes(projects, "https://zanegiordano.com")
        if selected.intersection({"club", "personal", "photo-notes", "acl", "coachella"}):
            verify_legacy()
    except (ValueError, OSError, subprocess.SubprocessError):
        for slug in reversed(attempted):
            if before[slug] is None:
                record(f"Owner follow-up: review new Worker and domain for {slug}")
                continue
            try:
                if active_version(worker_api, account, slug) != before[slug]:
                    subprocess.run(["npx", "--no-install", "wrangler", "rollback", before[slug],
                                    "--name", f"zane-{slug}", "--message", "Release verification failed"],
                                   cwd=ROOT, env=env, check=True, timeout=90)
                if active_version(worker_api, account, slug) != before[slug]:
                    raise ValueError("Rollback version did not become active")
                record(f"Restored {slug}: {before[slug]}")
            except (ValueError, OSError, subprocess.SubprocessError):
                record(f"Owner follow-up: restore {slug} to {before[slug]}")
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", help="Enabled slug or 'all'")
    parser.add_argument("--before")
    parser.add_argument("--after")
    parser.add_argument("--apply", action="store_true", help="Publish the plan to Cloudflare")
    parser.add_argument("--provision", action="store_true", help="Allow approved domain provisioning")
    args = parser.parse_args()
    try:
        if args.project is not None and (args.before or args.after):
            raise ValueError("Use either --project or a commit range")
        projects = load()
        selected = select(projects, args)
        print("Workers: " + (", ".join(slug for slug in ordered(projects) if slug in selected)
                             or "none"), flush=True)
        if args.apply:
            publish(projects, selected, provision=args.provision)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
