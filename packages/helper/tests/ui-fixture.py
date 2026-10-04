"""Serve the real helper page with a local, model-free bridge for UI checks."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import mimetypes
from threading import Thread

assets = Path(__file__).resolve().parents[1] / 'assets'
tests = Path(__file__).parent

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/shutdown':
            self.send_response(204)
            self.end_headers()
            Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.path != '/result':
            self.send_error(404)
            return
        data = self.rfile.read(min(int(self.headers.get('Content-Length', 0)), 4096))
        print('RESULT ' + data.decode(), flush=True)
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/':
            data = (tests / 'ui-fixture.html').read_bytes()
            mime = 'text/html'
        elif path == '/assets/fixture.html':
            html = (assets / 'floating.html').read_text()
            # Only the fixture allows its local mock bridge script.
            html = html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
            mock = (tests / 'ui-fixture-bridge.js').read_text()
            data = html.replace('<script type="module" src="shell.js">', f'<script>{mock}</script><script type="module" src="shell.js">').encode()
            mime = 'text/html'
        elif path.startswith('/assets/'):
            target = (assets / path[len('/assets/'):]).resolve()
            if not target.is_relative_to(assets) or not target.is_file():
                self.send_error(404)
                return
            data = target.read_bytes()
            mime = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)
    def log_message(self, *_):
        pass

print('Orb UI fixture: http://127.0.0.1:18763', flush=True)
ThreadingHTTPServer(('127.0.0.1', 18763), Handler).serve_forever()
