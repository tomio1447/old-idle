"""Teste E2E do mapa grande: camera, colisao, teclado, NPCs, depot/templo."""
import os
import sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("GAME_URL", "file:///home/user/tibia-idle/game/index.html")
errors = []


def run():
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: errors.append("CONSOLE " + m.text)
              if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        pg.goto(URL, wait_until="networkidle")
        pg.evaluate("() => localStorage.clear()")
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(900)
        pg.fill("#char-name", "Explorador")
        pg.click('[data-voc="knight"]')
        pg.click("#btn-create")
        pg.wait_for_timeout(1800)

        info = pg.evaluate("""() => ({
            mapW: MAP_W, mapH: MAP_H, tile: TILE,
            buildings: BUILDINGS.length, npcs: Object.keys(POI).length,
            decor: DECOR.length,
            px: Math.round(G.walker.px), py: Math.round(G.walker.py),
        })""")
        print("mapa:", info)
        assert info["mapW"] >= 30 and info["mapH"] >= 22, "mapa pequeno"
        assert info["buildings"] >= 8, "poucos predios"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-map.png")

        # --- camera segue o jogador
        cam0 = pg.evaluate("() => ({x: G.renderer.camX, y: G.renderer.camY})")
        pg.evaluate("() => { const c = tileCenter(30, 20); "
                    "G.walker.goToPixel(c.x, c.y, null); }")
        pg.wait_for_timeout(4500)
        cam1 = pg.evaluate("() => ({x: G.renderer.camX, y: G.renderer.camY})")
        pos1 = pg.evaluate("() => ({x: Math.round(G.walker.px), y: Math.round(G.walker.py)})")
        print("camera:", cam0, "->", cam1, "| jogador:", pos1)
        assert cam1["x"] != cam0["x"] or cam1["y"] != cam0["y"], "camera nao seguiu"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-map2.png")

        # --- colisao: nao pode atravessar predio
        blocked = pg.evaluate("""() => {
            // tenta empurrar o jogador para dentro de um predio
            const b = BUILDINGS[0];
            const c = tileCenter(b.x + 1, b.y + 1);
            G.walker.px = c.x - TILE * 2; G.walker.py = c.y;
            G.walker.path = []; G.walker.keys = { right: true };
            return { blockedTile: isBlocked(b.x + 1, b.y + 1) };
        }""")
        pg.wait_for_timeout(1400)
        after = pg.evaluate("""() => {
            G.walker.keys = {};
            const t = toTile(G.walker.px, G.walker.py);
            return { inside: isBlocked(t.tx, t.ty), tx: t.tx, ty: t.ty };
        }""")
        print("colisao:", blocked, "-> jogador dentro de parede?", after)
        assert not after["inside"], "jogador atravessou a parede"

        # --- teclado move
        pg.evaluate("() => { const c = tileCenter(16, 14); "
                    "G.walker.px = c.x; G.walker.py = c.y; G.walker.path = []; }")
        p0 = pg.evaluate("() => ({x: G.walker.px, y: G.walker.py})")
        pg.keyboard.down("d")
        pg.wait_for_timeout(700)
        pg.keyboard.up("d")
        pg.wait_for_timeout(200)
        p1 = pg.evaluate("() => ({x: G.walker.px, y: G.walker.py, d: G.walker.dir})")
        print("teclado D:", p0, "->", p1)
        assert p1["x"] > p0["x"] + 8, "tecla D nao moveu"
        assert p1["d"] == "e", "direcao errada no teclado"

        # --- caminhar ate o templo (priest) abre o dialogo
        pg.evaluate("() => { const c = tileCenter(16, 14); "
                    "G.walker.px = c.x; G.walker.py = c.y; G.walker.path = []; }")
        pg.evaluate("() => G.walker.goToNpc('priest')")
        pg.wait_for_timeout(6000)
        opened = pg.is_visible("#npc-content")
        print("chegou no templo e abriu dialogo:", opened)
        assert opened, "nao abriu o dialogo do templo"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-templo.png")
        pg.click("#npc-close")
        pg.wait_for_timeout(400)

        # --- pathfinding contorna obstaculo
        path_len = pg.evaluate("""() => {
            const c = tileCenter(16, 14);
            G.walker.px = c.x; G.walker.py = c.y;
            G.walker.goToNpc('shopkeeper');
            return G.walker.path.length;
        }""")
        print("tamanho do caminho ate a loja:", path_len)
        assert path_len > 3, "pathfinding nao gerou rota"

        # --- minimapa desenhou
        has_mini = pg.evaluate("() => typeof G.renderer.drawMiniMap === 'function'")
        print("minimapa presente:", has_mini)

        # --- ir caçar e voltar
        pg.evaluate("() => startHunt('rats')")
        pg.wait_for_timeout(1500)
        pg.click("#btn-city")
        pg.wait_for_timeout(1500)
        st = pg.evaluate("() => ({city: !!G.inCity, hunt: G.p.hunt})")
        print("caçar e voltar:", st)
        assert st["city"] and not st["hunt"], "nao voltou para a cidade"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-map3.png")

        b.close()


run()
if errors:
    print("\n=== ERROS ===")
    for e in errors[:20]:
        print(" -", e)
    sys.exit(1)
print("\nOK: mapa da cidade funcionando")
