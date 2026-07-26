"""Compara meu parser Python com o SpriteBuffer do client original."""
import subprocess, time, json, sys
from playwright.sync_api import sync_playwright

srv = subprocess.Popen(["python3", "-m", "http.server", "8321"],
                       cwd="/home/user/base",
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page()
        pg.goto("http://127.0.0.1:8321/", wait_until="networkidle")
        # o client carrega os assets sozinho pela networkManager
        pg.wait_for_timeout(4000)
        res = pg.evaluate("""async () => {
            // carrega spr/dat manualmente igual o network-manager faz
            const [spr, dat] = await Promise.all([
              fetch('./data/74/Tibia.spr').then(r => r.arrayBuffer()),
              fetch('./data/74/Tibia.dat').then(r => r.arrayBuffer())
            ]);
            gameClient.spriteBuffer.__load('Tibia.spr', spr);
            gameClient.dataObjects.__load('Tibia.dat', dat);
            const out = {};
            for (const sid of [2654, 3405, 3410, 3411]) {
              const img = gameClient.spriteBuffer.__getImageData(sid);
              let rows = [];
              for (let y = 0; y < 32; y++) {
                let s = '';
                for (let x = 0; x < 32; x++)
                  s += img.data[(y*32+x)*4+3] ? '#' : '.';
                rows.push(s);
              }
              out[sid] = rows;
            }
            out.itemCount = gameClient.dataObjects.itemCount;
            return out;
        }""")
        b.close()
finally:
    srv.terminate()

print("itemCount do client:", res.pop("itemCount"))
json.dump(res, open("/tmp/client_sprites.json", "w"))
for sid, rows in res.items():
    print("=== client sprite", sid, "===")
    for r in rows[:14]:
        print("   ", r)
