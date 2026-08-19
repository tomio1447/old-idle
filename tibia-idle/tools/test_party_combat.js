/* Teste da v20 — PARTY (convite pendente, líder fixo, zona) + PARTY COMBAT
 * (todos na mesma instância) + formas oficiais de onda/área dos monstros.
 *
 * 1) skillRadiusCells/skillRadiusHas: explosão usa o CÍRCULO do Canary
 *    (diamante com cantos cortados), NÃO o quadrado Chebyshev;
 * 2) skillWaveCells/skillWaveHas: onda RETA (eixo dominante) com a boca do
 *    spread — nunca mais linha diagonal;
 * 3) convite local: líder convida -> convite PENDENTE; trocando para o
 *    personagem convidado, ele ACEITA de lá (e só em cidade/treino);
 * 4) líder é FIXO no criador (trocar de personagem não move a liderança);
 * 5) PARTY COMBAT: líder entra na hunt -> TODOS os membros vão para a MESMA
 *    instância (c.players); os aliados atacam, os monstros miram o alvo mais
 *    próximo e o jogador troca o controle sem recarregar.
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

      // ---------- 1) ÁREA: círculo oficial do Canary (não quadrado) ----------
      {
        const r4 = skillRadiusCells(10, 10, 4);
        const set = new Set(r4.map(q => q.cx + "," + q.cy));
        if (r4.length !== 21) fail("radius=4 deveria ter 21 células, tem " + r4.length);
        if (set.has("14,14")) fail("canto (4,4) do quadrado NÃO pode ser atingido (raio 4)");
        if (!set.has("12,10") || !set.has("10,12")) fail("eixo deveria atingir até 2 do centro");
        if (!skillRadiusHas(10, 10, 4, 11, 12)) fail("skillRadiusHas(1,2) deveria ser true");
        if (skillRadiusHas(10, 10, 4, 14, 10)) fail("skillRadiusHas(4,0) deveria ser false (raio 4 corta em 3)");
        if (!skillRadiusHas(10, 10, 3, 11, 10)) fail("raio 3 deveria cobrir a casa à direita do centro");
        if (skillRadiusHas(10, 10, 3, 12, 10)) fail("raio 3 NÃO deveria cobrir dx=2 (é 3x3)");
        ok.push("explosão usa o círculo oficial (21 células p/ raio 4, cantos cortados)");
      }

      // ---------- 2) ONDA: reta com spread (nunca diagonal) ----------
      {
        // monstro em (5,5), alvo a LESTE -> onda vai reta no eixo X
        const cells = skillWaveCells({ cx: 5, cy: 5 }, { cx: 9, cy: 5 }, 4, 2);
        // Igual às waves do jogador (AREA_WAVE*): boca LARGA na ponta,
        // estreita perto do caster. len4/spread2: x=9 boca 5 (cy 3..7),
        // x=8 boca 5, x=7..6 boca 3 — total 5+5+3+3 = 16
        if (cells.length !== 16) fail("onda len4/spread2 deveria ter 16 células, tem " + cells.length);
        const xOk = cells.every(q => q.cx >= 6 && q.cx <= 9);
        if (!xOk) fail("onda LESTE deveria ser reta (x 6..9), veio " + JSON.stringify(cells));
        const ponta = cells.filter(q => q.cx === 9);
        if (ponta.length !== 5 || ponta.some(q => q.cy < 3 || q.cy > 7))
          fail("fim da onda deveria ter boca 5 centrada no eixo (como AREA_WAVE do player)");
        const perto = cells.filter(q => q.cx === 6);
        if (perto.length !== 3 || perto.some(q => q.cy < 4 || q.cy > 6))
          fail("base da onda deveria ser estreita junto do caster");
        if (!skillWaveHas({ cx: 5, cy: 5 }, { cx: 9, cy: 5 }, 4, 2, 8, 5)) fail("alvo alinhado deveria ser atingido");
        if (skillWaveHas({ cx: 5, cy: 5 }, { cx: 9, cy: 5 }, 4, 2, 9, 8)) fail("alvo fora da boca da onda NÃO deveria ser atingido");
        if (skillWaveHas({ cx: 5, cy: 5 }, { cx: 9, cy: 7 }, 4, 2, 6, 8)) fail("borda junto do caster NÃO deveria atingir fora");
        // alvo DIAGONAL (dx=3, dy=-5 -> eixo dominante vertical): a onda sobe
        // RETO para o norte (cy < 5), com boca do spread em cx 3..7 — nunca
        // uma linha diagonal em direção ao alvo
        const c2 = skillWaveCells({ cx: 5, cy: 5 }, { cx: 8, cy: 0 }, 8, 3);
        const reta = c2.every(q => q.cy < 5 && q.cx >= 3 && q.cx <= 7);
        if (!reta) fail("onda com alvo diagonal deveria ir RETO no eixo dominante, veio " + JSON.stringify(c2.slice(0, 6)));
        if (c2.some(q => q.cy === 4 && q.cx === 8)) fail("onda NÃO pode desviar na diagonal até o alvo (8,4)");
        ok.push("onda reta no eixo dominante com boca do spread (sem diagonal)");
      }

      // ---------- 3) PARTY LOCAL: convite pendente + aceite no convidado ----------
      localStorage.clear();
      const lider = createCharacter("LiderPC", "knight", "male");
      const membro = createCharacter("MembroPC", "druid", "male");
      const outros = createCharacter("OutroPC", "paladin", "male");
      G.p = lider; G.inCity = true; G.combat = null; G.training = null;
      // cria a party local
      localStorage.setItem("tibia-idle-party-local-v1", JSON.stringify({
        leaderId: String(characterId(lider)), leaderName: lider.name,
        members: [], invites: [], shareExp: false, session: null,
      }));
      if (!partyIsLeaderLocal(lider)) fail("líder local não reconhecido");
      // convite do líder para o membro
      const inv = partyInviteMember(lider, String(characterId(membro)));
      if (!inv.ok) fail("convite falhou: " + inv.msg);
      const pend = partyPendingInvites(lider);
      if (pend.length !== 0) fail("convite não deveria aparecer para o líder");
      const pendM = partyPendingInvites(membro);
      if (pendM.length !== 1) fail("convite deveria estar PENDENTE para o personagem convidado");
      // o convidado NÃO está na party ainda
      if (partyIsMemberLocal(membro)) fail("convidado não pode entrar antes de aceitar");
      // líder fora da zona segura -> convite bloqueado
      G.inCity = false; G.p.hunt = "rats"; G.combat = { huntId: "rats" };
      const inv2 = partyInviteMember(lider, String(characterId(outros)));
      if (inv2.ok) fail("convite deveria ser bloqueado fora de cidade/treino");
      // convidado em zona segura aceita
      G.p = membro; G.inCity = true; G.p.hunt = null; G.combat = null;
      const ace = partyAcceptInvite(membro, pendM[0].id);
      if (!ace.ok) fail("aceite falhou: " + ace.msg);
      if (!partyIsMemberLocal(membro)) fail("membro deveria estar na party após aceitar");
      if (String(partyLocalData().leaderId) !== String(characterId(lider)))
        fail("líder deveria continuar sendo o criador");
      ok.push("convite pendente + aceite no personagem convidado + zona validados");

      // ---------- 4) LÍDER FIXO: trocar de personagem não move a liderança ----------
      G.p = membro;
      if (partyIsLeaderLocal(membro)) fail("membro não pode virar líder ao trocar de personagem");
      if (!partyIsLeaderLocal(lider)) fail("líder original perdeu a liderança");
      ok.push("líder permanece no personagem que criou a party");

      // ---------- 5) PARTY COMBAT: todos na MESMA instância ----------
      {
        // membro não pode entrar em hunt por conta própria
        G.p = membro; G.inCity = true;
        if (!partyBlocksHunt()) fail("membro de party deveria estar bloqueado de hunt");
        // líder entra na hunt -> c.players com TODOS
        G.p = lider; G.inCity = false; G.combat = null;
        const c = newCombat(lider, "rats", "non-pvp");
        G.combat = c;
        if (!c.players || c.players.length !== 2)
          fail("party combat deveria carregar 2 entidades, veio " + (c.players ? c.players.length : "null"));
        if (c.player !== c.players[0]) fail("entidade ativa deveria ser o líder");
        const entM = c.players.find(e => String(e.id) === String(characterId(membro)));
        if (!entM || !entM.p) fail("membro deveria ter entidade viva na mesma instância");
        // os dois começam vivos
        if (lider.hp <= 0 || entM.p.hp <= 0) fail("entidades deveriam começar vivas");
        // o membro ataca sozinho (força atkCd zerado + alvo em alcance)
        const mob = { slug: "rat", def: Object.assign({}, GAMEDATA.monsters["rat"] || GAMEDATA.monsters["cave-rat"]),
                      hp: 5000, maxHp: 5000, id: "r1", cx: 8, cy: 8, x: 0.4, y: 0.5, atkCd: 0, dir: "w", attackAnim: 0 };
        c.mobs = [mob];
        entM.cx = 7; entM.cy = 8;
        const s = cellToScreen(7, 8); entM.x = s.x; entM.y = s.y;
        entM.atkCd = 0;
        partyTickAllies(c, Date.now(), 100);
        if (mob.hp >= 5000) fail("aliado deveria ter atacado o monstro");
        ok.push("party combat: membros na mesma instância, aliados atacam sozinhos");
        // monstro mira o alvo mais próximo (não só o personagem ativo)
        const alvoM = partyNearestTarget(c, mob);
        if (!alvoM || !alvoM.p) fail("monstro deveria ter alvo");
        const distL = sqmDistance(c.players[0], mob);
        const distM = sqmDistance(entM, mob);
        if (distM >= distL && alvoM !== c.players[0])
          fail("monstro deveria mirar o membro (mais próximo), mirou outro");
        // mobAttack acerta o ALIADO: o dano vai para o membro, não só o líder
        mob.target = entM;
        const hpMembroAntes = entM.p.hp;
        const hpLiderAntes = lider.hp;
        mob.atkCd = 0;
        mobAttack(c, lider, mob);
        if (entM.p.hp >= hpMembroAntes) fail("aliado deveria ter tomado dano do monstro");
        if (lider.hp !== hpLiderAntes) fail("líder NÃO deveria tomar dano quando o monstro mira o aliado");
        ok.push("monstros miram o alvo mais próximo e acertam o aliado de verdade");
        // troca de controle sem recarregar
        if (!partyCombatSwitchTo(String(characterId(membro)))) fail("troca de controle falhou");
        if (G.p !== entM.p) fail("controle deveria ter ido para o membro");
        ok.push("troca de controle (ativo) sem recarregar a página");
        // aliado caído vira inconsciente e renasce (partyHandleDown + reviveAt)
        const hpTotal = maxStats(entM.p).hp;
        entM.p.hp = 0;
        partyHandleDown(c, entM.p);
        if (!entM.reviveAt) fail("aliado caído deveria ter reviveAt agendado");
        ok.push("aliado caído fica inconsciente e renasce no local (reviveAt)");
      }

      console.log("  - " + ok.join("\\n  - "));
    `, ctx);
    if (errors.length) throw new Error(errors.join(" | "));
    console.log("PARTY COMBAT + ONDAS/ÁREAS OK — formas oficiais, convite pendente, líder fixo e mesma instância validados");
    process.exit(0);
  } catch (e) {
    console.log("ERRO:", e.message);
    errors.slice(0, 10).forEach((x) => console.log("  - " + x));
    process.exit(1);
  }
}, 900);
