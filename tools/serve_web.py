#!/usr/bin/env python3
"""
Serve the browser app on http://localhost:8080 and relay AI requests for hosts
that do not allow calls from a browser (CORS), such as the Qwen Cloud Token Plan.

    python3 tools/serve_web.py [port]

The page calls /proxy/https://host/path (or http:// for a server on the LAN); the
request is forwarded as is and the answer comes back from the page's own origin.
Listens on 127.0.0.1 only.
"""
from __future__ import annotations

import sys
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"
PREFIX = "/proxy/"
FORWARD = ("authorization", "x-api-key", "content-type", "anthropic-version", "accept")


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path.startswith(PREFIX):
            return self._relay()
        return super().do_GET()

    def do_POST(self):  # noqa: N802
        if self.path.startswith(PREFIX):
            return self._relay()
        self.send_error(405)

    def _relay(self):
        target = self.path[len(PREFIX):]
        if not target.startswith(("https://", "http://")):
            return self.send_error(400, "Only http(s) targets are relayed.")
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() in FORWARD}
        req = urllib.request.Request(target, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                status, ctype, data = res.status, res.headers.get("content-type", "application/json"), res.read()
        except urllib.error.HTTPError as e:
            status, ctype, data = e.code, e.headers.get("content-type", "application/json"), e.read()
        except OSError as e:
            return self.send_error(502, f"Could not reach {target}: {e}")
        self.send_response(status)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(WEB)))
    print(f"Open http://localhost:{port}  (Ctrl-C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
