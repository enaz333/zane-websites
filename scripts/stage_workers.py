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
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from projects import ROOT, config_path, load, ordered, public_redirects


USER_AGENT = "zane-websites-smoke/1.0 (+https://github.com/enaz333/zane-websites)"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


STAGING_FIELDS = {"name", "main", "compatibility_date", "workers_dev", "preview_urls",
                  "assets", "vars", "services"}
ASSET_FIELDS = {"directory", "binding", "html_handling", "not_found_handling", "run_worker_first"}
CLUB_ORIGINS = {"PERSONAL_ORIGIN": "personal", "ACL_ORIGIN": "acl",
                "COACHELLA_ORIGIN": "coachella"}
SITE_PREFIXES = {"acl": "/acl", "coachella": "/coachella", "photo-notes": "/PhotoNotes"}


def staging_vars(slug, origins):
    if slug == "personal":
        return {"STAGING_PROJECT_ORIGINS": origins}
    if slug == "club":
        return {key: origins[target] for key, target in CLUB_ORIGINS.items()}
    if slug in SITE_PREFIXES:
        return {"SITE_PREFIX": SITE_PREFIXES[slug]}
    return {}


def validate_staging_config(slug, config, names, origins, prefix):
    name = config.get("name")
    if (name != names[slug] or name != prefix + slug or len(name) > 63
            or not re.fullmatch(r"zane-stage-[0-9]{1,20}(?:-[0-9]{1,10})?-[a-z0-9-]+", name)):
        raise ValueError(f"{slug}: unexpected staging Worker name")
    if (config.keys() - STAGING_FIELDS or config["workers_dev"] is not True
            or config["preview_urls"] is not False):
        raise ValueError(f"{slug}: unexpected staging fields or preview settings")
    assets = config["assets"]
    if assets.keys() - ASSET_FIELDS or assets.get("directory") != "./public":
        raise ValueError(f"{slug}: unexpected staging assets configuration")
    if config.get("vars", {}) != staging_vars(slug, origins):
        raise ValueError(f"{slug}: expected test-only variables")
    allowed = set(names.values())
    for binding in config.get("services", []):
        if binding.keys() != {"binding", "service"} or binding["service"] not in allowed:
            raise ValueError(f"{slug}: service binding must target a Worker from this staging run")


def staging_config(slug, names, origins, prefix):
    config = json.loads((ROOT / config_path(slug)).read_text())
    config.update(name=names[slug], workers_dev=True, preview_urls=False)
    for binding in config.get("services", []):
        target = binding["service"].removeprefix("zane-")
        if target not in names:
            raise ValueError(f"{slug}: missing staging target for service binding")
        binding["service"] = names[target]
    config["vars"] = staging_vars(slug, origins)
    validate_staging_config(slug, config, names, origins, prefix)
    return config


def forbidden_details(response):
    headers = response.headers
    details = [f"{name}: {headers[name]!r}" for name in
               ("Server", "CF-Ray", "CF-Mitigated", "Content-Type", "CF-Error-Code")
               if name in headers]
    location = urlsplit(headers.get("Location", ""))
    body = response.read(65536).decode("utf-8", errors="replace")
    code = re.search(r"\berror(?:[\s:_-]+code)?[\s:_-]+(1[0-9]{3})\b", body, re.I)
    if code:
        details.append(f"Cloudflare error page code: {code[1]}")
    if headers.get("CF-Error-Code") == "1010" or (code and code[1] == "1010"):
        details.append("Cloudflare Browser Integrity Check (1010)")
    if (location.path.startswith("/cdn-cgi/access/")
            or "/cdn-cgi/access/" in body
            or re.search(r"Cloudflare (?:Zero Trust|Access)", body, re.I)):
        details.append("Cloudflare Access sign-in or denial marker")
    if not code and "CF-Error-Code" not in headers:
        details.append("No Cloudflare error code found in the response headers or first 64 KiB")
    return "; ".join(details)


def check(opener, origin, path, status, *, location=None, marker=None, method="GET"):
    request = Request(origin + path, headers={"User-Agent": USER_AGENT}, method=method)
    last_forbidden = None
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
                if result.code == 403:
                    last_forbidden = forbidden_details(result)
        except (URLError, TimeoutError) as error:
            problem = str(error)
        if attempt < 11:
            time.sleep(5)
    if last_forbidden is not None:
        problem += f" (last HTTP 403 details: {last_forbidden})"
    raise ValueError(f"{method} {request.full_url}: {problem}")


def check_project_routes(projects, personal_origin, origins=None, *, check_redirects=True):
    opener = build_opener(NoRedirect())
    query = "?routing_check=launch&value=a%2Bb"
    for slug, (short_path, canonical) in public_redirects(projects).items():
        url = urlsplit(canonical)
        origin = origins[slug] if origins else f"{url.scheme}://{url.netloc}"
        destination = url.path + query
        check(opener, origin, destination, 200)
        if check_redirects:
            for suffix in ("", "/"):
                check(opener, personal_origin, short_path + suffix + query, 302,
                      location=origin + destination)


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
    parser.add_argument("--run-attempt", default="1")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", args.subdomain):
        parser.error("Provide only the account's workers.dev subdomain label")
    if not re.fullmatch(r"[0-9]{1,20}", args.run_id):
        parser.error("Provide a numeric GitHub run ID")
    if not re.fullmatch(r"[0-9]{1,10}", args.run_attempt):
        parser.error("Provide a numeric GitHub run attempt")
    projects = load()
    slugs = [slug for slug in ordered(projects) if projects[slug]["enabled"]]
    prefix = f"zane-stage-{args.run_id}-{args.run_attempt}-"
    names = {slug: prefix + slug for slug in slugs}
    if any(len(name) > 63 for name in names.values()):
        parser.error("A temporary Worker name exceeds 63 characters")
    origins = {slug: f"https://{name}.{args.subdomain}.workers.dev" for slug, name in names.items()}
    # Validate the complete plan before any Worker is deployed.
    configs = {slug: staging_config(slug, names, origins, prefix) for slug in slugs}
    with tempfile.TemporaryDirectory() as out:
        for slug in slugs:
            config = configs[slug]
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
        from check_club_launch import candidate

        smoke(origins)
        candidate(origins["club"], origins["personal"], origins["acl"], origins["coachella"])
        check_project_routes(projects, origins["personal"], origins)
        if summary := os.getenv("GITHUB_STEP_SUMMARY"):
            with open(summary, "a") as file:
                file.write("All launch smoke checks passed.\n\n")
                for slug, origin in origins.items():
                    file.write(f"- {slug}: {origin}\n")


if __name__ == "__main__":
    main()
