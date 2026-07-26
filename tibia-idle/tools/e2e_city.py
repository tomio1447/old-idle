"""Teste E2E da cidade: NPCs, loja, banco, templo, academia, estalagem."""
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
        pg.fill("#char-name", "Cidadao")
        pg.click('[data-voc="knight"]')
        pg.click("#btn-create")
        pg.wait_for_timeout(1500)

        # deve comecar na cidade
        in_city = pg.evaluate("() => !!G.inCity")
        print("começa na cidade:", in_city)
        assert in_city, "nao iniciou na cidade"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-cidade.png")

        # da ouro para testar as compras
        pg.evaluate("() => { G.p.gold = 500000; G.p.level = 60; "
                    "G.p.exp = expForLevel(60); renderAll(); }")

        # --- loja de equipamentos
        pg.evaluate("() => openNpc('shopkeeper')")
        pg.wait_for_timeout(600)
        n_items = pg.evaluate("() => document.querySelectorAll('[data-buy-item]').length")
        print("itens na loja:", n_items)
        assert n_items > 0, "loja vazia"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-loja.png")
        before = pg.evaluate("() => G.p.gold")
        pg.click("[data-buy-item]:not([disabled])")
        pg.wait_for_timeout(500)
        after = pg.evaluate("() => G.p.gold")
        print("compra de equip: gold %d -> %d" % (before, after))
        assert after < before, "compra nao debitou"

        # --- runas
        pg.evaluate("() => openNpc('magicshop')")
        pg.wait_for_timeout(500)
        pg.click("[data-buy-sup]:not([disabled])")
        pg.wait_for_timeout(400)
        sup = pg.evaluate("() => Object.keys(G.p.supplies).length")
        print("tipos de supply:", sup)
        assert sup > 0, "nao comprou supply"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-runas.png")

        # --- banco
        pg.evaluate("() => openNpc('banker')")
        pg.wait_for_timeout(500)
        pg.click('[data-dep="10000"]')
        pg.wait_for_timeout(400)
        bank = pg.evaluate("() => G.p.bank")
        print("depositado no banco:", bank)
        assert bank == 10000, "deposito falhou"
        pg.click('[data-wd="1000"]')
        pg.wait_for_timeout(400)
        print("apos saque:", pg.evaluate("() => G.p.bank"))
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-banco.png")

        # --- templo
        pg.evaluate("() => { G.p.hp = 10; openNpc('priest'); }")
        pg.wait_for_timeout(500)
        pg.click("#temple-heal")
        pg.wait_for_timeout(400)
        hp = pg.evaluate("() => Math.round(G.p.hp)")
        print("hp apos cura:", hp)
        assert hp > 100, "cura do templo falhou"
        pg.click("#temple-bless")
        pg.wait_for_timeout(400)
        print("abencoado:", pg.evaluate("() => G.p.blessed"))
        assert pg.evaluate("() => G.p.blessed"), "bencao falhou"

        # --- academia
        pg.evaluate("() => openNpc('trainer')")
        pg.wait_for_timeout(500)
        sk_before = pg.evaluate("() => G.p.skills.sword")
        pg.click('[data-train="sword"]:not([disabled])')
        pg.wait_for_timeout(400)
        sk_after = pg.evaluate("() => G.p.skills.sword")
        print("sword %d -> %d" % (sk_before, sk_after))
        assert sk_after > sk_before, "treino falhou"

        # --- estalagem
        pg.evaluate("() => { G.p.stamina = 3600; openNpc('innkeeper'); }")
        pg.wait_for_timeout(500)
        pg.click('[data-rest="5"]:not([disabled])')
        pg.wait_for_timeout(400)
        st = pg.evaluate("() => Math.round(G.p.stamina)")
        print("stamina apos descanso:", st)
        assert st > 3600, "descanso falhou"

        # --- ferreiro (vender)
        pg.evaluate("() => { addItem(G.p,'small-diamond',5); openNpc('blacksmith'); }")
        pg.wait_for_timeout(500)
        g0 = pg.evaluate("() => G.p.gold")
        pg.click("#sell-all")
        pg.wait_for_timeout(400)
        print("venda: gold %d -> %d" % (g0, pg.evaluate("() => G.p.gold")))
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-ferreiro.png")

        # --- viagens: inicia hunt pelo capitao
        pg.evaluate("() => openNpc('captain')")
        pg.wait_for_timeout(600)
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-viagens.png")
        pg.click('[data-travel="orcs"]')
        pg.wait_for_timeout(2500)
        st2 = pg.evaluate("() => ({city: !!G.inCity, hunt: G.p.hunt})")
        print("apos viajar:", st2)
        assert not st2["city"] and st2["hunt"] == "orcs", "viagem falhou"

        # --- voltar para a cidade pelo botao
        pg.click("#btn-city")
        pg.wait_for_timeout(1200)
        st3 = pg.evaluate("() => ({city: !!G.inCity, hunt: G.p.hunt})")
        print("apos botao cidade:", st3)
        assert st3["city"] and not st3["hunt"], "nao voltou pra cidade"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-cidade2.png")

        # --- clique num NPC direto no canvas
        hit = pg.evaluate("""() => {
            const h = G.renderer.npcHit;
            if (!h || !h.length) return null;
            const cv = document.getElementById('scene');
            const r = cv.getBoundingClientRect();
            const t = h[0];
            return { id: t.id,
                     x: r.left + t.x * (r.width / cv.width),
                     y: r.top + t.y * (r.height / cv.height) };
        }""")
        print("npc no canvas:", hit["id"] if hit else None)
        assert hit, "nenhum NPC clicavel no canvas"
        pg.mouse.click(hit["x"], hit["y"])
        pg.wait_for_timeout(700)
        opened = pg.is_visible("#npc-content")
        print("dialogo abriu pelo canvas:", opened)
        assert opened, "clique no canvas nao abriu NPC"

        b.close()


run()
if errors:
    print("\n=== ERROS ===")
    for e in errors[:20]:
        print(" -", e)
    sys.exit(1)
print("\nOK: cidade funcionando sem erros")
