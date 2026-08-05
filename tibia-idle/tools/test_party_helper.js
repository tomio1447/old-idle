/* Teste da v23 — Helper INDIVIDUAL por personagem no Party Combat + tag de
 * party ao lado do personagem (OTC/Canary).
 *
 * 1) partyHelperTick roda o HELPER COMPLETO para cada aliado com a própria
 *    config: o druid aliado se cura (spell), bebe mana, e o cooldown de
 *    potion/heal é POR PERSONAGEM (o líder beber não trava o aliado);
 * 2) aliados atacam com a arma deles (não só o líder);
 * 3) a tag de party (estrela no líder, círculo nos membros) é desenhada ao
 *    lado do nome de cada personagem na cena.
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
    if (k === "measureText") return () => ({ width: 20 });
    if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === "string" ? () => {} : undefined;
  },
  set() { return true; },
});
w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,xx";
w.requestAnimationFrame = (cb) => setTimeout(cb, 16);
w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
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

      // ---------- 1) helper individual por personagem ----------
      const lider = createCharacter("LiderH", "knight", "male");
      const druid = createCharacter("DruidH", "druid", "male");
      druid.level = 300;
      const mxD = maxStats(druid);
      druid.hp = Math.floor(mxD.hp * 0.3);   // ferido
      druid.mp = 5000;
      druid.config.healSpell = "exura-gran";  // cura forte do druid
      druid.config.healSpellAt = 70;
      druid.config.healItemAt = 30;
      druid.config.manaAt = 60;
      druid.supplies["mana-potion"] = 20;
      druid.config.manaSupply = "mana-potion";
      // party local com o druid de membro
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(lider)), leaderName: lider.name,
        members: [{ id: String(characterId(druid)), name: druid.name, voc: druid.voc, level: druid.level,
                    expGained: 0, kills: 0, levelUps: 0 }],
        invites: [], shareExp: false, session: null,
      }));
      saveCharacterToRoster(lider);
      saveCharacterToRoster(druid);
      G.p = lider;
      const c = newCombat(lider, "rats", "non-pvp");
      G.combat = c;
      if (!c.players || c.players.length !== 2) fail("party combat deveria carregar 2 entidades");
      const entD = c.players.find(e => String(e.id) === String(characterId(druid)));
      if (!entD) fail("entidade do druid não encontrada");
      // o c.player da entidade do druid é o save DELE (config individual)
      if (entD.p.config.healSpell !== "exura-gran") fail("config do druid não preservada na entidade");
      const hpAntes = entD.p.hp;
      // monstro para o aliado atacar
      const mob = { slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
                    hp: 5000, maxHp: 5000, id: "r1", cx: 8, cy: 6,
                    x: cellToScreen(8, 6).x, y: cellToScreen(8, 6).y, dir: "w", attackAnim: 0 };
      c.mobs = [mob];
      entD.cx = 6; entD.cy = 6;
      const sD = cellToScreen(6, 6); entD.x = sD.x; entD.y = sD.y;
      entD.atkCd = 0;
      // tick do helper do ALIADO
      partyHelperTick(c, entD, Date.now(), 100);
      if (entD.p.hp <= hpAntes) fail("druid aliado NÃO se curou com a própria config (hp " + entD.p.hp + " <= " + hpAntes + ")");
      ok.push("aliado se cura com a própria config do helper (exura gran)");
      if (mob.hp >= 5000) fail("aliado NÃO atacou com a arma dele");
      ok.push("aliado ataca com a arma dele");
      // mana: drena a mana do druid e confere que ele bebe
      const mpAntes = entD.p.mp;
      entD.p.mp = Math.floor(mxD.mp * 0.2);
      partyHelperTick(c, entD, Date.now() + 1500, 100);
      if (entD.p.mp <= Math.floor(mxD.mp * 0.2)) fail("aliado NÃO bebeu mana potion (mp " + entD.p.mp + ")");
      ok.push("aliado bebe mana potion (config própria)");

      // ---------- 2) cooldown de potion/heal POR PERSONAGEM ----------
      {
        const liderP = lider;
        const druidP = entD.p;
        // líder bebe potion (trava o dele) — o valor do aliado NÃO muda
        const potDruidAntes = entCd(c, druidP, "potionCd");
        entCdSet(c, liderP, "potionCd", Date.now() + 5000);
        if (entCd(c, druidP, "potionCd") !== potDruidAntes) fail("potionCd do aliado não deveria ser afetado pelo líder");
        if (entCd(c, liderP, "potionCd") <= 0) fail("potionCd do líder deveria estar travado");
        ok.push("cooldowns de potion independentes por personagem (líder não trava aliado)");
        // healCd também por personagem
        const healLiderAntes = entCd(c, liderP, "healCd");
        entCdSet(c, druidP, "healCd", Date.now() + 3000);
        if (entCd(c, liderP, "healCd") !== healLiderAntes) fail("healCd do líder não deveria ser afetado pelo druid");
        ok.push("cooldowns de cura independentes por personagem");
      }

      // ---------- 3) tag de party no render (estrela/círculo) ----------
      {
        if (typeof drawPartyTagIcon !== "function") fail("drawPartyTagIcon não definida");
        ok.push("drawPartyTagIcon definida (estrela no líder, círculo nos membros)");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    // ---- fonte: tag chamada para player e aliados; helper por entidade ----
    const rsrc = fs.readFileSync(path.join(GAME, "js/render.js"), "utf8");
    if (!/drawPartyTagIcon\(ctx, px \* W - nmW \/ 2 - 8, drawY - 20, ehLider\)/.test(rsrc))
      throw new Error("tag do líder não desenhada ao lado do nome");
    if (!/drawPartyTagIcon\(ctx, ent\.x \* W - nmW2 \/ 2 - 8, top - 19, false\)/.test(rsrc))
      throw new Error("tag do membro não desenhada ao lado do nome");
    const csrc = fs.readFileSync(path.join(GAME, "js/combat.js"), "utf8");
    if (!/partyHelperTick\(c, ent, now, dt\)/.test(csrc)) throw new Error("partyHelperTick não encontrada");
    if (!/tryHeal\(c, p, now\)/.test(csrc) || !/tryMana\(c, p, now\)/.test(csrc))
      throw new Error("helper completo por aliado não roda");
    console.log("  - fonte: helper completo por aliado + tag de party no render");
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V23 OK — helper individual por personagem (party combat) e tag de party ao lado do personagem");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
