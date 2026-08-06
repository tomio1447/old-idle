"""Exporta PNGs compostos (2x2, 2x1, 1x2...) para o RME.

Uso na máquina que contém os arquivos do client que GERARAM o catálogo:

  export TIBIA860=/caminho/para/client-extraido
  python3 tibia-idle/tools/import_rme_multitiles.py 28420 28421 28422 28423 28424

O diretório apontado por TIBIA860 precisa conter Tibia.dat e Tibia.spr.
A saída é game/assets/tiles/<id>.png, preservando o tamanho completo.
Não reimporta o atlas nem altera o catálogo; serve para corrigir somente os
IDs usados no mapa, evitando milhares de arquivos desnecessários.
"""
import os
import sys
from pathlib import Path

try:
    from PIL import Image  # noqa: F401
except ImportError:
    raise SystemExit("Pillow não instalado. Execute: python -m pip install Pillow")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from tibia_assets_860 import Dat860, Spr860, render_item_860  # noqa: E402

SRC = Path(os.environ.get("TIBIA860", ""))
if not SRC or not (SRC / "Tibia.dat").is_file() or not (SRC / "Tibia.spr").is_file():
    raise SystemExit("Defina TIBIA860 para uma pasta com Tibia.dat e Tibia.spr.")

ids = [int(x) for x in sys.argv[1:]]
if not ids:
    raise SystemExit("Informe ao menos um ID. Ex.: ... 28423")

out = ROOT / "game" / "assets" / "tiles"
out.mkdir(parents=True, exist_ok=True)
dat = Dat860(str(SRC / "Tibia.dat"))
spr = Spr860(str(SRC / "Tibia.spr"))

for item_id in ids:
    obj = dat.item(item_id)
    if obj is None:
        print(f"{item_id}: não existe neste Tibia.dat")
        continue
    img = render_item_860(dat, spr, item_id)
    if img is None or not img.getbbox():
        print(f"{item_id}: sem pixels")
        continue
    # render_item_860 já devolve a composição de todos os quadrantes.
    target = out / f"{item_id}.png"
    img.save(target)
    print(f"{item_id}: {img.width}x{img.height} -> {target.relative_to(ROOT)}")
