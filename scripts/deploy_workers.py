#!/usr/bin/env python3
"""Plan and publish selected Workers from a reviewed main branch."""

import argparse
import json
import os
import re
import subprocess
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from projects import ROOT, affected, config_path, load, ordered

ZONE = "zanegiordano.com"
SHA = re.compile(r"[a-f0-9]{40}")


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
            raise ValueError(f"Cloudflare {request.method} {path}: HTTP {error.code}") from None
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


def publish(projects, selected):
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
    if domains:
        zone = os.environ.get("CLOUDFLARE_ZONE_ID", "")
        domain_token = os.environ.get("CLOUDFLARE_DOMAIN_API_TOKEN", "")
        if not re.fullmatch(r"[a-f0-9]{32}", zone) or not domain_token:
            raise ValueError("Configure the Cloudflare zone ID and Custom Domain token")
        domain_api = Cloudflare(domain_token)
        for slug, hostname in sorted(domains.items()):
            check_domain(domain_api, account, zone, hostname, f"zane-{slug}")

    # Keep the domain token away from Wrangler and its build subprocesses.
    env = dict(os.environ)
    env.pop("CLOUDFLARE_DOMAIN_API_TOKEN", None)
    for slug in ordered(projects):
        if slug not in selected:
            continue
        subprocess.run(["npx", "--no-install", "wrangler", "deploy", "--config", str(config_path(slug))],
                       cwd=ROOT, env=env, check=True)
        if slug in domains:
            attach_domain(domain_api, account, zone, domains[slug], f"zane-{slug}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", help="Enabled slug or 'all'")
    parser.add_argument("--before")
    parser.add_argument("--after")
    parser.add_argument("--apply", action="store_true", help="Publish the plan to Cloudflare")
    args = parser.parse_args()
    try:
        if args.project is not None and (args.before or args.after):
            raise ValueError("Use either --project or a commit range")
        projects = load()
        selected = select(projects, args)
        print("Workers: " + (", ".join(slug for slug in ordered(projects) if slug in selected)
                             or "none"), flush=True)
        if args.apply:
            publish(projects, selected)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
