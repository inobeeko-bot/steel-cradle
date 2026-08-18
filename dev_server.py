# -*- coding: utf-8 -*-
"""開発用の簡易サーバー。run.bat から呼ばれる。

素の `python -m http.server` を使うと、ブラウザがファイルをキャッシュする。
これが厄介な壊れ方をする ―― 新しい .js を足したのに古い index.html が
使われると、その新しいファイルだけ読み込まれない。すると毎コマ例外が出て、
描画も敵AIも当たり判定も止まり、画面が真っ暗になる。
しかも main.js の tick() が例外を握り潰すので、原因が表に出ない。

なので開発中は「絶対にキャッシュさせない」。
Ctrl+Shift+R を押し忘れても壊れないほうが、覚えることが減る。

本番(Cloudflare Pages)は普通にキャッシュされる。これは手元専用。
"""
from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # no-store = 保存すらするな。revalidate より強い
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 404 と 500 番台だけ出す。200 が延々流れると見落とすため
        try:
            code = int(args[1])
        except (IndexError, ValueError):
            code = 0
        if code >= 400:
            sys.stderr.write("  %s -> %s\n" % (self.path, code))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print("  serving http://127.0.0.1:%d/  (no-cache)" % port)
        print("  press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("  stopped")


if __name__ == "__main__":
    main()
