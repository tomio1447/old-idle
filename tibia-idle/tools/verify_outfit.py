"""Descobre como o client desenha uma outfit de verdade na tela."""
import subprocess, time, base64
from playwright.sync_api import sync_playwright

srv = subprocess.Popen(["python3", "-m", "http.server", "8323"],
                       cwd="/home/user/base",
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page()
        pg.on("pageerror", lambda e: print("ERR", e))
        pg.goto("http://127.0.0.1:8323/", wait_until="networkidle")
        pg.wait_for_timeout(3000)

        out = pg.evaluate("""async () => {
            const [spr, dat] = await Promise.all([
              fetch('./data/74/Tibia.spr').then(r => r.arrayBuffer()),
              fetch('./data/74/Tibia.dat').then(r => r.arrayBuffer())
            ]);
            gameClient.spriteBuffer.__load('Tibia.spr', spr);
            gameClient.dataObjects.__load('Tibia.dat', dat);

            // usa o proprio caminho de composicao do client
            const outfit = new Outfit({
              id: 128,
              details: { head: 78, body: 68, legs: 58, feet: 76 },
              mount: 0, addonOne: 0, addonTwo: 0
            });
            const cv = document.createElement('canvas');
            cv.width = 64; cv.height = 64;
            const ctx = cv.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            const dataObj = gameClient.dataObjects.getOutfit(128);
            const g = dataObj.frameGroups[0];
            // identificador composto que o client usa no sprite buffer
            const id = outfit.getIdentifier
              ? outfit.getIdentifier(0, 2, 0, 0, 0, 0)
              : null;
            const info = { hasGetIdentifier: !!outfit.getIdentifier,
                           outfitKeys: Object.keys(outfit) };

            // tenta o metodo de composicao
            let sprite = null;
            try {
              sprite = gameClient.spriteBuffer.getComposed
                ? gameClient.spriteBuffer.getComposed(outfit, g, 0, 2, 0, 0, 0, 0)
                : null;
            } catch (e) { info.composeErr = String(e); }
            info.sbMethods = Object.getOwnPropertyNames(
              Object.getPrototypeOf(gameClient.spriteBuffer));
            return info;
        }""")
        print(out)
        b.close()
finally:
    srv.terminate()
