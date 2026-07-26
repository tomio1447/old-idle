"""Pergunta ao client original quais sprite IDs uma outfit realmente usa."""
import subprocess, time, json
from playwright.sync_api import sync_playwright

srv = subprocess.Popen(["python3", "-m", "http.server", "8322"],
                       cwd="/home/user/base",
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page()
        pg.goto("http://127.0.0.1:8322/", wait_until="networkidle")
        pg.wait_for_timeout(3000)
        res = pg.evaluate("""async () => {
            const dat = await fetch('./data/74/Tibia.dat').then(r => r.arrayBuffer());
            gameClient.dataObjects.__load('Tibia.dat', dat);
            const D = gameClient.dataObjects;
            const out = { itemCount: D.itemCount, outfitCount: D.outfitCount,
                          effectCount: D.effectCount, distanceCount: D.distanceCount };
            for (const lt of [128, 131, 5, 21, 35]) {
              const o = D.getOutfit(lt);
              const g = o.frameGroups[0];
              out['lt' + lt] = {
                id: D.itemCount + lt,
                w: g.width, h: g.height, layers: g.layers,
                px: g.pattern.x, py: g.pattern.y, pz: g.pattern.z,
                anim: g.animationLength,
                n: g.sprites.length,
                sprites: g.sprites.slice(0, 32),
                southFrame0: g.getSpriteId(0, 2, 0, 0, 0, 0, 0),
              };
            }
            return out;
        }""")
        b.close()
finally:
    srv.terminate()

print(json.dumps(res, indent=1)[:2500])
json.dump(res, open("/tmp/client_dat.json", "w"))
