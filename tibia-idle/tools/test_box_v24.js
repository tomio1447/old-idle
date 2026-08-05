/* Teste da v24 — Modo BOX (formação por vocação), avalanche fix (sprite no
 * chão), party limite 4 + convites visíveis, exeta res (cd 5s, pega todos).
 *
 * 1) AVALANCHE: "ice-area" não pode mais apontar para o ice-crystal-effect
 *    (o alias que rasgava a sprite no chão); fxFrameCount("ice-area") = 9 e
 *    o Sprites.fx cai no assets/fx/ice-area.png do DAT;
 * 2) PARTY 4: limite de 4 no total (líder + 3); com 3 membros o 4º convite
 *    é bloqueado com a msg certa; convites pendentes aparecem para o líder
 *    (partyPendingInvitesAll) e podem ser cancelados;
 * 3) EXETA RES: cd 5s e pega TODOS os monstros (não só 1);
 * 4) MODO BOX: boxTargetCell dá posições por vocação — knight no centro,
 *    paladin a 2 SQM nas RETAS (nunca diagonais), magos na célula com mais
 *    mobs no raio de área; boxThinkStep move a entidade até a posição.
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

      // ---------- 1) AVALANCHE: sprite correta no chão ----------
      {
        const meta = fxClientMeta("ice-area");
        if (meta) fail("ice-area não deveria ter alias (meta=" + meta.slug + ")");
        if (fxFrameCount("ice-area") !== 9) fail("fxFrameCount(ice-area) deveria ser 9 (DAT), veio " + fxFrameCount("ice-area"));
        // o Sprites.fx deve apontar para o DAT, não para o crystal da wiki
        const srcFx = Sprites.fx("ice-area");
        const srcStr = srcFx && (srcFx.src || "");
        if (!/assets\\/fx\\/ice-area\\.png/.test(srcStr)) fail("ice-area deveria usar assets/fx/ice-area.png, veio " + srcStr);
        ok.push("avalanche: ice-area sem alias, 9 frames, sprite do DAT no chão");
      }

      // ---------- 2) PARTY: limite 4 + convites visíveis p/ o líder ----------
      localStorage.clear();
      const lider = createCharacter("KnightP4", "knight", "male");
      const sorc = createCharacter("SorcP4", "sorcerer", "male");
      const pala = createCharacter("PalaP4", "paladin", "male");
      const drui = createCharacter("DruidP4", "druid", "male");
      const quint = createCharacter("QuintoP4", "monk", "male");
      G.p = lider; G.inCity = true; G.combat = null;
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(lider)), leaderName: lider.name,
        members: [], invites: [], shareExp: false, session: null,
      }));
      const aceitar = (p2) => {
        G.p = p2;
        const pend = partyPendingInvites(p2);
        if (!pend.length) return false;
        partyAcceptInvite(p2, pend[0].id);
        return true;
      };
      partyInviteMember(lider, String(characterId(sorc))); aceitar(sorc);
      partyInviteMember(lider, String(characterId(pala))); aceitar(pala);
      G.p = lider;
      // convida o druid (4º) — fica pendente e o LÍDER vê
      const invD = partyInviteMember(lider, String(characterId(drui)));
      if (!invD.ok) fail("convite do 4º falhou: " + invD.msg);
      const env = partyPendingInvitesAll();
      if (env.length !== 1 || env[0].toName !== drui.name) fail("líder deveria ver o convite pendente do druid");
      // cancela e re-envia
      const canc = partyCancelInvite(lider, env[0].id);
      if (!canc.ok) fail("cancelar convite falhou: " + canc.msg);
      if (partyPendingInvitesAll().length !== 0) fail("convite deveria ter sido cancelado");
      // druid volta a aparecer na lista
      const dispo = partyAvailableMembers(lider).map(d => d.name);
      if (dispo.indexOf(drui.name) === -1) fail("druid deveria voltar à lista após cancelar");
      partyInviteMember(lider, String(characterId(drui))); aceitar(drui);
      if (partyLocalData().members.length !== 3) fail("deveria ter 3 membros (4 no total), veio " + partyLocalData().members.length);
      // 5º personagem: bloqueado
      G.p = lider;
      const invQ = partyInviteMember(lider, String(characterId(quint)));
      if (invQ.ok) fail("5º personagem NÃO deveria entrar (limite 4)");
      if (!/4 personagens/.test(invQ.msg || "")) fail("msg do limite errada: " + invQ.msg);
      ok.push("party: limite 4 (líder + 3), convites pendentes visíveis e canceláveis no líder");
      localStorage.clear();
      // limpa a party p/ os próximos testes
      const lider2 = createCharacter("LiderBox", "knight", "male");
      const rp2 = createCharacter("RPBox", "paladin", "male");
      const sor2 = createCharacter("SorcBox", "sorcerer", "male");
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(lider2)), leaderName: lider2.name,
        members: [
          { id: String(characterId(rp2)), name: rp2.name, voc: rp2.voc, level: 200, expGained: 0, kills: 0, levelUps: 0 },
          { id: String(characterId(sor2)), name: sor2.name, voc: sor2.voc, level: 200, expGained: 0, kills: 0, levelUps: 0 },
        ],
        invites: [], shareExp: false, session: null,
      }));
      saveCharacterToRoster(lider2); saveCharacterToRoster(rp2); saveCharacterToRoster(sor2);
      G.p = lider2;
      const cBox = newCombat(lider2, "rats", "non-pvp");
      cBox.huntMap = null;   // teste determinístico: sem paredes do mapa
      G.combat = cBox;
      // posiciona o knight no centro (spawn) e mobs em volta
      const centro = boxCenter(cBox);
      cBox.player.cx = centro.cx; cBox.player.cy = centro.cy;
      const sc0 = cellToScreen(centro.cx, centro.cy);
      cBox.player.x = sc0.x; cBox.player.y = sc0.y;
      cBox.mobs = [];
      // 4 mobs em cluster a 1-2 SQM do centro (alvos da área do mago)
      const cluster = [[8,4],[9,4],[10,4],[8,5]];
      for (let i = 0; i < cluster.length; i++) {
        const [mxc, myc] = cluster[i];
        const sm = cellToScreen(mxc, myc);
        cBox.mobs.push({ slug: "rat", def: Object.assign({}, GAMEDATA.monsters["cave-rat"]),
          hp: 100, maxHp: 100, id: "b"+i,
          cx: mxc, cy: myc, x: sm.x, y: sm.y, dir: "w", moving: false, attackAnim: 0 });
      }
      // o sorc aliado longe do caminho do RP (não bloqueia)
      const entSorSetup = cBox.players.find(e => e.p && e.p.voc === "sorcerer");
      entSorSetup.cx = 2; entSorSetup.cy = 10;
      const scS = cellToScreen(2, 10);
      entSorSetup.x = scS.x; entSorSetup.y = scS.y;

      // ---------- 3) EXETA RES: cd 5s e pega TODOS ----------
      {
        const kn = lider2;
        kn.level = 200; kn.mp = 9999;
        kn.config.exetaRes = true;
        kn.config.exetaAmpRes = false;
        for (const m of cBox.mobs) delete m.challengedUntil;
        const usou = tryChallenge(cBox, kn, Date.now());
        if (!usou) fail("exeta res não castou");
        const marcados = cBox.mobs.filter(m => m.challengedUntil).length;
        if (marcados !== 4) fail("exeta res deveria pegar TODOS (4), pegou " + marcados);
        const sRes = SPELLS["exeta-res"];
        if (!sRes || sRes.cd !== 5000) fail("exeta res deveria ter cd 5000, veio " + (sRes && sRes.cd));
        ok.push("exeta res: cd 5s e pega todos os monstros");
      }

      // ---------- 4) MODO BOX: posições por vocação ----------
      {
        // knight: centro da sala
        const tKn = boxTargetCell(cBox, cBox.players[0], null);
        if (tKn.cx !== centro.cx || tKn.cy !== centro.cy) fail("knight BOX deveria ir ao centro");
        // RP: 2 SQM nas RETAS (nunca diagonal)
        const entRP = cBox.players.find(e => e.p && e.p.voc === "paladin");
        entRP.cx = centro.cx + 5; entRP.cy = centro.cy + 3;   // longe
        const scRP = cellToScreen(entRP.cx, entRP.cy);
        entRP.x = scRP.x; entRP.y = scRP.y;
        const tRP = boxTargetCell(cBox, entRP, null);
        const dx = Math.abs(tRP.cx - centro.cx), dy = Math.abs(tRP.cy - centro.cy);
        if (Math.max(dx, dy) !== 2) fail("RP BOX deveria ficar a 2 SQM, veio " + JSON.stringify(tRP));
        if (dx !== 0 && dy !== 0) fail("RP BOX NUNCA pode ficar na diagonal: " + JSON.stringify(tRP));
        // mago: a posição escolhida maximiza mobs no raio 3 (cluster 4 mobs
        // a 1-2 SQM do centro -> o centro mesmo pega todos)
        const entSor = cBox.players.find(e => e.p && e.p.voc === "sorcerer");
        entSor.cx = centro.cx + 4; entSor.cy = centro.cy + 2;
        const tSor = boxTargetCell(cBox, entSor, null);
        const nAlvo = boxCountMobs(cBox, tSor.cx, tSor.cy, 3);
        if (nAlvo < 4) fail("mago BOX deveria achar posição com os 4 mobs no raio 3, achou " + nAlvo + " em " + JSON.stringify(tSor));
        ok.push("modo BOX: knight no centro, RP a 2 SQM nas retas, mago na posição de área");
        // boxThinkStep move o RP até a formação (recalcula o alvo livre)
        entRP.p.config = Object.assign({ attackMode: "box" }, entRP.p.config || {});
        let passos = 0;
        let tBox = Date.now();
        let ultPos = "";
        while (passos < 60) {
          tBox += 1200;   // espera o nextStepAt passar (passo real de ~1.1s)
          // no jogo o updateGridMovement roda advanceStep antes do think
          let guarda = 0;
          while (entRP.moving && guarda < 5) { advanceStep(entRP, 5000); guarda++; }
          const occ = buildOccupancy(cBox);
          boxThinkStep(cBox, entRP, cBox.mobs[0], occ, tBox);
          const pos = entRP.cx + "," + entRP.cy;
          if (pos === ultPos) { fail("RP travou em " + pos); }
          ultPos = pos;
          passos++;
        }
        const dxF = Math.abs(entRP.cx - centro.cx), dyF = Math.abs(entRP.cy - centro.cy);
        const distF = Math.max(dxF, dyF);
        if (distF !== 2) fail("RP deveria terminar a 2 SQM do knight, veio " + entRP.cx + "," + entRP.cy + " (dist " + distF + ")");
        if (dxF !== 0 && dyF !== 0) fail("RP NÃO pode terminar na diagonal: " + entRP.cx + "," + entRP.cy);
        ok.push("boxThinkStep move o aliado até a formação (2 SQM, reta)");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, vctx);
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("V24 OK — avalanche fix, party limite 4 + convites, exeta res (5s/todos) e modo BOX validados");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
