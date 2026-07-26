"""Teste E2E: andar pela cidade e interagir caminhando ate os NPCs."""
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
        pg.fill("#char-name", "Andarilho")
        pg.click('[data-voc="knight"]')
        pg.click("#btn-create")
        pg.wait_for_timeout(1500)

        start = pg.evaluate("() => ({x: G.walker.x, y: G.walker.y})")
        print("posicao inicial:", start)

        # --- clique no chao: deve caminhar
        cv = pg.query_selector("#scene")
        box = cv.bounding_box()
        pg.mouse.click(box["x"] + box["width"] * 0.25,
                       box["y"] + box["height"] * 0.75)
        pg.wait_for_timeout(150)
        moving = pg.evaluate("() => G.walker.moving")
        print("comecou a andar:", moving)
        assert moving, "nao iniciou caminhada ao clicar no chao"

        # sprite deve alternar frames enquanto anda
        frames = set()
        for _ in range(8):
            frames.add(pg.evaluate("() => G.walker.frame"))
            pg.wait_for_timeout(90)
        print("frames de animacao vistos:", sorted(frames))
        assert len(frames) > 1, "animacao de passos nao alterna"

        pg.wait_for_timeout(2500)
        after = pg.evaluate("() => ({x: G.walker.x, y: G.walker.y, m: G.walker.moving})")
        print("apos caminhar:", after)
        assert abs(after["x"] - start["x"]) > 0.05, "personagem nao se moveu"
        assert not after["m"], "nao parou ao chegar"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-walk.png")

        # --- direcao do sprite muda conforme o rumo
        pg.evaluate("() => G.walker.goTo(0.9, G.walker.y, null)")
        pg.wait_for_timeout(300)
        d_east = pg.evaluate("() => G.walker.dir")
        pg.evaluate("() => G.walker.goTo(0.1, G.walker.y, null)")
        pg.wait_for_timeout(300)
        d_west = pg.evaluate("() => G.walker.dir")
        print("direcoes: indo p/ direita =", d_east, "| p/ esquerda =", d_west)
        assert d_east == "e" and d_west == "w", "direcao do sprite errada"

        # --- clicar num NPC: caminha ate ele e abre o dialogo sozinho
        pg.evaluate("() => { G.walker.x = 0.5; G.walker.y = 0.9; "
                    "G.walker.moving = false; }")
        hit = pg.evaluate("""() => {
            const t = G.renderer.npcHit.find(h => h.id === 'banker');
            const cv = document.getElementById('scene');
            const r = cv.getBoundingClientRect();
            return { x: r.left + t.x * (r.width / cv.width),
                     y: r.top + t.y * (r.height / cv.height) };
        }""")
        pg.mouse.click(hit["x"], hit["y"])
        pg.wait_for_timeout(250)
        st = pg.evaluate("() => ({m: G.walker.moving, t: G.walker.target})")
        print("indo ate o NPC:", st)
        assert st["t"] == "banker", "nao definiu o NPC como destino"

        pg.wait_for_timeout(4000)
        opened = pg.is_visible("#npc-content")
        print("dialogo abriu ao chegar:", opened)
        assert opened, "dialogo nao abriu ao alcancar o NPC"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-walk-npc.png")
        pg.click("#npc-close")
        pg.wait_for_timeout(400)

        # --- atalho lateral tambem faz caminhar
        pg.evaluate("() => { G.walker.x = 0.2; G.walker.y = 0.9; }")
        pg.click('#npc-quick [data-npc="priest"]')
        pg.wait_for_timeout(250)
        st2 = pg.evaluate("() => ({m: G.walker.moving, t: G.walker.target})")
        print("atalho lateral:", st2)
        assert st2["t"] == "priest", "atalho nao fez caminhar ate o NPC"

        # --- caçar e voltar: nao pode quebrar
        pg.evaluate("() => startHunt('rats')")
        pg.wait_for_timeout(1200)
        pg.click("#btn-city")
        pg.wait_for_timeout(1200)
        st3 = pg.evaluate("() => ({city: !!G.inCity, x: G.walker.x})")
        print("voltou da caçada:", st3)
        assert st3["city"], "nao voltou para a cidade"

        b.close()


run()
if errors:
    print("\n=== ERROS ===")
    for e in errors[:20]:
        print(" -", e)
    sys.exit(1)
print("\nOK: caminhada funcionando sem erros")
