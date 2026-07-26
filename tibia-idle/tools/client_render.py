"""Renderiza outfits usando o CLIENT ORIGINAL e salva PNG, para comparar."""
import subprocess, time, base64
from playwright.sync_api import sync_playwright

srv = subprocess.Popen(["python3", "-m", "http.server", "8331"],
                       cwd="/home/user/base",
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page()
        pg.on("pageerror", lambda e: print("PAGEERR", e))
        pg.goto("http://127.0.0.1:8331/", wait_until="networkidle")
        pg.wait_for_timeout(2500)

        data = pg.evaluate("""async () => {
            const [spr, dat] = await Promise.all([
              fetch('./data/74/Tibia.spr').then(r => r.arrayBuffer()),
              fetch('./data/74/Tibia.dat').then(r => r.arrayBuffer())
            ]);
            gameClient.spriteBuffer.__load('Tibia.spr', spr);
            gameClient.dataObjects.__load('Tibia.dat', dat);

            const looks = [128, 129, 130, 131, 132, 134, 136, 139, 141, 73, 64, 57];
            const cv = document.createElement('canvas');
            cv.width = looks.length * 40; cv.height = 40;
            const ctx = cv.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            looks.forEach((lt, i) => {
              const obj = gameClient.dataObjects.getOutfit(lt);
              if (!obj) return;
              const g = obj.frameGroups[0];
              // caminho oficial do client para outfit colorida
              const outfit = new Outfit({ id: lt,
                details: { head: 78, body: 68, legs: 58, feet: 76 },
                mount: 0, addonOne: 0, addonTwo: 0 });
              const baseId = 0xF000000 + lt * 1000 + i;  // id unico no buffer
              gameClient.spriteBuffer.addComposedOutfit(
                baseId, outfit, g, 0, 2, 0, 0, 0);
              const sprite = gameClient.spriteBuffer.get(baseId);
              if (sprite) {
                ctx.drawImage(sprite.src,
                  sprite.position.x * 32, sprite.position.y * 32, 32, 32,
                  i * 40 + 4, 4, 32, 32);
              }
            });
            return { png: cv.toDataURL('image/png'), looks: looks };
        }""")
        b.close()
finally:
    srv.terminate()

png = data["png"].split(",", 1)[1]
open("/tmp/client_outfits.png", "wb").write(base64.b64decode(png))
print("looktypes renderizados pelo client:", data["looks"])
print("salvo em /tmp/client_outfits.png")
