#!/usr/bin/env python3
"""Check preservation, local references, JS syntax, form markup and isolation."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]
errors = []
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        errors.append(message)


class Markup(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


def main():
    manifest = json.loads((ROOT / 'docs/archive-sha256.json').read_text())['files']
    for rel, expected in manifest.items():
        if rel == 'README.md':
            continue
        p = (ROOT / 'docs/netlify-reference/club-redirects.txt'
             if rel == '_redirects' else ROOT / 'sites/club/public' / rel)
        check(p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == expected, f'Club baseline changed: {rel}')
    for site in ('acl', 'coachella'):
        for rel, expected in manifest.items():
            if not rel.startswith(site + '/') or rel == 'coachella/index.html':
                continue
            p = ROOT / 'sites' / site / 'public' / rel
            check(p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == expected, f'Festival original changed: {rel}')
    p = ROOT / 'sites/photo-notes/public/PhotoNotes/index.html'
    check(hashlib.sha256(p.read_bytes()).hexdigest() == manifest['photo-notes/index.html'], 'Photo Notes content changed')
    for src, dst in [('acl/styles.css', 'base-styles.css'), ('acl/assets/exportify-export-all.jpg', 'assets/exportify-export-all.jpg'), ('acl/assets/select-spotify-playlists.png', 'assets/select-spotify-playlists.png')]:
        p = ROOT / 'sites/coachella/public/coachella' / dst
        check(hashlib.sha256(p.read_bytes()).hexdigest() == manifest[src], f'Vendored dependency mismatch: {dst}')
    for public in sorted((ROOT / 'sites').glob('*/public')):
        for p in public.rglob('*.html'):
            for tag, attrs in Markup(p.read_text()).tags:
                for key in ('src', 'href'):
                    url = attrs.get(key, '')
                    parsed = urlsplit(url)
                    if not url or url.startswith(('#', '//')) or parsed.scheme:
                        continue
                    path = unquote(parsed.path)
                    if public.parent.name == 'personal' and path == '/PhotoNotes':
                        continue  # Handled by the personal Worker service binding.
                    target = public / path.lstrip('/') if path.startswith('/') else p.parent / path
                    exists = target.is_file() or (target / 'index.html').is_file()
                    check(exists and target.resolve().is_relative_to(public.resolve()), f'Missing/escaped reference: {p.relative_to(ROOT)} -> {url}')
        for p in public.rglob('*.zip'):
            with zipfile.ZipFile(p) as z:
                check(z.testzip() is None, f'Broken ZIP: {p}')
        for p in public.rglob('*.js'):
            if shutil.which('node'):
                result = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
                check(result.returncode == 0, result.stderr)
    coachella = (ROOT / 'sites/coachella/public/coachella/index.html').read_text()
    check('../acl/' not in coachella, 'Coachella still borrows ACL assets')
    personal = Markup((ROOT / 'sites/personal/public/index.html').read_text())
    inputs = {a.get('name'): a for t, a in personal.tags if t == 'input'}
    forms = [a for t, a in personal.tags if t == 'form']
    check(len(forms) == 1 and forms[0].get('method') == 'POST' and 'data-netlify' not in forms[0] and forms[0].get('action') == '/thanks/', 'Form configuration incorrect')
    check(inputs['email'].get('type') == 'email' and 'required' in inputs['email'], 'Email validation missing')
    check(inputs['consent'].get('value') == 'yes' and 'required' in inputs['consent'] and 'checked' not in inputs['consent'], 'Consent is not explicit opt-in')
    check(inputs['consent_version'].get('value') == 'v1' and 'bot-field' in inputs, 'Consent version/honeypot missing')
    check(all('disabled' in inputs[name] for name in ('email', 'consent'))
          and all('disabled' in a for t, a in personal.tags if t == 'button' and a.get('type') == 'submit'),
          'Signup must remain paused until a backend is configured')
    project_links = {a.get('href') for t, a in personal.tags if t == 'a'}
    for required in ('https://coolstrangersclub.com/', '/PhotoNotes', 'https://acl.zanegiordano.com/acl/', 'https://coachella.zanegiordano.com/coachella/'):
        check(required in project_links, f'Missing migrated project link: {required}')
    print(f'{checks} checks; {len(errors)} failures')
    for error in errors:
        print('FAIL:', error)
    if not shutil.which('node'):
        print('NOT CHECKED: JavaScript syntax (Node unavailable)')
    print('Source checks only. Cloudflare routing, DNS/TLS and browser interactions require runtime verification.')
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
