/* Teste da v21 — Energy Ring restrito (só Monk/RP), aba Escudo Mágico fora
 * do Knight, Challenge (exeta res + exeta amp res) com toggles na aba Ataque
 * + animação oficial, e o sistema de CARGAS de anéis/amuletos (por tempo
 * como o time ring e por golpe como o might ring).
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
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 840, height: 520 };
    if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
    if (k === "measureText") return () => ({ width: 10 });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === "string" ? () => {} : undefined;
  },
  set() { return true; },
});
w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const ctx = vm.createContext(w);
for (const s of scripts) {
  try { vm.runInContext(fs.readFileSync(path.join(GAME, s), "utf8"), ctx, { filename: s }); }
  catch (e) { errors.push(s + ": " + e.message); }
}

setTimeout(() => {
  try {
    vm.runInContext(`
      const ok = [];
      const fail = (m) => { throw new Error(m); };

      // ---------- 1) ENERGY RING: só Monk e RP ----------
      {
        const kn = createCharacter("KnightER", "knight", "male");
        const mo = createCharacter("MonkER", "monk", "male");
        const rp = createCharacter("PaladinER", "paladin", "male");
        const dr = createCharacter("DruidER", "druid", "male");
        if (canEquipItem(kn, "energy-ring", "ring").ok) fail("knight NÃO pode equipar energy ring");
        if (!canEquipItem(mo, "energy-ring", "ring").ok) fail("monk deveria poder equipar energy ring");
        if (!canEquipItem(rp, "energy-ring", "ring").ok) fail("RP deveria poder equipar energy ring");
        if (canEquipItem(dr, "energy-ring", "ring").ok) fail("druid NÃO pode equipar energy ring");
        if (energyRingAllowed(kn)) fail("energyRingAllowed(knight) deveria ser false");
        if (!energyRingAllowed(mo) || !energyRingAllowed(rp)) fail("monk/RP deveriam poder energy ring");
        ok.push("energy ring restrito a Monk e RP (knight/druid bloqueados)");
      }

      // ---------- 2) CHALLENGE: toggles exeta res + exeta amp res ----------
      {
        const kn = createCharacter("KnightCh", "knight", "male");
        kn.level = 200; kn.mp = 5000;
        G.p = kn; G.inCity = false; G.combat = null;
        const c = newCombat(kn, "rats", "non-pvp");
        c.mobs = [0,1,2,3].map((i) => ({
          slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
          hp: 100, maxHp: 100, id: "m"+i, cx: 3 + i, cy: 6, x: 0.2, y: 0.5,
          dir: "w", attackAnim: 0, atkCd: 0,
        }));
        // sem toggle: não casta nada
        const antes = kn.mp;
        tryChallenge(c, kn, Date.now());
        if (kn.mp !== antes) fail("sem toggle, exeta não deveria castar");
        // só exeta res: marca 1
        kn.config.exetaRes = true;
        tryChallenge(c, kn, Date.now());
        const marcados = c.mobs.filter((m) => m.challengedUntil).length;
        if (marcados !== 1) fail("exeta res deveria marcar 1 inimigo, marcou " + marcados);
        // os DOIS ligados: amp res marca TODOS (prioridade). Passa 3s para
        // o grupo de cooldown compartilhado (grupos "3") destravar.
        kn.config.exetaAmpRes = true;
        for (const m of c.mobs) delete m.challengedUntil;
        tryChallenge(c, kn, Date.now() + 3000);
        const marcados2 = c.mobs.filter((m) => m.challengedUntil).length;
        if (marcados2 !== 4) fail("exeta amp res deveria marcar TODOS (4), marcou " + marcados2);
        const ev = c.events.filter((e) => e.t === "challenge").pop();
        if (!ev || ev.id !== "exeta-amp-res") fail("evento challenge deveria carregar id exeta-amp-res");
        ok.push("exeta res (1 alvo) + exeta amp res (todos) com os dois ligados");
      }

      // ---------- 3) ANIMAÇÃO do exeta amp res registrada ----------
      {
        if (fxFrameCount("chivalrous-challenge") !== 8)
          fail("sprite chivalrous-challenge deveria ter 8 quadros");
        ok.push("animação oficial do exeta amp res registrada (8 quadros)");
      }

      // ---------- 4) CARGAS POR TEMPO (time ring) ----------
      {
        const p = createCharacter("RingT", "knight", "male");
        // dá um time ring e equipa
        addItem(p, "time-ring", 1);
        if (!equipItemFromContainer(p, "time-ring", "bag", "ring")) fail("não equipou time ring");
        const e = p.equip.ring;
        if (e.charges !== 200) fail("time ring deveria equipar com 200 cargas, veio " + e.charges);
        // drena 6s -> 2 cargas
        tickAccessoryCharges(p, 6000);
        if (e.charges !== 198) fail("6s deveriam gastar 2 cargas (198), veio " + e.charges);
        // equipado continua no slot
        if (!p.equip.ring) fail("anel não deveria ter quebrado ainda");
        // desequipa: saldo parcial vai para o ledger
        if (!unequipToContainer(p, "ring", "bag")) fail("falha ao desequipar");
        if (p.ringCharges["time-ring"] !== 198) fail("ledger deveria guardar 198, veio " + p.ringCharges["time-ring"]);
        // re-equipa: continua de 198 (não recarrega de graça)
        if (!equipItemFromContainer(p, "time-ring", "bag", "ring")) fail("não re-equipou");
        if (p.equip.ring.charges !== 198) fail("re-equipar deveria continuar de 198, veio " + p.equip.ring.charges);
        ok.push("cargas por tempo: 1 carga/3s, saldo parcial preservado na troca");
      }

      // ---------- 5) CARGAS POR GOLPE (might ring) + quebra ----------
      {
        const p = createCharacter("RingM", "knight", "male");
        addItem(p, "might-ring", 1);
        equipItemFromContainer(p, "might-ring", "bag", "ring");
        const e = p.equip.ring;
        if (e.charges !== 20) fail("might ring deveria ter 20 cargas, veio " + e.charges);
        // 3 golpes -> 17
        applyPlayerResist(p, "physical", 100);
        applyPlayerResist(p, "fire", 80);
        applyPlayerResist(p, "energy", 60);
        if (e.charges !== 17) fail("3 golpes deveriam gastar 3 cargas (17), veio " + e.charges);
        // zera: quebra e sai do slot
        e.charges = 1;
        applyPlayerResist(p, "physical", 50);
        if (p.equip.ring) fail("might ring deveria QUEBRAR com carga zerada");
        if (p.ringCharges["might-ring"]) fail("ledger do might ring deveria ser limpo na quebra");
        ok.push("cargas por golpe: might ring gasta 1/golpe e quebra ao zerar");
      }

      // ---------- 6) ESCUDO MÁGICO: render sem energy ring p/ não-Monk/RP ----------
      {
        const sor = createCharacter("SorcererMS", "sorcerer", "male");
        const h = renderMagicShieldHelper(sor);
        if (/Energy Ring/.test(h) && !/exclusivo de Monk/.test(h))
          fail("sorcerer não deveria ver a seção de energy ring");
        if (!/não pode equipar/.test(h)) fail("sorcerer deveria ver aviso de vocação incompatível");
        const kn = createCharacter("KnightMS", "knight", "male");
        const hk = renderMagicShieldHelper(kn);
        if (!/Knights não usam/.test(hk)) fail("knight deveria ver aviso de que não usa magic shield");
        ok.push("escudo mágico: knight fora; energy ring oculto para não-Monk/RP");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, ctx);
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V21 OK — energy ring (Monk/RP), exeta res+amp res, animação e cargas por tempo/golpe validados");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
