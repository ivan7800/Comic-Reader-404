#!/usr/bin/env python3
from __future__ import annotations
import base64, contextlib, http.server, os, shutil, socket, subprocess, tempfile, threading, time, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')

def make_cbz(path: Path, pages: int = 4) -> Path:
    xml = '''<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo><Title>QA Comic</Title><Series>Reader QA</Series><Number>7</Number><Writer>404 QA</Writer><Publisher>Local</Publisher><Genre>Test</Genre><Manga>No</Manga></ComicInfo>'''
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('ComicInfo.xml', xml)
        for i in range(pages): z.writestr(f'{i+1:03d}.png', PNG)
    return path

def free_port() -> int:
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]

@contextlib.contextmanager
def staged_server():
    with tempfile.TemporaryDirectory(prefix='cr404-e2e-') as td:
        base = Path(td)
        app = base / 'comic-reader-404'
        shutil.copytree(ROOT, app, ignore=shutil.ignore_patterns('node_modules', '.qa', '__pycache__'))
        port = free_port()
        handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(*args, directory=str(base), **kwargs)
        server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            yield app, f'http://127.0.0.1:{port}/comic-reader-404/'
        finally:
            server.shutdown(); thread.join(timeout=3); server.server_close()

def chromium_path() -> str | None:
    for candidate in [os.getenv('CHROMIUM_PATH'), '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']:
        if candidate and Path(candidate).exists(): return candidate
    return None

PROFILES = {
    'desktop': dict(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, is_mobile=False, has_touch=False),
    'iphone': dict(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                   user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'),
    'ipad': dict(viewport={'width': 820, 'height': 1180}, device_scale_factor=2, is_mobile=True, has_touch=True,
                 user_agent='Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'),
    'android': dict(viewport={'width': 412, 'height': 915}, device_scale_factor=2.625, is_mobile=True, has_touch=True,
                    user_agent='Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36'),
}
