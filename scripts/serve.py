#!/usr/bin/env python3
"""Serve the workspace on 127.0.0.1:4173 with caching disabled, so browsers always load the latest JS and data.

index.html is served with ?v=<mtime> on each local script and stylesheet, so a changed file gets a new URL even in a
browser that cached the old one before no-store was sent."""
import functools
import http.server
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSET = re.compile(r'(\b(?:src|href)=")([^":?#]+\.(?:js|css))(")')


def versioned_index():
    def stamp(m):
        path = ROOT / m.group(2)
        return f'{m.group(1)}{m.group(2)}?v={int(path.stat().st_mtime)}{m.group(3)}' if path.is_file() else m.group(0)
    return ASSET.sub(stamp, (ROOT / 'index.html').read_text()).encode()


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] not in ('/', '/index.html'):
            return super().do_GET()
        body = versioned_index()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', 4173), handler) as server:
        print('Serving Groundwork at http://127.0.0.1:4173')
        server.serve_forever()
