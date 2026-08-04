"""Teste end-to-end do jogo num browser real (headless)."""
import sys
from playwright.sync_api import sync_playwright

import os
URL = os.environ.get("GAME_URL", "http://127.0.0.1:8000/")
errors = []
logs = []


def run():
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.on("console", lambda m: (logs.append(m.text),
              errors.append("CONSOLE " + m.text) if m.type == "error" else None))
        pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))

        pg.goto(URL, wait_until="networkidle")
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-login.png")

        # cria personagem
        pg.fill("#char-name", "Bubble")
        pg.click('[data-voc="knight"]')
        pg.click("#btn-create")
        pg.wait_for_timeout(1200)

        assert pg.is_visible("#app"), "app nao ficou visivel"
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-city.png")

        # inicia uma hunt
        pg.click('.hunt-card[data-hunt="rats"]')
        # desde a atualização de instâncias, é preciso escolher non-pvp
        pg.wait_for_timeout(400)
        pg.click('#modal-body [data-instance="non-pvp"]')
        # primeiro kill pode levar ~15-30s no nível 1 (dagger); espera com
        # polling em vez de tempo fixo
        for _ in range(12):
            pg.wait_for_timeout(5000)
            if pg.evaluate("G.combat && G.combat.stats.kills > 0"):
                break
        pg.wait_for_timeout(2000)
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-hunt.png")

        state = pg.evaluate("""() => ({
            level: G.p.level, exp: G.p.exp, gold: G.p.gold,
            kills: G.combat ? G.combat.stats.kills : 0,
            hp: Math.round(G.p.hp), mobs: G.combat ? G.combat.mobs.length : 0,
            logLines: document.querySelectorAll('#log .log-line').length,
            invItems: Object.keys(G.p.bag).length,
            equipped: Object.keys(G.p.equip).length,
            canvasW: document.getElementById('scene').width,
        })""")
        print("estado após 14s em rats:", state)
        assert state["kills"] > 0, "nenhum kill em 14s"
        assert state["logLines"] > 0, "log vazio"
        assert state["canvasW"] > 300, "canvas nao dimensionou"

        # avanca bastante tempo simulado numa hunt mais dura
        pg.evaluate("""() => {
            G.p.level = 90; G.p.exp = expForLevel(90);
            ['sword','axe','club','dist','fist'].forEach(k => G.p.skills[k] = 68);
            G.p.skills.shield = 55;
            G.p.gold = 200000;
            ['fire-sword','dragon-scale-mail','royal-helmet','dragon-shield',
             'knight-legs','boots-of-haste','platinum-amulet','might-ring']
              .forEach(s => addItem(G.p, s, 1));
            autoEquip(G.p);
            const m = maxStats(G.p); G.p.hp = m.hp; G.p.mp = m.mp;
            startHunt('undead', 'non-pvp');
        }""")
        pg.wait_for_timeout(1000)
        # roda 20 min simulados de uma vez
        pg.evaluate("""() => {
            const t0 = Date.now();
            for (let i = 0; i < 12000; i++) {
                combatTick(G.combat, G.p, 100, t0 + i * 100);
                G.combat.events.length = 0;
                if (i % 150 === 0) { sellAllPouch(G.p); autoRestock(G.p); }
            }
        }""")
        pg.wait_for_timeout(500)
        s2 = pg.evaluate("""() => ({
            level: G.p.level, gold: G.p.gold,
            kills: G.combat.stats.kills, deaths: G.combat.stats.deaths,
            retreats: G.combat.stats.retreats || 0,
            supplyCost: Math.round(G.combat.stats.supplyCost),
            exp: G.combat.stats.exp,
        })""")
        print("20min simulados em undead (nv90):", s2)
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-undead.png",
                      full_page=True)

        # testa persistencia
        pg.evaluate("save()")
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(800)
        has_continue = pg.is_visible("#continue-box")
        print("save/continue disponivel:", has_continue)
        assert has_continue, "save nao persistiu"
        pg.click("#btn-continue")
        pg.wait_for_timeout(1500)
        after = pg.evaluate("() => ({level: G.p.level, gold: G.p.gold})")
        print("apos reload:", after)
        pg.screenshot(path="/home/user/tibia-idle/tools/shot-reload.png")

        b.close()


run()
if errors:
    print("\n=== ERROS ===")
    for e in errors[:25]:
        print(" -", e)
    sys.exit(1)
print("\nOK: sem erros de console/página")
