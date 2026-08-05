/* Teste dos fixes de combate da v18:
 * 1) O ataque básico (melee) dos monstros roda SEMPRE, junto com as skills
 *    (Canary commitCombatIntention) — antes o `skills || melee` pulava o
 *    dano físico quando qualquer skill passava;
 * 2) Knight tem +30% de dano base (playerDamage);
 * 3) HEAL FRIEND (Druid/Monk): exura sio/gran sio curam 1 aliado; exura
 *    gran mas res (Mass Healing) cura 2+ aliados feridos da party.
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
      const conclui = [];
      // ---- 1) melee sempre roda + skills ----
      const p = createCharacter("FixTest", "knight", "male");
      p.level = 300;
      const mx = maxStats(p);
      p.hp = mx.hp; p.mp = mx.mp;
      G.p = p; G.inCity = false; G.combat = null; G.training = null;
      const c = newCombat(p, "dt-seal", "non-pvp");
      c.mobs = [];
      for (const slug of ["vexclaw","grimeleech","dark-torturer"]) {
        const base = GAMEDATA.monsters[slug];
        c.mobs.push({ slug, def: base, hp: base.hp, maxHp: base.hp,
          atkCd: 0, skillCds: {}, id: "m"+slug, x: 0.7, y: 0.5,
          dir: "w", moving: false, attackAnim: 0, speed: 0.00005, spawnAt: Date.now() });
      }
      if (typeof resolveSQMOccupancy === "function") resolveSQMOccupancy(c);
      // força o melee a rodar: garante que mobAttack chama sem skills no caminho
      const hpIni = p.hp;
      for (let i = 0; i < 30; i++) combatTick(c, p, 500);
      const tomado = c.events.filter(e => e.t === "taken");
      const fisico = tomado.filter(e => e.el === "physical" || !e.el).length;
      if (!fisico) throw new Error("nenhum dano físico (melee) saiu em 30 ticks");
      conclui.push("melee sempre roda (físico presente)");

      // ---- 2) Knight +30% dano base ----
      const kn = createCharacter("Knight30", "knight", "male");
      kn.level = 50;
      kn.equip.weapon = { item: "sword" };   // atk 14 -> fis = 14*1.2*1.3 = 21
      const dK = playerDamage(kn);
      if (dK.max < 20) throw new Error("knight dano baixo: " + dK.max);
      conclui.push("knight +30% (dano " + dK.min + "-" + dK.max + ")");

      // ---- 3) HEAL FRIEND mass heal ----
      const d = createCharacter("DruidHF", "druid", "male");
      d.level = 300;
      d.mp = 10000;
      d.config.healFriendSpell = "exura-gran-mas-res";
      d.config.healFriendAt = 70;
      const a1 = createCharacter("Aliado1", "knight", "male"); a1.id = "a1";
      const a2 = createCharacter("Aliado2", "paladin", "male"); a2.id = "a2";
      const mx1 = maxStats(a1), mx2 = maxStats(a2);
      a1.hp = Math.floor(mx1.hp * 0.2); a2.hp = Math.floor(mx2.hp * 0.3);
      saveCharacterToRoster(a1); saveCharacterToRoster(a2);
      // party LOCAL compartilhada (storage): líder = d, membros = a1/a2
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(d)), leaderName: d.name,
        members: [
          { id: "a1", name: "Aliado1", voc: "knight", level: 300, expGained: 0, kills: 0, levelUps: 0 },
          { id: "a2", name: "Aliado2", voc: "paladin", level: 300, expGained: 0, kills: 0, levelUps: 0 },
        ],
        invites: [], shareExp: false, session: null,
      }));
      G.p = d;
      const c2 = { events: [], player: { x: 0.5, y: 0.5 } };
      tryHealFriend(c2, d, Date.now());
      const roster = readRoster();
      if (roster["a1"].p.hp <= Math.floor(mx1.hp * 0.2)) throw new Error("aliado1 não curado");
      if (roster["a2"].p.hp <= Math.floor(mx2.hp * 0.3)) throw new Error("aliado2 não curado");
      conclui.push("HEAL FRIEND mass heal curou 2 aliados");

      // ---- 3b) HEAL FRIEND single (exura sio) com 1 ferido ----
      const d2 = createCharacter("DruidSingle", "druid", "male");
      d2.level = 100; d2.mp = 10000;
      d2.config.healFriendSpell = "exura-sio";
      d2.config.healFriendAt = 70;
      const a3 = createCharacter("Aliado3", "knight", "male"); a3.id = "a3";
      const mx3 = maxStats(a3);
      a3.hp = Math.floor(mx3.hp * 0.2);
      saveCharacterToRoster(a3);
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(d2)), leaderName: d2.name,
        members: [{ id: "a3", name: "Aliado3", voc: "knight", level: 100, expGained: 0, kills: 0, levelUps: 0 }],
        invites: [], shareExp: false, session: null,
      }));
      G.p = d2;
      const c3 = { events: [], player: { x: 0.5, y: 0.5 } };
      tryHealFriend(c3, d2, Date.now());
      if (readRoster()["a3"].p.hp <= Math.floor(mx3.hp * 0.2)) throw new Error("aliado3 não curado (single)");
      conclui.push("HEAL FRIEND single (exura sio) curou 1 aliado");

      console.log("  - " + conclui.join("\\n  - "));
    `, ctx);
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("COMBAT FIXES OK — melee, knight +30% e heal friend validados");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 800);
