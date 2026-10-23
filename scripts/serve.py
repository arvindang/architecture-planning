#!/usr/bin/env python3
"""Serve the workspace on 127.0.0.1:4173 with caching disabled, so browsers always load the latest JS and data."""
import functools
import http.server
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', 4173), handler) as server:
        print('Serving Groundwork at http://127.0.0.1:4173')
        server.serve_forever()
