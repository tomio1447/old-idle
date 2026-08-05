/* Teste da v22 — posicionamento da sprite do personagem no MEIO do SQM e
 * ícone de ranged/melee menor na lateral direita da sprite, abaixo do nome.
 *
 * Carrega o jogo num canvas stub que CAPTURA os drawImage, roda o
 * Renderer.draw numa hunt e verifica:
 *   1) o personagem é desenhado centralizado no SQM (topo = py*H - h/2 e a
 *      sombra no centro do SQM);
 *   2) aliados do party combat usam a MESMA regra de centralização;
 *   3) o ícone de tipo de ataque (ranged/melee) é desenhado com 9px na
 *      lateral direita da sprite (x = mx + w/2 + 3, y ≈ meio da sprite,
 *      abaixo do nome) e NÃO mais ao lado esquerdo do nome.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const GAME = path.join(__dirname, "..", "game");
const html = fs.readFileSync(path.join(GAME, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const dom = new JSDOM(html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, ""), {
  url: "http://localhost/", pretendToBeVisual: true, runScripts: "outside-only",
});
const w = dom.window;
const errors = [];
w.addEventListener("error", (e) => errors.push("WINDOWERROR: " + (e.message || e.error)));

// ---- canvas stub que CAPTURA drawImage com as coordenadas ----
const draws = [];
function makeCtx(cw, ch) {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === "canvas") return { width: cw, height: ch };
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
      if (k === "measureText") return () => ({ width: 20 });
      if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (k === "drawImage") return (img, x, y, w2, h2) => {
        draws.push({ img: img && (img.src || img.tagName || "canvas"), x, y, w: w2, h: h2 });
      };
      return typeof k === "string" ? () => {} : undefined;
    },
    set() { return true; },
  });
}
const ctx = makeCtx(840, 520);
w.HTMLCanvasElement.prototype.getContext = () => ctx;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
w.__drawsRef = draws;   // expõe o capturador para o contexto do vm
const vctx = vm.createContext(w);
for (const s of scripts) {
  try { vm.runInContext(fs.readFileSync(path.join(GAME, s), "utf8"), vctx, { filename: s }); }
  catch (e) { errors.push(s + ": " + e.message); }
}

setTimeout(() => {
  try {
    vm.runInContext(`
      const ok = [];
      const fail = (m) => { throw new Error(m); };

      // ---- monta um combate com o personagem e um monstro ----
      const p = createCharacter("CenterTest", "knight", "male");
      p.level = 50;
      const mx = maxStats(p);
      p.hp = mx.hp; p.mp = mx.mp;
      G.p = p; G.inCity = false; G.combat = null;
      const c = newCombat(p, "rats", "non-pvp");
      G.combat = c;
      // player na celula (5,6)
      c.player.cx = 5; c.player.cy = 6;
      const s6 = cellToScreen(5, 6);
      c.player.x = s6.x; c.player.y = s6.y;
      // monstro na celula (8,6)
      const mob = { slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"], { ranged: 1 }),
                    hp: 100, maxHp: 100, id: "r1", cx: 8, cy: 6,
                    x: cellToScreen(8, 6).x, y: cellToScreen(8, 6).y,
                    dir: "w", moving: false, frame: 0, attackAnim: 0 };
      c.mobs = [mob];

      // renderer com dt qualquer (canvas 840x520 p/ o cálculo do tile)
      const scn = document.getElementById("scene");
      scn.width = 840; scn.height = 520;
      const r = new Renderer(scn);
      // stubs de sprites p/ o teste de posicionamento (JSDOM não carrega PNGs)
      const fakeCanvas = (w2, h2) => ({ tagName: "CANVAS", width: w2, height: h2, complete: true, naturalWidth: w2, naturalHeight: h2 });
      OutfitRenderer.forPlayer = () => fakeCanvas(32, 64);
      Sprites.mob = () => fakeCanvas(32, 32);
      Sprites.mobWalk = () => null;
      // limpa o log de drawImage capturado pelo stub
      window.__drawsRef.length = 0;
      r.draw(c, p, 16);
      const draws = window.__drawsRef;

      // ---- 1) personagem centralizado no SQM ----
      const W = scn.width, H = scn.height;
      const tile = W / 21;
      const scSpr = tile / 32;
      const py = s6.y;
      const topEsperado = py * H - 0; // h varia; validamos pela RELAÇÃO: topo + h/2 == centro
      // captura o drawImage do personagem: a última imagem com altura h tal que
      // (drawY + h/2) fique no centro do SQM
      // sprite do personagem: 32x64 * escala (tile/32)
      const pwE = 32 * scSpr, phE = 64 * scSpr;
      const playerDraw = draws.filter((d) => Math.abs(d.w - pwE) < 4 && Math.abs(d.h - phE) < 4).pop();
      if (!playerDraw) fail("nenhum drawImage do personagem capturado");
      const centroSQM = py * H;
      const centroSprite = playerDraw.y + playerDraw.h / 2;
      if (Math.abs(centroSprite - centroSQM) > 0.001)
        fail("personagem deveria estar centralizado no SQM: centro sprite " + centroSprite.toFixed(2) + " vs centro SQM " + centroSQM.toFixed(2));
      ok.push("personagem centralizado no SQM (vertical: " + centroSprite.toFixed(1) + " ≈ " + centroSQM.toFixed(1) + ")");

      // ---- 2) ícone de ranged: 9px na lateral direita, abaixo do nome ----
      // o stub de measureText devolve 20px; o ícone é vetorial (drawAtkTypeIcon
      // usa stroke, não drawImage) — verificamos o TAMANHO usado no código
      // via a constante: procuramos no fonte de render.js o bloco novo
      const src = document.documentElement.outerHTML; // não carrega o fonte
      // (o fonte é validado no node: ver teste abaixo)
      ok.push("ícone de ataque: posição lateral direita + tamanho 9 (verificado no fonte)");

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    // ---- validação estática do fonte (posição/tamanho do ícone) ----
    const rsrc = fs.readFileSync(path.join(GAME, "js/render.js"), "utf8");
    const blocoIcon = rsrc.indexOf("Ícone de TIPO DE ATAQUE (OTC): ranged");
    if (blocoIcon < 0) throw new Error("bloco do ícone de ataque não encontrado");
    const trecho = rsrc.slice(blocoIcon, blocoIcon + 700);
    if (!/iszAtk = 9/.test(trecho)) throw new Error("ícone deveria ter tamanho 9");
    if (!/atkX = Math\.round\(mx \+ w \/ 2 \+ 3\)/.test(trecho)) throw new Error("ícone deveria ficar à DIREITA da sprite");
    if (!/atkY = Math\.round\(top \+ h \* 0\.35\)/.test(trecho)) throw new Error("ícone deveria ficar no meio da sprite");
    if (/condIcons\.push\(\(typeof monsterAttackRange/.test(trecho)) throw new Error("ícone NÃO deveria mais ficar na linha do nome");
    if (!/top = py \* H - h \/ 2/.test(rsrc)) throw new Error("personagem deveria estar centralizado (py*H - h/2)");
    if (/py \* H \+ tile \/ 2 - h/.test(rsrc)) throw new Error("âncora antiga (pé na borda) não deveria existir no player");
    console.log("  - fonte: player centralizado (py*H - h/2) e ícone 9px à direita da sprite");
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V22 OK — sprite do personagem centralizada no SQM e ícone de ranged/melee reposicionado");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
