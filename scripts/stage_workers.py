#!/usr/bin/env python3
"""Deploy and check isolated workers.dev copies of registered projects."""

import argparse
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from projects import ROOT, config_path, load, ordered


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def staging_config(slug, names, origins):
    config = json.loads((ROOT / config_path(slug)).read_text())
    config.update(name=names[slug], workers_dev=True)
    for binding in config.get("services", []):
        binding["service"] = names[binding["service"].removeprefix("zane-")]
    if slug == "club":
        for var, target in (("PERSONAL_ORIGIN", "personal"), ("ACL_ORIGIN", "acl"),
                            ("COACHELLA_ORIGIN", "coachella")):
            config["vars"][var] = origins[target]
    return config


def check(opener, origin, path, status, *, location=None, marker=None, method="GET"):
    request = Request(origin + path, method=method)
    for attempt in range(12):
        try:
            try:
                result = opener.open(request, timeout=10)
            except HTTPError as error:
                result = error
            with result:
                if (result.code == status
                        and (location is None or result.headers.get("Location") == location)
                        and (marker is None or marker in result.read())):
                    print(f"{method} {request.full_url} → {status}", flush=True)
                    return
                problem = f"HTTP {result.code}, unexpected response"
        except (URLError, TimeoutError) as error:
            problem = str(error)
        if attempt < 11:
            time.sleep(5)
    raise ValueError(f"{method} {request.full_url}: {problem}")


def smoke(origins):
    opener = build_opener(NoRedirect())
    check(opener, origins["photo-notes"], "/PhotoNotes/", 200, marker=b"Photo Notes")
    check(opener, origins["personal"], "/", 200, marker=b"Zane Giordano")
    check(opener, origins["personal"], "/PhotoNotes?card=staging", 200, marker=b"Photo Notes")
    check(opener, origins["personal"], "/photo-notes/index.html?card=staging", 302,
          location=origins["personal"] + "/PhotoNotes?card=staging")
    check(opener, origins["personal"], "/unknown-path", 404)
    check(opener, origins["personal"], "/thanks/", 503, method="POST")
    for slug in ("acl", "coachella"):
        check(opener, origins[slug], f"/{slug}/", 200)
        check(opener, origins[slug], f"/{slug}/app.js", 200)
        check(opener, origins[slug], f"/{slug}/sample-exportify/Exportify_Test.zip", 200,
              marker=b"PK")
        check(opener, origins["club"], f"/{slug}/?source=stage", 302,
              location=f"{origins[slug]}/{slug}/?source=stage")
    check(opener, origins["club"], "/", 200, marker=b"forms.gle/QemuZmv9eEhDkomCA")
    check(opener, origins["club"], "/redesign.html", 200)
    check(opener, origins["club"], "/BuildFest", 301, location=origins["club"] + "/buildfest/")
    check(opener, origins["club"], "/buildfest/gallery.html", 200)
    check(opener, origins["club"], "/buildfest/BuildFest_Support_Plugin.zip", 200, marker=b"PK")
    check(opener, origins["club"], "/photo-notes/?card=staging", 302,
          location=origins["personal"] + "/PhotoNotes?card=staging")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subdomain", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", args.subdomain):
        parser.error("Provide only the account's workers.dev subdomain label")
    if not re.fullmatch(r"[0-9]{1,20}", args.run_id):
        parser.error("Provide a numeric GitHub run ID")
    projects = load()
    slugs = [slug for slug in ordered(projects) if projects[slug]["enabled"]]
    names = {slug: f"zane-stage-{args.run_id}-{slug}" for slug in slugs}
    if any(len(name) > 63 for name in names.values()):
        parser.error("A temporary Worker name exceeds 63 characters")
    origins = {slug: f"https://{name}.{args.subdomain}.workers.dev" for slug, name in names.items()}
    with tempfile.TemporaryDirectory() as out:
        for slug in slugs:
            config = staging_config(slug, names, origins)
            parent = ROOT / config_path(slug).parent
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", prefix=".stage-", dir=parent) as file:
                json.dump(config, file)
                file.flush()
                command = ["npx", "--no-install", "wrangler", "deploy", "--config", file.name]
                if args.dry_run:
                    command += ["--dry-run", "--outdir", str(Path(out) / slug)]
                subprocess.run(command, cwd=ROOT, check=True)
            print(origins[slug], flush=True)
    if not args.dry_run:
        smoke(origins)
        if summary := os.getenv("GITHUB_STEP_SUMMARY"):
            with open(summary, "a") as file:
                file.write("All launch smoke checks passed.\n\n")
                for slug, origin in origins.items():
                    file.write(f"- {slug}: {origin}\n")


if __name__ == "__main__":
    main()
