"""
migracao_15x.py — MIGRAÇÃO COMPLETA 15.x (1 comando)

Orquestra todo o pipeline de migracao para os assets 15.x-with-8.60:

  1. extract_860.py          sprites reais do .dat/.spr 15.x (formato 8.60)
                             -> assets/outfit, assets/mob, assets/item
                             + strips _anim + cid/af/aw/ah no gamedata.js
  2. import_canary_items.py  atributos reais de combate do items.xml
                             (Canary 15.x) -> gamedata.js
  3. build_rme_catalog.py    catalogo + atlases do RME web + tileflags.js
                             (colisao do runtime) a partir do MESMO .dat
  4. consolidate_css.py      regera css/layout.css (mescla dos 3 CSS base)
                             e garante que o index.html aponta para ele

Pre-requisitos (uma unica vez):
  * Baixe de https://github.com/Levi999x/15.x-with-8.60 :
      - Tibia_spr_dat.zip   (~104 MB)  -> extraia -> contem Tibia.dat/Tibia.spr
      - items.xml                       (opcional, mas recomendado)
  * (Opcional) items.xml do Canary 15.x:
      https://raw.githubusercontent.com/opentibiabr/canary/main/data/items/items.xml
      (se nao passar, o script usa tibia-idle/tools/data/canary-items.xml)

Uso:
    python3 migracao_15x.py --tibia860 /caminho/extraido \
                            --items-xml /caminho/items.xml \
                            [--canary-xml /caminho/canary-items.xml]

    python3 migracao_15x.py --skip-extract --skip-import   # so RME + CSS
    python3 migracao_15x.py --skip-rme --skip-css          # so sprites+itens

Saidas:
  * tibia-idle/game/assets/...            PNGs reais 15.x (mesmos nomes)
  * tibia-idle/game/js/gamedata.js        + cid (id do dat), af/aw/ah
                                          (animacoes), atributos do Canary
  * tibia-idle/game/rme/data/catalog.js   paleta completa p/ o editor
  * tibia-idle/game/rme/data/atlas_*.png  folhas de sprite do editor
  * tibia-idle/game/js/tileflags.js       colisao (walk/block) por id
  * tibia-idle/game/css/layout.css        CSS base consolidado

RME DESKTOP (Remere's Map Editor 8.60):
  * Copie o Tibia.otfi do repo 15.x-with-8.60 para a pasta do RME 8.60
    e para a pasta do client Tibia 8.60.
  * No RME: opcoes -> Client Version -> 8.60, e abra o Tibia.dat/Tibia.spr.
  * O jogo e o editor passam a usar os MESMOS arquivos/sprites.
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run(step, args_env, cwd=None):
    print("\n" + "=" * 72)
    print("PASSO:", step[0])
    print("=" * 72)
    env = dict(os.environ)
    env.update(args_env)
    r = subprocess.run([sys.executable, step[1]], cwd=cwd or HERE, env=env)
    if r.returncode != 0:
        print("\n!! PASSO FALHOU (%d): %s" % (r.returncode, step[0]))
        sys.exit(r.returncode)
    return r


def main():
    ap = argparse.ArgumentParser(description="Migração completa 15.x")
    ap.add_argument("--tibia860", default=os.environ.get("TIBIA860"),
                    help="pasta com Tibia.dat + Tibia.spr extraidos")
    ap.add_argument("--items-xml", default=os.environ.get("ITEMS_XML"),
                    help="items.xml do 15.x-with-8.60 (opcional)")
    ap.add_argument("--canary-xml", default=os.environ.get("CANARY_XML"),
                    help="items.xml do Canary 15.x (opcional)")
    ap.add_argument("--canary-dir", default=os.environ.get("CANARY"),
                    help="pasta do Canary (deve ter data/items/items.xml)")
    ap.add_argument("--skip-extract", action="store_true")
    ap.add_argument("--skip-import", action="store_true")
    ap.add_argument("--skip-rme", action="store_true")
    ap.add_argument("--skip-css", action="store_true")
    a = ap.parse_args()

    if not a.skip_extract and not a.tibia860:
        ap.error("--tibia860 e obrigatorio (ou TIBIA860) para extrair sprites")

    env = {}
    if a.tibia860:
        env["TIBIA860"] = a.tibia860
    if a.items_xml:
        env["ITEMS_XML"] = a.items_xml
    if a.canary_xml:
        env["CANARY_XML"] = a.canary_xml
    if a.canary_dir:
        env["CANARY"] = a.canary_dir

    resumo = []

    if not a.skip_extract:
        run(("[1/4] Extraindo sprites 15.x do .dat/.spr -> assets/ + "
             "animacoes + cid no gamedata.js", "extract_860.py"), env)
        resumo.append("sprites: assets/outfit, assets/mob, assets/item "
                      "(15.x reais)")

    if not a.skip_import:
        if not (a.canary_dir or a.canary_xml):
            print("\n[2/4] ATENCAO: sem items.xml do Canary — pulando "
                  "atributos de combate. Use --canary-dir ou --canary-xml.")
            resumo.append("atributos canary: NAO rodou (sem items.xml)")
        else:
            run(("[2/4] Importando atributos de combate do items.xml "
                 "(Canary 15.x) -> gamedata.js", "import_canary_items.py"),
                env)
            resumo.append("atributos: gamedata.js enriquecido (Canary 15.x)")

    if not a.skip_rme:
        if not a.tibia860:
            print("\n[3/4] ATENCAO: sem --tibia860 — pulando catalogo do RME.")
        else:
            run(("[3/4] Regenerando catalogo/atlases do RME web + "
                 "tileflags.js", "build_rme_catalog.py"), env)
            resumo.append("RME: catalog.js + atlas_*.png + tileflags.js")

    if not a.skip_css:
        run(("[4/4] Consolidando CSS base -> css/layout.css",
             "consolidate_css.py"), env)
        resumo.append("CSS: layout.css consolidado (3 arquivos -> 1)")

    print("\n" + "=" * 72)
    print("MIGRACAO CONCLUIDA")
    print("=" * 72)
    for r in resumo:
        print("  *", r)
    if a.tibia860:
        print("\nRME desktop: use o Tibia.otfi do repo 15.x-with-8.60 com o")
        print("Remere's 8.60 e abra o Tibia.dat/Tibia.spr da pasta:")
        print("  ", os.path.abspath(a.tibia860))
    print("\nDica: rode o jogo com CTRL+F5 (limpar cache) e confira os")
    print("novos sprites e as animacoes de item no inventario.")


if __name__ == "__main__":
    main()
