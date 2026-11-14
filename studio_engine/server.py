"""Loopback-only synthetic-data workbench and a separate immutable-preview origin."""
import argparse
import json
import re
import sqlite3
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from .engine import Engine, FILES, ROOT, digest
from .export import prepare

UI = ROOT / "sites/studio/public/builder"
MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8"}


def handler(workspace, preview=False):
    port = 8795 if preview else 8794
    origin = f"http://127.0.0.1:{port}"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, code, content, mime="application/json"):
            if not isinstance(content, bytes):
                content = json.dumps(content).encode()
            self.send_response(code)
            self.send_header("Content-Type", mime)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header("Content-Security-Policy",
                             "default-src 'self'; script-src 'self'; style-src 'self'; "
                             "connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(content)

        def host_valid(self):
            return self.headers.get("Host") == f"127.0.0.1:{port}"

        def do_GET(self):
            if not self.host_valid():
                return self.reply(403, {})
            if preview:
                match = re.fullmatch(r"/([a-z][a-z0-9-]{2,39})/([1-9][0-9]*)/(index.html|app.mjs|model.mjs|style.css)", self.path)
                if not match:
                    return self.reply(404, {})
                slug, version, name = match.groups()
                engine = Engine(workspace)
                try:
                    run = engine.db.execute("SELECT digest FROM runs WHERE slug=? AND parent=? AND state='review_ready'",
                                            (slug, int(version) - 1)).fetchone()
                    if not run:
                        return self.reply(404, {})
                    folder = Path(workspace) / slug / version / "public"
                    files = {file: (folder / file).read_text() for file in FILES}
                    if digest(files) != run["digest"]:
                        return self.reply(409, {"error": "artifact_changed"})
                    return self.reply(200, files[name].encode(), MIME[Path(name).suffix])
                except OSError:
                    return self.reply(404, {})
                finally:
                    engine.close()
            if self.path == "/api/projects":
                engine = Engine(workspace)
                try:
                    projects = [dict(row) for row in engine.db.execute("SELECT * FROM projects ORDER BY slug")]
                    for project in projects:
                        project["runs"] = [dict(row) for row in engine.db.execute(
                            "SELECT id,state,diagnostic,created_at,parent,request,message,digest FROM runs WHERE slug=? ORDER BY rowid DESC",
                            (project["slug"],))]
                    return self.reply(200, projects)
                finally:
                    engine.close()
            name = {"/": "index.html", "/app.mjs": "app.mjs", "/style.css": "style.css"}.get(self.path)
            if name:
                return self.reply(200, (UI / name).read_bytes(), MIME[Path(name).suffix])
            self.reply(404, {})

        def do_POST(self):
            if preview or not self.host_valid() or self.headers.get("Origin") != origin:
                return self.reply(403, {})
            if self.path not in {"/api/build", "/api/export"} or self.headers.get("Content-Type") != "application/json":
                return self.reply(400, {})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 16_384:
                    return self.reply(413, {})
                body = json.loads(self.rfile.read(size))
                engine = Engine(workspace)
                try:
                    if self.path == "/api/export":
                        base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, timeout=10).decode().strip()
                        self.reply(200, prepare(engine, body["slug"], body["version"], base))
                    else:
                        result = engine.build(body["specification"], body["request_id"], body["parent"], message=body.get("message", ""))
                        self.reply(200, {key: result[key] for key in ("state", "diagnostic", "digest")})
                finally:
                    engine.close()
            except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError, sqlite3.IntegrityError):
                self.reply(400, {"error": "invalid_or_conflicting_request"})
    return Handler


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    args = parser.parse_args()
    workspace = str(Path(args.workspace).resolve())
    engine = Engine(workspace)
    engine.close()
    preview = HTTPServer(("127.0.0.1", 8795), handler(workspace, preview=True))
    threading.Thread(target=preview.serve_forever, daemon=True).start()
    HTTPServer(("127.0.0.1", 8794), handler(workspace)).serve_forever()
