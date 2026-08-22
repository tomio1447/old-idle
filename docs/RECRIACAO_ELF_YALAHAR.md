# Recriação do Elf Yalahar — análise + runbook de reimportação 15.x

Data: 2026-08-22 · Hunt reconstruída no padrão do pipeline 15.x (referência:
`deathlings-sunken-temple.js` / `deeplingstairs.otbm`).

---

## 1. Diagnóstico — por que a sala estava bugada

| Verificação | Elf Yalahar (bugado) | Deathling (referência) |
|---|---|---|
| PNGs presentes dos 116/138 IDs do mapa | ✅ todos | ✅ todos |
| Procedência dos PNGs | ❌ client **7.4** (import antigo) | ✅ **15.x-with-8.60** |
| Nomes no `tiledata.js` | `item 486`, `item 4515`… (genéricos, sem items.xml) | nomes oficiais |
| Tiles com animação (`TILE_ANIM`) | **0** | vários (água/cristais vivos) |
| `otbmFovBounds`/`otbmRuntime*` na hunt | ❌ ausentes | ✅ presentes |

O `.otbm` em si está são (Canary RME 4, z=7, 22×17, 374 células, bounds
1048..1069 × 988..1004, `maps/` == `beta-maps/`). O problema é que os
**PNGs de `assets/tiles/<id>.png` foram renderizados do .spr 7.4**: cada ID
mostra a sprite errada, com tamanho/âncora errados — e como metade da sala é
multi-tile (4515 2×2, 5260 1×3, 5261 3×1, 1128 4×4), o empilhamento quebra
visualmente por completo.

O importador **pula PNGs existentes** (`falta = usados - existentes`) — por
isso tentativas de "reimportar por cima" nunca corrigiram: é preciso
**apagar os PNGs errados antes**.

## 2. Como funciona a SOBREPOSIÇÃO no montar do mapa

1. **OTBM**: cada TILE do `.otbm` traz o chão (attr 9) e os ITEM filhos
   **empilhados em ordem** — o RME salva a pilha exatamente como você vê no
   editor (chão → tapete → mesa → tocha).
2. **`huntMapFromOtbm`** (otbm.js): cada célula vira `g` (chão) +
   `items[]` (pilha). A pilha inteira gera uma **assinatura** na legenda do
   runtime — mesma pilha = mesmo caractere; trocar a ordem dos itens cria
   outra assinatura (e outra sobreposição desenhada).
3. **Renderer** (tilemap.js): desenha por camadas — `ground` (chão + itens
   andáveis) **antes** das criaturas, `deco` (itens em cima) depois. Dentro
   da célula, os itens saem **na ordem da pilha** (bottom-up).
4. **Multi-tile (overlap grande)**: `tilepatterndata.js` (gerado pelo
   `import_otbm_sprites.py` do DAT 15.x) declara `px×py` de cada ID
   (4515 = 2×2, 5260 = 1×3…). O PNG é composto no tamanho completo e o
   renderer ancora no canto **inferior-direito**; a colisão bloqueia o
   footprint inteiro (não só a âncora) — monstro não entra "dentro" da
   parede. Se o PNG vem do 7.4, o tamanho/âncora não bate com o pattern →
   é o efeito "sala bugada".
5. **Animações**: `TILE_ANIM` + `assets/tiles/<id>_anim.png` (strip de
   frames, gerado pelo `extract_tile_anims.py`). O mapa elf tinha ZERO
   porque a extração antiga não gerava tiras — reimportar do 15.x traz as
   decorações vivas (igual ao Sunken Temple).

## 3. Runbook — reimportação na sua máquina (onde estão o Tibia.dat/.spr)

```bash
cd tibia-idle

# 0) (Re)exportar o mapa no RME Canary com o dat 15.x-with-8.60 se quiser
#    redesenhar algo; o elfyalahar.otbm atual já é Canary 4 válido.

# 1) APAGAR os PNGs 7.4 dos IDs que o mapa usa (o importador pula existentes)
node -e "
const fs=require('fs'),OTBM=require('./game/js/otbm.js');
const m=OTBM.read(fs.readFileSync('game/maps/elfyalahar.otbm'),{z:7});
const ids=new Set();Object.values(m.cells).forEach(c=>{if(c.g)ids.add(c.g);(c.items||[]).forEach(i=>ids.add(i));});
fs.writeFileSync('/tmp/elf_ids.txt',[...ids].join('\n'));
console.log('ids do mapa:',ids.size);
}"
cd game/assets/tiles && cat /tmp/elf_ids.txt | xargs rm -f && cd ../../..

# 2) Reimportar do 15.x (PNGs 32×32 ancorados topo-esquerda; multitiles no
#    tamanho completo; regenera known_tiles.js + tiledata.js com nomes Canary)
export TIBIA860=/caminho/para/15x860_extraido   # pasta com Tibia.dat + Tibia.spr
python3 tools/import_otbm_sprites.py game/maps/elfyalahar.otbm

# 3) Regenerar as animações dos tiles (água/fogo/cristais/portais)
python3 tools/extract_tile_anims.py

# 4) (Só se algum multi-tile ficar croppado) recompor manualmente:
#    python3 tools/import_rme_multitiles.py 4515 5260 5261 1128

# 5) Publicar beta→runtime (já estão idênticos; refaça se redesenhou)
cp game/beta-maps/elfyalahar.otbm game/maps/elfyalahar.otbm

# 6) VALIDAR — falha se qualquer ID do mapa ficar sem PNG/catálogo,
#    ou se o mapa mudar de dimensão (regressão agora inclui o elfyalahar)
node tools/test_canary_otbm.js
# esperado: "OK: elfyalahar (fonte 22x17, runtime 24x17, 116 sprites)."
```

In-game: entre na hunt e confira (a) chão/paredes corretos, (b) decorações
multi-tile cobrindo seus SQMs sem "vazar", (c) tochas/água/cristais
animando, (d) monstros não atravessando paredes.

## 4. O que já foi mudado no código (este commit)

- `game/js/elf-yalahar.js` — recriado do zero no padrão deathling:
  `otbmFovBounds {1048,988,22×17,z7}` (sourceBounds reais do otbm),
  `otbmRuntimeWidth/Height 30`, `cat:"aventureiro"` (antes `cat:"hunt"`
  inexistente na taxonomia), sem `party:true` (não faz parte do padrão).
  Médias conferidas no canarymonsters (hp 160 / exp 97 / dano 27 / armor 9).
  Loot: nenhum item dos 3 elfs faltava no GAMEDATA (verificado).
- `tools/test_canary_otbm.js` — elfyalahar entrou na regressão
  (22×17, 374 células, runtime 24×17) + leitura com `{z}` do spec
  (mapas z=7 eram lidos no floor errado sem a opção).
- Servidor: HUNTS["elf-yalahar"] já registrado (aventureiro/pack 4).
