"""Serveur statique de developpement, servant la racine du projet.

Le port vient de la variable d'environnement PORT, pour que l'hote puisse en
assigner un libre. `python -m http.server` ne sait pas faire : il prend son port
en argument positionnel, ce qui le figeait sur 8765 et le mettait en conflit avec
tout serveur deja lance.

    python tools/serve.py
    PORT=9000 python tools/serve.py
"""
import http.server
import os
import socketserver
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Le service worker et les modules ES sont relus a chaque rechargement :
        # sans ca, une correction ne se voit pas tant que le cache n'a pas expire.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Une ligne par requete noie les erreurs reelles dans le journal.
        if not args or not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


def main():
    port = int(os.environ.get("PORT") or 8765)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"yole: http://127.0.0.1:{port}/index.html", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
