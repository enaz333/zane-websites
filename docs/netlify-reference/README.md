# Zane Giordano · website migration kit

The site files have been reorganized into five independent Netlify projects. Start with **[START-HERE.md](START-HERE.md)** for the complete launch procedure. Nothing has been uploaded and no DNS or live website settings have been changed.

## Publish map

| Project | Editable source | Final public address |
| --- | --- | --- |
| Club | `sites/club/public` | Existing canonical `coolstrangersclub.com` / www |
| Personal | `sites/personal/public` | `https://zanegiordano.com/` |
| Photo Notes | `sites/photo-notes/public` | `https://zanegiordano.com/PhotoNotes` through the personal project's proxy |
| ACL | `sites/acl/public` | `https://acl.zanegiordano.com/acl/` |
| Coachella | `sites/coachella/public` | `https://coachella.zanegiordano.com/coachella/` |

**Deploy generated release folders, not raw club/personal source.** Club source deliberately retains the archive's local links, old project copies and baseline redirect. Personal source contains an unresolved Photo Notes upstream. `scripts/prepare.py` resolves all migration routes and links using your config, then creates five drag-and-drop folders and five matching ZIPs. Missing/placeholder origins fail before packaging. The ZIPs contain publish files at their root; unzip them before using Netlify Drop.

The three standalone sources (Photo Notes, ACL, Coachella) can be uploaded directly for initial project creation. A separate temporary club staging project is used during testing; there are five permanent projects, not six.

## Tools

Python **3.9+**; Node is optional for existing JavaScript syntax checks. No npm packages, frontend build, CLI login, or credentials are required for local preparation.

```sh
cd /Users/zane/Documents/ChatGPT/ZaneGiordano.com
python3 scripts/validate.py
python3 -m unittest discover -s tests -v
```

Once actual URLs are entered in `config/staging.json`:

```sh
python3 scripts/prepare.py --config config/staging.json --output dist/staging-01
python3 scripts/check_routes.py --config config/staging.json --report docs/staging-routes.json
```

Use a new output name for each release; the generator will not overwrite an earlier release. Edit `sites/`, never generated `dist/` files. `release.json` records configured origins and SHA-256 hashes for every published file. There is no root `netlify.toml`: deploying the whole repository would publish the wrong content.

## Local preview

Run one command below, then open its corresponding URL. Stop it with Control-C before running another server on that port.

| Preview | Command | URL |
| --- | --- | --- |
| Personal | `python3 -m http.server 5173 --bind 127.0.0.1 --directory sites/personal/public` | `http://127.0.0.1:5173/` |
| Club | `python3 -m http.server 5173 --bind 127.0.0.1 --directory sites/club/public` | `http://127.0.0.1:5173/` |
| Photo Notes | `python3 -m http.server 5173 --bind 127.0.0.1 --directory sites/photo-notes/public` | `http://127.0.0.1:5173/PhotoNotes/` |
| ACL | `python3 -m http.server 5173 --bind 127.0.0.1 --directory sites/acl/public` | `http://127.0.0.1:5173/acl/` |
| Coachella | `python3 -m http.server 5173 --bind 127.0.0.1 --directory sites/coachella/public` | `http://127.0.0.1:5173/coachella/` |

Python serves ordinary files. It does **not** implement Netlify redirects, headers, form processing, or the Photo Notes proxy. The local personal Photo Notes link will return 404; a valid local form POST will return 501. Neither proves a Netlify failure. Use the staging checks before launch.

## Supporting documents

- [Launch guide](START-HERE.md): ordered instructions, deploy mapping and troubleshooting.
- [Routes](docs/routes.md): redirect policy and expected URLs.
- [Launch record](docs/launch-record.md): fill in actual project IDs, deploys, QR URL and DNS before cutover.
- [Browser checklist](docs/browser-checklist.md): interactive release gates.
- [Validation report](docs/validation.md): what passed and what is unverified.
- [Provenance](docs/provenance.md): preservation and borrowed-file history.
- [Signup records](docs/subscribers.md): consent fields, exports and future mailing.
- [Personal page preview](docs/personal-preview.png).

The supplied migration plan and archive README are preserved as reference documents under `docs/`; they are not executed as commands or treated as authorization to change production.
