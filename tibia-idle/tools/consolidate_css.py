"""
consolidate_css.py — Gera css/layout.css (CSS base consolidado)

Mescla, NA ORDEM, os 3 CSS base do jogo:
    css/style.css  +  css/global-idle.css  +  css/accessories-extra.css
em um unico css/layout.css, e garante que o index.html aponta para ele
(carregando layout.css ANTES do otc-complete.css — a cascata final e
identica a versao com 3 arquivos).

Depois da migracao, os 3 arquivos antigos podem ser apagados do projeto:
o layout.css os substitui integralmente.

Uso:
    python3 consolidate_css.py [--dry-run]
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", "game"))
BASE = [
    ("css/style.css", "style.css — layout do jogo (.layout, .col, .panel, "
                      ".equip-grid, .slot, #app, keyframes)"),
    ("css/global-idle.css", "global-idle.css — identidade visual v1 (--gi-*)"),
    ("css/accessories-extra.css", "accessories-extra.css — ajustes do helper"),
]

HEADER = """/* ============================================================
   layout.css — CSS BASE consolidado (migração completa)
   Mescla, NA ORDEM, os antigos:
     1. style.css            (layout do jogo: .layout, .col, .panel,
                              .equip-grid, .slot, #app, keyframes)
     2. global-idle.css      (identidade visual v1: cores --gi-*)
     3. accessories-extra.css(ajustes do helper/equipamento)
   A cascata final e IDENTICA a carregar os 3 arquivos separados:
   este arquivo deve vir SEMPRE antes do otc-complete.css, que e a
   camada de estetica OTClient (sobrescreve o que precisar).
   Gerado por tools/consolidate_css.py — nao edite a mao.
   ============================================================ */
"""


def main():
    dry = "--dry-run" in sys.argv
    partes = [HEADER]
    for rel, _desc in BASE:
        p = os.path.join(GAME, rel)
        if not os.path.exists(p):
            print("!! faltando", rel)
            continue
        partes.append("\n/* ================= %s ================= */\n"
                      % os.path.basename(rel))
        partes.append(open(p, encoding="utf-8").read())
    out = "".join(partes)

    destino = os.path.join(GAME, "css", "layout.css")
    if dry:
        print("dry-run: %d linhas iriam para %s" % (len(out.splitlines()),
                                                    destino))
    else:
        open(destino, "w", encoding="utf-8").write(out)
        print("gerado %s (%d linhas)" % (destino, len(out.splitlines())))

    # index.html: deve carregar layout.css e NAO os 3 antigos
    idx = os.path.join(GAME, "index.html")
    html = open(idx, encoding="utf-8").read()
    ok = 'css/layout.css' in html
    antigos = [r for r in ("css/style.css", "css/global-idle.css",
                           "css/accessories-extra.css") if r in html]
    if not dry:
        if not ok:
            html = html.replace(
                '  <link rel="stylesheet" href="css/style.css">\n'
                '<link rel="stylesheet" href="css/global-idle.css">\n'
                '<link rel="stylesheet" href="css/accessories-extra.css">\n',
                '  <link rel="stylesheet" href="css/layout.css">\n')
            open(idx, "w", encoding="utf-8").write(html)
            print("index.html corrigido: layout.css no lugar dos 3 antigos")
        else:
            print("index.html OK: layout.css carregado")
        if antigos:
            print("AVISO: o index.html ainda referencia CSS antigos:",
                  antigos, "— remova-os quando confirmar o layout.css")
    print("\nPronto. Agora voce pode apagar os 3 CSS antigos do projeto:")
    for rel, desc in BASE:
        print("  *", rel, " —", desc)


if __name__ == "__main__":
    main()
