/*
 * game.js — loop principal, save/load, ganhos offline e bootstrap
 */
"use strict";

// DEBUG temporário: contadores de procs da Exaltation Forge na tela
window.FORGE_DEBUG_COUNT = { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };

const SAVE_KEY = "tibia-idle-save-v1";
const CHARACTERS_KEY = "tibia-idle-characters-v1";
const ACTIVE_CHARACTER_KEY = "tibia-idle-active-character-v1";
const AUTOLOGIN_KEY = "tibia-idle-autologin-v1";
const INSTANCE_SESSION_KEY = "tibia-idle-active-instance-v1";
const FULL_STAMINA_SECONDS = 42 * 3600;

const G = {
  p: null,
  combat: null,
  training: null,
  renderer: null,
  last: 0,
  autoScroll: true,
  paused: false,
  sellTimer: 0,
  saveTimer: 0,
  tickAcc: 0,
  cityRegenHp: 0,
  cityRegenMp: 0,
  manaTrainAcc: 0,
};

/* ------------------------------------------------------------ save */
function characterId(p) {
  if (!p.id) p.id = "char-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  return p.id;
}

function readRoster() {
  try {
    const raw = localStorage.getItem(CHARACTERS_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return d && typeof d === "object" ? d : {};
  } catch (e) { return {}; }
}

function writeRoster(roster) {
  localStorage.setItem(CHARACTERS_KEY, JSON.stringify(roster));
}

function saveCharacterToRoster(p) {
  if (!p) return false;
  const id = characterId(p);
  const roster = readRoster();
  p.lastSeen = Date.now();
  roster[id] = { v: 1, p: p };
  writeRoster(roster);
  localStorage.setItem(ACTIVE_CHARACTER_KEY, id);
  return true;
}

function getCharacters() {
  const roster = readRoster();
  return Object.keys(roster).map((id) => {
    const p = roster[id] && roster[id].p ? normalizePlayer(roster[id].p) : null;
    if (p) p.id = id;
    return p;
  }).filter(Boolean).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

function clearInstanceSession(reason,localOnly) {
  try { localStorage.removeItem(INSTANCE_SESSION_KEY); } catch (e) { /* sem storage */ }
  if(!localOnly&&typeof accountApiConfigured==="function"&&accountApiConfigured()&&
     typeof accountEndInstance==="function"&&typeof sessionToken==="function")
    accountEndInstance(sessionToken(),reason||"cleared").catch(()=>{});
}

function combatSessionParticipants(c) {
  if (c && c.players && c.players.length) return c.players.filter((e) => e && e.p);
  return G.p ? [{ id:G.p.id, name:G.p.name, p:G.p }] : [];
}

/* Persiste a instância, não apenas o personagem. O mapa/efeitos são
 * reconstruídos no reload; entidades, HP, cooldowns, waves e mecânicas do
 * boss permanecem no snapshot. Assim fechar o navegador equivale a deixar
 * a aba oculta, em vez de teleportar a party para a cidade. */
function persistActiveInstance() {
  const c=G.combat;
  if(!c||c.instanceFinished||c.bossDefeated){clearInstanceSession(c&&c.bossDefeated?"boss-defeated":"finished");return null;}
  const savedAt=Date.now(),participants=combatSessionParticipants(c);
  for(const ent of participants)if(ent.p)ent.p.stamina=FULL_STAMINA_SECONDS;
  const descriptor={
    v:1,savedAt,startedAt:c.instanceStartedAt||(c.instanceStartedAt=savedAt),
    kind:c.boss?"boss":"hunt",huntId:c.huntId||null,
    bossId:c.boss&&c.boss.id?c.boss.id:null,
    instanceMode:c.instanceMode||(G.p&&G.p.instanceMode)||"non-pvp",
    activeCharacterId:G.p&&G.p.id?String(G.p.id):null,
    members:participants.map((ent)=>({
      id:String(ent.id||ent.p.id||""),p:ent.p,
      hp:ent.p.hp,mp:ent.p.mp,
    })),
  };
  try {
    const state=JSON.parse(JSON.stringify(c,(key,value)=>{
      // Shared references (c.player também está em c.players) são válidas e
      // devem ser duplicadas pelo JSON.stringify. Remova apenas ciclos reais.
      // damageTrack/takenTrack: só cliente (rederivados dos eventos); se
      // persistirem no checkpoint, o tick online reenvia o snapshot e zera
      // o acumulado da sessão no analyser.
      if(key==="huntMap"||key==="events"||key==="randomFn"||key==="raf"||
         key==="_authorityDescriptor"||key==="_formationReservations"||
         key==="damageTrack"||key==="takenTrack")return undefined;
      if(key==="target")return value&&value.id?{__targetId:String(value.id)}:null;
      return typeof value==="function"?undefined:value;
    }));
    descriptor.state=state;
  } catch(error) {
    console.warn("[idle] snapshot compacto da instância",error);
  }
  try {
    localStorage.setItem(INSTANCE_SESSION_KEY,JSON.stringify(descriptor));
  } catch(error) {
    // Quota reduzida: ainda guarda membros + identidade para recriar a arena.
    delete descriptor.state;
    try { localStorage.setItem(INSTANCE_SESSION_KEY,JSON.stringify(descriptor)); }
    catch(e){console.warn("[idle] não foi possível persistir a instância",e);return null;}
  }
  // Online: o servidor é a fonte de verdade; localStorage fica somente como
  // espelho de emergência/migração de versões anteriores.
  if(typeof accountApiConfigured==="function"&&accountApiConfigured()&&
     typeof accountSaveInstance==="function"&&typeof sessionToken==="function")
    accountSaveInstance(sessionToken(),descriptor).catch(()=>{});
  // Saves dos aliados acompanham o snapshot sem trocar o personagem ativo.
  if(participants.length>1){
    try{
      const roster=readRoster(),active=descriptor.activeCharacterId;
      for(const ent of participants){
        const id=String(ent.id||ent.p.id||"");if(!id)continue;
        ent.p.lastSeen=savedAt;roster[id]={v:1,p:ent.p};
      }
      writeRoster(roster);if(active)localStorage.setItem(ACTIVE_CHARACTER_KEY,active);
    }catch(error){console.warn("[idle] falha ao salvar party da instância",error);}
  }
  return descriptor;
}

function instanceIncludesCharacter(instance,id){
  return !!(instance&&Array.isArray(instance.members)&&
    instance.members.some((member)=>String(member&&member.id)===String(id)));
}

/* Atualiza somente quem está sendo controlado no espelho local da instância.
 * Não serializa nem recria o combate: a troca em party precisa preservar o
 * runtime compartilhado que já está em execução. */
function setActiveInstanceCharacter(id){
  const activeId=String(id||"");
  if(!activeId)return false;
  try{
    const raw=localStorage.getItem(INSTANCE_SESSION_KEY);
    if(!raw)return false;
    const session=JSON.parse(raw);
    if(!instanceIncludesCharacter(session,activeId))return false;
    session.activeCharacterId=activeId;
    localStorage.setItem(INSTANCE_SESSION_KEY,JSON.stringify(session));
    return true;
  }catch(error){
    console.warn("[idle] falha ao atualizar personagem ativo da instância",error);
    return false;
  }
}

function readInstanceSession() {
  try{
    const raw=localStorage.getItem(INSTANCE_SESSION_KEY);if(!raw)return null;
    const session=JSON.parse(raw);
    if(!session||session.v!==1||!session.savedAt||
       (session.kind!=="hunt"&&session.kind!=="boss"))return null;
    if(session.kind==="hunt"&&(!session.huntId||!GAMEDATA.hunts[session.huntId]))return null;
    return session;
  }catch(error){console.warn("[idle] sessão de instância inválida",error);return null;}
}

function restoreCombatSessionState(fresh,session){
  const raw=session.state;if(!raw)return fresh;
  const c=raw;
  c.hunt=fresh.hunt;c.huntMap=fresh.huntMap;c.boss=fresh.boss;
  // Preserva eventos do servidor (modo online). O step() do authoritative
  // engine gera eventos de dano/cura que drainEvents() processa em floaters.
  c.events=Array.isArray(c.events)?c.events:[];c.delayedHits=c.delayedHits||[];c.pendingSpawns=c.pendingSpawns||[];
  // Reserva de formação é estado transitório com chaves de objeto (Map).
  // JSON antigo a transformava em `{}`; recriá-la também limpa referências
  // para entidades anteriores ao reload.
  c._formationReservations=new Map();
  if(c.players&&c.players.length){
    c.players=c.players.map((ent)=>{
      if(ent.p)ent.p=normalizePlayer(ent.p);
      ent.id=ent.id||(ent.p&&ent.p.id);ent.name=ent.name||(ent.p&&ent.p.name);return ent;
    });
    const activeId=String(session.activeCharacterId||"");
    c.player=c.players.find((ent)=>String(ent.id)===activeId)||c.players.find((ent)=>ent.p&&ent.p.hp>0)||c.players[0];
    if(c.player&&c.player.p)G.p=c.player.p;
  }
  const findTarget=(id)=>c.players&&c.players.find((ent)=>String(ent.id)===String(id));
  const hydrateMob=(mob)=>{
    if(!mob)return mob;
    // Sempre usa o def completo do GAMEDATA local. O servidor envia um
    // def compacto (só name/race/element) para reduzir o tamanho do
    // snapshot; o cliente precisa do def completo para renderização.
    mob.def=(GAMEDATA.monsters&&GAMEDATA.monsters[mob.slug])||mob.def||{};
    if(mob.target&&mob.target.__targetId)mob.target=findTarget(mob.target.__targetId)||null;
    return mob;
  };
  c.mobs=(c.mobs||[]).map(hydrateMob);
  for(const pending of c.pendingSpawns)pending.mob=hydrateMob(pending.mob);
  if(c.greed)c.greed.randomFn=Math.random;
  if(c.hatred){c.hatred.randomFn=Math.random;delete c.hatred.renderKey;if(!c.players)c._hatredPlayer=G.p;}
  if(c.scarlett)c.scarlett.raf=0;
  if(c.spite){c.spite.randomFn=Math.random;delete c.spite.renderKey;}
  if(c.malice){c.malice.randomFn=Math.random;delete c.malice.renderKey;}
  if(c.mega){c.mega.randomFn=Math.random;delete c.mega.renderKey;}
  return c;
}

function resumeIdleInstance(session){
  return new Promise((resolve)=>{
    const activeId=String(session.activeCharacterId||"");
    const member=(session.members||[]).find((m)=>String(m.id)===activeId)||(session.members||[])[0];
    if(member&&member.p){G.p=normalizePlayer(member.p);G.p.id=member.id||G.p.id;}
    const boss=session.kind==="boss"&&typeof BOSS_DEFS!=="undefined"?BOSS_DEFS[session.bossId]:null;
    const hunt=boss?bossArenaDefinition(boss):GAMEDATA.hunts[session.huntId];
    if((session.kind==="boss"&&!boss)||(session.kind==="hunt"&&!hunt)){
      clearInstanceSession();resolve({resumed:false,ended:true});return;
    }
    G.p.hunt=session.kind==="hunt"?session.huntId:null;
    G.p.instanceMode=session.kind==="boss"?"boss":session.instanceMode;
    G.inCity=false;
    G.huntMapReady=false;
    if(typeof beginMapLoading==="function")beginMapLoading(`Retomando ${boss?boss.name:hunt.name}...`);
    let done=false,watchdog=null;
    const build=()=>{
      if(done)return;done=true;if(watchdog)clearTimeout(watchdog);
      try{
        const fresh=boss?newBossCombat(G.p,boss):newCombat(G.p,session.huntId,session.instanceMode);
        if(typeof markHuntMapReady==="function")markHuntMapReady();
        else G.huntMapReady=true;
        if(!boss&&!session.state){
          spawnWave(fresh,G.p);
          for(const pending of fresh.pendingSpawns||[])pending.startedAt=session.savedAt;
        }
        G.combat=restoreCombatSessionState(fresh,session);
        G.p.hunt=session.kind==="hunt"?session.huntId:null;
        G.p.instanceMode=session.kind==="boss"?"boss":session.instanceMode;
        // O worker já reivindicou intervalos completos sem lease. Soma o
        // pequeno residual após o último checkpoint e aplica cada período uma
        // única vez no mesmo motor de combate usado pela aba ativa.
        const workerElapsed=Math.max(0,Number(session.workerElapsedMs)||0);
        const residual=Math.max(0,Date.now()-session.savedAt);
        const elapsed=workerElapsed+residual,startAt=session.savedAt-workerElapsed;
        delete session.workerElapsedMs;delete session.workerCheckpointAt;
        // Snapshot autoritativo já foi avançado pelo mesmo núcleo no servidor.
        const result=(session.authority||G.instanceReconnectPending)?{processed:0,
          ended:!!(session.authority&&session.authority.ended),
          reason:session.authority&&session.authority.terminalReason||null}:
          advanceIdleInstance(elapsed,startAt,{silent:true});
        if(G.combat){persistActiveInstance();G.inCity=false;}
        resolve({resumed:!!G.combat,ended:result.ended,elapsed});
      }catch(error){
        console.error("[idle] falha ao retomar instância",error);clearInstanceSession();G.combat=null;G.inCity=true;
        resolve({resumed:false,ended:true,error});
      }finally{if(typeof finishMapLoading==="function")finishMapLoading();}
    };
    watchdog=setTimeout(build,7000);
    try{
      if(hunt&&hunt.otbm&&typeof huntMapFromOtbmAsync==="function")huntMapFromOtbmAsync(hunt,build);
      else setTimeout(build,0);
    }catch(error){console.warn("[idle] mapa da instância salva falhou",error);build();}
  });
}

function save() {
  if (!G.p) return false;
  try {
    G.p.stamina=FULL_STAMINA_SECONDS;
    saveCharacterToRoster(G.p);
    const activeSession=G.combat?persistActiveInstance():null;
    if(!G.combat)clearInstanceSession(G.foreignInstance?"foreign-instance":"no-combat",!!G.foreignInstance);
    // mantém compatibilidade com saves antigos de 1 personagem
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, p: G.p,
      session: activeSession||null,
    }));
    // MODO ONLINE: envia o save para a API (MySQL) do personagem da conta
    if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
        typeof accountSaveCharacter === "function") {
      const tok = sessionToken();
      // Nunca use apenas o seletor da sessão: durante uma troca ele pode já
      // apontar para o próximo card enquanto G.p ainda é o personagem atual.
      // O id do próprio save impede sobrescrever outro personagem da conta.
      const cid = G.p && G.p.id ? String(G.p.id) : sessionCharId();
      if(typeof accountCharacterCacheRead==="function"&&typeof accountCharacterCacheWrite==="function"){
        const cache=accountCharacterCacheRead();const summary=cache.find(c=>String(c.id)===String(cid));
        if(summary){summary.voc=G.p.voc;summary.level=G.p.level;summary.sex=G.p.sex;
          summary.outfit=G.p.outfit;summary.snapshot=G.p;accountCharacterCacheWrite(cache);}
      }
      // Durante combate online, /api/instance/tick já grava todos os membros
      // na mesma transação. Um autosave paralelo criaria conflito de versão.
      if(G.combat&&typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat()){
        // persistActiveInstance acima já enfileirou o checkpoint visual.
      }else if(G.combat&&G.combat.players&&G.combat.players.length>1&&
         typeof partyCombatSaveAll==="function")partyCombatSaveAll();
      else if (tok && cid) accountSaveCharacter(tok, cid, G.p).catch(() => {});
    }
    return true;
  } catch (e) {
    console.warn("falha ao salvar", e);
    return false;
  }
}

/* ---------- sessão online (token + personagem da conta) ---------- */
function sessionToken() {
  try { return sessionStorage.getItem("tibia-idle-token") || ""; } catch (e) { return ""; }
}
function sessionCharId() {
  try { return sessionStorage.getItem("tibia-idle-char") || ""; } catch (e) { return ""; }
}
function sessionAccount() {
  try {
    const raw = sessionStorage.getItem("tibia-idle-account");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function load() {
  try {
    const roster = readRoster();
    // Migração única: soma o gold de todos os personagens locais e passa a
    // carteira para a conta. Depois p.gold vira um accessor compartilhado.
    if (typeof accountLoad === "function") {
      const acc = accountLoad();
      if (!acc.goldMigrated) {
        let total = acc.gold || 0;
        for (const id of Object.keys(roster)) { const raw = roster[id] && roster[id].p; if (raw) { total += Math.max(0, Math.floor(raw.gold || 0)); raw.gold = 0; } }
        acc.gold = total; acc.goldMigrated = true; accountSave(acc); writeRoster(roster);
      }
    }
    const active = localStorage.getItem(ACTIVE_CHARACTER_KEY);
    if (active && roster[active] && roster[active].p) {
      const p = normalizePlayer(roster[active].p);
      p.id = active;
      return p;
    }
    const ids = Object.keys(roster);
    if (ids.length) {
      const id = ids[0];
      localStorage.setItem(ACTIVE_CHARACTER_KEY, id);
      const p = normalizePlayer(roster[id].p);
      p.id = id;
      return p;
    }
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.p) return null;
    const p = normalizePlayer(d.p);
    saveCharacterToRoster(p);
    return p;
  } catch (e) { return null; }
}

function normalizePlayer(p) {
  // Migracao: o quiver tinha um slot proprio inventado. No Tibia ele ocupa a
  // mao secundaria, entao saves antigos precisam mover o item para `shield`
  // e apagar o campo obsoleto, senao o personagem fica com dois quivers.
  if (p.equip && p.equip.quiver) {
    if (!p.equip.shield ||
        (GAMEDATA.items[p.equip.shield.item] || {}).t === "quiver") {
      p.equip.shield = p.equip.quiver;
    } else {
      // ja tinha escudo de verdade: o quiver volta para a mochila
      p.bag = p.bag || {};
      p.bag[p.equip.quiver.item] = (p.bag[p.equip.quiver.item] || 0) + 1;
    }
    delete p.equip.quiver;
  }
  p.config = Object.assign({
    healAt: 90,
    healSpellAt: 90,
    healItemAt: 60,
    manaAt: 50,
    healSpell: "",
    healSupply: "",
    manaSupply: "mana-potion",
    useRunes: true,
    autoRestock: false,
    manaTrain: null,
    autoConjure: null,
    attackMode: "chase",
    kiteDistance: 3,
    shooterType: "auto",
    shooterSpell: "",
    shooterRune: "",
    hasteSpell: "",           // magia de velocidade escolhida no helper (vazia = nao usa)
    missionCollapsed: false,
    noPotions: false,          // Helper: "NÃO USAR POTIONS"
    pouchAutoSell: false,     // Loot Pouch: autoseller ligado/desligado
    pouchAutoSellPct: 80,     // Loot Pouch: % de enchimento p/ vender tudo
    spellAttack: true,
    autoRetreat: true,
    autoWalk: true,
    barMode: "bars",
    lootFilter: "all",
    refillArrow: "",
    refillBolt: "",
  }, p.config || {});
  // Migracao: o "mystic-dust" verde (poeira mistica criada antes do Canary)
  // foi removido. Saves antigos convertem o que tinham na lootPouch/mochila
  // para o Dust da Exaltation Forge (p.dust), respeitando o dustLimit.
  if (p.lootPouch && p.lootPouch["mystic-dust"]) {
    p.dust = Math.min(p.dustLimit || 100, (p.dust || 0) + p.lootPouch["mystic-dust"]);
    delete p.lootPouch["mystic-dust"];
  }
  if (p.bag && p.bag["mystic-dust"]) {
    p.dust = Math.min(p.dustLimit || 100, (p.dust || 0) + p.bag["mystic-dust"]);
    delete p.bag["mystic-dust"];
  }
  p.config.autoRestock = false;
  p.config.healSpellAt = Math.max(1, Math.min(99, parseInt(p.config.healSpellAt === undefined ? p.config.healAt : p.config.healSpellAt, 10) || 90));
  p.config.healItemAt = Math.max(1, Math.min(99, parseInt(p.config.healItemAt === undefined ? p.config.healAt : p.config.healItemAt, 10) || 60));
  p.config.healAt = Math.max(p.config.healSpellAt, p.config.healItemAt);
  p.config.kiteDistance = Math.max(1, Math.min(5, parseInt(p.config.kiteDistance, 10) || 3));
  // paladino sempre tem uma munição padrão selecionada
  if (p.voc === "paladin" && !p.config.refillArrow && !p.config.refillBolt)
    p.config.refillArrow = "arrow";
  p.supplies = p.supplies || {};
  // Migracao do update 15.25.3a4a52: mana fluid foi REMOVIDO do jogo.
  // Cargas guardadas viram mana-potion (mesma faixa de restauracao) e a
  // selecao do Helper passa a apontar para ela.
  if (Object.prototype.hasOwnProperty.call(p.supplies, "mana-fluid")) {
    const q = p.supplies["mana-fluid"] || 0;
    if (q > 0) {
      p.supplies["mana-potion"] = (p.supplies["mana-potion"] || 0) + q;
    }
    delete p.supplies["mana-fluid"];
  }
  if (p.config.manaSupply === "mana-fluid") p.config.manaSupply = "mana-potion";
  if (!Object.prototype.hasOwnProperty.call(p.supplies, "mana-potion")) p.supplies["mana-potion"] = 0;
  if (p.config.manaSupply === undefined) p.config.manaSupply = "mana-potion";
  // Saves antigos que selecionaram algo que deixou de existir nao podem
  // quebrar o motor de cura/mana.
  if (p.config.manaSupply && typeof SUPPLIES !== "undefined" && !SUPPLIES[p.config.manaSupply])
    p.config.manaSupply = "";
  if (p.config.healSupply && typeof SUPPLIES !== "undefined" && !SUPPLIES[p.config.healSupply])
    p.config.healSupply = "";
  if (p.config.manaSupply && typeof supplyAllowed === "function" && !supplyAllowed(p, p.config.manaSupply)) {
    const manaOrder = ["distilled-ultimate-mana-potion", "ultimate-mana-potion",
      "distilled-superior-mana-potion", "superior-mana-potion",
      "great-mana-potion", "strong-mana-potion", "mana-potion"];
    p.config.manaSupply = manaOrder.find((slug) => supplyAllowed(p, slug)) || "mana-potion";
  }
  // Garante chave de supply para a potion selecionada (CARGAS 0 + auto-buy).
  if (p.config.manaSupply && !Object.prototype.hasOwnProperty.call(p.supplies, p.config.manaSupply))
    p.supplies[p.config.manaSupply] = 0;
  if (p.config.healSupply && !Object.prototype.hasOwnProperty.call(p.supplies, p.config.healSupply))
    p.supplies[p.config.healSupply] = 0;
  if (p.config.autoWalk === undefined) p.config.autoWalk = true;
  p.bag = p.bag || {};
  p.bagSlots = p.bagSlots || 8;
  p.itemInstances = Array.isArray(p.itemInstances) ? p.itemInstances : [];
  p.lootPouch = p.lootPouch || {};
  p.supplyStash = p.supplyStash || {};
  if (!p.config.autoSupplyStash || typeof p.config.autoSupplyStash !== "object") {
    p.config.autoSupplyStash = {};
  }
  p.lootConfig = p.lootConfig || { noCollect: [], noSell: [] };
  p.lootConfig.noCollect = p.lootConfig.noCollect || [];
  p.lootConfig.noSell = p.lootConfig.noSell || [];
  p.equip = p.equip || {};
  if (!p.equip.backpack) p.equip.backpack = { item: "bag", count: 1 };
  p.gold = Math.max(0, Math.floor(p.gold || 0));
  if (typeof bindAccountGold === "function") bindAccountGold(p);
  p.bank = p.bank || 0;
  p.promoted = !!p.promoted;
  p.promotedAt = p.promotedAt || null;
  p.missions = p.missions || {};
  p.bosses = p.bosses || {};
  p.instanceMode = p.instanceMode || null;
  // Stamina temporariamente desativada: todo personagem permanece em 42h.
  p.stamina = 42 * 3600;
  // ultima instancia escolhida no modal da hunt (pre-selecao de UI)
  p.lastInstanceChoice = p.lastInstanceChoice || null;
  p.ammo = p.ammo || {};
  p.upgrades = p.upgrades || {};
  p.imbuements = p.imbuements || {};
  p.dummies = p.dummies || {};
  p.conditions = p.conditions || {};
  p.buffs = p.buffs || {};
  if (typeof ensureItemInstances === "function") ensureItemInstances(p);
  if (typeof ensurePrey === "function") ensurePrey(p);
  if (typeof ensureParty === "function") ensureParty(p);
  // Stances do update 15.25.3a4a52: posturas permanentes salvas junto ao
  // personagem (persistem apos logout, como no oficial).
  p.stances = p.stances || {};
  // Migracao: antes do 15.25 o Protector (utamo-tempo) era um BUFF
  // relancado pelo Helper. Vira stance ativa no save antigo.
  if (p.config.buff === "utamo-tempo") {
    p.stances["utamo-tempo"] = true;
    p.config.buff = null;
  }
  // Migracao: a Sharpshooter antiga (utito tempo san) foi SUBSTITUIDA
  // pela stance utori con. Se o jogador a usava como magia de suporte
  // recorrente, a stance equivalente ja nasce ligada.
  const mencionavaSharpshooter =
    p.config.buff === "utito-tempo-san" ||
    p.config.shooterSpell === "utito-tempo-san" ||
    (Array.isArray(p.config.attackSpells) &&
     p.config.attackSpells.indexOf("utito-tempo-san") !== -1) ||
    (Array.isArray(p.config.combo) && p.config.combo.some(
      (x) => x && x.kind === "spell" && x.id === "utito-tempo-san"));
  if (p.config.buff === "utito-tempo-san") p.config.buff = null;
  if (p.config.shooterSpell === "utito-tempo-san") p.config.shooterSpell = "";
  if (mencionavaSharpshooter && p.voc === "paladin" && p.level >= 20) {
    p.stances["utori-con"] = true;
  }
  // Magias removidas/substituidas pelo update saem das listas ofensivas
  // (combo e selecao antiga do Helper), senao o motor tenta lancar
  // fantasma. Stances nunca devem figurar como magia de rotacao.
  const REMOVIDAS_1525 = {
    "utito-tempo-san": 1,   // virou stance utori con
    "uteta-tio": 1,         // Mentor Other removida pelo update
  };
  if (Array.isArray(p.config.attackSpells)) {
    p.config.attackSpells = p.config.attackSpells.filter(
      (id) => !REMOVIDAS_1525[id] &&
              !(typeof SPELLS !== "undefined" && SPELLS[id] && SPELLS[id].stance));
  }
  if (Array.isArray(p.config.combo)) {
    for (let i = 0; i < p.config.combo.length; i++) {
      const slot = p.config.combo[i];
      if (slot && slot.kind === "spell" &&
          (REMOVIDAS_1525[slot.id] ||
           (typeof SPELLS !== "undefined" && SPELLS[slot.id] && SPELLS[slot.id].stance))) {
        p.config.combo[i] = null;
      }
    }
  }
  // Monk: harmonia acumulada e santuarios da quest "The Way of the Monk".
  // Saves feitos antes do sistema de Mantra nao tem esses campos.
  // barra de combo: cria a estrutura e migra a config antiga do shooter
  if (typeof ensureCombo === "function") ensureCombo(p);
  if (typeof migrateComboFromShooter === "function") migrateComboFromShooter(p);
  if (typeof CanaryVocation !== "undefined" && CanaryVocation.sanitizePlayerSpells
      && typeof SPELLS !== "undefined") {
    CanaryVocation.sanitizePlayerSpells(p, SPELLS);
  }
  // helper de rings/amulets e Magic Shield (saves antigos nascem desligados)
  if (typeof ensureAccessoryConfig === "function") ensureAccessoryConfig(p);
  if (typeof ensureCyclopedia === "function") ensureCyclopedia(p);
  p.harmony = Math.max(0, Math.min(5, p.harmony || 0));
  p.monkShrines = Math.max(0, Math.min(3, p.monkShrines || 0));
  if (!p.config.dummy) p.config.dummy = "exercise";
  migrateAmmoToCounter(p);   // saves antigos guardavam munição na bag
  if (typeof ensurePlayerCapacity === "function") ensurePlayerCapacity(p);
  ensureOutfit(p);
  return p;
}

function wipeSave() {
  // remove o personagem atual do roster, não só o save legado
  const id = G.p ? characterId(G.p) : localStorage.getItem(ACTIVE_CHARACTER_KEY);
  if (id) {
    const roster = readRoster();
    delete roster[id];
    writeRoster(roster);
    const rest = Object.keys(roster);
    if (rest.length) localStorage.setItem(ACTIVE_CHARACTER_KEY, rest[0]);
    else localStorage.removeItem(ACTIVE_CHARACTER_KEY);
  }
  localStorage.removeItem(SAVE_KEY);
  clearInstanceSession("character-reset",!!G.foreignInstance);
  try { sessionStorage.removeItem(AUTOLOGIN_KEY); } catch (e) {}
  location.reload();
}

/* ------------------------------------------------------------ offline */
/* Simula o tempo que o jogador ficou fora, de forma resumida e conservadora */
function computeOffline(p) {
  const now = Date.now();
  const elapsed = Math.max(0, now - (p.lastSeen || now));
  const MAX_OFFLINE = 12 * 3600 * 1000;         // teto de 12h
  const eff = Math.min(elapsed, MAX_OFFLINE);
  if (!p.hunt || eff < 60000) return null;      // menos de 1 min: ignora

  const hunt = GAMEDATA.hunts[p.hunt];
  if (!hunt) return null;

  const est = huntEstimate(p, hunt);
  const risk = huntRisk(p, hunt);
  // eficiencia offline: 60% do rendimento online, pior se a hunt for perigosa
  let effRate = 0.6;
  if (risk.cls === "mid") effRate = 0.45;
  if (risk.cls === "high") effRate = 0.25;

  // Stamina está temporariamente desativada e permanece sempre em 42h.
  const staminaSec = eff / 1000;
  p.stamina = FULL_STAMINA_SECONDS;
  const hours = staminaSec / 3600;
  if (hours <= 0) return null;

  const modeMul = p.instanceMode === "pvp" ? 1.25 : 1;
  const kills = Math.floor(est.kills * hours * effRate);
  let exp = Math.floor(est.exp * hours * effRate * modeMul);
  if (typeof loyaltyExpMultiplier === "function") {
    const loyaltyMul = loyaltyExpMultiplier(p);
    if (loyaltyMul > 1) exp = Math.floor(exp * loyaltyMul);
  }
  let gold = Math.floor(est.gold * hours * effRate * modeMul);

  // supplies/ammo offline usam o mesmo modelo de cargas do combate online:
  // cargas existentes são consumidas; se uma carga selecionada está 0, compra
  // a próxima diretamente do gold balance.
  let supplyCost = 0;
  const usedSupplies = {};

  // loot em itens
  const loot = {};
  const mobs = hunt.monsters;
  for (let i = 0; i < kills; i++) {
    const m = GAMEDATA.monsters[mobs[i % mobs.length]];
    if (!m) continue;
    for (const l of m.loot) {
      if (Math.random() * 100 > l.chance) continue;
      if (l.item === "gold-coin") continue;   // ja contabilizado
      if (isNoCollect(p, l.item)) continue;
      const cnt = typeof lootStackCount === "function" ? lootStackCount(l) :
        (l.max > 1 ? 1 + Math.floor(Math.random() * l.max) : 1);
      loot[l.item] = (loot[l.item] || 0) + cnt;
    }
    if (i > 4000) break;   // limite de simulacao
  }

  // aplica
  const beforeLevel = p.level;
  addExp(p, exp);
  p.gold += gold;
  p.stamina = FULL_STAMINA_SECONDS;
  p.totalKills += kills;
  p.playtime += staminaSec * 1000;

  const offlineStats = { supplyUsed: usedSupplies, supplyCost: 0, supplyBought: {} };
  const offlineCombat = { stats: offlineStats, events: [] };
  let runeUse = Math.min(4000, Math.floor(kills * 0.35));
  const supplySlugs = Object.keys(p.supplies || {}).filter((slug) => {
    const s = SUPPLIES[slug];
    return s && (s.type === "heal" || s.type === "attack" || s.type === "mana");
  });
  for (let i = 0; i < runeUse && supplySlugs.length; i++) {
    const slug = supplySlugs[i % supplySlugs.length];
    if (!consumeSupplyCharge(offlineCombat, p, slug)) break;
  }

  // skills: ganha tries proporcional aos golpes
  const swings = Math.floor(kills * Math.max(1, est.ttk / 2));
  const sk = weaponSkill(p);
  if (sk === "dist") {
    const ammoUse = Math.min(4000, Math.floor(swings * 0.6));
    for (let i = 0; i < ammoUse; i++) {
      if (!consumeAmmoCharge(offlineCombat, p)) break;
    }
  }
  const skillMul = p.instanceMode === "pvp" ? 1.25 : 1;
  if (sk !== "magic") addSkillTries(p, sk, Math.floor(swings * 0.6 * skillMul));
  addSkillTries(p, "shield", Math.floor(swings * 0.5 * skillMul));
  if (VOCATIONS[p.voc].weapon === "magic")
    addManaSpent(p, Math.floor(kills * 40 * skillMul));

  // loot vai para supplies, loot pouch ou municao — TODO item (equipamento
  // incluso) cai na pouch, regra da casa. Moedas (platinum/crystal) são
  // convertidas direto em gold.
  for (const slug in loot) {
    if (currencyValue(slug)) gold += creditCurrency(p, slug, loot[slug]);
    else if (SUPPLIES[slug]) p.supplies[slug] = (p.supplies[slug] || 0) + loot[slug];
    else if (GAMEDATA.items[slug] && GAMEDATA.items[slug].s === "ammo") addAmmo(p, slug, loot[slug]);
    else if (typeof routeLootItem === "function") routeLootItem(p, slug, loot[slug]);
    else if (shouldGoLootPouch(slug)) addLootPouch(p, slug, loot[slug]);
    else if (!addItem(p, slug, loot[slug])) delete loot[slug];
  }
  supplyCost = offlineStats.supplyCost;

  return {
    time: staminaSec * 1000, kills: kills, exp: exp, gold: gold,
    levels: p.level - beforeLevel, loot: loot, supplies: usedSupplies,
    supplyCost: supplyCost, hunt: hunt.name, rate: effRate,
    capped: elapsed > MAX_OFFLINE,
  };
}

function showOfflineModal(r) {
  const lootRows = Object.keys(r.loot)
    .sort((a, b) => (GAMEDATA.items[b] ? GAMEDATA.items[b].sell || 0 : 0) -
                    (GAMEDATA.items[a] ? GAMEDATA.items[a].sell || 0 : 0))
    .slice(0, 24)
    .map((s) => `<div class="inv-item ${itemClsBorder(s)}" title="${itemName(s)}">
        ${itemImg(s, 0, null, r.loot[s])}<span class="cnt">${r.loot[s]}</span></div>`).join("");
  const supRows = Object.keys(r.supplies).map((s) =>
    `<div class="stat-row"><span class="k">${SUPPLIES[s] ? SUPPLIES[s].name : itemName(s)}</span>
     <span class="v">-${r.supplies[s]}</span></div>`).join("");

  $("#modal-body").innerHTML = `
    <div class="panel-title">Bem-vindo de volta!</div>
    <div class="panel-body">
      <p class="small mb8">Você caçou em <b style="color:#d4af37">${r.hunt}</b>
      por <b>${fmtTime(r.time / 1000)}</b>${r.capped ? ' <span class="dim">(limite de 12h)</span>' : ""}.</p>
      <div class="panel-inset" style="padding:8px" class="mb8">
        <div class="stat-row"><span class="k">Monstros mortos</span><span class="v">${fmtFull(r.kills)}</span></div>
        <div class="stat-row"><span class="k">Experiência</span><span class="v" style="color:#9ce84a">+${fmtFull(r.exp)}</span></div>
        ${r.levels > 0 ? `<div class="stat-row"><span class="k">Níveis ganhos</span><span class="v" style="color:#ffe680">+${r.levels}</span></div>` : ""}
        <div class="stat-row"><span class="k">Ouro coletado</span><span class="v gold-txt">+${fmtFull(r.gold)}</span></div>
        ${r.supplyCost ? `<div class="stat-row"><span class="k">Gasto em supplies</span><span class="v" style="color:#e08080">-${fmtFull(r.supplyCost)}</span></div>` : ""}
        <div class="stat-row"><span class="k">Rendimento offline</span><span class="v">${Math.round(r.rate * 100)}%</span></div>
      </div>
      ${supRows ? `<div class="small dim mt8 mb4">Supplies consumidos</div>${supRows}` : ""}
      ${lootRows ? `<div class="small dim mt8 mb4">Loot recolhido</div>
        <div class="inv-grid">${lootRows}</div>` : ""}
      <button class="primary full mt12" id="modal-ok">Continuar caçando</button>
    </div>`;
  $("#modal").classList.add("show");
  $("#modal-ok").addEventListener("click", () => {
    $("#modal").classList.remove("show");
  });
}

/* ------------------------------------------------------------ missions */
const MISSION_DEFS = {
  rats: {
    title: "Missão: Esgoto de Rookgaard",
    tasks: [
      { monster: "rat", target: 25, reward: { items: [{ slug: "rapier", count: 1 }] } },
      { monster: "cave-rat", target: 25, reward: { items: [{ slug: "leather-boots", count: 1 }] } },
      { monster: "bug", target: 25, reward: { items: [{ slug: "leather-armor", count: 1 }] } },
    ],
    completeReward: { supplies: [{ slug: "health-potion", count: 10 }], gold: 500 },
  },
  // Missão da Timira the Many-Headed: matar 25 Naga Archer, 25 Naga Warrior
  // e 25 Makara no mapa das Nagas. Completar a missão LIBERA o cooldown do
  // boss (bossState("timira-the-many-headed").lastFight = 0) — para matá-la
  // de novo é preciso refazer a missão (o kill do boss zera o progresso).
  "marapur-nagas": {
    title: "Missão: Timira the Many-Headed",
    tasks: [
      { monster: "naga-archer", target: 25, reward: { supplies: [{ slug: "strong-health-potion", count: 5 }] } },
      { monster: "naga-warrior", target: 25, reward: { supplies: [{ slug: "strong-mana-potion", count: 5 }] } },
      { monster: "makara", target: 25, reward: { supplies: [{ slug: "ultimate-health-potion", count: 2 }] } },
    ],
    completeReward: { gold: 5000, items: [{ slug: "small-diamond", count: 2 }] },
  },
  "dark-thais": {
    title: "Missão: Mirrored Nightmare",
    tasks: [
      { monster:"many-faces", target:25, reward:{ supplies:[{slug:"ultimate-health-potion",count:3}] } },
      { monster:"knight-s-apparition", target:25, reward:{ supplies:[{slug:"ultimate-health-potion",count:3}] } },
      { monster:"paladin-s-apparition", target:25, reward:{ supplies:[{slug:"ultimate-spirit-potion",count:3}] } },
      { monster:"sorcerer-s-apparition", target:25, reward:{ supplies:[{slug:"ultimate-mana-potion",count:3}] } },
      { monster:"druid-s-apparition", target:25, reward:{ supplies:[{slug:"ultimate-mana-potion",count:3}] } },
      { monster:"monk-s-apparition", target:25, reward:{ supplies:[{slug:"ultimate-spirit-potion",count:3}] } },
      { monster:"distorted-phantom", target:25, reward:{ supplies:[{slug:"ultimate-spirit-potion",count:3}] } },
    ],
    // A recompensa é permanente: concluir Mirrored Nightmare libera a porta
    // da bossroom de Goshnar's Greed.
    completeReward: { bossAccess:"goshnar-s-greed", bossName:"Goshnar's Greed" },
  },
  "rotten-wasteland": {
    title: "Missão: Goshnar's Hatred",
    tasks: [
      { monster:"rotten-golem", target:50,
        reward:{ supplies:[{slug:"ultimate-health-potion",count:5}] } },
    ],
    completeReward:{bossAccess:"goshnar-s-hatred",bossName:"Goshnar's Hatred"},
  },
};

function missionForHunt(id) {
  if (MISSION_DEFS[id]) return MISSION_DEFS[id];
  const hu = GAMEDATA.hunts[id];
  if (!hu) return null;
  const seen = new Set();
  const tasks = hu.monsters.filter((m) => !seen.has(m) && seen.add(m))
    .map((m) => ({ monster: m, target: 25, reward: { supplies: [{ slug: "health-potion", count: 2 }] } }));
  return {
    title: "Missão: " + hu.name,
    tasks: tasks,
    completeReward: { supplies: [{ slug: "health-potion", count: 10 }], gold: 500 },
  };
}

function mergeMissionMaps(remote, local) {
  const out = Object.assign({}, remote && typeof remote === "object" ? remote : {});
  const src = local && typeof local === "object" ? local : {};
  for (const huntId of Object.keys(src)) {
    const a = out[huntId] && typeof out[huntId] === "object" ? out[huntId] : { progress: {}, claimed: {}, completeClaimed: false };
    const b = src[huntId] && typeof src[huntId] === "object" ? src[huntId] : {};
    const progress = Object.assign({}, a.progress || {});
    for (const k of Object.keys(b.progress || {}))
      progress[k] = Math.max(Number(progress[k]) || 0, Number(b.progress[k]) || 0);
    out[huntId] = {
      progress,
      claimed: Object.assign({}, a.claimed || {}, b.claimed || {}),
      completeClaimed: !!(a.completeClaimed || b.completeClaimed),
    };
  }
  return out;
}

function missionState(p, huntId) {
  p.missions = p.missions || {};
  // Modo online: missões são por conta. Sincroniza do account data para o
  // personagem antes de acessar, assim qualquer char vê o mesmo progresso.
  if (typeof accountApiConfigured === "function" && accountApiConfigured()) {
    const acc = sessionAccount();
    if (acc && acc.missions) {
      if (!p.missions[huntId] && acc.missions[huntId])
        p.missions[huntId] = acc.missions[huntId];
    }
    if (acc && acc.missionsDone) {
      p.missionsDone = p.missionsDone || {};
      for (const k of Object.keys(acc.missionsDone)) p.missionsDone[k] = acc.missionsDone[k];
    }
  }
  if (!p.missions[huntId])
    p.missions[huntId] = { progress: {}, claimed: {}, completeClaimed: false };
  return p.missions[huntId];
}

/* Sincroniza o progresso de missões do personagem para a conta (online).
 * Chamada após handleMissionKill e tryCompleteMissionRewards. */
function syncMissionsToAccount(p) {
  if (typeof accountApiConfigured === "function" && accountApiConfigured()) {
    const acc = sessionAccount();
    if (!acc) return;
    acc.missions = p.missions || {};
    acc.missionsDone = p.missionsDone || {};
    try { sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc)); } catch (e) {}
    const token = sessionToken();
    if (token && typeof accountUpdateMissions === "function")
      accountUpdateMissions(token, p.missions, p.missionsDone).catch(() => {});
  }
}

function rewardText(reward) {
  if (!reward) return "—";
  const out = [];
  if (reward.gold) out.push(fmtFull(reward.gold) + " gp");
  (reward.items || []).forEach((r) => out.push((r.count || 1) + "x " + itemName(r.slug)));
  (reward.supplies || []).forEach((r) => out.push((r.count || 1) + " carga(s) " + (SUPPLIES[r.slug] ? SUPPLIES[r.slug].name : itemName(r.slug))));
  if (reward.bossAccess)
    out.push("Acesso ao boss " + (reward.bossName || reward.bossAccess));
  return out.join(" · ") || "—";
}

function grantMissionReward(p, reward) {
  if (!reward) return true;
  // recompensas (equipamento incluso) caem na loot pouch, regra da casa:
  // ela nao tem limite, entao nao existe mais "mochila cheia" em missao.
  for (const r of reward.items || []) {
    addLootPouch(p, r.slug, r.count || 1);
  }
  for (const r of reward.supplies || [])
    p.supplies[r.slug] = (p.supplies[r.slug] || 0) + (r.count || 1);
  if (reward.gold) p.gold += reward.gold;
  if (reward.bossAccess) {
    p.bossAccess = p.bossAccess || {};
    p.bossAccess[reward.bossAccess] = true;
  }
  return true;
}

function tryCompleteMissionRewards(p, huntId) {
  const def = missionForHunt(huntId);
  if (!def) return;
  const st = missionState(p, huntId);
  for (const task of def.tasks) {
    if ((st.progress[task.monster] || 0) >= task.target && !st.claimed[task.monster]) {
      grantMissionReward(p, task.reward);
      st.claimed[task.monster] = true;
      addLog("level", `Missão: matou ${task.target}x <b>${GAMEDATA.monsters[task.monster] ? GAMEDATA.monsters[task.monster].name : task.monster}</b>. Recompensa: ${rewardText(task.reward)}.`);
      toast(`Missão concluída: <b>${rewardText(task.reward)}</b>`, "level");
    }
  }
  const all = def.tasks.every((t) => st.claimed[t.monster]);
  if (all && !st.completeClaimed) {
    grantMissionReward(p, def.completeReward);
    st.completeClaimed = true;
    addLog("level", `Missão de <b>${GAMEDATA.hunts[huntId].name}</b> completa. Recompensa final: ${rewardText(def.completeReward)}.`);
    toast(`Missão completa! <b>${rewardText(def.completeReward)}</b>`, "level");
  }
  // Timira: completar a missão das Nagas LIBERA o cooldown do boss — pode
  // matá-la de novo sem esperar as 16h (a missão precisa ser refeita, pois
  // o kill do boss zera o progresso — ver startBoss).
  if (BOSS_REQUIREMENTS_ENABLED && huntId === "marapur-nagas" && all) {
    const tim = bossState(p, "timira-the-many-headed");
    if (tim.lastFight) {
      tim.lastFight = 0;
      addLog("level", "Timira the Many-Headed liberada! O cooldown foi zerado pela missão completa.");
      toast("Timira liberada! Missão completa zerou o cooldown.", "level");
    }
  }
}

function handleMissionKill(p, huntId, monster) {
  const def = missionForHunt(huntId);
  if (!def || !def.tasks.some((t) => t.monster === monster)) return;
  p.missionsDone = p.missionsDone || {};
  if (p.missionsDone[huntId]) return;
  const st = missionState(p, huntId);
  if (st.completeClaimed) return;
  const task = def.tasks.find((t) => t.monster === monster);
  if (st.claimed && st.claimed[task.monster] && (st.progress[monster] || 0) >= task.target) {
    tryCompleteMissionRewards(p, huntId);
    syncMissionsToAccount(p);
    if (typeof requestAnimationFrame === "function") {
      if (!G._missionRenderQueued) {
        G._missionRenderQueued = true;
        requestAnimationFrame(() => {
          G._missionRenderQueued = false;
          renderMission();
        });
      }
    } else renderMission();
    return;
  }
  st.progress[monster] = Math.min(task.target, (st.progress[monster] || 0) + 1);
  tryCompleteMissionRewards(p, huntId);
  syncMissionsToAccount(p);
  // innerHTML da missão no mesmo frame do kill (e do wave-clear) causa hitch;
  // redesenha no próximo frame.
  if (typeof requestAnimationFrame === "function") {
    if (!G._missionRenderQueued) {
      G._missionRenderQueued = true;
      requestAnimationFrame(() => {
        G._missionRenderQueued = false;
        renderMission();
      });
    }
  } else renderMission();
}

function renderMission() {
  const box = $("#mission-box");
  if (!box || !G.p || !G.combat || G.training || G.combat.boss) {
    if (box) box.style.display = "none";
    return;
  }
  const huntId = G.combat.huntId;
  const def = missionForHunt(huntId);
  if (!def) { box.style.display = "none"; return; }
  // missão já finalizada: some de vez da tela
  G.p.missionsDone = G.p.missionsDone || {};
  if (G.p.missionsDone[huntId]) { box.style.display = "none"; return; }
  const st = missionState(G.p, huntId);
  const collapsed = !!G.p.config.missionCollapsed;
  const totalDone = def.tasks.filter((t) => (st.progress[t.monster] || 0) >= t.target).length;
  const completa = totalDone >= def.tasks.length;
  box.style.display = "block";
  // colapsada: só o cabeçalho fica visível — a classe remove o fundo preto
  // que ficava cobrindo o jogo atrás do painel
  box.classList.toggle("collapsed", collapsed);
  box.innerHTML = `
    <div class="mission-head" id="mission-toggle">
      <span>${collapsed ? "▸" : "▾"}</span><span>${def.title}</span>
      <span class="spacer"></span><span>${totalDone}/${def.tasks.length}</span>
      ${completa ? `<button class="sm primary" id="mission-finish" title="Encerrar a missão e remover do painel">FINALIZAR</button>` : ""}
    </div>
    ${collapsed ? "" : `<div class="mission-body">
      ${def.tasks.map((t) => {
        const cur = Math.min(t.target, st.progress[t.monster] || 0);
        const done = cur >= t.target;
        const pct = (cur / t.target) * 100;
        const name = GAMEDATA.monsters[t.monster] ? GAMEDATA.monsters[t.monster].name : t.monster;
        return `<div class="mission-row ${done ? "done" : ""}">
          <div style="flex:1"><b>${name}</b><div class="mission-progressbar"><div style="width:${pct}%"></div></div></div>
          <span>${cur}/${t.target}</span>
        </div>`;
      }).join("")}
      <div class="mission-reward">Final: ${rewardText(def.completeReward)}</div>
      ${completa ? `<div class="mission-reward" style="color:#9ce84a;margin-top:6px">✅ Missão completa! Clique em FINALIZAR para removê-la do painel.</div>` : ""}
    </div>`}`;
  // Delegação de eventos no CONTAINER (uma vez só): o clique continua
  // funcionando mesmo quando renderAll() re-renderiza o conteúdo durante
  // a caçada (cada kill recria o HTML interno — antes o listener morria
  // junto e o minimizar parava de responder).
  if (!box._missionBound) {
    box._missionBound = true;
    box.addEventListener("click", (e) => {
      // FINALIZAR vem ANTES do toggle: o botão fica dentro do cabeçalho
      // (que é o #mission-toggle), então a checagem precisa ser primeiro
      if (e.target.closest && e.target.closest("#mission-finish")) {
        G.p.missionsDone = G.p.missionsDone || {};
        G.p.missionsDone[huntId] = true;
        syncMissionsToAccount(G.p);
        addLog("info", `Missão <b>${def.title}</b> finalizada.`);
        renderMission();
      } else if (e.target.closest && e.target.closest("#mission-toggle")) {
        G.p.config.missionCollapsed = !G.p.config.missionCollapsed;
        renderMission();
      }
    });
  }
}

function isMissionComplete(p, huntId) {
  const def = missionForHunt(huntId);
  if (!def) return false;
  const st = missionState(p, huntId);
  return def.tasks.every((t) => (st.progress[t.monster] || 0) >= t.target);
}

/* ------------------------------------------------------------ bosses */
// Temporariamente todos os bosses ficam livres: sem requisitos e sem cooldown.
// Os dados originais continuam nas definições para serem reativados depois.
const BOSS_REQUIREMENTS_ENABLED = false;
const BOSS_COOLDOWNS_ENABLED = false;
// TEMP TEST: remove before release — libera taints/requisitos do Megalomania.
const MEGA_TEST_BYPASS = true;
const BOSS_COOLDOWN = 0;
const BOSS_DEFS = {
  "the-monster": {
    id: "the-monster",
    name: "The Monster",
    title: "Boss dos Rats",
    hunt: "rats",
    baseMonster: "cave-rat",
    sprite: "cave-rat",
    mult: 10,
    requirement: { mission: "rats", text: "Completar tasks do Bueiro de Rookgaard" },
    cooldown: BOSS_COOLDOWN,
    loot: [
      { item: "platinum-coin", chance: 10, max: 5 },
      { item: "chain-armor", chance: 10, max: 1 },
      { item: "legion-helmet", chance: 10, max: 1 },
      { item: "studded-legs", chance: 10, max: 1 },
      { item: "copper-shield", chance: 10, max: 1 },
      { item: "mace", chance: 10, max: 1 },
      { item: "katana", chance: 10, max: 1 },
      { item: "leather-boots", chance: 10, max: 1 },
      // quiver de boss: nao existe na loja, so cai aqui
      { item: "jungle-quiver", chance: 4, max: 1 },
    ],
  },
  "goshnar-s-greed": {
    id:"goshnar-s-greed", name:"Goshnar's Greed",
    title:"Boss de Mirrored Nightmare", hunt:"goshnars-greed-room",
    baseMonster:"goshnar-s-greed", sprite:"goshnar-s-greed",
    hp:300000, exp:150000, damage:5000, armor:160, defense:160,
    cooldown:BOSS_COOLDOWN,
    requirement:{
      level:550, mission:"dark-thais", access:"goshnar-s-greed", enforced:false,
      text:"Complete a missão Mirrored Nightmare para acessar Goshnar's Greed",
    },
    mechanic:"greedbeast-vulnerability",
  },
  "goshnar-s-hatred": {
    id:"goshnar-s-hatred",name:"Goshnar's Hatred",
    title:"Boss de Rotten Wasteland",hunt:"goshnars-hatred-room",
    baseMonster:"goshnar-s-hatred",sprite:"goshnar-s-hatred",
    hp:300000,exp:75000,damage:5000,armor:160,defense:160,
    cooldown:0,
    requirement:{
      mission:"rotten-wasteland",access:"goshnar-s-hatred",enforced:false,
      text:"Elimine 50 Rotten Golems em Rotten Wasteland para liberar Goshnar's Hatred",
    },
    mechanic:"dreads-torment",
  },
  "goshnar-s-spite": {
    id:"goshnar-s-spite",name:"Goshnar's Spite",
    title:"Boss de Ebb and Flow",hunt:"goshnars-spite-room",
    baseMonster:"goshnar-s-spite",sprite:"goshnar-s-spite",
    hp:300000,exp:75000,damage:5000,armor:160,defense:160,
    cooldown:0,
    requirement:{
      level:400,enforced:false,
      text:"Boss de Ebb and Flow (cooldown desligado para testes)",
    },
    mechanic:"searing-fire-bubble-qte",
  },
  "goshnar-s-malice": {
    id:"goshnar-s-malice",name:"Goshnar's Malice",
    title:"Boss Soul War — Malice",hunt:"goshnars-malice-room",
    baseMonster:"goshnar-s-malice",sprite:"goshnar-s-malice",
    hp:300000,exp:75000,damage:5000,armor:160,defense:160,
    cooldown:0,
    requirement:{
      level:400,enforced:false,
      text:"Boss de Soul War Malice (cooldown desligado para testes)",
    },
    mechanic:"maze-qte-curse",
  },
  "goshnar-s-megalomania": {
    id:"goshnar-s-megalomania",name:"Goshnar's Megalomania",
    title:"Boss final Soul War",hunt:"goshnars-megalomania-room",
    baseMonster:"goshnar-s-megalomania-green",
    sprite:"goshnar-s-megalomania-purple",
    hp:620000,exp:3000000,damage:2500,armor:55,defense:55,
    cooldown:0,
    requirement:{
      // TEMP TEST: remove before release — enforced fica off com MEGA_TEST_BYPASS.
      allSoulWarTaints:true,enforced:!MEGA_TEST_BYPASS,
      text:"Requer as 5 máculas Soul War ativas (Malice, Spite, Greed, Hatred e Cruelty)",
    },
    mechanic:"aspect-phase-white-tiles",
  },
  // Ferumbras Mortal Shell — boss da Ferumbras Ascendant (Canary 15.x):
  // 300.000 HP, 2.000.000 exp, invoca 3 Demons, resist 65% em quase tudo
  // (menos físico/drown), loot oficial do boss (ids traduzidos do items.xml).
  // Timira the Many-Headed — boss das Nagas (Canary 15.x): 75.000 HP,
  // 45.500 exp, mitigação 2.07, resist 10% em energy/fire/ice/death.
  // Requisito: missão do mapa das Nagas (25 naga archer + 25 naga warrior +
  // 25 makara). Ao completar a missão o cooldown de 16h é ZERADO; ao matá-la
  // a missão volta a zero (precisa refazer para liberar de novo).
  "timira-the-many-headed": {
    id: "timira-the-many-headed",
    name: "Timira the Many-Headed",
    title: "Boss das Nagas (Marapur)",
    hunt: "timira-room",
    baseMonster: "timira-the-many-headed",
    sprite: "timira-the-many-headed",
    hp: 75000,
    exp: 45500,
    damage: 600,
    armor: 82,
    defense: 60,
    speed: 0.00007,
    requirement: {
      mission: "marapur-nagas",
      text: "Matar 25 Naga Archer, 25 Naga Warrior e 25 Makara no mapa das Nagas",
    },
    cooldown: BOSS_COOLDOWN,
    // loot: usa o do canary (merge do monsterdata na baseMonster)
  },
  "ferumbras-mortal-shell": {
    id: "ferumbras-mortal-shell",
    name: "Ferumbras Mortal Shell",
    title: "Boss da Ferumbras Ascendant",
    hunt: "dt-seal",
    baseMonster: "ferumbras-mortal-shell",
    // looktype 229 do Canary = a forma do Ferumbras (não é um demon):
    // sprite própria extraída do DAT 15.x (assets/mob/ferumbras-mortal-shell.png)
    sprite: "ferumbras-mortal-shell",
    // stats DIRETOS do canary (newBossCombat usa hp/exp quando presentes)
    hp: 300000,
    exp: 2000000,
    damage: 500,
    armor: 100,
    defense: 120,
    speed: 0.00009,
    requirement: { level: 250, text: "Requer nível 250+ (Ferumbras Ascendant)" },
    cooldown: BOSS_COOLDOWN,
    // loot integral: usa as 57 entradas importadas do MONSTERDATA do servidor.
  },
};

/* Boss rooms Soul War são rotas imutáveis. Não reutilize `p.hunt`, mapa da
 * missão anterior ou aliases de cache: cada boss sempre resolve seu próprio
 * hunt id + OTBM dedicado. */
const SOULWAR_BOSS_ROOMS={
  "goshnar-s-greed":{hunt:"goshnars-greed-room",otbm:"goshnars_greed_room"},
  "goshnar-s-hatred":{hunt:"goshnars-hatred-room",otbm:"goshnars_hatred_room"},
  "goshnar-s-spite":{hunt:"goshnars-spite-room",otbm:"goshnars_spite_room"},
  "goshnar-s-malice":{hunt:"goshnars-malice-room",otbm:"goshars_malice_room"},
  "goshnar-s-megalomania":{hunt:"goshnars-megalomania-room",otbm:"goshnars_megalomania"},
};
function bossArenaDefinition(boss){
  if(!boss)return null;const route=SOULWAR_BOSS_ROOMS[boss.id];
  if(route){
    boss.hunt=route.hunt;
    const arena=GAMEDATA.hunts[route.hunt];
    if(arena){arena.otbm=route.otbm;const key="otbm:"+route.otbm;
      if(typeof HUNTMAPS!=="undefined"&&HUNTMAPS[key])arena.mapa=key;return arena;}
  }
  return boss.hunt&&GAMEDATA.hunts[boss.hunt];
}

/* Quivers que so vem de boss (QUIVER_DEFS[x].drop). Cada um fica ligado ao
 * boss que o entrega, para o painel dizer onde consegui-lo em vez de so
 * mostrar "indisponivel". Enquanto o jogo tiver poucos bosses, os de nivel
 * mais alto ficam anotados como conteudo futuro. */
const QUIVER_DROPS = {
  "jungle-quiver": { boss: "the-monster", nome: "The Monster" },
  "candy-coated-quiver": { boss: null, nome: "boss de nível 200" },
  "eldritch-quiver": { boss: null, nome: "boss de nível 250" },
  "naga-quiver": { boss: null, nome: "boss de nível 250" },
  "alicorn-quiver": { boss: null, nome: "boss de nível 400" },
};

/* Onde conseguir um quiver de drop (texto curto para a UI) */
function quiverDropSource(slug) {
  const d = QUIVER_DROPS[slug];
  if (!d) return "";
  return d.boss ? "cai de " + d.nome : "drop de " + d.nome;
}

function bossState(p, id) {
  p.bosses = p.bosses || {};
  if (!p.bosses[id]) p.bosses[id] = { lastFight: 0, kills: 0 };
  return p.bosses[id];
}

function bossReadyInfo(p, boss) {
  const enforceRequirement = boss.requirement &&
    (BOSS_REQUIREMENTS_ENABLED || boss.requirement.enforced) &&
    // TEMP TEST: remove before release
    !(MEGA_TEST_BYPASS && boss.id === "goshnar-s-megalomania");
  if (enforceRequirement) {
    if (boss.requirement.level && p.level < boss.requirement.level)
      return { ok: false, reason: boss.requirement.text || ("Requer nível " + boss.requirement.level), left: 0 };
    if (boss.requirement.mission && !isMissionComplete(p, boss.requirement.mission))
      return { ok: false, reason: boss.requirement.text, left: 0 };
    if (boss.requirement.allSoulWarTaints) {
      const ok = typeof soulwarHasAllBossTaints === "function" && soulwarHasAllBossTaints(p);
      if (!ok) return { ok: false, reason: boss.requirement.text, left: 0 };
    }
    if (boss.requirement.access) {
      p.bossAccess = p.bossAccess || {};
      // Migração para personagens que já concluíram Mirrored Nightmare antes
      // de a recompensa de acesso existir.
      if (!p.bossAccess[boss.requirement.access] && boss.requirement.mission &&
          isMissionComplete(p, boss.requirement.mission))
        p.bossAccess[boss.requirement.access] = true;
      if (!p.bossAccess[boss.requirement.access])
        return { ok:false, reason:boss.requirement.text, left:0 };
    }
  }
  const st = bossState(p, boss.id);
  const left = BOSS_COOLDOWNS_ENABLED
    ? Math.max(0, (st.lastFight || 0) + (boss.cooldown || 0) - Date.now())
    : 0;
  if (left > 0) return { ok: false, reason: "Cooldown", left: left };
  return { ok: true, reason: "Disponível", left: 0 };
}

/* Loot real do boss: o BOSS_DEFS pode não ter `loot` (ex.: a Timira usa o
 * loot do monstro base). Antes isso quebrava o modal (boss.loot.map de
 * undefined) — por isso a Timira não abria. */
function bossLootReal(boss) {
  if (boss.loot && boss.loot.length) return boss.loot;
  const base = GAMEDATA.monsters[boss.baseMonster || boss.sprite || "cave-rat"];
  return (base && base.loot) || [];
}

function bossLootText(boss) {
  return bossLootReal(boss).map((l) =>
    `${l.chance}% ${l.max > 1 ? "até " + l.max + "x " : ""}${itemName(l.item)}`);
}

function renderBosses(p) {
  const el = $("#bosses-modal-list");
  if (!el || !p) return;
  el.innerHTML = `<div class="npc-quick boss-quick">${Object.keys(BOSS_DEFS).map((id) => {
    const b = BOSS_DEFS[id];
    const r = bossReadyInfo(p, b);
    const portrait = typeof bossMobImg === "function"
      ? bossMobImg(b.sprite, 46) : mobImg(b.sprite, 46);
    return `<button class="npc-btn boss-btn ${r.ok ? "" : "locked"}" data-boss-info="${id}" title="${b.name} — ${r.left ? "Cooldown" : r.reason}">
      ${portrait}
      <span class="nb">${b.name}</span>
    </button>`;
  }).join("")}</div>`;
  $$("#bosses-modal-list [data-boss-info]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const body = $("#modal-body");
      if (body) body.classList.remove("bosses-modal-shell");
      openBossModal(btn.dataset.bossInfo);
    }));
}

function openBossesCatalogModal() {
  if (!G.p) return;
  const modal = $("#modal"), body = $("#modal-body");
  body.classList.remove(
    "hunts-modal-shell", "boss-modal-shell", "reward-modal-shell",
    "npcs-modal-shell", "cidade-modal-shell", "ranking-modal-shell"
  );
  body.classList.add("bosses-modal-shell");
  body.innerHTML = `<div class="panel-title bosses-modal-title">
      <span class="bosses-megalomania-icon" aria-hidden="true"></span>
      <span>BOSSES</span><button class="sm" id="bosses-modal-close">Fechar</button>
    </div><div class="panel-body" id="bosses-modal-list"></div>`;
  modal.classList.add("show");
  $("#bosses-modal-close").addEventListener("click", () => {
    modal.classList.remove("show");
    body.classList.remove("bosses-modal-shell");
  });
  renderBosses(G.p);
}

/* Stats do boss: diretos (hp/exp/damage/armor no BOSS_DEFS, como o
 * Ferumbras Mortal Shell) ou escalados do monstro base pelo mult. */
function bossStats(boss) {
  const base = GAMEDATA.monsters[boss.baseMonster || boss.sprite] ||
    GAMEDATA.monsters["cave-rat"];
  const mult = applyBossMultiplier(base, boss.mult || 10);
  return {
    hp: boss.hp || mult.hp,
    exp: boss.exp || mult.exp,
    damage: boss.damage || mult.damage,
    armor: boss.armor || mult.armor,
    defense: boss.defense || base.defense || 0,
  };
}

function openBossModal(id) {
  const boss = BOSS_DEFS[id];
  if (!boss) return;
  const ready = bossReadyInfo(G.p, boss);
  const st = bossState(G.p, id);
  const drops = bossLootReal(boss);
  const stats = bossStats(boss);
  const base = GAMEDATA.monsters[boss.baseMonster || boss.sprite] || {};
  const elements = ["physical", "earth", "energy", "fire", "ice", "holy", "death"];
  const resistHtml = elements.map((el) => {
    const value = (base.resist && base.resist[el]) || 0;
    const info = ELEMENTS[el] || ELEMENTS.physical;
    const width = Math.max(8, Math.min(100, 50 + value / 2));
    const color = value < 0 ? "#e85b52" : (value >= 100 ? "#37d45b" : "#80d64a");
    return `<div class="hunt-best-res" title="${info.name}: ${value > 0 ? "+" : ""}${value}%">
      <span>${info.icon || "◆"}</span><i><b style="width:${width}%;background:${color}"></b></i></div>`;
  }).join("");
  const lootHtml = drops.map((l) => {
    const name = itemName(l.item);
    const title = `${name} · ${l.chance}% de chance${l.max > 1 ? ` · até ${l.max}x` : ""}`;
    const border = typeof itemClsBorder === "function" ? itemClsBorder(l.item) : "";
    return `<div class="hunt-loot-slot ${border}" data-boss-drop="${l.item}"
      aria-label="${title}">${itemImg(l.item, 28)}</div>`;
  }).join("") || `<span class="tiny dim">Sem loot.</span>`;

  const modalBox = $("#modal-body");
  modalBox.classList.remove("reward-modal-shell", "bosses-modal-shell", "hunts-modal-shell");
  modalBox.classList.add("boss-modal-shell");
  const portrait = (typeof bossMobImg === "function" ? bossMobImg : mobImg);
  modalBox.innerHTML = `
    <div class="panel-title">
      ${portrait(boss.sprite, 24)}
      ${boss.name} — <span class="dim" style="font-weight:normal">${boss.title}</span>
      <span style="flex:1"></span><button class="sm" id="boss-close">✕</button>
    </div>
    <div class="panel-body boss-detail-body">
      <div class="boss-detail-summary">
        <span>Disponibilidade: <b style="color:${ready.ok ? "#9ce84a" : "#ff9a6a"}">${ready.reason}</b></span>
        <span>Vitórias: <b>${fmtFull(st.kills || 0)}</b></span>
      </div>
      <div class="hunt-best-card boss-best-card">
        <div class="hunt-best-sprite boss-best-sprite">${portrait(boss.sprite, 76)}</div>
        <div class="hunt-best-name">${boss.name}</div>
        <div class="hunt-best-stat"><span>HP</span><b>${fmtFull(stats.hp)}</b></div>
        <div class="hunt-best-stat"><span>Exp</span><b>${fmtFull(stats.exp)}</b></div>
        <div class="hunt-best-title">RESISTÊNCIAS</div>
        <div class="hunt-best-resists boss-best-resists">${resistHtml}</div>
        <div class="hunt-best-title">LOOT</div>
        <div class="hunt-best-loot boss-best-loot">${lootHtml}</div>
      </div>
      <button class="danger full mt8" id="boss-fight" ${ready.ok ? "" : "disabled"}>FIGHT</button>
      <div class="tiny dim mt8 center">O loot vai para o
        <img src="assets/item/reward-chest.png" class="boss-reward-inline" alt="Reward Chest"> Reward Chest.</div>
    </div>`;
  $$("#modal-body [data-boss-drop]").forEach((el, index) => {
    const drop = drops[index];
    if (!drop || typeof bindFullItemTooltip !== "function") return;
    bindFullItemTooltip(el, drop.item,
      `Drop de ${boss.name} · ${drop.chance}% de chance${
        drop.max > 1 ? ` · até ${drop.max}x` : ""}`);
  });
  const closeBossModal = () => {
    if (typeof hideTip === "function") hideTip();
    $("#modal").classList.remove("show");
    modalBox.classList.remove("boss-modal-shell");
  };
  $("#modal").classList.add("show");
  $("#boss-close").addEventListener("click", closeBossModal);
  $("#boss-fight").addEventListener("click", () => {
    closeBossModal();
    // Megalomania: Fight sempre abre o lobby (nunca combate direto).
    if (id === "goshnar-s-megalomania") {
      const openLobby = (typeof megaLobbyOpenFromBoss === "function" && megaLobbyOpenFromBoss) ||
        (typeof window !== "undefined" && window.megaLobbyOpenFromBoss);
      if (typeof openLobby === "function") {
        openLobby();
        return;
      }
      toast("Lobby Megalomania indisponível. Recarregue a página.", "bad");
      return;
    }
    startBoss(id);
  });
}

function startBoss(id, force, arenaReady) {
  window.FORGE_DEBUG_COUNT = { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
  const boss = BOSS_DEFS[id];
  if (!boss) return;
  // Megalomania: abre lobby antes do combate (bypass só libera taints/gates, não o lobby).
  // `__MEGA_LOBBY_STARTING` / `__MEGA_LOBBY_FOLLOW` = start interno pós-lobby.
  if (id === "goshnar-s-megalomania" && !force && !window.__MEGA_LOBBY_STARTING &&
      !window.__MEGA_LOBBY_FOLLOW) {
    const openLobby = (typeof megaLobbyOpenFromBoss === "function" && megaLobbyOpenFromBoss) ||
      (typeof window !== "undefined" && window.megaLobbyOpenFromBoss);
    if (typeof openLobby === "function") {
      openLobby();
      return;
    }
    toast("Lobby Megalomania indisponível. Recarregue a página.", "bad");
    return;
  }
  if(!force&&G.foreignInstance){
    toast("Outro personagem da conta já possui uma instância ativa. Troque para ele antes de iniciar outro boss.","bad");return;
  }
  // PARTY: membros (não líder) não podem entrar em boss por conta própria —
  // só o líder escolhe e leva a party (requisitos validados no server).
  // `force = true` é o FOLLOW (membro teleportado para a sala do líder).
  if (!force && typeof partyBlocksHunt === "function" && partyBlocksHunt()) {
    toast("Membros de party só podem estar na Cidade ou Área de Treino. O líder escolhe o boss.", "bad");
    return;
  }
  const ready = bossReadyInfo(G.p, boss);
  if (!ready.ok) { toast(ready.reason); return; }
  if (typeof partyCombatRestoreAll === "function") partyCombatRestoreAll("entrada do boss");

  // Boss com sala própria espera OTBM + sprites antes de criar entidades.
  const arena = bossArenaDefinition(boss);
  if (!arenaReady && arena && arena.otbm && typeof huntMapFromOtbmAsync === "function") {
    if (typeof beginMapLoading === "function") beginMapLoading(`Carregando ${boss.name}...`);
    huntMapFromOtbmAsync(arena, () => {
      const assets = typeof preloadHuntMapAssets === "function"
        ? preloadHuntMapAssets(arena, `Preparando ${boss.name}`) : Promise.resolve();
      assets.then(() => startBoss(id, force, true));
    });
    return;
  }
  if (!arenaReady && typeof beginMapLoading === "function")
    beginMapLoading(`Carregando ${boss.name}...`);
  if (G.training) stopAcademy(false);
  // skipPartyZone: evita returnHome da party no intervalo city→boss.
  if (G.combat) stopHunt(true, { skipPartyZone: true });
  const st = bossState(G.p, id);
  st.lastFight = BOSS_COOLDOWNS_ENABLED ? Date.now() : 0;
  // Esta reinicialização só faz parte da regra de requisito da Timira.
  if (BOSS_REQUIREMENTS_ENABLED && id === "timira-the-many-headed") {
    const mst = missionState(G.p, "marapur-nagas");
    mst.progress = {};
    mst.claimed = {};
    mst.completeClaimed = false;
  }
  G.p.hunt = null;
  G.p.instanceMode = "boss";
  if(typeof accountBeginInstance==="function")accountBeginInstance();
  G.combat = newBossCombat(G.p, boss);
  G.combat.instanceStartedAt = Date.now();
  G.inCity = false;
  if(typeof persistActiveInstance==="function")persistActiveInstance();
  const spawnWait=typeof bossArenaSpawnDelayMs==="function"?bossArenaSpawnDelayMs(id):5000;
  if(id!=="goshnar-s-megalomania"&&spawnWait>0)
    addLog("death", `Você entrou no boss <b>${boss.name}</b>. O boss surge em ${Math.round(spawnWait/1000)}s.`);
  else
    addLog("death", `Você entrou no boss <b>${boss.name}</b>. Entrada liberada.`);
  toast(`Boss: <b>${boss.name}</b>`, "death");
  // PARTY: enquanto a liberação temporária estiver ativa, o servidor recebe
  // cooldown zero e nenhum requisito de missão para todos os integrantes.
  if (typeof partyReportZone === "function") {
    const info = {
      zone: "boss", boss: id,
      cooldownMs: BOSS_COOLDOWNS_ENABLED ? (boss.cooldown || 0) : 0,
    };
    if ((BOSS_REQUIREMENTS_ENABLED || (boss.requirement && boss.requirement.enforced)) &&
        boss.requirement && boss.requirement.mission) {
      info.mission = boss.requirement.mission;
      const mdef = missionForHunt(boss.requirement.mission);
      if (mdef && mdef.tasks) {
        info.missionTargets = {};
        for (const t of mdef.tasks) info.missionTargets[t.monster] = t.target;
      }
    }
    partyReportZone(info);
  }
  renderAll();
  if (typeof finishMapLoading === "function") finishMapLoading();
}

/* ------------------------------------------------------------ hunt */
function openInstanceModal(id) {
  const hu = GAMEDATA.hunts[id];
  if (!hu) return;
  // lembra a ultima instancia escolhida e destaca no modal — facilita
  // repetir a mesma hunt sem ler os dois blocos de novo
  const ultima = G.p && G.p.lastInstanceChoice;
  const modo = (G.p && G.p.config && G.p.config.attackMode) || "chase";
  // v33: sem Chase/Stand — sempre STAND
  const modos = [["kiting", "Kiting"], ["box", "BOX"], ["safe", "SAFE"]];
  $("#modal-body").innerHTML = `
    <div class="panel-title">Escolha a instância — ${hu.name}</div>
    <div class="panel-body">
      <div class="small mb4" style="color:#d4af37;font-weight:bold">🎯 Modo de Hunt</div>
      <div class="row wrap mb8" style="gap:6px">
        ${modos.map(([mid, label]) =>
          `<button class="sm ${modo === mid ? "primary" : ""}" data-hunt-mode="${mid}" title="${
            mid === "box" ? "Formação tática por vocação (knight no melhor spot, RP nas retas, magos na área)"
            : mid === "safe" ? "Fica nos cantos da tela, longe da box, mas no range das spells"
            : ""}">${label}</button>`).join("")}
      </div>
      <div class="shop-row" style="align-items:flex-start">
        <div style="flex:1">
          <div class="small" style="color:#9ce84a">Instância non-pvp
            ${ultima === "non-pvp" ? `<span class="tiny dim">· última escolha</span>` : ""}</div>
          <div class="tiny dim">Ninguém pode te raidar. EXP, loot e skills normais.</div>
        </div>
        <button class="primary sm" data-instance="non-pvp">Entrar</button>
      </div>
      <div class="shop-row" style="align-items:flex-start">
        <div style="flex:1">
          <div class="small" style="color:#ff9a6a">Instância pvp
            ${ultima === "pvp" ? `<span class="tiny dim">· última escolha</span>` : ""}</div>
          <div class="tiny dim">Outros jogadores reais poderão te raidar e matar no online. EXP, loot e skills +25%. +0,5% de chance de monstro Influenced.</div>
        </div>
        <button class="danger sm" data-instance="pvp">Entrar</button>
      </div>
      <button class="full mt8" id="instance-cancel">Cancelar</button>
    </div>`;
  $("#modal").classList.add("show");
  // MODO DE HUNT: escolhido aqui vale para a hunt inteira (party inclusa)
  $$("#modal-body [data-hunt-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      if (G.p && G.p.config) G.p.config.attackMode = b.dataset.huntMode;
      openInstanceModal(id);   // re-renderiza destacando o escolhido
    }));
  $$("#modal-body [data-instance]").forEach((b) =>
    b.addEventListener("click", () => {
      $("#modal").classList.remove("show");
      startHunt(id, b.dataset.instance);
    }));
  $("#instance-cancel").addEventListener("click", () => $("#modal").classList.remove("show"));
}

function startHunt(id, instanceMode, force) {
  window.FORGE_DEBUG_COUNT = { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
  const hu = GAMEDATA.hunts[id];
  if (!hu) return;
  if(!force&&G.foreignInstance){
    toast("Outro personagem da conta já possui uma instância ativa. Troque para ele antes de iniciar outra hunt.","bad");return;
  }
  // Hunts sem requisito de nível (modo de testes/progressão livre).
  // PARTY: membros (não líder) não podem entrar em hunt por conta própria —
  // só cidade/treino. O líder escolhe a hunt e leva a party junto (follow).
  // `force = true` é o FOLLOW (o membro é teleportado pelo servidor para a
  // MESMA instância do líder — não é escolha dele).
  if (!force && typeof partyBlocksHunt === "function" && partyBlocksHunt()) {
    toast("Membros de party só podem estar na Cidade ou Área de Treino. O líder escolhe a hunt.", "bad");
    return;
  }
  if (!instanceMode) { openInstanceModal(id); return; }
  // Online: sem lease a caçada congela (sem ticks de autoridade) e parece
  // 9999 ping. Garanta o controle antes de mutar o estado da hunt.
  if(typeof accountApiConfigured==="function"&&accountApiConfigured()&&
     typeof accountEnsureLease==="function"){
    const token=sessionToken();
    if(!token){toast("Sessão online ausente. Entre novamente.","bad");return;}
    accountEnsureLease(token,{silent:true}).then((lease)=>{
      if(!lease||!lease.ok){
        toast((lease&&lease.msg)||"Não foi possível obter o controle da conta.","bad");
        return;
      }
      startHuntAfterLease(id,instanceMode,force);
    });
    return;
  }
  startHuntAfterLease(id,instanceMode,force);
}
function startHuntAfterLease(id, instanceMode, force) {
  const hu = GAMEDATA.hunts[id];
  if (!hu) return;
  if (typeof partyCombatRestoreAll === "function") partyCombatRestoreAll("entrada da hunt");
  // Toda troca de arena passa pelo checkpoint city. Além de limpar a
  // instância anterior, isso ordena a transição da party no servidor.
  if(G.combat)stopHunt(true,{skipPartyZone:true});
  if (G.training) stopAcademy(false);
  if (typeof clearCombatVisualOverlays === "function") clearCombatVisualOverlays(null);
  G.inCity = false;
  G.p.hunt = id;
  G.p.instanceMode = instanceMode;
  G.p.lastInstanceChoice = instanceMode;   // pre-seleciona no proximo modal
  const entryToken = (G.huntEntryToken || 0) + 1;
  G.huntEntryToken = entryToken;G.huntEntryPendingToken=entryToken;
  G.huntMapReady = false;
  if (typeof beginMapLoading === "function") beginMapLoading(`Carregando ${hu.name}...`);

  // Última barreira contra overlay infinito: mesmo que um callback externo
  // deixe de responder, a transição sempre conclui. Em rede saudável, mapa e
  // assets terminam muito antes; em pane, o acesso tem prioridade.
  let entryCompleted = false;
  let entryWatchdog = null;
  const entryStillValid = () =>
    G.huntEntryToken === entryToken && !G.inCity && G.p.hunt === id;
  const restoreHuntEntryState = (source) => {
    // Token trocado significa uma ação real posterior (templo, treino ou
    // outra hunt). Apenas inconsistências do MESMO clique podem ser reparadas.
    if (G.huntEntryToken !== entryToken) return false;
    if (!entryStillValid()) {
      console.warn(`[hunt] ${source} restaurou estado de entrada em ${id}`);
      G.inCity = false;
      G.p.hunt = id;
      G.p.instanceMode = instanceMode;
    }
    return true;
  };
  const closeHuntEntryLoading = (immediate) => {
    // Token explícito: o guard do otbmhunt não depende apenas da variável
    // lexical de preload.js para saber que o watchdog já encerrou a entrada.
    G.huntEntryCompletedToken = entryToken;
    if (typeof finishMapLoading === "function") finishMapLoading();
    // O watchdog deve liberar no mesmo tick, inclusive se timers/rAF estiverem
    // throttled. O finish acima ainda invalida todos os reports atrasados.
    if (immediate && typeof showGameLoading === "function") showGameLoading(false);
  };
  const finishHuntEntry = () => {
    if (entryCompleted) return;
    if (!restoreHuntEntryState("finalização")) {
      entryCompleted = true;if(G.huntEntryPendingToken===entryToken)G.huntEntryPendingToken=null;
      if (entryWatchdog) clearTimeout(entryWatchdog);
      return;
    }
    entryCompleted = true;if(G.huntEntryPendingToken===entryToken)G.huntEntryPendingToken=null;
    if (entryWatchdog) clearTimeout(entryWatchdog);
    try {
      if(typeof accountBeginInstance==="function")accountBeginInstance();
      G.combat = newCombat(G.p, id, instanceMode);
      G.combat.instanceStartedAt = Date.now();
      if (typeof markHuntMapReady === "function") markHuntMapReady();
      else G.huntMapReady = true;
      spawnWave(G.combat, G.p);
      if(typeof persistActiveInstance==="function")persistActiveInstance();
      addLog("info", `Viajando para <b style="color:#d4af37">${hu.name}</b> · instância <b>${instanceMode}</b>`);
      toast(`Caçando em <b>${hu.name}</b> (${instanceMode})`);
      // PARTY: líder entrou num local de caça -> membros seguem p/ MESMA instância
      if (typeof partyReportZone === "function") {
        partyReportZone({ zone: "hunt", hunt: id, instance: instanceMode, otbm: hu.otbm || null });
      }
      renderAll();
    } catch (error) {
      // O watchdog é a última barreira de acesso: um erro secundário de UI
      // não pode manter a tela inteira bloqueada. O callback OTBM ainda pode
      // tentar novamente quando o mapa integral terminar de carregar.
      entryCompleted = false;G.huntEntryPendingToken=entryToken;
      console.error(`[hunt] falha ao concluir entrada em ${id}:`, error);
    } finally {
      closeHuntEntryLoading(false);
    }
  };
  const watchdogMs = Math.max(1, Number(
    typeof window !== "undefined" && window.HUNT_ENTRY_TIMEOUT_MS
  ) || 7000);
  entryWatchdog = setTimeout(() => {
    // Uma transição mais nova (templo, treino ou outra hunt) sempre vence.
    if (!restoreHuntEntryState("watchdog")) return;
    console.warn(`[hunt] watchdog liberou entrada em ${id} após ${watchdogMs}ms`);
    // Libera a tela antes de qualquer criação/renderização de combate.
    closeHuntEntryLoading(true);
    finishHuntEntry();
  }, watchdogMs);

  // Hunt com arena .otbm: carrega (fetch) e converte o mapa antes de montar
  // o combate. Exceções e promises rejeitadas também convergem para a entrada.
  try {
    huntMapFromOtbmAsync(hu, () => {
      // Não espere o watchdog: se uma sincronização de party apenas marcou
      // cidade durante o fetch (sem trocar o token), continue a entrada agora.
      if (!restoreHuntEntryState("OTBM")) return;

      // Se o watchdog já criou o combate com o fallback, uma leitura OTBM
      // tardia ainda pode instalar o mapa integral — mas somente na mesma
      // entrada/hunt. Voltar ao templo invalida entryStillValid().
      if (entryCompleted) {
        const key = hu.otbm ? "otbm:" + hu.otbm : null;
        const integralMap = key && typeof HUNTMAPS !== "undefined" ? HUNTMAPS[key] : null;
        const curMap = G.combat && G.combat.huntMap;
        if (!integralMap || !integralMap.rows || !G.combat ||
            G.combat.huntId !== id || curMap === integralMap) return;

        console.warn("[hunt] OTBM tardio substituiu fallback", id);
        let lateReady;
        try {
          lateReady = typeof preloadHuntMapAssets === "function"
            ? preloadHuntMapAssets(hu, `Preparando ${hu.name}`) : Promise.resolve();
        } catch (error) {
          console.warn("[hunt] falha síncrona no preloader tardio:", error);
          lateReady = Promise.resolve();
        }
        Promise.resolve(lateReady)
          .catch((error) => console.warn("[hunt] preloader tardio rejeitado:", error))
          .then(() => {
            if (!restoreHuntEntryState("preloader tardio") || !G.combat ||
                G.combat.huntId !== id || G.combat.huntMap === integralMap) return;
            try {
              G.combat = newCombat(G.p, id, instanceMode);
              G.combat.instanceStartedAt = Date.now();
              if (typeof markHuntMapReady === "function") markHuntMapReady();
              else G.huntMapReady = true;
              spawnWave(G.combat, G.p);
              if(typeof persistActiveInstance==="function")persistActiveInstance();
              renderAll();
            } catch (error) {
              console.error(`[hunt] falha ao instalar OTBM tardio em ${id}:`, error);
            } finally {
              closeHuntEntryLoading(false);
            }
          });
        return;
      }

      let ready;
      try {
        ready = typeof preloadHuntMapAssets === "function"
          ? preloadHuntMapAssets(hu, `Preparando ${hu.name}`) : Promise.resolve();
      } catch (error) {
        console.warn("[hunt] falha síncrona no preloader:", error);
        ready = Promise.resolve();
      }
      Promise.resolve(ready)
        .catch((error) => console.warn("[hunt] preloader rejeitado:", error))
        .then(finishHuntEntry);
    });
  } catch (error) {
    console.warn("[hunt] carregador OTBM falhou antes do callback:", error);
    finishHuntEntry();
  }
}

function resetTemplePlayerPosition() {
  if (!G.walker && typeof CityWalker === "function") G.walker = new CityWalker();
  if (G.walker && typeof G.walker.resetToSpawn === "function")
    G.walker.resetToSpawn();
  G.hoverNpc = null;
  G.activeNpc = null;
  if (G.renderer) G.renderer.npcHit = [];
}

function stopHunt(skipMapLoading, opts) {
  opts = opts || {};
  G.huntMapReady = true;
  if (!skipMapLoading && typeof beginMapLoading === "function")
    beginMapLoading("Retornando ao Templo Oficial...");
  // Invalida qualquer callback OTBM iniciado antes do retorno.
  G.huntEntryToken = (G.huntEntryToken || 0) + 1;G.huntEntryPendingToken=null;
  if (typeof clearCombatVisualOverlays === "function") clearCombatVisualOverlays(G.combat);
  // Checkpoint do templo: cura ANTES de persistir. save() com G.combat
  // online não grava o personagem (o tick já o fez com HP de combate),
  // então HP 150/0 acabava no banco se a cura viesse depois.
  if (typeof partyCombatRestoreAll === "function") partyCombatRestoreAll("templo");
  if (G.p) {
    const m = maxStats(G.p);
    G.p.hp = m.hp; G.p.mp = m.mp;
    G.p.hunt = null;
    G.p.instanceMode = null;
  }
  if (typeof partyCombatSaveAll === "function") partyCombatSaveAll();
  if (typeof scarlettBossCleanup === "function" && G.combat) scarlettBossCleanup(G.combat);
  if (typeof greedBossCleanup === "function" && G.combat) greedBossCleanup(G.combat);
  if (typeof hatredBossCleanup === "function" && G.combat) hatredBossCleanup(G.combat);
  if (typeof spiteBossCleanup === "function" && G.combat) spiteBossCleanup(G.combat);
  if (typeof maliceBossCleanup === "function" && G.combat) maliceBossCleanup(G.combat);
  if (typeof megaBossCleanup === "function" && G.combat) megaBossCleanup(G.combat);
  G.combat = null;
  ONLINE_AUTH_APPLIED_VERSION=0;ONLINE_AUTH_APPLIED_INSTANCE="";
  if(typeof clearInstanceSession==="function")clearInstanceSession("returned-city");
  if (typeof save === "function") save();
  if (typeof resetGridSize === "function") resetGridSize();
  G.inCity = true;
  resetTemplePlayerPosition();
  addLog("info", "Voltou para o <b style='color:#ffe680'>Templo Oficial de Thais</b>.");
  // Transição interna hunt/boss→boss: não reporte city (gera returnHome e
  // expulsa a party antes do zone=boss seguinte).
  if (!opts.skipPartyZone && typeof partyReportZone === "function")
    partyReportZone({ zone: "city" });
  renderAll();
  if (!skipMapLoading) {
    const templeReady = typeof preloadGameAssets === "function"
      ? preloadGameAssets(G.p, "Preparando templo") : Promise.resolve();
    templeReady.then(() => {
      if (typeof finishMapLoading === "function") finishMapLoading();
    });
  }
}

/* Alterna entre cidade, caçada e academia */
function goToCity() {
  if (typeof partyCombatRestoreAll === "function") partyCombatRestoreAll("templo");
  if (G.training) stopAcademy();
  // Bosses usam G.combat, mas deixam G.p.hunt=null. Verificar só `hunt`
  // mantinha o combate ativo e o botão parecia travado após trocar o templo.
  else if (G.combat || G.p.hunt) stopHunt();
  else { G.inCity = true; resetTemplePlayerPosition(); renderAll(); }
}

function startAcademy() {
  if (!G.p) return;
  if (typeof partyCombatRestoreAll === "function") partyCombatRestoreAll("training room");
  if (G.combat) stopHunt(true);
  if (typeof beginMapLoading === "function") beginMapLoading("Carregando academia...");
  G.training = newAcademyTraining(G.p);
  G.inCity = false;
  G.p.hunt = null;
  G.combat = null;
  addLog("info", "Teleportado para a <b style='color:#9ce84a'>Academia Safezone</b>.");
  toast("Academia Safezone: Treiner ativo", "level");
  // PARTY: Área de Treino é zona permitida para convidar
  if (typeof partyReportZone === "function") partyReportZone({ zone: "training", training: "academy" });
  renderAll();
  openAcademyConjureModal(false);
  if (typeof finishMapLoading === "function") finishMapLoading();
}

function stopAcademy(log) {
  if (!G.training) return;
  const returningToTemple = log !== false;
  if (returningToTemple && typeof partyCombatRestoreAll === "function")
    partyCombatRestoreAll("retorno do treino");
  if (returningToTemple && typeof beginMapLoading === "function")
    beginMapLoading("Retornando ao Templo Oficial...");
  G.training = null;
  if (typeof resetGridSize === "function") resetGridSize();
  G.inCity = true;
  resetTemplePlayerPosition();
  G.combat = null;
  G.p.hunt = null;
  const m = maxStats(G.p);
  G.p.hp = m.hp;
  if (log !== false) {
    addLog("info", "Saiu da academia e voltou para o <b style='color:#ffe680'>Templo Oficial de Thais</b>.");
    toast("Voltou para o templo");
  }
  G.activeNpc = null;
  // PARTY: líder voltou para a safe zone
  if (typeof partyReportZone === "function") partyReportZone({ zone: "city" });
  renderAll();
  if (returningToTemple) {
    const templeReady = typeof preloadGameAssets === "function"
      ? preloadGameAssets(G.p, "Preparando templo") : Promise.resolve();
    templeReady.then(() => {
      if (typeof finishMapLoading === "function") finishMapLoading();
    });
  }
}

/* ------------------------------------------------------------ eventos */
function normalizedCombatElement(value) {
  const raw=String(value||"physical").trim().toLowerCase().replace(/[ _]+/g,"-");
  const aliases={phys:"physical",melee:"physical",physicaldamage:"physical",
    frost:"ice",electric:"energy",poison:"earth",holydamage:"holy",deathdamage:"death"};
  return aliases[raw]||raw;
}

function combatVisualDescriptor(e) {
  if (!e) return null;
  let kind=null,amount=0,channel="";
  if (e.t === "hit") { kind="damage"; amount=e.dmg||0; channel=normalizedCombatElement(e.el); }
  else if (e.t === "taken") { kind="taken"; amount=e.dmg||0; channel=normalizedCombatElement(e.el); }
  else if (e.t === "mobheal") { kind="heal"; amount=e.heal||0; channel="hp"; }
  else if (e.t === "heal" || e.t === "heal-friend") { kind="heal"; amount=e.amount||0; channel="hp"; }
  if (!kind || amount <= 0) return null;
  const target=e.targetId?"id:"+e.targetId:
    "xy:"+Math.round((Number(e.x)||0)*1000)+":"+Math.round((Number(e.y)||0)*1000);
  return {key:kind+"|"+channel+"|"+target,kind,channel,amount};
}

/* Soma números equivalentes no mesmo tick (mesmo alvo + mesmo elemento).
 * O lead do grupo mostra o total; hits extras não geram floater/log/FX —
 * assim vários físicos (party/dual/delayed) viram um combo como o gelo. */
function aggregateCombatVisualEvents(events) {
  const groups=new Map(),byEvent=new Map();
  for (const event of events||[]) {
    const d=combatVisualDescriptor(event);if(!d)continue;
    let group=groups.get(d.key);
    if(!group){group={first:event,total:0,count:0,kind:d.kind,channel:d.channel};groups.set(d.key,group);}
    group.total+=d.amount;group.count++;byEvent.set(event,group);
  }
  return {groups,byEvent};
}

/* Log de hit: no mesmo alvo/elemento e janela curta, soma no último
 * "sofreu N" em vez de N linhas (online com ts espaçado). */
let _hitLogCombo = null;
function addCombatHitLog(comboKey, alvo, col, amount, elName) {
  if (typeof addLog !== "function") return;
  const now = Date.now();
  const box = typeof $ === "function" ? $("#log") : null;
  const last = box && box.lastElementChild;
  if (comboKey && _hitLogCombo && _hitLogCombo.key === comboKey &&
      last && last === _hitLogCombo.el && last.classList.contains("hit") &&
      (now - _hitLogCombo.at) < 400) {
    _hitLogCombo.total += amount;
    _hitLogCombo.at = now;
    const span = last.querySelector("span:not(.time)");
    if (span) {
      span.innerHTML = `<b>${alvo}</b> sofreu <b style="color:${col}">${fmtDmg(_hitLogCombo.total)}</b> (${elName}).`;
    }
    return;
  }
  addLog("hit", `<b>${alvo}</b> sofreu <b style="color:${col}">${fmtDmg(amount)}</b> (${elName}).`);
  _hitLogCombo = {
    key: comboKey || "",
    total: amount,
    at: now,
    el: box ? box.lastElementChild : null
  };
}

function drainEvents() {
  const c = G.combat;
  if (!c) return;
  const r = G.renderer;

  // Modo online: eventos do servidor têm `ts` (timestamp). O servidor
  // processa 1s de combate de uma vez; sem espaçar, todos os floaters
  // aparecem no mesmo frame. Filtramos apenas os eventos cujo `ts` já
  // passou. MAS se o clock do servidor estiver à frente do cliente,
  // os eventos ficariam presos indefinidamente. Limite de 5s de pending:
  // se o ts está mais de 5s no futuro, processa imediatamente (provável
  // diferença de clock).
  const now = Date.now();
  const ready = [];
  const pending = [];
  for (const e of c.events) {
    if (e.ts && e.ts > now && (e.ts - now) < 5000) pending.push(e);
    else ready.push(e);
  }
  c.events = pending;

  if (!ready.length) return;

  // Damage / Damage Taken: agrega hit+taken por personagem/elemento a partir
  // dos eventos já emitidos (offline e online), sem campos extras no servidor.
  if (typeof otcAnalyserIngestEvents === "function") {
    try { otcAnalyserIngestEvents(ready, c); } catch (err) { /* analyser opcional */ }
  }

  // O alvo pode ter avançado vários frames desde que o lote foi recebido.
  // Atualize origem/destino imediatamente antes de criar texto, efeito e
  // projétil; se a entidade já morreu/sumiu, a coordenada congelada do evento
  // continua sendo o fallback correto para o último hit/corpse.
  for (const event of ready) resolveLiveCombatEventPosition(c, event);

  const visualTotals=aggregateCombatVisualEvents(ready);
  const visualAmount=(event,fallback)=>{
    const group=visualTotals.byEvent.get(event);
    return !group||group.first===event?(group?group.total:fallback):0;
  };
  // Crit/Fatal: no máximo UM sprite por monstro neste lote. Hits dual
  // (físico+elemento) e agregação de tick não devem empilhar 2× no mesmo
  // alvo — mas CADA alvo atingido pelo proc precisa do efeito.
  const critFxShown = new Set();
  const fatalFxShown = new Set();
  const critFxKey = (ev) => {
    if (ev.targetId !== undefined && ev.targetId !== null && ev.targetId !== "")
      return "id:" + String(ev.targetId);
    if (ev.mobId !== undefined && ev.mobId !== null && ev.mobId !== "")
      return "mob:" + String(ev.mobId);
    return "xy:" + Math.round((Number(ev.x) || 0) * 1000) + ":" +
      Math.round((Number(ev.y) || 0) * 1000);
  };
  // Posição normalizada (0-1) de um evento: os eventos carregam a posição
  // REAL da entidade no canvas (player ou mob, que andam pelo grid do
  // mapa). A fórmula antiga (0.42 + x*0.5) era do campo fixo e deslocava
  // os floaters para a direita — dodge/ruse saíam longe do personagem e o
  // dano em mobs próximos também ficava torto.
  const ex = (e) => (e.x !== undefined && e.x !== null)
    ? e.x : (c.player ? c.player.x : 0.5);
  const ey = (e) => (e.y !== undefined && e.y !== null)
    ? e.y : (c.player ? c.player.y : 0.5);
  for (const e of ready) {
    switch (e.t) {
      case "hit": {
        // Cor do NUMERO de dano: fisico em VERMELHO contra criaturas de
        // SANGUE e contra PLAYERS (como o Tibia clássico) — a raca define a
        // cor (blood = vermelho) e o efeito. As demais racas seguem o esquema
        // antigo (veneno verde, morto-vivo cinza etc.).
        const visualElement=normalizedCombatElement(e.el);
        const ehFisico = visualElement === "physical";
        const raca = ehFisico
          ? (typeof fisicoPorRaca === "function" ? fisicoPorRaca(e.race) : null)
          : null;
        // blood (e sem raca conhecida) -> VERMELHO; players -> VERMELHO
        const vermelho = (ehFisico && raca && raca.color === "#c00000") ||
                         (ehFisico && e.race === "player");
        const col = ehFisico
          ? (vermelho ? "#c00000" : (raca ? raca.color : ELEMENTS.physical.color))
          : (ELEMENTS[visualElement] || ELEMENTS.physical).color;
        // `dual` marca a parte elemental de uma arma que bate nos dois
        // tipos: desloca o NUMERO para o lado para nao ficar por cima do
        // numero fisico. Impacto/crit/projetil ficam no centro do SQM.
        const x = ex(e), y = ey(e);
        const shownDamage=visualAmount(e,e.dmg||0);
        // Combo lead: só o primeiro hit do grupo (mesmo alvo+elemento)
        // mostra número, log, projétil e impacto. Hits extras do tick
        // (e janela curta online) entram no total sem poluir FX/log.
        const isComboLead = shownDamage > 0;
        if (isComboLead && e.projectile && r.addProjectile)
          r.addProjectile(e.sx || (c.player ? c.player.x : 0.18), e.sy || 0.62,
                          x, y, col, e.missile);
        // Todo dano nasce exatamente no alvo. Só a segunda parcela elemental
        // de arma híbrida (`dual`) recebe deslocamento para não cobrir o
        // número físico; magia elemental comum não deve flutuar à direita.
        const floaterX=ex(e)+(e.dual?0.022:0);
        const comboKey=e.targetId?("damage|"+visualElement+"|"+String(e.targetId)):null;
        if (isComboLead) {
          r.addFloater(floaterX, y, "-" + fmtDmg(shownDamage), col, shownDamage > 200, true, "damage", comboKey);
          const elName=(ELEMENTS[visualElement]||ELEMENTS.physical).name;
          const alvo=typeof displayMonsterName==="function"
            ? displayMonsterName(e.mobSlug||e.spell||"alvo") : (e.mobSlug||e.spell||"alvo");
          addCombatHitLog(comboKey, alvo, col, shownDamage, elName);
        }
        // e.fx vem do COMBAT_PARAM_EFFECT da runa (mort area, ice area,
        // stones...). Sem isso toda runa mostrava so o efeito generico do
        // elemento e a sudden death parecia igual a um golpe de death comum.
        // Exori usa o estouro CINZA "hit-area" (nao o draw-blood vermelho).
        // Golpe fisico basico: prioriza e.fx do motor; fallback pela raca
        // (sangue / hit-area / veneno) — nunca omitir o impacto.
        const hitFx = e.fx || ((e.exori && ehFisico) ? "hit-area"
                    : (raca ? raca.fx
                       : (ELEMENTS[visualElement] || ELEMENTS.physical).fx));
        // Impacto só no lead do combo; addEffect ainda dedupe por
        // fx+alvo na janela curta (party online com ts espaçado).
        if (isComboLead) {
          const fxComboKey = e.targetId
            ? ("fx|" + (hitFx || "draw-blood") + "|" + String(e.targetId))
            : null;
          r.addEffect(x, y, hitFx || "draw-blood", undefined, undefined, fxComboKey);
        }
        // Crítico e Fatal permanecem pelo mesmo tempo. O conteúdo visível do
        // Critical Hit ocupa ~37px dentro do frame 64px, contra ~53px do
        // Onslaught; 1.45x iguala o tamanho percebido sem trocar a sprite.
        // AoE compartilhado: cada monstro hitado pelo proc ganha o FX (não
        // só o alvo primário). Dedupe por targetId evita dobro em arma dual.
        const fxKey = critFxKey(e);
        if (e.crit && !critFxShown.has(fxKey)) {
          critFxShown.add(fxKey);
          r.addEffect(x, y, "critical-hit-effect", 1200, 1.45);
        }
        // FATAL (Onslaught): sprite "FATAL!" importado do efeito oficial
        if (e.fatal && !fatalFxShown.has(fxKey)) {
          fatalFxShown.add(fxKey);
          r.addEffect(x, y - 0.10, "fatal-text", 1200, 1);
          const fdc = window.FORGE_DEBUG_COUNT || { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
          fdc.fatal = (fdc.fatal || 0) + 1;
          window.FORGE_DEBUG_COUNT = fdc;
        }
        break;
      }
      case "stance":
        // ativacao de stance: o sprite da postura explode no jogador
        r.addEffect(e.screen ? e.x : 0.13, e.screen ? e.y : 0.6, e.fx || "magic-blue");
        addLog("skill", `Stance ativada: <b>${e.nome}</b>`);
        break;
      case "stance-off":
        addLog("skill", `Stance desativada: <b>${e.nome}</b>`);
        break;
      case "manabuffer": {
        // Mana Buffer do 15.25: o golpe letal sai da mana em vez da vida
        const px = e.screen ? e.x : 0.13, py = e.screen ? e.y : 0.6;
        r.addFloater(px, py - 0.09, "-" + fmtFull(e.mana) + " mana", "#6a8aff");
        r.addFloater(px, py - 0.02, "mana buffer!", "#9ac0e8");
        r.addEffect(px, py, "magic-blue");
        r.playerFlash = 90;
        addLog("skill", `Mana Buffer absorveu <b>${fmtFull(e.vida)}</b> de dano por <b>${fmtFull(e.mana)}</b> mana.`);
        renderStats(G.p);
        break;
      }
      case "magic-shield-on": {
        const px = e.screen ? e.x : 0.13, py = e.screen ? e.y : 0.6;
        // 12.55+: mostra a capacidade do escudo (o "bônus" que o mage ganha
        // na mana) no cast
        r.addFloater(px, py - 0.10, e.cap ? "Magic Shield · ⚡" + fmt(e.cap) : "Magic Shield", "#7ec8ff");
        // O cast mantém o brilho azul oficial e adiciona o pulso roxo
        // persistente usado pelo OTC para diferenciar o Mana Shield.
        r.addEffect(px, py, "magic-blue");
        r.addEffect(px, py, "purple-energy", 800);
        break;
      }
      case "magic-shield": {
        const px = e.screen ? (e.x || 0.13) : 0.13, py = e.screen ? (e.y || 0.6) : 0.6;
        // Energy Ring (clássico): drena mana do personagem. utamo vita
        // (12.55+): drena a POOL do escudo — mostra o restante.
        if (e.source === "Magic Shield" && e.pool !== undefined) {
          // Absorção do Utamo Vita: número puro roxo, sem texto extra.
          r.addFloater(px, py - 0.10, "-" + fmtFull(e.mana), "#a64dff");
        } else {
          r.addFloater(px, py - 0.10, "-" + fmtFull(e.mana) + " mana", "#6a8aff");
        }
        r.addEffect(px, py, "magic-blue");
        // escudo quebrou (pool zerou): aviso
        if (e.source === "Magic Shield" && e.pool === 0) {
          addLog("death", "<b style='color:#7ec8ff'>Magic Shield</b> quebrou — a capacidade esgotou.");
        }
        break;
      }
      case "mana-wisp": {
        // as wands/rods do 15.25 devolvem mana a cada ataque
        const px = e.screen ? e.x : 0.13, py = e.screen ? e.y : 0.6;
        if (e.amount > 0)
          r.addFloater(px + 0.03, py - 0.14, "+" + fmtFull(e.amount), "#168cff", false, true, "restore");
        r.addEffect(px, py, "mana-wisp");
        break;
      }
      case "miss": {
        // Ruse (armor): evitou completamente um ataque.
        // Os floaters sobem NO SQM da entidade (player ou mob alvo) — a
        // posição vem do evento; o pequeno offset em y coloca o texto
        // sobre a cabeça, como os demais números.
        const mx = ex(e), my = ey(e) - 0.06;
        if (e.ruse) {
          r.addEffect(mx, ey(e), "ruse-effect", 1000);
          const fdc = window.FORGE_DEBUG_COUNT || { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
          fdc.ruse = (fdc.ruse || 0) + 1;
          window.FORGE_DEBUG_COUNT = fdc;
        } else {
          // CONST_ME_POFF: sem o sprite, só o texto "errou" aparecia.
          if (e.projectile && r.addProjectile)
            r.addProjectile(e.sx || (c.player ? c.player.x : mx), e.sy || (c.player ? c.player.y : my),
                            mx, ey(e), "#a0a0a0", e.missile);
          r.addEffect(mx, ey(e), e.fx || "poff");
          r.addFloater(mx, my, "errou", "#a0a0a0");
        }
        break;
      }
      case "dust": {
        const px = e.screen ? (e.x || 0.13) : (c.player ? c.player.x : 0.13);
        const py = e.screen ? ((e.y || 0.5) - 0.12) : (c.player ? c.player.y - 0.12 : 0.5);
        const dustN = Number(e.dust) || 0;
        if (dustN > 0) r.addFloater(px, py, "+" + fmtDmg(dustN) + " dust", e.fiendish ? "#c78cff" : "#66c7ff");
        if (e.slivers) r.addFloater(px + 0.03, py + 0.04, "+" + fmtDmg(e.slivers) + " slivers", "#ffe680");
        if (e.overflow) addLog("info", `Dust no limite: <b>${fmtFull(e.overflow)}</b> perdido.`);
        break;
      }
      case "range":
        // "fora de alcance" saía solto no meio da tela (a fórmula antiga
        // de posição deslocava tudo para a direita). Removido: a falha de
        // alcance fica só no log, sem poluir a cena.
        break;
      case "taken": {
        // Mitigação total online às vezes chega como taken dmg=0 (em vez de
        // block). Sem dano e sem condition → trata como bloqueio (block-hit).
        const takenDmg = Number(e.dmg) || 0;
        if (takenDmg <= 0 && !e.condition) {
          const bx = ex(e), by = ey(e);
          if (e.projectile && r.addProjectile)
            r.addProjectile(e.sx, e.sy, bx, by, "#9ac0e8", e.missile);
          r.addEffect(bx, by, e.fx || "block-hit");
          r.addFloater(bx, by - 0.07, "bloqueou", "#9ac0e8");
          break;
        }
        // O dano físico RECEBIDO por player usa sangue vermelho no client.
        // A cor cinza é exclusiva de físico sem sangue (pedra/constructos).
        const col = e.el === "physical" || !e.el
          ? "#ff6b6b" : (ELEMENTS[e.el] || ELEMENTS.physical).color;
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx, e.sy, e.x, e.y, col, e.missile);
        const shownTaken=visualAmount(e,takenDmg);
        if(shownTaken>0)r.addFloater(e.screen ? e.x : 0.13, e.screen ? e.y - 0.07 : 0.55, "-" + fmtDmg(shownTaken), col, false, true, "damage");
        // e.fx = COMBAT_PARAM_EFFECT da habilidade do monstro (fire-area do
        // demon, mort area do lich...) — sem, cai o generico do elemento
        r.addEffect(e.screen ? e.x : 0.13, e.screen ? e.y : 0.6,
                    e.fx || (ELEMENTS[e.el] || ELEMENTS.physical).fx);
        r.playerFlash = 90;
        break;
      }
      case "mobheal": {
        // cura defensiva do proprio monstro (bloco defenses do .lua)
        const shownHeal=visualAmount(e,e.heal||0);
        if(shownHeal>0)r.addFloater(ex(e), ey(e) - 0.06, "+" + fmtFull(shownHeal), "#00e65a", false, true, "restore");
        r.addEffect(ex(e), ey(e), e.fx || "magic-green");
        break;
      }
      case "effect":
        // animacao pura (debuff de stat de monstro nao implementado como
        // mecanica — entra so o efeito oficial da habilidade)
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx, e.sy, ex(e), ey(e), "#ffffff", e.missile);
        r.addEffect(ex(e), ey(e), e.fx || "magic-blue");
        break;
      case "block": {
        const bx = ex(e), by = ey(e);
        if (e.projectile && r.addProjectile)
          r.addProjectile(e.sx, e.sy, bx, by, "#9ac0e8", e.missile);
        // CONST_ME_BLOCKHIT: o floater sozinho não basta — precisa do sprite.
        if (!e.magicShield) {
          r.addEffect(bx, by, e.fx || "block-hit");
          r.addFloater(bx, by - 0.07, "bloqueou", "#9ac0e8");
        }
        break;
      }
      case "heal-friend": {
        // HEAL FRIEND: cura aplicada em um aliado da party (exura sio /
        // gran sio / gran mas res). Mostra o +HP sobre o personagem.
        const px = e.screen ? e.x : (c.player ? c.player.x : 0.13);
        const py = e.screen ? e.y - 0.12 : (c.player ? c.player.y - 0.12 : 0.5);
        const shownHeal=visualAmount(e,e.amount||0);
        if(shownHeal>0)r.addFloater(px, py, "+" + fmtFull(shownHeal), "#00e65a", false, true, "restore");
        r.addEffect(px, e.screen ? e.y : (c.player ? c.player.y : 0.6), e.mass ? "magic-green" : "green-rings");
        // Critical Heal do Druid (10% base): efeito azul oficial em cima
        // do personagem que casta + texto CRITICAL!
        if (e.crit) {
          r.addFloater(px, py - 0.16, "CRITICAL!", "#7ec8ff");
          r.addEffect(px, e.screen ? e.y : (c.player ? c.player.y : 0.6), "critical-heal-effect", 800);
        }
        // A fala (exura sio "Nome") vem no evento `say` do caster, como no
        // Canary. Não repetir as palavras sobre o aliado curado.
        if (e.mass) addLog("party", `<b style="color:#9ce84a">Mass Healing</b> curou <b>${e.target}</b> (+${fmtFull(e.amount)} hp)`);
        else addLog("party", `Curou <b>${e.target}</b> com ${e.spell} (+${fmtFull(e.amount)} hp)`);
        break;
      }
      case "heal": {
        const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
        const py = e.y !== undefined ? e.y : (c.player ? c.player.y - 0.12 : 0.5);
        const shownHeal=visualAmount(e,e.amount||0);
        if(shownHeal>0)r.addFloater(px, py, "+" + fmtFull(shownHeal), "#00e65a", false, true, "restore");
        // Critical Heal (Vocation Adjustments 2026): SOMENTE a animação AZUL
        // oficial (critical-heal-effect) em cima do personagem que casta.
        // O vermelho é exclusivo do dano crítico em monstros.
        if (e.crit) {
          r.addEffect(px, py, "critical-heal-effect", 800);
        }
        // potion de spirit tambem restaura mana no mesmo gole
        if (e.mana) r.addFloater(px + 0.03, py + 0.04, "+" + fmtFull(e.mana), "#168cff", false, true, "restore");
        r.addEffect(px, c.player ? c.player.y : 0.6, "green-rings");
        // a potion correspondente brilha no Helper
        if (e.supply && typeof helperSupplyFlash === "function")
          helperSupplyFlash(e.supply, "heal");
        break;
      }
      case "mana": {
        const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
        const py = e.y !== undefined ? e.y : (c.player ? c.player.y - 0.12 : 0.5);
        r.addFloater(px, py, "+" + fmtFull(e.amount), "#168cff", false, true, "restore");
        // spirit potion bebida como mana tambem mostra a cura
        if (e.heal) r.addFloater(px + 0.03, py + 0.04, "+" + fmtFull(e.heal), "#00e65a", false, true, "restore");
        // faisca azul do gole de mana (como o CONST_ME_MAGIC_BLUE do client)
        r.addEffect(px, c.player ? c.player.y : 0.6, "magic-blue");
        if (e.supply && typeof helperSupplyFlash === "function")
          helperSupplyFlash(e.supply, "mana");
        break;
      }
      case "supply-buy":
        addLog("sell", `Carga de <b>${e.name}</b> comprada no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderSupplies(G.p);
        break;
      case "ammo-buy":
        addLog("sell", `Comprou 1x <b>${e.name}</b> no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderEquip(G.p);
        renderRefill(G.p);
        break;
      case "no-ammo":
        addLog("death", `Sem quiver/munição válida/gold para usar <b>${e.name}</b>: o ataque à distância falhou.`);
        renderEquip(G.p);
        renderRefill(G.p);
        break;
      case "bag-full":
        addLog("death", "Mochila cheia: loot no chão foi ignorado.");
        toast("Mochila cheia", "death");
        break;
      case "raid-real-player":
        addLog("death", "Raid PvP reservado para jogador real online — nenhum NPC fake foi criado.");
        break;
      case "cast":
        r.addEffect(e.screen ? e.x : 0.3, e.screen ? e.y : 0.5, e.area ? "explosion-area" : "magic-blue");
        break;
      case "break": {
        const nome = e.name || e.item || "item";
        addLog("info", `<b style="color:#ff9090">${nome}</b> quebrou (cargas esgotadas).`);
        if (typeof renderEquip === "function") renderEquip(G.p);
        if (typeof refreshEquipChargeOverlays === "function") refreshEquipChargeOverlays(G.p);
        break;
      }
      case "player-condition": {
        const d = CONDITIONS[e.tipo];
        if (d) addLog("death", `Você está <b style="color:${d.cor}">${d.nome}</b>!`);
        renderStats(G.p);
        if (typeof renderStatusBar === "function") renderStatusBar(G.p);
        if (typeof renderPlayerStates === "function") renderPlayerStates(G.p);
        break;
      }
      case "condition": {
        // Condition ticking (poison/fire/bleed/energy/cursed) do servidor
        const px = e.screen ? e.x : 0.13, py = e.screen ? e.y : 0.6;
        const tipo = e.condition || e.tipo || e.el || "physical";
        const d = typeof CONDITIONS !== "undefined" && (CONDITIONS[tipo] || CONDITIONS[e.el]);
        const el = (d && d.el) || e.el || "physical";
        const col = (typeof ELEMENTS !== "undefined" && ELEMENTS[el]) ? ELEMENTS[el].color : "#ff6b6b";
        if (e.dmg > 0) r.addFloater(px, py - 0.07, "-" + fmtDmg(e.dmg), col, false, true, "damage");
        r.addEffect(px, py, (d && d.fx) || (typeof ELEMENTS !== "undefined" && ELEMENTS[el] && ELEMENTS[el].fx) || "draw-blood");
        if (d) addLog("death", `<b style="color:${d.cor}">${d.nome}</b> causou <b>${e.dmg}</b> de dano.`);
        renderStats(G.p);
        break;
      }
      case "buff": {
        // Forge buffs (Momentum/Transcendence/Onslaught/Ruse) do servidor
        const px = e.screen ? e.x : 0.13, py = e.screen ? e.y : 0.6;
        r.addFloater(px, py - 0.10, e.nome + "!", "#ffe680", true);
        r.addEffect(px, py, "magic-blue");
        addLog("skill", `<b>${e.nome}</b> ativado!`);
        break;
      }
      case "cured":
        addLog("skill", `Curou <b>${e.nome}</b>.`);
        renderStats(G.p);
        break;
      case "challenge-target": {
        r.addEffect(e.x, e.y, e.amp ? "chivalrous-challenge" : "challenge-effect");
        // Online: a animação vinha no evento, mas o alvo/melee ficavam só no
        // motor do servidor. Aplica na hora para a IA visual colar no knight.
        const mob = e.targetId && c.mobs
          ? c.mobs.find((m) => m && String(m.id) === String(e.targetId))
          : null;
        if (mob) {
          const until = Date.now() + 10000;
          mob.challengedUntil = until;
          if (e.whoId) {
            mob.challengeTargetId = String(e.whoId);
            mob.targetId = String(e.whoId);
            const knight = (c.players || []).find((ent) =>
              String(ent && (ent.id || (ent.p && ent.p.id))) === String(e.whoId) &&
              ent.p && ent.p.hp > 0);
            if (knight) mob.target = knight;
          }
          if (e.amp) mob.forceMeleeUntil = until;
        }
        break;
      }
      case "challenge": {
        // Exeta (Challenge / Chivalrous Challenge) do Knight: monstros
        // marcados focam o knight e causam 20% menos dano por 10s.
        const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
        const py = e.y !== undefined ? e.y : (c.player ? c.player.y : 0.6);
        const ehAmp = e.id === "exeta-amp-res" || /chivalrous/i.test(e.spell || "");
        // Exeta Amp Res: animação oficial (CONST_ME_CHIVALRIOUS_CHALLENGE,
        // anel de energia roxo/azul do DAT 15.x). Exeta Res: magic blue do
        // challenge.lua do Canary.
        if (!ehAmp) r.addEffect(px, py, "challenge-effect");
        addLog("party", `<b style="color:#ffd65a">${e.spell || "Challenge"}</b> marcou <b>${e.count}</b> inimigo(s) — dano deles reduzido 20%`);
        break;
      }
      case "buff": {
        addLog("skill", `Buff ativo: <b>${e.nome}</b>`);
        // Momentum (helmet): redução de cooldowns
        if (e.nome === "Momentum") {
          const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
          const py = e.y !== undefined ? e.y : (c.player ? c.player.y : 0.6);
          r.addEffect(px, py, "momentum-effect", 1000);
          const fdc = window.FORGE_DEBUG_COUNT || { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
          fdc.momentum = (fdc.momentum || 0) + 1;
          window.FORGE_DEBUG_COUNT = fdc;
        } else if (e.nome === "Transcendence") {
          const px = e.x !== undefined ? e.x : (c.player ? c.player.x : 0.13);
          const py = e.y !== undefined ? e.y : (c.player ? c.player.y : 0.6);
          r.addFloater(px, py - 0.18, "AVATAR!", "#d79cff");
          const avatarFx = (typeof CLIENT_EFFECTS !== "undefined" && CLIENT_EFFECTS["avatar-effect"])
            ? "avatar-effect" : "magic-blue";
          r.addEffect(px, py, avatarFx, 1100);
          const fdc = window.FORGE_DEBUG_COUNT || { fatal: 0, momentum: 0, ruse: 0, transcendence: 0 };
          fdc.transcendence = (fdc.transcendence || 0) + 1;
          window.FORGE_DEBUG_COUNT = fdc;
        }
        break;
      }
      case "poisoned":
        r.addEffect(ex(e), ey(e), "hit-by-poison");
        addLog("info", `<b>${e.name}</b> foi envenenado.`);
        break;
      case "burst":
        // a runa de area usa o proprio efeito (ice area na avalanche, fire
        // area na great fireball); a burst arrow continua na explosao
        r.addEffect(ex(e), ey(e), e.fx || "explosion-area");
        break;
      case "areafx": {
        // pinta o efeito em TODAS as casas cobertas pela matriz, nao so onde
        // havia monstro. Sem isso a magia de area parecia acertar um alvo so.
        // Células absolutas (cx/cy) → centro exato do SQM via cellToScreen.
        // NÃO reancorar no caster quando o alvo sumiu: isso pintava exevo dir
        // san / barrage inteiro no SQM do jogador. AoE do Tibia fica no tile
        // do cast, não segue interpolação do alvo.
        const gw=Number(c&&c.gridW)||(typeof GRID_W!=="undefined"?GRID_W:21);
        const gh=Number(c&&c.gridH)||(typeof GRID_H!=="undefined"?GRID_H:13);
        for (const cel of (e.cells || [])) {
          let pos=null;
          if (cel&&Number.isFinite(Number(cel.cx))&&Number.isFinite(Number(cel.cy))
              && typeof cellToScreen==="function") {
            pos=cellToScreen(Number(cel.cx), Number(cel.cy), gw, gh);
          } else if (cel&&cel.x!=null&&cel.y!=null) {
            pos={x:Number(cel.x),y:Number(cel.y)};
          }
          if (!pos) continue;
          r.addEffect(pos.x, pos.y, e.fx || "explosion-area");
        }
        break;
      }
      case "chain": {
        // Elos da corrente: impacto/faisca em CADA salto (nao so no primario).
        // SQMs vazios entre hops: areafx com chainPath (Bresenham + stagger);
        // o contrato autoritativo tambem manda e.path no evento chain.
        const hops = Array.isArray(e.links) && e.links.length ? e.links : null;
        if (hops) {
          const idOf = (ent) => String(ent && (ent.id !== undefined ? ent.id : (ent.p && ent.p.id)) || "");
          for (const link of hops) {
            const live = link && link.id != null && c && Array.isArray(c.mobs)
              ? c.mobs.find((m) => idOf(m) === String(link.id)) : null;
            const x = live && live.x != null ? live.x : (link && link.x != null ? link.x : ex(e));
            const y = live && live.y != null ? live.y : (link && link.y != null ? link.y : ey(e));
            r.addEffect(x, y, e.impactFx || e.fx || "white-energy-spark");
            if (e.chainFx && e.chainFx !== (e.impactFx || e.fx)) {
              r.addEffect(x, y, e.chainFx);
            }
          }
        } else {
          r.addEffect(ex(e), ey(e), e.fx || "white-energy-spark");
        }
        if (e.n > 1) addLog("info", `Corrente atingiu <b>${e.n}</b> alvos.`);
        break;
      }
      case "say": {
        // TALKTYPE_SPELL: palavras no caster, visíveis para toda a party.
        // Potion/comida ("Aaaah...", Munch.) não são magia — não desenhar.
        // Cada evento = um bubble separado (nunca concatenar "exori gran" +
        // "exevo mas san" no mesmo texto).
        const text = String(e.text || "").replace(/\s+/g, " ").trim();
        if (!text || e.supply || /^(Aaaah|Aahhh|Munch)\b/i.test(text)) break;
        // Dedup só com authTs (replay online). Local não tem authTs e não
        // deve perder re-casts legítimos da mesma magia.
        const authTs = Number(e.authTs);
        if (Number.isFinite(authTs)) {
          const sayFinger = "say|" + String(e.whoId || "") + "|" + text + "|" +
            String(Math.floor(authTs / 50));
          const seenSay = (typeof G !== "undefined" && G)
            ? (G._saySeen || (G._saySeen = new Map())) : null;
          if (seenSay) {
            const prev = seenSay.get(sayFinger) || 0;
            if (prev && (now - prev) < 2500) break;
            seenSay.set(sayFinger, now);
            if (seenSay.size > 80) {
              for (const [k, t0] of seenSay) if (now - t0 > 4000) seenSay.delete(k);
            }
          }
        }
        const idOf = (ent) => String(ent && (ent.id !== undefined ? ent.id : (ent.p && ent.p.id)) || "");
        const wanted = e.whoId !== undefined && e.whoId !== null ? String(e.whoId) : "";
        const saidor = wanted && c && Array.isArray(c.players)
          ? (c.players.find((x) => idOf(x) === wanted) || null) : null;
        const alvo = saidor || (!wanted && c && c.player) || null;
        const nome = (alvo && (alvo.name || (alvo.p && alvo.p.name))) || (G.p && G.p.name) || "";
        if (alvo && typeof creatureSay === "function") {
          creatureSay(alvo, text, TALK.SPELL);
          addLog("say", `<b>${nome}</b>: ${text}`);
        } else {
          r.addSpeech(text, "#ffe680");
          addLog("say", `<b>${nome}</b>: ${text}`);
        }
        break;
      }
      case "cap-drop": {
        // CAP cheia no servidor autoritativo — avisa sem spam a cada drop.
        const now = Date.now();
        if (!G._capDropToastAt || now - G._capDropToastAt > 2500) {
          G._capDropToastAt = now;
          const msg = (typeof capacityMessage === "function")
            ? capacityMessage()
            : ((typeof t === "function" && t("cap.full")) || e.msg || "You cannot carry more.");
          addLog("death", msg);
          if (typeof toast === "function") toast(msg, "bad");
          if (G.p && typeof renderEquip === "function") renderEquip(G.p);
        }
        break;
      }
      case "kill": {
        const x = ex(e), y = ey(e);
        r.addCorpse(x, y, e.mob);
        let shownExp=Number(e.exp)||0;
        if(Array.isArray(e.shares)&&G.p){
          const mine=e.shares.find((row)=>String(row&&row.id)===String(G.p.id));
          if(mine&&mine.exp!==undefined)shownExp=Number(mine.exp)||0;
        }else if(e.gained!==undefined&&e.gained!==null)shownExp=Number(e.gained)||0;
        r.addFloater(x, y - 0.06, "+" + fmtDmg(shownExp) + " xp", "#ffffff");
        r.addEffect(x, y, "poff");
        addLog("exp", `Matou <b>${e.name}</b> · <span style="color:#9ce84a">+${fmtFull(shownExp)} xp</span>`);
        if (e.loot && e.loot.length) {
          // v27 — pedido do dono: sem toast de "loot raro" (flutuante à
          // esquerda) e sem a mensagem verde que sobe na tela. O loot fica
          // apenas no log do painel (abaixo).
          const txt = e.loot.map((l) => {
            const it = GAMEDATA.items[l.item];
            const rare = it && (it.sell || 0) >= 500;
            const nm = `${l.count > 1 ? l.count + "x " : ""}${itemName(l.item)}`;
            return rare ? `<b style="color:#dab0ff">${nm}</b>` : nm;
          }).join(", ");
          addLog("loot", `Loot: ${txt}`);
        }
        // Bestiário/bosstiário: no modo local isto roda dentro de combatTick
        // (combat.js). No online, o evento kill é a única oportunidade de
        // contar o abate para a Cyclopedia.
        if (typeof bestiaryKill === "function") bestiaryKill(G.p, e.mob, 1);
        if (e.boss && typeof bosstiaryKill === "function") bosstiaryKill(G.p, e.mob, 1);
        // No online o snapshot já traz kills/totalKills/bossState. Somar de
        // novo no drain duplicava o bosstiário e as tasks.
        const onlineAuth=typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat();
        if (!onlineAuth) {
          G.p.totalKills = (G.p.totalKills || 0) + 1;
          G.p.kills = G.p.kills || {};
          G.p.kills[e.mob] = (G.p.kills[e.mob] || 0) + 1;
        }
        if (c.boss) {
          const isWorldBoss = !!(c.worldBoss || c.boss.worldBoss);
          if (!onlineAuth && !isWorldBoss) {
            const st = bossState(G.p, c.boss.id);
            st.kills = (st.kills || 0) + 1;
          }
          // World Boss: toast único vem de world-boss-ui (wbExitCombat).
          if (!isWorldBoss) {
            addLog("level", `Boss <b>${c.boss.name}</b> derrotado!`);
            toast(`Boss derrotado: <b>${c.boss.name}</b>`, "level");
            renderBosses(G.p);
            setTimeout(() => {
              if (G.combat === c && c.bossDefeated) stopHunt();
            }, 2500);
          }
        } else {
          handleMissionKill(G.p, c.huntId, e.mob);
        }
        break;
      }
      case "death": {
        const xp=e.exp?` Perdeu <b>${fmtFull(e.exp)} XP</b> (${Math.round((e.rate||0)*100)}% PVP).`:" Nenhuma experiência foi perdida.";
        addLog("death",`Você morreu e perdeu a bless.${xp}`);
        toast("Você morreu — bless perdida!", "death");
        break;
      }

      case "spawn-blink": {
        // Piscada do teleporte no ponto de respawn (o monstro ainda nao
        // nasceu): o efeito oficial de teleporte toca na celula.
        const px = (e.x !== undefined && e.x !== null) ? e.x : 0.5;
        const py = (e.y !== undefined && e.y !== null) ? e.y : 0.5;
        r.addEffect(px, py, "teleport", 240);
        break;
      }
      case "spawn": {
        // Monstro terminou de nascer: um estouro leve marca o momento.
        const px = (e.x !== undefined && e.x !== null) ? e.x : 0.5;
        const py = (e.y !== undefined && e.y !== null) ? e.y : 0.5;
        r.addEffect(px, py, "poff", 300);
        break;
      }

    }
  }
  // Modo online: c.events agora contém apenas os eventos pendentes (ts no
  // futuro). Eles serão processados nos próximos frames quando ts passar.
  // Modo local: c.events foi esvaziado pela filtragem (todos sem ts = ready).
}

function regenInCity(p, dt) {
  const max = maxStats(p);
  if (typeof CanaryVocation !== "undefined" && CanaryVocation.applyVocationRegenTo) {
    G.cityRegen = G.cityRegen || {};
    const key = String((p && (p.id || p.name)) || "local");
    const holder = G.cityRegen[key] || (G.cityRegen[key] = { vocRegenAcc: { hp: 0, mp: 0 } });
    CanaryVocation.applyVocationRegenTo(holder, p, dt, max);
    return;
  }
  const g = gearStats(p);
  const rr = regenRate(p.voc, g.hpreg > 0);
  G.cityRegenHp += dt;
  G.cityRegenMp += dt;
  const hpEvery = Math.max(1000, (rr.hp * 1000) / (1 + g.hpreg * 0.4));
  const mpEvery = Math.max(800, (rr.mp * 1000) / (1 + g.mpreg * 0.4));
  while (G.cityRegenHp >= hpEvery) {
    G.cityRegenHp -= hpEvery;
    p.hp = Math.min(max.hp, p.hp + 1);
  }
  while (G.cityRegenMp >= mpEvery) {
    G.cityRegenMp -= mpEvery;
    p.mp = Math.min(max.mp, p.mp + 2);
  }
}

function tickManaTrain(p, dt) {
  G.manaTrainAcc += dt;
  if (G.manaTrainAcc < 1000) return;
  G.manaTrainAcc = 0;
  const r = runManaTrainTick(p);
  if (!r) return;
  if (r.stopped) {
    toast(r.msg);
    addLog("skill", `Mana train pausado: ${r.msg}`);
    return;
  }
  addLog("skill", `Mana train criou <b>${r.product}</b> usando ${fmtFull(r.recipe.mana)} mana.`);
  if (r.mlUp > 0) toast(`Magic Level +${r.mlUp}!`, "level");
  renderSkills(p);
  renderInventory(p);
  renderSupplies(p);
  renderEquip(p);
  if (G.activeNpc === "trainer" && $("#modal").classList.contains("show"))
    refreshNpc("trainer");
}

function drainAcademyEvents() {
  const t = G.training;
  if (!t) return;
  const r = G.renderer;
  for (const e of t.events) {
    const kind = e.type || e.t;
    switch (kind) {
      case "hit":
        if (e.mode === "dummy") {
          // Exercise Dummy: NÃO leva dano, apenas registra o tick de skill.
          // Sem floater de dano, sem efeito de impacto no dummy.
          // Com mapa .otbm, as posições vêm do training; sem mapa usa a baia fixa.
          const dp = t.dummyPos || { x: 0.70, y: 0.60 };
          r.addFloater(dp.x - 0.02, dp.y - 0.16, "+tick " + (SKILL_NAMES[e.skill] || e.skill), "#9ce84a", e.skillUp);
          renderSkills(G.p);
          renderStats(G.p);
          renderTopbar(G.p);
          if (e.skillUp) addLog("skill", `<b>${SKILL_NAMES[e.skill] || e.skill}</b> subiu no Exercise Dummy.`);
          if (e.shieldUp) addLog("skill", "<b>Shielding</b> subiu no Exercise Dummy.");
        } else {
          if (e.dmg > 0) r.addFloater(0.70, 0.45, "-" + fmtDmg(e.dmg), "#d8d8d8", e.dmg > 80);
          r.addFloater(0.68, 0.38, "+tick " + (SKILL_NAMES[e.skill] || e.skill), "#9ce84a", e.skillUp);
          r.addEffect(0.68, 0.58, e.skill === "magic" ? "magic-blue" : "block-hit");
          // O Treiner revida para gerar shielding: explosão de fogo visual no player.
          r.addEffect(0.28, 0.60, "fire-area");
          r.addFloater(0.28, 0.48, "treiner hit", "#ff8a3c");
          renderSkills(G.p);
          renderStats(G.p);
          renderTopbar(G.p);
          if (e.skillUp) addLog("skill", `<b>${SKILL_NAMES[e.skill] || e.skill}</b> subiu batendo no Treiner.`);
          if (e.shieldUp) addLog("skill", "<b>Shielding</b> subiu treinando no Treiner.");
        }
        break;
      case "msg":
        addLog("info", e.msg);
        break;
      case "conjure":
        addLog("info", `Auto-conjure: <b>${e.msg}</b>`);
        if (e.mlUp) addLog("skill", "<b>Magic Level</b> subiu conjurando.");
        renderEquip(G.p);
        renderSupplies(G.p);
        renderRefill(G.p);
        break;
      case "ammo-buy":
        addLog("sell", `Comprou 1x <b>${e.name}</b> no uso por <span class="gold-txt">${fmtFull(e.cost)} gp</span>`);
        renderEquip(G.p);
        renderRefill(G.p);
        break;
      case "no-ammo":
        addLog("death", `Sem quiver/munição válida/gold para treinar com <b>${e.name}</b>.`);
        renderEquip(G.p);
        renderRefill(G.p);
        break;
    }
  }
  t.events.length = 0;
}

/* ------------------------------------------------------------ continuidade idle */
function reviveDownedParty(c,now,silent){
  if(!c||c.dead||!c.players||c.players.length<2)return 0;
  // Se todos caíram, a instância termina; ninguém pode ressuscitar antes da
  // verificação de wipe.
  if(c.players.every((ent)=>!ent.p||ent.p.hp<=0))return 0;
  let revived=0;
  for(const ent of c.players){
    if(ent.p && ent.p.hp<=0 && !ent.permadead && ent.reviveAt && now>=ent.reviveAt){
      const mx=maxStats(ent.p);ent.p.hp=mx.hp;ent.p.mp=mx.mp;
      if(ent.deathPos){
        ent.x=ent.deathPos.x;ent.y=ent.deathPos.y;ent.dir=ent.deathPos.dir||"e";
        ent.cx=undefined;ent.cy=undefined;if(typeof ensureCell==="function")ensureCell(ent);
      }
      ent.reviveAt=0;ent.downedAt=0;ent.deathPos=null;ent.moving=false;revived++;
      if(!silent&&typeof addLog==="function")addLog("party",`<b style="color:#9ce84a">${ent.name}</b> renasceu no local da morte.`);
      if(!silent&&typeof saveCharacterToRoster==="function")saveCharacterToRoster(ent.p);
    }
  }
  return revived;
}

function idleInstanceEndReason(c,now){
  if(!c)return null;now=now||Date.now();
  const members=combatSessionParticipants(c);
  if(members.some((ent)=>ent.p&&Number(ent.p.stamina)<=0))return "stamina";
  // O corpse/countdown permanece visível até deadUntil. Só então a party
  // compra as bênçãos e retorna à hunt ou é enviada ao templo.
  if(c.dead)return now>=(c.deadUntil||0)?"party-wipe":null;
  if(members.length&&members.every((ent)=>!ent.p||ent.p.hp<=0))return "party-wipe";
  return null;
}

function partyWipeBlessCost(c){
  return combatSessionParticipants(c).reduce((sum,ent)=>sum+(
    typeof blessingPriceForLevel==="function"?blessingPriceForLevel(ent.p&&ent.p.level):
      Math.max(1,(ent.p&&ent.p.level)||1)*1000),0);
}

function partyWipeBlessByPlayer(c){
  const out={};
  for(const ent of combatSessionParticipants(c)){
    if(!ent||!ent.p)continue;
    const id=String(ent.id!=null?ent.id:(ent.p.id!=null?ent.p.id:"player"));
    const price=typeof blessingPriceForLevel==="function"?blessingPriceForLevel(ent.p.level):
      Math.max(1,(ent.p.level)||1)*1000;
    out[id]=(Number(out[id])||0)+price;
  }
  return out;
}

function cleanupEncounterState(c){
  if(typeof scarlettBossCleanup==="function")scarlettBossCleanup(c);
  if(typeof greedBossCleanup==="function")greedBossCleanup(c);
  if(typeof hatredBossCleanup==="function")hatredBossCleanup(c);
  if(typeof spiteBossCleanup==="function")spiteBossCleanup(c);
  if(typeof maliceBossCleanup==="function")maliceBossCleanup(c);
  if(typeof megaBossCleanup==="function")megaBossCleanup(c);
}

/* Compra automaticamente a bless de todos e recria a mesma instância.
 * Retorna false sem descontar nada quando o saldo não cobre a party toda. */
function returnPartyToInstanceAfterWipe(c,cost,silent){
  const members=combatSessionParticipants(c),activeId=G.p&&G.p.id;
  if(!members.length||!G.p||G.p.gold<cost||!spendGold(G.p,cost))return false;
  const blessByPlayer=partyWipeBlessByPlayer(c);
  const prevDeathTrack=c.stats&&c.stats.deathTrack?c.stats.deathTrack:null;
  const prevDeaths=c.stats?Number(c.stats.deaths)||0:0;
  const prevBless=c.stats?Number(c.stats.blessCost)||0:0;
  const fullBless=typeof vipFullBless==="function"&&vipFullBless();
  for(const ent of members){
    if(!ent.p)continue;const mx=maxStats(ent.p);ent.p.hp=mx.hp;ent.p.mp=mx.mp;
    ent.p.blessed=fullBless?7:true;ent.reviveAt=0;ent.downedAt=0;ent.deathPos=null;
    ent.permadead=false;ent.moving=false;
    if(typeof saveCharacterToRoster==="function")saveCharacterToRoster(ent.p);
  }
  const leader=(members[0]&&members[0].p)||G.p;
  const huntId=c.huntId,mode=c.instanceMode||"non-pvp",boss=c.boss||null;
  cleanupEncounterState(c);leader.hunt=boss?null:huntId;leader.instanceMode=boss?"boss":mode;G.p=leader;
  const next=boss?newBossCombat(leader,boss):newCombat(leader,huntId,mode);
  if(!boss)spawnWave(next,leader);
  /* Mantém mortes/bless da sessão ao recriar a instância após o wipe. */
  if(next&&next.stats){
    next.stats.deaths=prevDeaths;
    next.stats.blessCost=prevBless;
    if(prevDeathTrack&&typeof prevDeathTrack==="object"){
      next.stats.deathTrack={
        startedAt:Number(prevDeathTrack.startedAt)||Date.now(),
        byPlayer:Object.assign({},prevDeathTrack.byPlayer||{}),
      };
      for(const id of Object.keys(next.stats.deathTrack.byPlayer)){
        const src=prevDeathTrack.byPlayer[id];
        if(src&&typeof src==="object")next.stats.deathTrack.byPlayer[id]=Object.assign({},src);
      }
    }
    if(typeof recordCombatSessionBless==="function")recordCombatSessionBless(next,blessByPlayer);
  }
  G.combat=next;G.inCity=false;
  if(next.players&&activeId){
    const active=next.players.find(ent=>String(ent.id)===String(activeId));
    if(active&&active.p){next.player=active;G.p=active.p;}
  }
  try{if(G.p&&G.p.id)localStorage.setItem(ACTIVE_CHARACTER_KEY,String(G.p.id));}catch(e){}
  if(typeof persistActiveInstance==="function")persistActiveInstance();
  if(typeof save==="function")save();
  if(!silent&&typeof addLog==="function")addLog("info",`Party reviveu com bless por <b>${fmtFull(cost)} gp</b> e retornou à instância.`);
  if(!silent&&typeof toast==="function")toast("Party abençoada — retornando à hunt!","level");
  if(!silent&&typeof renderAll==="function")renderAll();
  return true;
}

function finishIdleInstance(reason,silent){
  const c=G.combat;if(!c||c.instanceFinished)return false;
  if(reason==="party-wipe"){
    // Boss wipe nunca compra bless/retorna à sala — falha e templo.
    if(!c.boss){
      const cost=partyWipeBlessCost(c);
      if(returnPartyToInstanceAfterWipe(c,cost,silent))return true;
      if(!silent&&typeof addLog==="function")addLog("death",`Party sem ${fmtFull(cost)} gp para as bênçãos — retorno ao templo.`);
    }else if(!silent&&typeof addLog==="function"){
      addLog("death","Party wipe no boss — retorno ao templo.");
    }
  }
  c.instanceFinished=true;clearInstanceSession(reason||"finished");
  if(reason==="stamina"&&!silent&&typeof addLog==="function")
    addLog("death","A stamina de um membro acabou. A instância foi encerrada.");
  // O templo é checkpoint seguro e regenera toda a party, sem devolver bless.
  stopHunt(!!silent);save();return true;
}

/* Avança combate por relógio real. É usado pelo timer de aba oculta e pelo
 * catch-up de um navegador reaberto. Movimento também é simulado — apenas
 * chamar combatTick deixava melee parado fora do alcance. */
function advanceIdleInstance(elapsed,startAt,options){
  options=options||{};elapsed=Math.max(0,Number(elapsed)||0);
  if(!G.combat||!G.p||!elapsed)return {processed:0,ended:false,reason:null};
  // Online: o servidor já avançou (tick/bg). Catch-up local re-simulava kills
  // e empilhava loot na pouch (analyser/log certos, qty inflada).
  if(typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat())
    return {processed:0,ended:false,reason:null};
  const maxSteps=250000;
  const step=options.step||Math.max(TICK,Math.ceil(elapsed/maxSteps/TICK)*TICK);
  let remaining=elapsed,cursor=Number(startAt)||Date.now()-elapsed,processed=0,reason=null;
  G._idleCatchup=true;G._silentCombat=!!options.silent;
  try{
    while(G.combat&&remaining>=step){
      cursor+=step;
      combatTick(G.combat,G.p,step,cursor);
      if(typeof updateGridMovement==="function")updateGridMovement(G.combat,G.p,step,cursor);
      else if(typeof updateCombatMovement==="function")updateCombatMovement(G.combat,G.p,step);
      remaining-=step;processed+=step;
      reason=idleInstanceEndReason(G.combat,cursor);
      if(reason)break;
      reviveDownedParty(G.combat,cursor,true);
      // Catch-up não renderiza floaters, mas o analyser precisa do total da sessão.
      if(typeof otcAnalyserIngestEvents==="function"&&G.combat.events&&G.combat.events.length){
        try{otcAnalyserIngestEvents(G.combat.events,G.combat);}catch(err){/* analyser opcional */}
      }
      G.combat.events.length=0;
    }
    if(G.combat){
      const members=combatSessionParticipants(G.combat);
      for(const ent of members){
        if(!ent.p)continue;ent.p.stamina=FULL_STAMINA_SECONDS;
        if(typeof tickAccessoryCharges==="function")tickAccessoryCharges(ent.p,processed);
        if(typeof imbTickAll==="function")imbTickAll(ent.p,processed);
      }
      if(typeof preyTick==="function")preyTick(G.p,processed);
      if(typeof otcAnalyserIngestEvents==="function"&&G.combat.events&&G.combat.events.length){
        try{otcAnalyserIngestEvents(G.combat.events,G.combat);}catch(err){/* analyser opcional */}
      }
      G.combat.events.length=0;
    }
  }finally{G._idleCatchup=false;G._silentCombat=false;}
  if(reason)finishIdleInstance(reason,!!options.silent);
  return {processed,ended:!!reason,reason};
}

/* ------------------------------------------------------------ loop */
/* Quando a aba fica inativa, o browser pausa requestAnimationFrame.
 * Ao voltar, o delta (ts - G.last) seria enorme e o tickAcc engoliria
 * dezenas de ticks de uma vez, causando o "travamento" que o jogador
 * percebe. A solução: resetar o acumulador ao retomar a aba e ignorar
 * o frame gigante que o browser entrega na volta. */
let _wasHidden = false;
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    _wasHidden = true;G.bgLast = Date.now();G.bgAcc=0;
    if(G.combat)persistActiveInstance();
  } else {
    // Se o SO congelou os timers além do TTL, readquire antes do catch-up.
    // Só processa o intervalo oculto quando nenhuma outra aba assumiu o lease.
    if(typeof accountApiConfigured==="function"&&accountApiConfigured()&&
       typeof accountLeaseAllowsSimulation==="function"&&!accountLeaseAllowsSimulation()){
      const lease=typeof accountEnsureLease==="function"?await accountEnsureLease(sessionToken()):{ok:false};
      if(!lease.ok){const deniedAt=Date.now();G.bgLast=deniedAt;G.bgAcc=0;G.last=performance.now();G.tickAcc=0;_wasHidden=false;return;}
      // Durante um congelamento maior que o TTL, o worker pode ter avançado o
      // relógio remoto. Recarrega o snapshot antes de qualquer catch-up local.
      if(typeof accountLoadInstance==="function"){
        const remote=await accountLoadInstance(sessionToken());
        if(remote.ok&&remote.instance&&typeof resumeIdleInstance==="function"){
          await resumeIdleInstance(remote.instance);
          const resumedAt=Date.now();G.bgLast=resumedAt;G.bgAcc=0;G.last=performance.now();G.tickAcc=0;_wasHidden=false;return;
        }
        if(remote.ok&&remote.lastStatus==="ended"){
          clearInstanceSession("worker-ended",true);G.combat=null;G.inCity=true;
          if(G.p){G.p.hunt=null;G.p.instanceMode=null;}
        }
      }
    }
    // Timers podem ser totalmente congelados pelo navegador/SO. Reconcilia
    // aqui todo o intervalo ainda não processado antes de reativar o rAF.
    const agora=Date.now();
    if(G.combat&&G.bgLast){
      if(typeof onlineAuthorityCombat==="function"&&onlineAuthorityCombat()){
        // Não rode combatTick/rollLoot local — o tick autoritativo já creditou.
        if(typeof requestOnlineAuthorityTick==="function")requestOnlineAuthorityTick();
        G.bgAcc=0;
      }else{
        const elapsed=Math.max(0,agora-G.bgLast)+(G.bgAcc||0);
        const result=advanceIdleInstance(elapsed,G.bgLast-(G.bgAcc||0),{silent:true});
        G.bgAcc=Math.max(0,elapsed-result.processed);
        if(G.combat)persistActiveInstance();
      }
    }
    G.bgLast=agora;G.last=performance.now();G.tickAcc=0;_wasHidden=false;
  }
});

/* ------------------------------------------------------------ idle em bg
 * O jogo é IDLE: minimizar a aba ou trocar de janela NÃO pode pausar a
 * caçada. O browser congela requestAnimationFrame em abas ocultas, então
 * um setInterval (que continua rodando, mesmo throttled a ~1s) mantém a
 * simulação viva:
 *
 *   - combatTick roda com `now` AVANÇANDO tick a tick (se todos os ticks
 *     usassem o mesmo Date.now(), os cooldowns de skill nunca passariam e
 *     o bicho castaria a magia em todos os ticks de uma vez);
 *   - c.events é limpo a cada tick (sem render não há floaters/logs — o
 *     resultado aparece nos painéis ao voltar);
 *   - imbuement/prey/supplies/save continuam rodando para o personagem
 *     não morrer nem perder progresso.
 */
let _bgTimer = null;
// O núcleo autoritativo avança em passos de 200ms. Poll de 200ms entrega
// spells/ataques no mesmo ritmo; o disco JSON é gravado com debounce.
const ONLINE_AUTH_TICK_MS=200;
let ONLINE_AUTH_TICKING=false,ONLINE_AUTH_ACC=0,ONLINE_SESSION_INVALID=false;
let ONLINE_AUTH_APPLIED_VERSION=0,ONLINE_AUTH_APPLIED_INSTANCE="";
let SERVER_CONNECTION_ONLINE=true,SERVER_STATUS_BOUND=false;
function onlineAuthorityCombat(){
  // World Boss skeleton: combate local isolado — não misturar com tick/hunt online.
  if(G&&G.combat&&(G.combat.worldBoss||(G.combat.boss&&G.combat.boss.worldBoss)))return false;
  return !!(!ONLINE_SESSION_INVALID&&G&&G.combat&&typeof accountApiConfigured==="function"&&accountApiConfigured()&&
    typeof accountTickInstance==="function");
}
/* Entrada de hunt/boss ainda sem id ativo no servidor: o tombstone "ended"
 * da instância anterior NÃO pode chamar stopHunt (kick instantâneo). */
function combatInstanceEntryPending(){
  if(typeof accountInstanceCreating==="function"&&accountInstanceCreating())return true;
  const c=G&&G.combat;
  if(!c)return false;
  const started=Number(c.instanceStartedAt)||0;
  if(!started||(Date.now()-started)>12000)return false;
  return typeof accountInstanceActive!=="function"||!accountInstanceActive();
}
/* FX/fala/projéteis do canvas + speech nas entidades. Sem isso, reconnect
 * ou troca de hunt deixava areafx/palavras mágicas congelados na tela. */
function clearCombatVisualOverlays(combat){
  if(typeof G!=="undefined"&&G&&G.renderer&&typeof G.renderer.clearCombatVisuals==="function")
    G.renderer.clearCombatVisuals();
  if(typeof G!=="undefined"&&G)G._saySeen=new Map();
  const c=combat||(typeof G!=="undefined"&&G&&G.combat)||null;
  if(!c)return;
  c.events=[];
  const seen=new Set();
  const wipe=(ent)=>{
    if(!ent||seen.has(ent))return;
    seen.add(ent);
    ent.speech=[];
  };
  wipe(c.player);
  for(const ent of c.players||[])wipe(ent);
  for(const ent of c.mobs||[])wipe(ent);
  for(const sp of c.pendingSpawns||[])if(sp&&sp.mob)wipe(sp.mob);
}
function serverDisconnectCopy(reason){
  const why=reason||(typeof accountServerDisconnectReason==="function"?accountServerDisconnectReason():"");
  if(why==="maintenance"){
    return {
      title:typeof t==="function"?t("maint.title"):"Manutenção em breve",
      msg:typeof t==="function"?t("maint.msg"):
        "O servidor será desligado para atualização. Conecte-se novamente após o restart.",
      toast:typeof t==="function"?t("server.lostToast"):"SERVIDOR OFF. Use Reconnect quando a API voltar.",
    };
  }
  const restarted=why==="restart";
  if(restarted){
    return {
      title:typeof t==="function"?t("server.restartTitle"):"Servidor reiniciou",
      msg:typeof t==="function"?t("server.restartMsg"):
        "O servidor reiniciou. A caçada ficou pausada nesta aba — use Reconnect quando a API voltar.",
      toast:typeof t==="function"?t("server.restartToast"):
        "Servidor reiniciou. Use Reconnect para retomar.",
    };
  }
  if(why==="session"){
    return {
      title:typeof t==="function"?t("server.sessionTitle"):"Sessão online perdida",
      msg:typeof t==="function"?t("server.sessionMsg"):
        "O controle online expirou (restart ou sessão inválida). Use Reconnect; se falhar, entre novamente.",
      toast:typeof t==="function"?t("server.sessionToast"):
        "Sessão/lease inválidos. Use Reconnect.",
    };
  }
  return {
    title:typeof t==="function"?t("server.lostTitle"):"Conexão perdida",
    msg:typeof t==="function"?t("server.lostMsg"):
      "Servidor indisponível. A caçada permanece pausada nesta aba — use Reconnect quando a API voltar.",
    toast:typeof t==="function"?t("server.lostToast"):
      "SERVIDOR OFF. Use Reconnect quando a API voltar.",
  };
}
function setServerPowerBadge(powerOn){
  const badge=$("#server-power-badge");
  if(!badge)return;
  const on=!!powerOn;
  badge.classList.toggle("on",on);
  badge.classList.toggle("off",!on);
  const key=on?"server.on":"server.off";
  badge.setAttribute("data-i18n",key);
  badge.textContent=typeof t==="function"?t(key):(on?"SERVIDOR ON":"SERVIDOR OFF");
}
function setServerPowerStatus(powerOn){
  const box=$("#server-status"),text=$("#server-status-text");
  const on=!!powerOn;
  if(box){
    box.classList.toggle("power-on",on);
    box.classList.toggle("power-off",!on);
    // offline class = sessão/reconnect pendente; power-* = saúde da API
    box.classList.toggle("online",on&&SERVER_CONNECTION_ONLINE);
    box.classList.toggle("offline",!SERVER_CONNECTION_ONLINE||!on);
  }
  if(text){
    const key=on?"server.on":"server.off";
    text.setAttribute("data-i18n",key);
    text.textContent=typeof t==="function"?t(key):(on?"SERVIDOR ON":"SERVIDOR OFF");
  }
  setServerPowerBadge(on);
}
function setServerReconnectBanner(online,options){
  const banner=$("#server-reconnect-banner");
  if(!banner)return;
  const show=typeof accountApiConfigured==="function"&&accountApiConfigured()&&!online;
  banner.hidden=!show;
  if(!show){
    const err=$("#server-reconnect-error");
    if(err){err.hidden=true;err.textContent="";}
    return;
  }
  const copy=serverDisconnectCopy(options&&options.reason);
  const title=$("#server-reconnect-title"),msg=$("#server-reconnect-msg");
  if(title)title.textContent=copy.title;
  if(msg)msg.textContent=copy.msg;
  const healthOk=options&&options.healthOk;
  if(healthOk!==undefined)setServerPowerBadge(!!healthOk);
  else if(typeof accountServerReachable==="function")setServerPowerBadge(!!accountServerReachable());
  else setServerPowerBadge(false);
}
function setServerConnectionStatus(online,options){
  const was=SERVER_CONNECTION_ONLINE;
  SERVER_CONNECTION_ONLINE=!!online;
  const box=$("#server-status"),btn=$("#btn-reconnect");
  const playersBox=$("#players-online");
  const show=typeof accountApiConfigured==="function"&&accountApiConfigured();
  if(box)box.hidden=!show;
  if(playersBox&&!show)playersBox.hidden=true;
  if(btn)btn.hidden=!!online;
  const healthOk=options&&options.healthOk!==undefined
    ?!!options.healthOk
    :(online?true:(typeof accountServerReachable==="function"?!!accountServerReachable():false));
  setServerPowerStatus(healthOk);
  setServerReconnectBanner(online,Object.assign({},options||{},{healthOk}));
  if(!online&&was&&!(options&&options.silent)&&typeof toast==="function"&&show)
    toast(serverDisconnectCopy(options&&options.reason).toast,"bad");
}
let MAINTENANCE_COUNTDOWN_TIMER=null;
let MAINTENANCE_COUNTDOWN_ENDS_AT=0;
function hideMaintenanceCountdown(){
  if(MAINTENANCE_COUNTDOWN_TIMER){clearInterval(MAINTENANCE_COUNTDOWN_TIMER);MAINTENANCE_COUNTDOWN_TIMER=null;}
  MAINTENANCE_COUNTDOWN_ENDS_AT=0;
  const el=$("#maintenance-countdown");
  if(el)el.hidden=true;
}
function showMaintenanceCountdown(endsAt){
  const until=Number(endsAt)||0;
  if(!until||until<=Date.now()){
    hideMaintenanceCountdown();
    return;
  }
  MAINTENANCE_COUNTDOWN_ENDS_AT=until;
  const el=$("#maintenance-countdown"),num=$("#maintenance-countdown-num");
  if(!el)return;
  el.hidden=false;
  const tick=()=>{
    const left=Math.max(0,Math.ceil((MAINTENANCE_COUNTDOWN_ENDS_AT-Date.now())/1000));
    if(num)num.textContent=String(left);
    if(left<=0){
      hideMaintenanceCountdown();
      if(typeof accountForceServerDisconnect==="function")
        accountForceServerDisconnect("maintenance");
      setServerConnectionStatus(false,{reason:"maintenance",healthOk:false,silent:true});
      setServerPowerStatus(false);
    }
  };
  tick();
  if(MAINTENANCE_COUNTDOWN_TIMER)clearInterval(MAINTENANCE_COUNTDOWN_TIMER);
  MAINTENANCE_COUNTDOWN_TIMER=setInterval(tick,250);
}
function bindServerStatusControls(){
  if(SERVER_STATUS_BOUND)return;SERVER_STATUS_BOUND=true;
  const clickReconnect=()=>{reconnectOnlineRuntime();};
  const btn=$("#btn-reconnect"),bannerBtn=$("#btn-reconnect-banner");
  if(btn)btn.addEventListener("click",clickReconnect);
  if(bannerBtn)bannerBtn.addEventListener("click",clickReconnect);
  window.addEventListener("tibia-idle-server-online",()=>{
    // Só limpa a UI OFFLINE após reconnect bem-sucedido (ou boot sem pending).
    if(G&&G.instanceReconnectPending)return;
    if(typeof accountServerForcedOffline==="function"&&accountServerForcedOffline())return;
    setServerConnectionStatus(true,{silent:true,healthOk:true});
  });
  window.addEventListener("tibia-idle-server-offline",(event)=>{
    if(G)G.instanceReconnectPending=true;
    if(typeof clearCombatVisualOverlays==="function")clearCombatVisualOverlays(G&&G.combat);
    const reason=event&&event.detail&&event.detail.reason;
    setServerConnectionStatus(false,{reason,healthOk:false});
  });
  window.addEventListener("tibia-idle-server-ready",()=>{
    // Health OK de novo: mostra SERVIDOR ON, mas Reconnect ainda é obrigatório.
    setServerPowerStatus(true);
    setServerPowerBadge(true);
    const hint=$("#server-reconnect-error");
    if(hint&&!SERVER_CONNECTION_ONLINE){
      hint.hidden=false;
      hint.textContent=typeof t==="function"?t("server.readyHint"):"SERVIDOR ON — clique em Reconnect.";
      hint.classList.remove("bad");hint.classList.add("good");
    }
  });
  window.addEventListener("tibia-idle-server-power",(event)=>{
    const on=!(event&&event.detail&&event.detail.on===false);
    setServerPowerStatus(on);
    if(!SERVER_CONNECTION_ONLINE)setServerPowerBadge(on);
  });
  window.addEventListener("tibia-idle-maintenance",(event)=>{
    const detail=event&&event.detail||{};
    if(detail.active&&detail.endsAt)showMaintenanceCountdown(detail.endsAt);
    else hideMaintenanceCountdown();
  });
  if(typeof accountStartServerHealthMonitor==="function")accountStartServerHealthMonitor();
  if(typeof accountApiConfigured==="function"&&accountApiConfigured())
    setServerConnectionStatus(true,{silent:true,healthOk:true});
}
/* Hard reload ≈ Ctrl+F5: nova URL com ?_=timestamp força re-fetch do HTML
 * (e dos assets versionados nele). Limpa Cache Storage quando existir. */
function hardReloadBypassCache(){
  try{
    const url=new URL(String(location.href));
    url.searchParams.delete("_");
    url.searchParams.delete("_ts");
    url.searchParams.delete("cb");
    url.searchParams.set("_",String(Date.now()));
    const go=()=>{
      try{location.replace(url.href);}catch(e){location.href=url.href;}
    };
    if(typeof caches!=="undefined"&&caches&&typeof caches.keys==="function"){
      Promise.resolve(caches.keys()).then((keys)=>Promise.all((keys||[]).map((k)=>{
        try{return caches.delete(k);}catch(e){return null;}
      }))).catch(()=>null).then(go,go);
      return;
    }
    go();
  }catch(e){
    try{location.reload();}catch(e2){}
  }
}
async function reconnectOnlineRuntime(){
  const btn=$("#btn-reconnect"),bannerBtn=$("#btn-reconnect-banner");
  const err=$("#server-reconnect-error");
  const label=(typeof t==="function"?t("server.reconnect"):"Reconnect")+"...";
  const setBusy=(busy)=>{
    if(btn){btn.disabled=busy;btn.textContent=busy?label:(typeof t==="function"?t("server.reconnect"):"Reconnect");}
    if(bannerBtn){bannerBtn.disabled=busy;bannerBtn.textContent=busy?label:(typeof t==="function"?t("server.reconnect"):"Reconnect");}
  };
  const showError=(message)=>{
    if(err){err.hidden=false;err.textContent=message;err.classList.add("bad");err.classList.remove("good");}
    if(typeof toast==="function")toast(message,"bad");
  };
  setBusy(true);
  ONLINE_RUNTIME_RETRY_AT=0;ONLINE_SESSION_INVALID=false;
  if(G)G.instanceReconnectPending=true;
  if(typeof clearCombatVisualOverlays==="function")clearCombatVisualOverlays(G&&G.combat);
  try{
    if(typeof accountApiConfigured==="function"&&accountApiConfigured()){
      const health=typeof accountCheckServerHealth==="function"?await accountCheckServerHealth():{ok:true};
      if(!health||!health.ok){
        showError(typeof t==="function"?t("server.stillDown"):"Servidor ainda indisponível.");
        setBusy(false);
        return false;
      }
    }
    // Sempre hard-reload no Reconnect (mesmo bootId): garante JS/CSS novos
    // após deploy/restart. Sessão em localStorage sobrevive; o boot normal
    // reassume lease/login.
    hardReloadBypassCache();
    return true;
  }catch(e){
    showError(typeof t==="function"?t("server.reconnectFail"):"Falha ao reconectar.");
    setBusy(false);
    return false;
  }
}
let ONLINE_RUNTIME_RECOVERING=false,ONLINE_RUNTIME_RETRY_AT=0;
function resetOnlineRuntimeClocks(){
  G.last=performance.now();G.tickAcc=0;G.bgLast=Date.now();G.bgAcc=0;ONLINE_AUTH_ACC=0;
}
async function requestOnlineRuntimeRecovery(options){
  const force=!!(options&&options.force);
  if(G&&G.combat&&(G.combat.worldBoss||(G.combat.boss&&G.combat.boss.worldBoss)))return false;
  if(ONLINE_RUNTIME_RECOVERING||!onlineAuthorityCombat()||Date.now()<ONLINE_RUNTIME_RETRY_AT)return false;
  // Sem force: não martelar lease/API enquanto o banner Reconnect está ativo.
  if(!force){
    if(typeof accountServerForcedOffline==="function"&&accountServerForcedOffline())return false;
    if(G&&G.instanceReconnectPending&&!SERVER_CONNECTION_ONLINE)return false;
  }
  ONLINE_RUNTIME_RECOVERING=true;ONLINE_RUNTIME_RETRY_AT=Date.now()+2000;
  try{
    const token=typeof sessionToken==="function"?sessionToken():"";if(!token){
      ONLINE_SESSION_INVALID=true;ONLINE_RUNTIME_RETRY_AT=Number.POSITIVE_INFINITY;return false;
    }
    const lease=typeof accountEnsureLease==="function"
      ?await accountEnsureLease(token,{silent:true}):{ok:true};
    if(!lease||!lease.ok){
      if(lease&&lease.unauthorized){
        // Sessão morta: pare o storm de /lease/acquire. O invalidate+reload
        // do account-client assume o retorno ao login.
        ONLINE_SESSION_INVALID=true;ONLINE_RUNTIME_RETRY_AT=Number.POSITIVE_INFINITY;return false;
      }
      // Outra aba realmente ativa continua vencendo; só volte a pedir o lease
      // depois que o TTL atual expirar. Takeover continua só no botão.
      const heldMs=Number(lease&&lease.expiresAt?new Date(lease.expiresAt).getTime()-Date.now():0);
      ONLINE_RUNTIME_RETRY_AT=Date.now()+Math.max(2000,heldMs||3000);
      return false;
    }
    if(typeof accountLoadInstance!=="function")return false;
    let remote=await accountLoadInstance(token);
    if(remote&&remote.ok&&remote.instance){
      if(!G.combat||!instanceIncludesCharacter(remote.instance,G.p&&G.p.id))return false;
      const applied=applyOnlineAuthorityState(remote.instance,
        remote.lastStatus==="ended"?"ended":null);
      if(applied){
        resetOnlineRuntimeClocks();
        if(G)delete G.instanceReconnectPending;
        setServerConnectionStatus(true,{silent:true});
      }
      return !!applied;
    }
    if(remote&&remote.ok&&remote.lastStatus==="ended"){
      // Instância nova ainda em PUT: ignore o "ended" da anterior e recria.
      if(combatInstanceEntryPending()){
        if(typeof accountBeginInstance==="function"&&typeof persistActiveInstance==="function"){
          accountBeginInstance();persistActiveInstance();
        }
        return false;
      }
      if(G.combat&&!(G.combat.worldBoss||(G.combat.boss&&G.combat.boss.worldBoss))){
        clearInstanceSession(remote.terminalReason||"remote-ended",true);
        setTimeout(()=>{if(G.combat)stopHunt(true);},0);
      }else if(G.combat)clearInstanceSession(remote.terminalReason||"remote-ended",true);
      return false;
    }
    // Storage reiniciado sem tombstone: restaure o checkpoint que permaneceu
    // aberto na aba, usando o lease recém-readquirido e a mesma party/runtime.
    if(remote&&remote.ok&&!remote.instance&&G.combat&&!(G.combat.worldBoss||(G.combat.boss&&G.combat.boss.worldBoss))&&
       typeof accountBeginInstance==="function"&&
       typeof persistActiveInstance==="function"){
      accountBeginInstance();persistActiveInstance();
      const saved=typeof accountLastInstancePromise==="function"?await accountLastInstancePromise():false;
      if(saved){
        remote=await accountLoadInstance(token);
        const applied=!!(remote&&remote.ok&&remote.instance&&
          instanceIncludesCharacter(remote.instance,G.p&&G.p.id)&&
          applyOnlineAuthorityState(remote.instance,null));
        if(applied){
          resetOnlineRuntimeClocks();
          if(G)delete G.instanceReconnectPending;
          setServerConnectionStatus(true,{silent:true});
        }
        return applied;
      }
    }
    return false;
  }catch(error){return false;}
  finally{ONLINE_RUNTIME_RECOVERING=false;}
}
/* Reancora um evento quando ele REALMENTE vira efeito/floater, não apenas
 * quando o lote chega. Os eventos são distribuídos por até 850 ms e nesse
 * intervalo a interpolação continua; congelar x/y no recebimento deixava o
 * número no tile anterior enquanto a criatura já estava no próximo. */
function resolveLiveCombatEventPosition(combat,event){
  if(!combat||!event)return event;
  const idOf=(ent)=>String(ent&&(ent.id!==undefined?ent.id:(ent.p&&ent.p.id))||""),
    players=Array.isArray(combat.players)&&combat.players.length?combat.players:(combat.player?[combat.player]:[]),
    mobs=Array.isArray(combat.mobs)?combat.mobs:[],find=(list,id)=>{
      const wanted=String(id===undefined||id===null?"":id);return wanted?list.find((ent)=>idOf(ent)===wanted):null;
    },targetId=event.targetId!==undefined?event.targetId:event.mobId,
    playerEvent=event.t==="taken"||event.t==="death"||event.t==="condition"||event.t==="block"||
      event.t==="heal"||event.t==="heal-friend"||event.t==="mana"||event.t==="magic-shield",
    target=playerEvent?find(players,targetId):(find(mobs,targetId)||find(players,targetId));
  if(target&&Number.isFinite(Number(target.x))&&Number.isFinite(Number(target.y))){
    event.x=Number(target.x);event.y=Number(target.y);event.screen=true;
  }
  const hopFrom=event.chain&&event.fromId!==undefined&&event.fromId!==null
    ? (find(mobs,event.fromId)||find(players,event.fromId)) : null;
  const source=hopFrom||(event.whoId!==undefined?find(players,event.whoId):null)||
    (event.sourceId!==undefined?find(mobs,event.sourceId):null);
  if(source&&Number.isFinite(Number(source.x))&&Number.isFinite(Number(source.y))){
    event.sx=Number(source.x);event.sy=Number(source.y);
    if((event.t==="say"||event.t==="buff")&&!target){event.x=event.sx;event.y=event.sy;event.screen=true;}
  }
  return event;
}

/* Distribui o lote autoritativo em poucos frames, sem o ping de ~1s que o
 * espalhamento antigo (850ms) introduzia. Preserva a ordem relativa. */
function releaseHeldAuthoritySpawns(c, now) {
  if (!c || !Array.isArray(c._heldAuthorityMobs) || !c._heldAuthorityMobs.length) return;
  const held = c._heldAuthorityMobs;
  c._heldAuthorityMobs = [];
  now = now || Date.now();
  const seen = new Set();
  for (const mob of c.mobs || []) {
    const id = String(mob && mob.id || "");
    if (id) seen.add(id);
  }
  for (const pending of c.pendingSpawns || []) {
    const id = String(pending && pending.mob && pending.mob.id || "");
    if (id) seen.add(id);
  }
  c.pendingSpawns = c.pendingSpawns || [];
  const w = Number(c.gridW) || 30, h = Number(c.gridH) || 30;
  for (const remote of held) {
    if (!remote) continue;
    const id = String(remote.id || "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const slug = remote.slug;
    const catalog = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && slug
      ? GAMEDATA.monsters[slug] : null;
    if (catalog) remote.def = catalog;
    const cx = Number.isFinite(Number(remote.cx)) ? Number(remote.cx) : Math.floor(w / 2);
    const cy = Number.isFinite(Number(remote.cy)) ? Number(remote.cy) : Math.floor(h / 2);
    c.pendingSpawns.push({ mob: remote, cx, cy, startedAt: now, blink: 0, done: false });
  }
}
/* Aplica pendingSpawns compactos do snapshot (sem spawnWave / sem OTBM). */
function syncAuthorityPendingSpawns(c, remotePending, now) {
  if (!c || !Array.isArray(remotePending)) return;
  now = now || Date.now();
  const local = Array.isArray(c.pendingSpawns) ? c.pendingSpawns : [];
  const byId = new Map();
  for (const sp of local) {
    const id = String(sp && sp.mob && sp.mob.id || "");
    if (id) byId.set(id, sp);
  }
  const next = [];
  const w = Number(c.gridW) || 30, h = Number(c.gridH) || 30;
  for (const remote of remotePending) {
    if (!remote || !remote.mob) continue;
    const id = String(remote.mob.id || "");
    const prev = id ? byId.get(id) : null;
    const slug = remote.mob.slug;
    const catalog = typeof GAMEDATA !== "undefined" && GAMEDATA.monsters && slug
      ? GAMEDATA.monsters[slug] : null;
    const mob = prev && prev.mob ? prev.mob : Object.assign({}, remote.mob);
    if (catalog) mob.def = catalog;
    if (remote.mob.hp !== undefined) mob.hp = Number(remote.mob.hp) || mob.hp;
    if (remote.mob.maxHp !== undefined) mob.maxHp = Number(remote.mob.maxHp) || mob.maxHp;
    const cx = Number.isFinite(Number(remote.cx)) ? Number(remote.cx)
      : (prev ? prev.cx : Math.floor(w / 2));
    const cy = Number.isFinite(Number(remote.cy)) ? Number(remote.cy)
      : (prev ? prev.cy : Math.floor(h / 2));
    // blink fica só no cliente: o snapshot remoto já pode vir com blink>=1
    // (servidor emitiu spawn-blink no mesmo step). Se importarmos esse
    // contador e ainda suprimirmos spawn-blink (abaixo), o FX some.
    next.push({
      mob, cx, cy,
      startedAt: Number(remote.startedAt) || (prev && prev.startedAt) || now,
      blink: Number(prev && prev.blink) || 0,
      done: false,
    });
  }
  c.pendingSpawns = next;
}
function scheduleOnlineAuthorityEvents(events,receivedAt){
  const input=Array.isArray(events)?events:[],now=Number(receivedAt)||Date.now();
  if(!input.length)return [];
  const valid=input.map((event)=>Number(event&&event.ts)).filter(Number.isFinite),
    first=valid.length?Math.min(...valid):0,last=valid.length?Math.max(...valid):first,
    span=Math.max(0,last-first),spread=140,
    scale=span>spread?spread/span:1,ties=new Map();
  return input.map((remote,index)=>{
    const event=Object.assign({},remote),raw=Number(event.ts),base=Number.isFinite(raw)?Math.max(0,raw-first):0,
      tieKey=Number.isFinite(raw)?String(raw):"missing",tie=ties.get(tieKey)||0;
    ties.set(tieKey,tie+1);
    // Preserva o ts autoritativo para dedup de say (o ts de exibição é remapeado).
    if(Number.isFinite(raw))event.authTs=raw;
    event.ts=now+Math.min(spread,Math.round(base*scale)+Math.min(16,tie*4));
    return{event,index};
  }).sort((a,b)=>a.event.ts-b.event.ts||a.index-b.index).map((item)=>item.event);
}
function applyOnlineAuthorityState(descriptor,terminalReason,version){
  if(!descriptor||!G.combat)return false;
  const previous=G.combat;
  const incomingVersion=Number(version!==undefined&&version!==null?version:descriptor.version);
  const instanceId=String(descriptor.id||descriptor.instanceId||
    (typeof ACCOUNT_INSTANCE!=="undefined"&&ACCOUNT_INSTANCE&&ACCOUNT_INSTANCE.id)||
    ONLINE_AUTH_APPLIED_INSTANCE||"");
  if(!terminalReason&&Number.isFinite(incomingVersion)&&incomingVersion>0&&
     incomingVersion<=ONLINE_AUTH_APPLIED_VERSION&&
     (!ONLINE_AUTH_APPLIED_INSTANCE||!instanceId||instanceId===ONLINE_AUTH_APPLIED_INSTANCE))
    return false;
  // Movimento é predição visual local; dano/HP/recompensas vêm do servidor.
  // Um tick não pode substituir G.combat nem as entidades que o renderer e a
  // troca de personagem já estão usando. A substituição integral fazia um
  // membro recém-selecionado e ondas inteiras piscarem/sumirem.
  // O snapshot materializado ainda contém campos transitórios do checkpoint
  // inicial. Preserve o passo local INTEIRO: manter x/y mas sobrescrever
  // tx/ty/stepT a cada resposta de 1s fazia a interpolação voltar para um
  // trajeto antigo e os monstros saltarem como se perdessem frames.
  const visualKeys=["cx","cy","x","y","sx","sy","tx","ty","dir","moving","frame","walkT",
    "stepT","stepDur","speedPts","walkFrames","_walkFramesSlug","nextStepAt","attackAnim","target",
    "path","pathIndex","moveFrom","moveTo","moveProgress","speech"];
  const entityId=(ent)=>String(ent&&(ent.id!==undefined?ent.id:(ent.p&&ent.p.id))||"");
  const localActiveId=entityId(previous.player),previousPlayers=Array.isArray(previous.players)?previous.players:[],
    previousMobs=Array.isArray(previous.mobs)?previous.mobs:[];
  // Não passe por restoreCombatSessionState/normalizePlayer a cada segundo:
  // isso clona saves enormes (lootPouch/missões) e congela a aba. O nested
  // `state` já é o combate; o descriptor externo só traz versão/membros.
  const incoming=(descriptor.state&&(descriptor.state.players||descriptor.state.mobs||
    descriptor.state.events))?descriptor.state:descriptor;
  if(!incoming||incoming===previous)return false;
  delete G.instanceReconnectPending;
  const beforeLevel=G.p&&Number(G.p.level)||0;

  const hydrateMobDef=(ent)=>{
    if(!ent)return ent;
    const slug=ent.slug,catalog=typeof GAMEDATA!=="undefined"&&GAMEDATA.monsters&&slug?GAMEDATA.monsters[slug]:null;
    // Sempre amarra o def ao slug atual. ID reciclado (Demon → Floating
    // Savant) não pode conservar looktype/nome da espécie anterior.
    if(catalog)ent.def=catalog;
    return ent;
  };
  const mergeEntity=(local,remote,isPlayer)=>{
    if(!local)return hydrateMobDef(remote);
    // ID reciclado: cadáver (hp 0) virando spawn novo, OU a mesma slot
    // visual recebendo outra espécie. Nos dois casos o outfit/nome/posição
    // do bicho antigo não podem vazar para o novo.
    if(!isPlayer&&((Number(local.hp)<=0&&Number(remote&&remote.hp)>0)||
       String(local.slug||"")!==String(remote&&remote.slug||"")))
      return hydrateMobDef(Object.assign({},remote));
    const visual={};for(const key of visualKeys)if(local[key]!==undefined)visual[key]=local[key];
    const playerRef=isPlayer&&local.p&&typeof local.p==="object"?local.p:null;
    const localDef=local.def;
    // O snapshot do servidor também carrega posição DENTRO de `p` (o save do
    // personagem). Sem preservar aqui, `Object.assign(playerRef,remote.p)`
    // devolvia o char ao tile de spawn a cada tick: a party inteira piscava
    // empilhada no mesmo quadrado e o movimento local era descartado.
    const playerVisual={};
    if(playerRef)for(const key of visualKeys)if(playerRef[key]!==undefined)playerVisual[key]=playerRef[key];
    Object.assign(local,remote||{});
    // speech é client-only; snapshot remoto nunca deve implantar fala eterna.
    if(visual.speech===undefined)delete local.speech;
    if(localDef)local.def=localDef;
    hydrateMobDef(local);
    if(playerRef&&remote&&remote.p){
      const localConfig=playerRef.config,localCombo=localConfig&&localConfig.combo,localStances=playerRef.stances,
        localPrey=playerRef.prey,localMissions=playerRef.missions,localMissionsDone=playerRef.missionsDone,
        localCharms=playerRef.charms,localCharmRace=playerRef.charmRace,
        localCharmPoints=playerRef.charmPoints,localCharmsPagos=playerRef.charmsPagos,
        localBestiary=playerRef.bestiary,
        localLootConfig=(playerRef.lootConfig&&typeof playerRef.lootConfig==="object"&&
          !Array.isArray(playerRef.lootConfig))?{
            noCollect:Array.isArray(playerRef.lootConfig.noCollect)?playerRef.lootConfig.noCollect.slice():[],
            noSell:Array.isArray(playerRef.lootConfig.noSell)?playerRef.lootConfig.noSell.slice():[],
          }:null;
      Object.assign(playerRef,remote.p);local.p=playerRef;
      /* Charms/bestiary: não deixar snapshot remoto vazio apagar unlock local. */
      playerRef.charms=Object.assign({}, remote.p.charms||{}, localCharms||{});
      playerRef.charmRace=Object.assign({}, remote.p.charmRace||{}, localCharmRace||{});
      playerRef.charmsPagos=Object.assign({}, remote.p.charmsPagos||{}, localCharmsPagos||{});
      playerRef.bestiary=Object.assign({}, remote.p.bestiary||{}, localBestiary||{});
      const rp=Number(remote.p.charmPoints), lp=Number(localCharmPoints);
      const localOnlyUnlock=Object.keys(localCharms||{}).some((k)=>localCharms[k]&&!(remote.p.charms||{})[k]);
      if(localOnlyUnlock&&Number.isFinite(lp))playerRef.charmPoints=lp;
      else if(Number.isFinite(rp))playerRef.charmPoints=rp;
      else if(Number.isFinite(lp))playerRef.charmPoints=lp;
      if(typeof ensureCyclopedia==="function")ensureCyclopedia(playerRef);
      if(remote.p.exp!==undefined)playerRef.exp=Number(remote.p.exp)||0;
      if(remote.p.level!==undefined)playerRef.level=Math.max(1,Number(remote.p.level)||1);
      if(localConfig){
        playerRef.config=Object.assign({},remote.p.config||{},localConfig);
        if(Array.isArray(localCombo))playerRef.config.combo=localCombo;
        // Nested: shallow assign apagava autoSupplyStash remoto com {} local.
        const remoteAuto=(remote.p.config&&remote.p.config.autoSupplyStash&&
          typeof remote.p.config.autoSupplyStash==="object"&&!Array.isArray(remote.p.config.autoSupplyStash))
          ?remote.p.config.autoSupplyStash:{};
        const localAuto=(localConfig.autoSupplyStash&&typeof localConfig.autoSupplyStash==="object"&&
          !Array.isArray(localConfig.autoSupplyStash))?localConfig.autoSupplyStash:{};
        playerRef.config.autoSupplyStash=Object.assign({},remoteAuto,localAuto);
      }
      // lootConfig: união remote ∪ local (antes do assign) — NÃO COLETAR
      // não some com snapshot atrasado após toggle no cliente.
      const mergeLootRules=(a,b)=>{
        const out=[];const seen=new Set();
        for(const list of [Array.isArray(a)?a:[],Array.isArray(b)?b:[]]){
          for(const raw of list){
            const rule=String(raw||"").trim().toLowerCase();
            if(!rule||seen.has(rule))continue;seen.add(rule);out.push(rule);
          }
        }
        return out;
      };
      const remoteLoot=(remote.p.lootConfig&&typeof remote.p.lootConfig==="object"&&
        !Array.isArray(remote.p.lootConfig))?remote.p.lootConfig:{};
      playerRef.lootConfig={
        noCollect:mergeLootRules(remoteLoot.noCollect,localLootConfig&&localLootConfig.noCollect),
        noSell:mergeLootRules(remoteLoot.noSell,localLootConfig&&localLootConfig.noSell),
      };
      if(localStances&&typeof localStances==="object")playerRef.stances=localStances;
      if(localPrey&&typeof localPrey==="object")playerRef.prey=localPrey;
      if(localMissions&&typeof localMissions==="object")
        playerRef.missions=mergeMissionMaps(remote.p.missions,localMissions);
      if(localMissionsDone&&typeof localMissionsDone==="object")
        playerRef.missionsDone=Object.assign({},remote.p.missionsDone||{},localMissionsDone);
      for(const key of Object.keys(playerVisual))playerRef[key]=playerVisual[key];
      if(typeof rewardChestEnsureShape==="function")rewardChestEnsureShape(playerRef);
      if(typeof renderRewardButton==="function")renderRewardButton(playerRef);}
    for(const key of Object.keys(visual))local[key]=visual[key];
    return local;
  };
  const ensurePosition=(ent,fallback,index)=>{
    if(!ent)return ent;
    if(Number.isFinite(Number(ent.x))&&Number.isFinite(Number(ent.y)))return ent;
    const w=Number(incoming.gridW)||Number(previous.gridW)||30,
      h=Number(incoming.gridH)||Number(previous.gridH)||30;
    let cx=Number(ent.cx),cy=Number(ent.cy);
    if(!Number.isFinite(cx))cx=Number(fallback&&fallback.cx);
    if(!Number.isFinite(cy))cy=Number(fallback&&fallback.cy);
    if(!Number.isFinite(cx))cx=Math.floor(w/2)+(index%3)-1;
    if(!Number.isFinite(cy))cy=Math.floor(h/2)+Math.floor(index/3);
    cx=Math.max(0,Math.min(w-1,Math.round(cx)));cy=Math.max(0,Math.min(h-1,Math.round(cy)));
    ent.cx=cx;ent.cy=cy;
    if(!Number.isFinite(Number(ent.x)))ent.x=(cx+.5)/w;
    if(!Number.isFinite(Number(ent.y)))ent.y=(cy+.5)/h;
    if(!Number.isFinite(Number(ent.sx)))ent.sx=ent.x;
    if(!Number.isFinite(Number(ent.sy)))ent.sy=ent.y;
    return ent;
  };

  // Atualiza escalares/mecânicas no próprio objeto, mas reconcilia criaturas
  // separadamente para manter referências, posição e identidade visual.
  const keepMalicePx=previous.malice&&previous.malice.qtePhase==="active"&&
    Array.isArray(previous._malicePendingMoves)&&previous._malicePendingMoves.length>0
    ?{px:previous.malice.px,py:previous.malice.py}:null;
  // Esteira Scarlett: raf/notes/DOM vivem só no cliente. O snapshot a cada
  // ~200ms substituía c.scarlett e reiniciava a animação (efeito lagado).
  const keepScarlettVisual=previous.scarlett?{
    raf:previous.scarlett.raf||0,
    _trackBuilt:!!previous.scarlett._trackBuilt,
    _localSig:previous.scarlett._localSig||null,
    _wallOffset:previous.scarlett._wallOffset,
    notes:previous.scarlett.notes,
    _noteNodes:previous.scarlett._noteNodes||null,
    _trackEl:previous.scarlett._trackEl||null,
    _titleEl:previous.scarlett._titleEl||null,
    _titleIndex:previous.scarlett._titleIndex,
    _successBannerUntil:previous.scarlett._successBannerUntil,
    lastBlockFx:Number(previous.scarlett.lastBlockFx)||0,
    qteStartedAt:Number(previous.scarlett.qteStartedAt)||0
  }:null;
  for(const key of Object.keys(incoming))
    if(key!=="players"&&key!=="player"&&key!=="mobs"&&key!=="events"&&
       key!=="hunt"&&key!=="huntMap"&&key!=="boss"&&key!=="stats"&&
       key!=="pendingSpawns"&&key!=="_heldAuthorityMobs")previous[key]=incoming[key];
  // Maze QTE: não sobrescreva a posição otimista enquanto há passos enfileirados.
  if(keepMalicePx&&previous.malice&&previous.malice.qtePhase==="active"){
    previous.malice.px=keepMalicePx.px;previous.malice.py=keepMalicePx.py;
  }
  if(keepScarlettVisual&&previous.scarlett){
    previous.scarlett.raf=keepScarlettVisual.raf;
    previous.scarlett._trackBuilt=keepScarlettVisual._trackBuilt;
    previous.scarlett._localSig=keepScarlettVisual._localSig;
    previous.scarlett._wallOffset=keepScarlettVisual._wallOffset;
    previous.scarlett._noteNodes=keepScarlettVisual._noteNodes;
    previous.scarlett._trackEl=keepScarlettVisual._trackEl;
    previous.scarlett._titleEl=keepScarlettVisual._titleEl;
    previous.scarlett._titleIndex=keepScarlettVisual._titleIndex;
    previous.scarlett._successBannerUntil=keepScarlettVisual._successBannerUntil;
    previous.scarlett.lastBlockFx=keepScarlettVisual.lastBlockFx;
    const sameQte=previous.scarlett.phase==="qte"&&
      Number(previous.scarlett.qteStartedAt||0)===keepScarlettVisual.qteStartedAt&&
      Array.isArray(keepScarlettVisual.notes)&&keepScarlettVisual.notes.length;
    if(sameQte)previous.scarlett.notes=keepScarlettVisual.notes;
  }
  if(typeof setGridSize==="function"){
    const gw=Number(previous.gridW)||Number(incoming.gridW);
    const gh=Number(previous.gridH)||Number(incoming.gridH);
    if(gw>0&&gh>0)setGridSize(gw,gh);
  }
  if(incoming.stats){
    // damageTrack/takenTrack vivem só no cliente (eventos hit/taken). O
    // checkpoint do servidor carrega um snapshot velho desses campos e
    // Object.assign apagava o acumulado a cada tick — Damage Taken (e
    // Damage) pareciam “valores do último segundo” em vez do total da sessão.
    const keepDamageTrack=previous.stats&&previous.stats.damageTrack;
    const keepTakenTrack=previous.stats&&previous.stats.takenTrack;
    previous.stats=Object.assign({},previous.stats||{},incoming.stats);
    if(keepDamageTrack&&typeof keepDamageTrack==="object")previous.stats.damageTrack=keepDamageTrack;
    if(keepTakenTrack&&typeof keepTakenTrack==="object")previous.stats.takenTrack=keepTakenTrack;
    previous.stats.supplyUsed=Object.assign({},incoming.stats.supplyUsed||{});
    previous.stats.supplyCost=Number(incoming.stats.supplyCost)||0;
    previous.stats.loot=Object.assign({},incoming.stats.loot||previous.stats.loot||{});
  }

  const remotePlayers=Array.isArray(incoming.players)?incoming.players:[],remotePlayersById=new Map();
  for(const ent of remotePlayers){const id=entityId(ent);if(id)remotePlayersById.set(id,ent);}
  const reconciledPlayers=[];
  for(const local of previousPlayers){
    const id=entityId(local),remote=remotePlayersById.get(id);
    if(remote){reconciledPlayers.push(mergeEntity(local,remote,true));remotePlayersById.delete(id);}
    // O snapshot remoto pode estar um tick atrás da hidratação da party. Um
    // membro válido do runtime não deve desaparecer só por essa defasagem.
    else if(local&&local.p)reconciledPlayers.push(local);
  }
  let playerIndex=reconciledPlayers.length;
  for(const remote of remotePlayersById.values()){
    const fallback=previous.player||reconciledPlayers[0]||null;
    reconciledPlayers.push(ensurePosition(hydrateMobDef(remote),fallback,playerIndex++));
  }
  if(Array.isArray(previous.players)){previous.players.splice(0,previous.players.length,...reconciledPlayers);}
  else previous.players=reconciledPlayers;
  const authClock=Number(incoming.authClock);
  if(Number.isFinite(authClock)){
    previous.authClock=authClock;
    previous._authWallAt=Date.now();
  }
  if(Number.isFinite(authClock)&&typeof cdHydrateFromAuthority==="function"){
    previous.authClock=authClock;
    for(const ent of previous.players||[])if(ent&&ent.p)cdHydrateFromAuthority(ent.p,authClock);
  }

  const remoteMobs=Array.isArray(incoming.mobs)?incoming.mobs:[],localMobsById=new Map();
  for(const mob of previousMobs){const id=entityId(mob);if(id)localMobsById.set(id,mob);}
  const reconciledMobs=[];
  const spawnBlocked=typeof G!=="undefined"&&G&&G.huntMapReady===false;
  // pendingSpawns vêm compactos do servidor — aplicar sem spawnWave/OTBM.
  if(Array.isArray(incoming.pendingSpawns))
    syncAuthorityPendingSpawns(previous,incoming.pendingSpawns,Date.now());
  const previewIds=new Set();
  for(const pending of previous.pendingSpawns||[]){
    const id=String(pending&&pending.mob&&pending.mob.id||"");
    if(id)previewIds.add(id);
  }
  const incomingHasKill=Array.isArray(incoming.events)&&
    incoming.events.some((ev)=>ev&&ev.t==="kill");
  const hasPendingPreview=!!(previous.pendingSpawns&&previous.pendingSpawns.length);
  // Entre a morte do último monstro e o respawn autoritativo existe um tick
  // vazio. Preserve a onda visual nesse intervalo curto para não piscar toda
  // a arena — MAS se já há kill ou pendingSpawns, limpe os fantasmas da onda
  // morta (senão o último mob "vivo" fica na tela durante o hitch do clear).
  if(!terminalReason&&remoteMobs.length===0&&previousMobs.some((mob)=>mob&&mob.hp>0)&&
     !incomingHasKill&&!hasPendingPreview){
    reconciledMobs.push(...previousMobs);
  }else if(spawnBlocked){
    previous._heldAuthorityMobs=remoteMobs.slice();
    for(const local of previousMobs)if(local)reconciledMobs.push(local);
  }else{
    for(let index=0;index<remoteMobs.length;index++){
      const remote=remoteMobs[index],id=entityId(remote),local=localMobsById.get(id);
      if(!local&&(previewIds.has(id)||((previous.pendingSpawns||[]).length&&!previousMobs.length)))
        continue;
      const merged=mergeEntity(local,remote,false),fallback=local||previousMobs[index%Math.max(1,previousMobs.length)]||previous.player;
      reconciledMobs.push(ensurePosition(merged,fallback,index));
    }
  }
  if(Array.isArray(previous.mobs)){previous.mobs.splice(0,previous.mobs.length,...reconciledMobs);}
  else previous.mobs=reconciledMobs;

  // Eventos de combate (dano/cura/kill/dust/death/condition/buff) gerados
  // pelo servidor entram na fila local sem substituir os eventos com `ts`
  // ainda pendentes. `events` é excluído do Object.assign de escalares acima:
  // se os dois arrays forem o mesmo, fazer push durante `for..of` cresce o
  // próprio iterador para sempre e congela completamente a aba no 1º hit.
  previous.events=Array.isArray(previous.events)?previous.events:[];
  if(Array.isArray(incoming.events)&&incoming.events.length){
    const receivedAt=Date.now(),visualPlayersById=new Map(),visualMobsById=new Map(localMobsById);
    for(const ent of previous.players||[]){const id=entityId(ent);if(id)visualPlayersById.set(id,ent);}
    for(const ent of previous.mobs||[]){const id=entityId(ent);if(id)visualMobsById.set(id,ent);}
    const placeEvent=(event)=>{
      // IDs são a fonte estável. Coordenadas do snapshot podem ter sido
      // produzidas até um tick antes; rebasing mantém dano/spells no alvo que
      // o grid local está mostrando e também cobre o mob removido no kill.
      const targetId=String(event.targetId!==undefined?event.targetId:(event.mobId!==undefined?event.mobId:""));
      let target=null;
      if(targetId){target=(event.t==="taken"||event.t==="death"||event.t==="condition"||event.t==="block")
        ?visualPlayersById.get(targetId):visualMobsById.get(targetId)||visualPlayersById.get(targetId);}
      if(target&&Number.isFinite(Number(target.x))&&Number.isFinite(Number(target.y))){event.x=Number(target.x);event.y=Number(target.y);event.screen=true;}
      const playerSource=event.whoId!==undefined?visualPlayersById.get(String(event.whoId)):null,
        mobSource=event.sourceId!==undefined?visualMobsById.get(String(event.sourceId)):null,
        source=playerSource||mobSource;
      if(source&&Number.isFinite(Number(source.x))&&Number.isFinite(Number(source.y))){event.sx=Number(source.x);event.sy=Number(source.y);
        if((event.t==="say"||event.t==="buff")&&!target){event.x=event.sx;event.y=event.sy;event.screen=true;}}
      return event;
    };
    const scheduled=scheduleOnlineAuthorityEvents(incoming.events,receivedAt);
    const suppressSpawnFx=!!((previous.pendingSpawns&&previous.pendingSpawns.length)||spawnBlocked);
    for(const remote of scheduled){
      if(suppressSpawnFx&&(remote.t==="spawn-blink"||remote.t==="spawn"))continue;
      const event=placeEvent(remote);
      previous.events.push(event);
    }
    // Defesa adicional contra snapshots repetidos/falhas prolongadas: uma
    // fila visual nunca pode crescer sem limite e bloquear o renderer.
    if(previous.events.length>500)previous.events.splice(0,previous.events.length-500);
  }

  // O activeCharacterId remoto pode estar um tick atrás logo após o clique.
  // Preserve primeiro o selecionado local; só use o remoto como fallback.
  const active=(previous.players||[]).find((ent)=>entityId(ent)===localActiveId)||
    (previous.players||[]).find((ent)=>entityId(ent)===String(descriptor.activeCharacterId||""))||previous.players[0];
  if(active&&active.p){
    previous.player=active;G.p=active.p;
    if(beforeLevel&&G.p.level>beforeLevel){
      if(typeof addLog==="function")addLog("level",`Subiu para o nível <b>${G.p.level}</b>!`);
      if(typeof toast==="function")toast(`Nível <b>${G.p.level}</b>!`,"level");
      if(G.renderer&&typeof G.renderer.addFloater==="function")G.renderer.addFloater(0.13,0.42,"LEVEL UP!","#ffe680",true);
    }
  }
  G.combat=previous;
  if(Number.isFinite(incomingVersion)&&incomingVersion>0){
    ONLINE_AUTH_APPLIED_VERSION=incomingVersion;
    if(instanceId)ONLINE_AUTH_APPLIED_INSTANCE=instanceId;
  }
  if(terminalReason){
    if(combatInstanceEntryPending())return true;
    clearInstanceSession(terminalReason,true);
    setTimeout(()=>{
      if(!G.combat)return;
      if(G.combat.worldBoss||(G.combat.boss&&G.combat.boss.worldBoss))return;
      stopHunt(true);
    },0);
  }
  // O loop redesenha canvas/HUD; não reconstrua party/modal a cada snapshot.
  return true;
}
function requestOnlineAuthorityTick(){
  if(ONLINE_AUTH_TICKING||!onlineAuthorityCombat())return;
  const leaseReady=typeof accountLeaseAllowsSimulation!=="function"||accountLeaseAllowsSimulation(),
    instanceReady=typeof accountInstanceActive!=="function"||accountInstanceActive();
  if(!leaseReady||!instanceReady||G.instanceReconnectPending){requestOnlineRuntimeRecovery();return;}
  ONLINE_AUTH_TICKING=true;
  accountTickInstance(sessionToken()).then((result)=>{
    if(result&&result.ok&&result.state)applyOnlineAuthorityState(result.state,result.terminalReason,
      result.version);
    else if(result&&result.ok&&!result.state&&result.terminalReason&&G.combat){
      if(combatInstanceEntryPending())return;
      clearInstanceSession(result.terminalReason,true);setTimeout(()=>{if(G.combat)stopHunt(true);},0);
    }else if(!result||!result.ok)requestOnlineRuntimeRecovery();
  }).catch(()=>{requestOnlineRuntimeRecovery();}).finally(()=>{ONLINE_AUTH_TICKING=false;});
}
if(typeof window!=="undefined"){
  window.addEventListener("tibia-idle-session-invalid",()=>{
    // O primeiro 401 autenticado é terminal para esta página. A conta-cliente
    // já encerrou transportes/lease; impeça também rAF/background de iniciar
    // ticks ou recovery com o token morto enquanto o login é recarregado.
    ONLINE_SESSION_INVALID=true;ONLINE_RUNTIME_RETRY_AT=Number.POSITIVE_INFINITY;ONLINE_AUTH_ACC=0;
    if(G){G.tickAcc=0;G.bgAcc=0;G.bgLast=Date.now();}
  });
  window.addEventListener("tibia-idle-session-restored",()=>{
    ONLINE_SESSION_INVALID=false;ONLINE_RUNTIME_RETRY_AT=0;
  });
  window.addEventListener("tibia-idle-sync-instance",(event)=>{
    const detail=event&&event.detail||{},state=detail.state,remote=detail.event||{};
    if(!state){
      if(G.foreignInstance)G.foreignInstance=null;
      const confirmedEnded=detail.lastStatus==="ended"||
        (remote.status==="ended"&&remote.matchesCurrent);
      if(G.combat&&confirmedEnded){
        // Não derrube arena recém-criada pelo tombstone da instância anterior.
        if(combatInstanceEntryPending())return;
        clearInstanceSession(remote.terminalReason||detail.terminalReason||"shared-ended",true);
        // Não derrubar arena World Boss ao encerrar a hunt anterior.
        if(G.combat.worldBoss||(G.combat.boss&&G.combat.boss.worldBoss))return;
        setTimeout(()=>{if(G.combat)stopHunt(true);},0);
      }
      return;
    }
    const belongs=G.p&&instanceIncludesCharacter(state,G.p.id);
    if(G.combat&&belongs)applyOnlineAuthorityState(state,detail.event&&detail.event.terminalReason,
      detail.meta&&detail.meta.version);
    else if(G.foreignInstance&&!belongs)G.foreignInstance.memberNames=(state.members||[]).map((m)=>m.p&&m.p.name||m.id);
  });
  window.addEventListener("tibia-idle-sync-party",()=>{
    if(typeof partySync==="function")partySync();
  });
}
function startBackgroundTick() {
  if (_bgTimer) return;
  _bgTimer = setInterval(() => {
    if (!G || !G.p || G.paused || !G.combat || !document.hidden) return;
    if(typeof accountLeaseAllowsSimulation==="function"&&!accountLeaseAllowsSimulation()){
      if(onlineAuthorityCombat())requestOnlineRuntimeRecovery();return;
    }
    if(onlineAuthorityCombat()){
      requestOnlineAuthorityTick();G.bgLast=Date.now();G.bgAcc=0;return;
    }
    const agora=Date.now(),last=G.bgLast||agora,carry=G.bgAcc||0;
    const elapsed=Math.max(0,agora-last)+carry;
    const result=advanceIdleInstance(elapsed,last-carry,{silent:true});
    G.bgLast=agora;G.bgAcc=Math.max(0,elapsed-result.processed);
    if(!G.combat)return;
    // reposição e autosave continuam usando relógio real em background.
    G.sellTimer=(G.sellTimer||0)+result.processed;
    if(G.sellTimer>15000){G.sellTimer=0;if(typeof autoRestock==="function")autoRestock(G.p);}
    G.saveTimer=(G.saveTimer||0)+result.processed;
    if(G.saveTimer>20000){G.saveTimer=0;if(typeof save==="function")save();}
  }, 200);
}

/* Loot Pouch: autoseller mede o limiar de 50 stacks, não a quantidade.
 * A coleta pode passar desse limiar sem descartar drops; o percentual fica
 * em 100% até que itens vendáveis sejam removidos. */
function pouchFillPct(p) {
  const cap = typeof LOOT_POUCH_MAX_SLOTS !== "undefined" ? LOOT_POUCH_MAX_SLOTS : 50;
  const used = typeof lootPouchSlotsUsed === "function"
    ? lootPouchSlotsUsed(p)
    : Object.keys((p && p.lootPouch) || {}).filter((s) => p.lootPouch[s] > 0).length;
  return Math.min(100, Math.round((used / cap) * 100));
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (!G.p) return;
  if(typeof accountLeaseAllowsSimulation==="function"&&!accountLeaseAllowsSimulation()){
    // FPS continua vivo enquanto a autoridade está pausada; tente readquirir
    // o lease/runtime para o jogo não ficar visualmente fluido porém congelado.
    if(G.combat&&onlineAuthorityCombat())requestOnlineRuntimeRecovery();
    G.last=ts;G.tickAcc=0;G.bgLast=Date.now();G.bgAcc=0;return;
  }
  // Alguns browsers ainda entregam rAF a 1fps em background. A simulação
  // oculta pertence exclusivamente ao relógio idle, evitando tick duplo.
  if(typeof document!=="undefined"&&document.hidden){G.last=ts;return;}
  /* Se estávamos com a aba escondida, descarta o frame de retorno
   * (ts pode ser segundos depois do G.last) e reinicia o relógio. */
  if (_wasHidden) {
    G.last = ts;
    G.tickAcc = 0;
    _wasHidden = false;
  }
  const dt = Math.min(250, ts - G.last || 16);
  G.last = ts;

  // a barra de cooldown anda sozinha, dentro ou fora da hunt — no Tibia o
  // cooldown nao pausa ao voltar para a cidade
  if (typeof renderCooldownBar === "function") renderCooldownBar(G.p);
  if (typeof avatarTick === "function") avatarTick(G.p, Date.now());

  if (!G.paused && G.combat) {
    // Level/skill up detection funciona nos dois modos (online e local).
    // No online, applyOnlineAuthorityState atualiza G.p.level/exp/skills
    // via Object.assign; sem este检测 o level-up não mostra toast/floater.
    const before = G.p.level;
    const beforeSkills = JSON.stringify(G.p.skills) + G.p.ml;
    if(onlineAuthorityCombat()){
      ONLINE_AUTH_ACC+=dt;
      if(!ONLINE_AUTH_TICKING&&ONLINE_AUTH_ACC>=ONLINE_AUTH_TICK_MS){
        ONLINE_AUTH_ACC=Math.min(ONLINE_AUTH_ACC-ONLINE_AUTH_TICK_MS,ONLINE_AUTH_TICK_MS);
        requestOnlineAuthorityTick();
      }
      // Somente interpolação/pathfinding visual roda no cliente online.
      if(typeof updateGridMovement==="function")updateGridMovement(G.combat,G.p,dt,Date.now());
      else if(typeof updateCombatMovement==="function")updateCombatMovement(G.combat,G.p,dt);
      // Preview Canary: teleporte 3× no cliente mesmo com combate no servidor.
      if(typeof tickSpawnQueue==="function"&&G.combat.pendingSpawns&&G.combat.pendingSpawns.length)
        tickSpawnQueue(G.combat,Date.now());
      // Eventos de combate (dano/cura/kill/dust/death) chegam via
      // applyOnlineAuthorityState e ficam na fila c.events.
      drainEvents();
      if (G.combat.greed && typeof greedRenderMinigame === "function") greedRenderMinigame(G.combat);
      else if (typeof greedHideMinigame === "function") greedHideMinigame();
      if (G.combat.hatred && typeof hatredRenderMinigame === "function") hatredRenderMinigame(G.combat, Date.now());
      else if (typeof hatredHideMinigame === "function") hatredHideMinigame();
      if (typeof scarlettRenderOnline === "function") scarlettRenderOnline(G.combat);
      if (typeof spiteRenderOnline === "function") spiteRenderOnline(G.combat);
      if (typeof maliceRenderOnline === "function") maliceRenderOnline(G.combat);
      if (typeof megaRenderOnline === "function") megaRenderOnline(G.combat);
      if (G.combat.greed) G.combat.greed.randomFn = Math.random;
      // Imbuements tickam por TEMPO DE COMBATE no cliente (o servidor
      // autoritativo não gerencia imbuements — eles são do save do char).
      if (typeof imbTickAll === "function") {
        const ents = G.combat.players && G.combat.players.length > 1 ? G.combat.players : [{ p: G.p }];
        for (const ent of ents) if (ent.p) imbTickAll(ent.p, dt);
      }
      // Online: cargas por tempo são autoritativas no servidor. Tick local
      // competia com o snapshot e podia “prender” o item em 1 carga.
      // Revive de party members caídos (visual)
      reviveDownedParty(G.combat,Date.now(),false);
      G._partyHudAt=(G._partyHudAt||0)+dt;
      if(G._partyHudAt>=250){G._partyHudAt=0;if(typeof updatePartyPanelLiveBars==="function")updatePartyPanelLiveBars();}
    }else{
    G.tickAcc += dt;
    while (G.tickAcc >= TICK) {
      combatTick(G.combat, G.p, TICK, Date.now());
      G.tickAcc -= TICK;
      const endedBecause=idleInstanceEndReason(G.combat,Date.now());
      if(endedBecause){finishIdleInstance(endedBecause,false);return;}
    }
    reviveDownedParty(G.combat,Date.now(),false);
    // Relogio dos imbuements: 20h de TEMPO DE COMBATE (ver imbuement.js).
    if (typeof imbTickAll === "function") {
      // Cada membro da party consome apenas os imbuements dos itens que ELE
      // tem equipados; não há relógio compartilhado entre personagens.
      const ents = G.combat.players && G.combat.players.length > 1 ? G.combat.players : [{ p: G.p }];
      for (const ent of ents) if (ent.p) imbTickAll(ent.p, dt);
    }

    // Movimento a cada FRAME, nao a cada tick de 100ms (como o combatTick
    // fazia). No Canary o servidor so marca o INICIO do passo no beat de
    // 50ms; a animacao do trajeto e o client que interpola na taxa da
    // tela. A decisao (playerThinkStep/monsterThinkStep) continua trancada
    // pelo stepDur/nextStepAt — o que muda e que a posicao desenhada agora
    // segue o dt real do frame, dando fluidez de 60fps. O motor antigo
    // fica de fallback caso grid.js/gridai.js nao carreguem.
    if (typeof updateGridMovement === "function") {
      updateGridMovement(G.combat, G.p, dt, Date.now());
    } else if (typeof updateCombatMovement === "function") {
      updateCombatMovement(G.combat, G.p, dt);
    }
    // CARGAS de anéis/amuletos/boots por TEMPO (1 carga/3s) — todos da party
    if (typeof tickAccessoryCharges === "function") {
      const ents = G.combat.players && G.combat.players.length > 1 ? G.combat.players : [{ p: G.p }];
      for (const ent of ents) if (ent.p) tickAccessoryCharges(ent.p, dt);
    }
    drainEvents();
    // HP/MP da party são entidades vivas; atualiza o painel em tempo real
    // mesmo quando outro membro está selecionado. Usamos a versão leve
    // (updatePartyPanelLiveBars) que só atualiza as barras via estilo,
    // evitando reconstruir innerHTML a cada 120ms (causava lag em combate).
    if (G.combat.players && G.combat.players.length > 1) {
      G._partyHudAt = (G._partyHudAt || 0) + dt;
      if (G._partyHudAt >= 120) {
        G._partyHudAt = 0;
        if (typeof updatePartyPanelLiveBars === "function") updatePartyPanelLiveBars();
        else if (typeof renderPartyPanel === "function") renderPartyPanel(G.p);
      }
    }
    }
    // Autoseller da Loot Pouch: só local/offline. Online a autoridade vende
    // (VIP) no tick — vender aqui mutava o cliente e o snapshot restaurava a pouch.
    if (G.p && G.p.config && G.p.config.pouchAutoSell) {
      if (typeof vipAutoSellAllowed === "function" && !vipAutoSellAllowed()) {
        G.p.config.pouchAutoSell = false;
      } else if (!onlineAuthorityCombat() && typeof sellAllPouch === "function") {
        G._pouchTick = (G._pouchTick || 0) + dt;
        if (G._pouchTick >= 2000) {
          G._pouchTick = 0;
          const pct = pouchFillPct(G.p);
          if (pct >= (G.p.config.pouchAutoSellPct || 80)) {
            const r = sellAllPouch(G.p);
            if (r.kinds) {
              if (typeof save === "function") save();
              addLog("sell", `Autoseller: Loot Pouch em <b>${pct}%</b> — vendeu tudo por <b>${fmtFull(r.gold)} gp</b>.`);
              if (typeof renderLootPouch === "function") renderLootPouch(G.p);
            }
          }
        }
      }
    }
    // Level up detection (online + local)
    if (G.p.level > before) {
      addLog("level", `Subiu para o nível <b>${G.p.level}</b>!`);
      toast(`Nível <b>${G.p.level}</b>!`, "level");
      G.renderer.addFloater(0.13, 0.42, "LEVEL UP!", "#ffe680", true);
    }
    if (JSON.stringify(G.p.skills) + G.p.ml !== beforeSkills) {
      renderSkills(G.p);
    }

    // auto equip a cada 15s (online + local) — reposição de supplies
    G.sellTimer += dt;
    if (G.sellTimer > 15000) {
      G.sellTimer = 0;
      const spent = autoRestock(G.p);
      if (spent > 0) {
        addLog("sell", `Repôs supplies por <span class="gold-txt">${fmtFull(spent)} gp</span>`);
        renderSupplies(G.p);
      }
      renderInventory(G.p);
      renderLootPouch(G.p);
    }
  }

  if (!G.paused && G.training) {
    const beforeSkills = JSON.stringify(G.p.skills) + G.p.ml;
    regenInCity(G.p, dt);
    // Stamina temporariamente fixa em 42h também durante o treino.
    const tr = G.training;
    G.p.stamina = FULL_STAMINA_SECONDS;
    academyTrainingTick(tr, G.p, dt, Date.now());
    drainAcademyEvents();
    if (JSON.stringify(G.p.skills) + G.p.ml !== beforeSkills) {
      renderSkills(G.p);
      renderStats(G.p);
    }
  }

  G.renderer.resize();
  if (G.training) {
    G.renderer.drawAcademy(G.training, G.p, dt);
  } else if (!G.combat) {
    // Durante o fetch OTBM ainda não há G.combat, mas a entrada já é válida.
    // Não reverta G.inCity nesse intervalo ou a finalização parecerá corrompida.
    if(!G.huntEntryPendingToken)G.inCity = true;
    // Na cidade a stamina também permanece temporariamente cheia.
    G.p.stamina = FULL_STAMINA_SECONDS;
    regenInCity(G.p, dt);
    // Soft boots / time rings: duração só com item EQUIPado (Canary stopduration).
    if (typeof tickAccessoryCharges === "function") tickAccessoryCharges(G.p, dt);
    tickManaTrain(G.p, dt);
    // caminhada: ao chegar num NPC, abre o dialogo dele
    const reached = G.walker.update(dt);
    if (reached) openNpc(reached);
    G.renderer.drawCityMap(G.p, dt, G.walker, G.hoverNpc);
  } else {
    G.renderer.draw(G.combat, G.p, dt);
  }

  // atualiza HUD a cada ~150ms
  G.hudAcc = (G.hudAcc || 0) + dt;
  if (G.hudAcc > 150) {
    G.hudAcc = 0;
    renderStats(G.p);
    renderTopbar(G.p);
    if (typeof renderStatusBar === "function") renderStatusBar(G.p);
    if (typeof refreshEquipChargeOverlays === "function") refreshEquipChargeOverlays(G.p);
    if (typeof renderPlayerStates === "function") renderPlayerStates(G.p);
    // selo da postura ativa no canto superior esquerdo da cena
    if (typeof renderStanceBadge === "function") renderStanceBadge(G.p);
  }
  // Analytics laterais acompanham a sessão sem redesenhar o DOM a cada frame.
  G.analyserAcc = (G.analyserAcc || 0) + dt;
  if (G.analyserAcc >= 500) {
    G.analyserAcc = 0;
    if (typeof renderOtcAnalyser === "function") renderOtcAnalyser();
  }

  // autosave a cada 20s
  G.saveTimer += dt;
  if (G.saveTimer > 20000) { G.saveTimer = 0; save(); }
  // Prey: o timer de 2h decrementa enquanto o personagem está caçando
  if (G.combat && typeof preyTick === "function") {
    preyTick(G.p, dt);
  }
}

/* ------------------------------------------------------------ render */
function renderAll() {
  const p = G.p;
  if (!p) return;
  renderStats(p);
  renderSkills(p);
  renderEquip(p);
  if (typeof renderStatusBar === "function") renderStatusBar(p);
  renderHunts(p);
  renderInventory(p);
  renderLootPouch(p);
  if (typeof renderSupplyStash === "function") renderSupplyStash(p);
  renderSupplies(p);
  renderSpells(p);
  renderHelper(p);
  renderMission();
  renderNpcQuick();
  renderBosses(p);
  renderTopbar(p);
  if (typeof renderCoinBalance === "function") renderCoinBalance();
  if (typeof renderOtcAnalyser === "function") renderOtcAnalyser();
  if (typeof renderStanceBadge === "function") renderStanceBadge(p);
  if (typeof renderPreyButton === "function") renderPreyButton(p);
  if (typeof renderPartyButton === "function") renderPartyButton(p);
  if (typeof renderRewardButton === "function") renderRewardButton(p);
  // painel de party estilo OTC (canto superior direito da tela do jogo)
  if (typeof renderPartyPanel === "function") renderPartyPanel(p);
  // OTClient HUD: combat modes, player states (o hud-panel com HP/MP/Lv foi
  // removido — level e mana já têm as barras fixas do painel do personagem)
  if (typeof renderPlayerStates === "function") renderPlayerStates(p);
}

/* ------------------------------------------------------------ boot */
/* Ao abrir o jogo, a sessão de combate nunca é retomada: todos os personagens
 * locais retornam ao templo de Thais com HP/MP completos. */
function resetRosterToTemple() {
  if (typeof partyOnlineMode === "function" && partyOnlineMode()) return;
  const roster = readRoster();
  for (const id of Object.keys(roster)) {
    const raw = roster[id] && roster[id].p;
    if (!raw) continue;
    const char = normalizePlayer(raw);
    const mx = maxStats(char);
    char.hp = mx.hp; char.mp = mx.mp;
    char.hunt = null; char.instanceMode = null;
    roster[id] = { v: 1, p: char };
  }
  writeRoster(roster);
}
async function loadOnlineInstanceAtBoot(token){
  let result={ok:false};
  // Reiniciar o processo HTTP derruba GET/SSE por alguns instantes. Não
  // conclua "sem instância" na primeira falha de transporte: isso limpava o
  // checkpoint local e mandava toda a party ao templo durante manutenção.
  for(let attempt=0;attempt<12;attempt++){
    result=await accountLoadInstance(token);
    if(result&&result.ok)return result;
    await new Promise((resolve)=>setTimeout(resolve,500));
  }
  return result;
}
function startGame(p) {
  // O templo OTBM precisa estar convertido antes de criar o CityWalker para
  // que o player nasça exatamente em (1020,1021,7).
  const templeReady = typeof loadOfficialTempleMap === "function"
    ? loadOfficialTempleMap() : Promise.resolve();
  // Todos os módulos JS já foram carregados pelo index; aqui aguardamos o
  // mapa e os assets essenciais para entrar sem sprites piscando vazios.
  if (typeof showGameLoading === "function" && typeof preloadGameAssets === "function") {
    if (typeof beginMapLoading === "function") beginMapLoading("Carregando o Templo Oficial de Thais...");
    else showGameLoading(true, "Carregando o Templo Oficial de Thais...", 0);
    return templeReady
      .then(() => preloadGameAssets(p, "Preparando templo"))
      .then(() => startGameReady(p))
      .then(() => {
        if (typeof finishMapLoading === "function") finishMapLoading();
        else showGameLoading(false);
      })
      .catch((error) => {
        G.runtimeStarting=false;showGameLoading(false);
        console.error(error);
        toast("Não foi possível carregar o templo oficial.", "bad");
      });
  }
  return templeReady.then(() => startGameReady(p));
}

async function startGameReady(p) {
  if(G.runtimeStarting||G.runtimeStarted)return;G.runtimeStarting=true;
  p = normalizePlayer(p);
  G.p = p;
  G.renderer = new Renderer($("#scene"));
  G.renderer.resize();
  G.walker = new CityWalker();

  // Migração: garante exercise weapon charges grátis para personagens antigos
  if (typeof ensureTraining === "function") {
    ensureTraining(p);
    const freeWeapon = p.voc === "knight" ? "exercise-sword"
      : p.voc === "paladin" ? "exercise-bow"
      : p.voc === "sorcerer" ? "exercise-wand"
      : p.voc === "druid" ? "exercise-rod"
      : p.voc === "monk" ? "exercise-wraps"
      : "exercise-sword";
    if (!p.exercise[freeWeapon]) p.exercise[freeWeapon] = 5000;
    if (!p.exercise["exercise-shield"]) p.exercise["exercise-shield"] = 5000;
  }

  $("#login").style.display = "none";
  $("#app").classList.add("ready");
  // modulelib lifecycle + background hide
  window.dispatchEvent(new Event("bg-game-start"));
  if (typeof moduleLifecycleStart === "function") moduleLifecycleStart();
  if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
      typeof showGlobalChat === "function") showGlobalChat();

  let localInstance=readInstanceSession();
  if(localInstance&&p.id&&(localInstance.members||[]).length&&
     !instanceIncludesCharacter(localInstance,p.id)){
    clearInstanceSession("wrong-character",true);localInstance=null;
  }
  let instanceSession=localInstance;
  if(typeof accountApiConfigured==="function"&&accountApiConfigured()&&
     typeof accountLoadInstance==="function"){
    const remote=await loadOnlineInstanceAtBoot(sessionToken());
    if(remote.ok&&remote.instance){
      const belongs=instanceIncludesCharacter(remote.instance,p.id);
      if(belongs){
        instanceSession=remote.instance;G.foreignInstance=null;
        try{localStorage.setItem(INSTANCE_SESSION_KEY,JSON.stringify(instanceSession));}catch(e){}
      }else{
        // A conta pode ter outro char solo caçando. Não renderize/controle a
        // instância dele; somente membros persistidos da mesma party entram.
        instanceSession=null;clearInstanceSession("different-character",true);
        G.foreignInstance={id:remote.meta&&remote.meta.id,kind:remote.instance.kind,
          activeCharacterId:remote.instance.activeCharacterId,
          memberNames:(remote.instance.members||[]).map((m)=>m.p&&m.p.name||m.id)};
      }
    }else if(remote.ok&&remote.lastStatus==="ended"){
      clearInstanceSession("remote-ended",true);instanceSession=null;
    }else if(remote.ok&&localInstance&&typeof accountSaveInstance==="function"){
      // Migração única do snapshot local legado para a fonte autoritativa.
      if(typeof accountBeginInstance==="function")accountBeginInstance();
      const migrated=await accountSaveInstance(sessionToken(),localInstance);
      instanceSession=migrated?localInstance:null;
    }else if(remote.ok){
      clearInstanceSession("remote-empty",true);instanceSession=null;
    }else{
      // Depois das tentativas, mantenha apenas o espelho já existente em vez
      // de teleportar para o templo. Ele não simula dano online sem resposta;
      // SSE/fallback reconciliará o snapshot assim que a API voltar.
      instanceSession=localInstance||null;
      if(instanceSession)G.instanceReconnectPending=true;
    }
  }
  // Migra saves antigos que guardavam apenas p.hunt/lastSeen (somente offline).
  if(!(typeof accountApiConfigured==="function"&&accountApiConfigured())&&
     !instanceSession&&p.hunt&&GAMEDATA.hunts[p.hunt])instanceSession={
    v:1,savedAt:p.lastSeen||Date.now(),startedAt:p.lastSeen||Date.now(),kind:"hunt",huntId:p.hunt,
    instanceMode:p.instanceMode||"non-pvp",activeCharacterId:p.id,
    members:[{id:p.id,p}],
  };
  if(typeof accountApiConfigured==="function"&&accountApiConfigured()&&!instanceSession){
    p.hunt=null;p.instanceMode=null;
  }
  // FIX: ao trocar de personagem na PT (online), o reload carrega o novo
  // personagem mas a sessão ainda tem activeCharacterId do personagem
  // anterior. Isso fazia resumeIdleInstance sobrescrever G.p de volta para
  // o personagem antigo. Atualiza para o personagem atual antes de retomar.
  if(instanceSession && p.id && instanceIncludesCharacter(instanceSession, p.id)){
    instanceSession = Object.assign({}, instanceSession, { activeCharacterId: String(p.id) });
    try { localStorage.setItem(INSTANCE_SESSION_KEY, JSON.stringify(instanceSession)); } catch(e){}
  }
  const off=instanceSession?null:computeOffline(p);
  p.lastSeen=Date.now();

  const startRuntime=(resumeResult)=>{
    // Duplo clique/reconnect concorrente não pode criar dois rAF loops,
    // timers e listeners sobre a mesma instância.
    if(G.runtimeStarted)return;G.runtimeStarting=false;G.runtimeStarted=true;
    if(!instanceSession)G.inCity=true;
    renderAll();bindControls();bindServerStatusControls();
    if(G.instanceReconnectPending)setServerConnectionStatus(false,{silent:true});
    addLog("info",`Bem-vindo, <b>${G.p.name}</b>!`);
    if(G.foreignInstance){
      const names=(G.foreignInstance.memberNames||[]).join(", ")||"outro personagem";
      addLog("info",`A instância ativa pertence a <b>${names}</b>; ${G.p.name} permaneceu no templo.`);
      toast(`Instância ativa de <b>${names}</b> não foi aberta neste personagem.`,"bad");
    }
    if(resumeResult&&resumeResult.resumed){
      addLog("info",`Instância retomada após <b>${fmtTime(Math.floor(resumeResult.elapsed/1000))}</b> em segundo plano.`);
    }
    if(off)showOfflineModal(off);
    G.last=performance.now();G.bgLast=Date.now();G.bgAcc=0;
    requestAnimationFrame(loop);
    window.addEventListener("beforeunload",save);
    window.addEventListener("pagehide",save);
    // O loop visível e startBackgroundTick já salvam a cada 20s. Um segundo
    // setInterval duplicava JSON/localStorage e causava long-task warnings.
    startBackgroundTick();
    if(typeof partyStartPolling==="function")partyStartPolling();
    if(typeof partyReportZone==="function"&&typeof partyCurrentZone==="function")
      setTimeout(()=>partyReportZone(partyCurrentZone()),1500);
  };

  if(!instanceSession){
    const mx=typeof maxStats==="function"?maxStats(p):null;
    if(mx){p.hp=mx.hp;p.mp=mx.mp;}
  }
  if(instanceSession)resumeIdleInstance(instanceSession).then(startRuntime);
  else startRuntime(null);
}

function bindControls() {
  const p = G.p;
  const btnHunts = $("#btn-hunts");
  if (btnHunts) btnHunts.addEventListener("click", () => {
    if (typeof openHuntsModal === "function") openHuntsModal();
  });
  const btnBosses = $("#btn-bosses");
  if (btnBosses) btnBosses.addEventListener("click", () => openBossesCatalogModal());
  const btnCidade = $("#btn-cidade");
  if (btnCidade) btnCidade.addEventListener("click", () => {
    if (typeof openCidadeModal === "function") openCidadeModal();
  });
  const btnRanking = $("#btn-ranking");
  if (btnRanking) btnRanking.addEventListener("click", () => {
    if (typeof openRankingModal === "function") openRankingModal();
  });
  const btnNpcs = $("#btn-npcs");
  if (btnNpcs) btnNpcs.addEventListener("click", () => {
    if (typeof openNpcsModal === "function") openNpcsModal();
  });
  $("#btn-cyclo").addEventListener("click", () => openCyclopedia());
  /* Market / Reward / Forge / Depot / Imbuements: só via modal CIDADE (e Cyclopedia). */
  const btnWheel = $("#btn-wheel");
  if (btnWheel) btnWheel.addEventListener("click", () => { if (typeof openWheelModal === "function") openWheelModal(); });
  const btnCharms = $("#btn-charms");
  if (btnCharms) btnCharms.addEventListener("click", () => {
    if (typeof openCyclopedia === "function") openCyclopedia("charms");
  });
  // painel de testes: so liga o botao se admin.js estiver carregado, para o
  // jogo continuar de pe se o arquivo for removido numa build de producao
  if (typeof bindPreyButton === "function") bindPreyButton();
  if (typeof bindPartyButton === "function") bindPartyButton();
  if (typeof bindLoyaltyButton === "function") bindLoyaltyButton();
  if (typeof bindTrainingButton === "function") bindTrainingButton();
  const btnAdmin = $("#btn-admin");
  if (btnAdmin) {
    const serverCfg = (typeof window !== "undefined" &&
      window.GLOBAL_IDLE_SERVER_CONFIG) || {};
    const account = sessionAccount();
    const onlineMode = typeof accountApiConfigured === "function" && accountApiConfigured();
    // Offline, TEST_SERVER, ou role admin: painel liberado. Em produção online
    // sem testServer, só contas admin. Grants no servidor também checam ownership.
    const adminAllowed = !onlineMode || !!serverCfg.testServer ||
      !!(account && account.role === "admin");
    if (typeof openAdmin === "function" && adminAllowed) {
      btnAdmin.addEventListener("click", () => openAdmin());
    } else {
      btnAdmin.style.display = "none";
    }
  }
  $("#btn-city").addEventListener("click", () => {
    if (G.inCity && !G.combat && !G.training) { toast("Você já está no templo"); return; }
    goToCity();
  });

  // interacao com NPCs no canvas da cidade
  const cv = $("#scene");
  const canvasPos = (e) => {
    const r = cv.getBoundingClientRect();
    return { mx: (e.clientX - r.left) * (cv.width / r.width),
             my: (e.clientY - r.top) * (cv.height / r.height) };
  };
  cv.addEventListener("mousemove", (e) => {
    if (!G.inCity || G.combat) {
      if (G.hoverNpc) { G.hoverNpc = null; cv.style.cursor = "default"; }
      return;
    }
    const { mx, my } = canvasPos(e);
    const id = G.renderer.npcAt(mx, my);
    G.hoverNpc = id;
    cv.style.cursor = id ? "pointer" : "default";
  });
  cv.addEventListener("mouseleave", () => { G.hoverNpc = null; });
  cv.addEventListener("click", (e) => {
    if (G.combat) {
      if (typeof playerAutoWalkOn === "function" && playerAutoWalkOn(G.p)) return;
      const { mx, my } = canvasPos(e);
      if (typeof canvasToCombatCell === "function" && G.combat.player) {
        G.combat.player.walkGoal = canvasToCombatCell(mx, my, cv.width, cv.height);
      }
      return;
    }
    if (!G.inCity) return;
    const { mx, my } = canvasPos(e);
    const id = G.renderer.npcAt(mx, my);
    if (id) {
      // caminha ate o NPC; se ja estiver do lado, abre na hora
      if (G.walker.goToNpc(id)) openNpc(id);
    } else {
      const w = G.renderer.screenToWorld(mx, my);
      G.walker.goToPixel(w.x, w.y, null);
    }
  });

  // ---- movimento por teclado (WASD e setas)
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };
  G.walkKeys = G.walkKeys || {};
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const k = KEYMAP[e.key];
    if (!k) return;
    // Labirinto Malice QTE: WASD/setas são do minigame (handler em capture).
    if (G.combat && G.combat.malice && G.combat.malice.qtePhase === "active") return;
    if (G.combat) {
      if (typeof playerAutoWalkOn === "function" && playerAutoWalkOn(G.p)) return;
      G.walkKeys[k] = true;
      e.preventDefault();
      return;
    }
    if (!G.inCity) return;
    G.walker.keys[k] = true;
    e.preventDefault();
  });
  document.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.key];
    if (k) {
      G.walker.keys[k] = false;
      if (G.walkKeys) G.walkKeys[k] = false;
    }
  });
  window.addEventListener("blur", () => { G.walker.keys = {}; G.walkKeys = {}; });

  // ESC fecha o modal aberto (e o context menu), como no client do Tibia.
  // O handler roda mesmo com foco em input, para o jogador nunca ficar
  // preso numa janela sem botao de fechar.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = $("#modal");
    if (modal && modal.classList.contains("show")) {
      modal.classList.remove("show", "wide");
      const modalBody = $("#modal-body");
      if (modalBody) {
        modalBody.classList.remove(
          "hunts-modal-shell", "bosses-modal-shell",
          "npcs-modal-shell", "cidade-modal-shell", "ranking-modal-shell"
        );
      }
      if (typeof closeModal === "function") closeModal();
    }
    if (typeof hideContextMenu === "function") hideContextMenu();
    if (typeof hideTip === "function") hideTip();
  });

  initPanelCollapse();
  const btnAutoWalk = $("#btn-auto-walk");
  if (btnAutoWalk) btnAutoWalk.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!G.p) return;
    const on = typeof togglePlayerAutoWalk === "function"
      ? togglePlayerAutoWalk(G.p)
      : (G.p.config.autoWalk = !(G.p.config && G.p.config.autoWalk !== false));
    if (typeof save === "function") save();
    if (typeof renderPartyPanel === "function") renderPartyPanel(G.p);
    toast(on ? "AUTO ligado" : "AUTO desligado — clique no chão ou WASD (1 SQM)");
  });
  $("#btn-lootpouch-config").addEventListener("click", openLootPouchConfigModal);
  $("#btn-pouch-sell-all").addEventListener("click", () => {
    const run = typeof sellAllPouchAndPersist === "function"
      ? sellAllPouchAndPersist(p)
      : Promise.resolve((() => {
          const r = sellAllPouch(p);
          if (r.kinds && typeof save === "function") save();
          return Object.assign({ ok: true }, r);
        })());
    Promise.resolve(run).then((r) => {
      if (!r || !r.ok) return;
      if (!r.kinds && !(r.gold > 0)) { toast("Nada para vender na Loot Pouch."); return; }
      toast(`Loot Pouch vendida por <b>${fmtFull(r.gold)} gp</b>`);
      if (typeof renderAll === "function") renderAll();
    });
  });
  $("#btn-switch").addEventListener("click", openCharacterModal);
  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Apagar o personagem e recomeçar? Isso não pode ser desfeito."))
      wipeSave();
  });
  $("#heal-at").addEventListener("input", (e) => {
    p.config.healAt = parseInt(e.target.value, 10);
    p.config.healSpellAt = p.config.healAt;
    p.config.healItemAt = p.config.healAt;
    $("#heal-at-val").textContent = p.config.healAt + "%";
    renderHelper(p);
  });
  $("#cfg-runes").addEventListener("change", (e) => {
    p.config.useRunes = e.target.checked;
  });
  $("#cfg-spell").addEventListener("change", (e) => {
    p.config.spellAttack = e.target.checked;
  });
  $("#bar-mode").addEventListener("change", (e) => {
    p.config.barMode = e.target.value;
  });
  $("#loot-filter").addEventListener("change", (e) => {
    p.config.lootFilter = e.target.value;
  });

  // tabs da coluna direita
  $$(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const group = t.dataset.group;
      $$(`.tab[data-group="${group}"]`).forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      $$(`[data-panel-group="${group}"]`).forEach((x) => {
        x.style.display = x.dataset.panel === t.dataset.panel ? "" : "none";
      });
    });
  });

  // sincroniza controles com o estado
  $("#heal-at").value = p.config.healAt;
  $("#heal-at-val").textContent = p.config.healAt + "%";
  $("#cfg-runes").checked = p.config.useRunes;
  $("#cfg-spell").checked = p.config.spellAttack;
  $("#bar-mode").value = p.config.barMode || "bars";
  $("#loot-filter").value = p.config.lootFilter;
}

/* ------------------------------------------------------------ personagens */
/* Kit inicial: o mesmo que o Canary entrega em Dawnport ao escolher a
 * vocacao (dawnport_vocation_trial.lua). Antes todo mundo comecava com
 * club + wooden shield, o que nao existe no servidor e ignorava que cada
 * vocacao ganha uma arma propria:
 *
 *   sorcerer  The Scorcher + spellbook of the novice
 *   druid     The Chiller  + spellbook of the novice
 *   paladin   bow + quiver + 100 simple arrows
 *   knight    dagger + wooden shield
 *   monk      simple jo staff
 *
 * Todos recebem leather helmet, coat, leather legs e leather boots, mais as
 * potions e runas da vocacao. giveStartingItems (js/supplies.js) le esses
 * dados; aqui ficam so os ajustes que o motor do jogo precisa. */
function giveStarterKit(p, options) {
  options = options || {};
  if (typeof giveStartingItems === "function") {
    giveStartingItems(p);
  } else {
    // fallback se supplydata.js nao carregou
    addItem(p, "club", 1);
    addItem(p, "wooden-shield", 1);
  }
  p.gold = Math.max(0, p.gold || 0);
  // Kit inicial: giveStartingItems já veste os slots Dawnport. Sem auto-equip
  // de "melhor item da bag" — o jogador troca o resto na aba Equipamento.
  if (p.voc === "paladin") {
    // o quiver de Dawnport ocupa o slot proprio; sem ele o paladino nao
    // consegue atirar, entao garantimos que esteja equipado
    if (!equippedQuiver(p) && GAMEDATA.items["quiver"]) {
      if (p.bag && p.bag["quiver"]) removeItem(p, "quiver", 1);
      // o quiver vai para a mao secundaria, devolvendo o escudo se houver
      if (p.equip.shield) addItem(p, p.equip.shield.item, 1);
      p.equip.shield = { item: "quiver", count: 1 };
    }
    if (!p.equip.weapon && GAMEDATA.items["bow"]) {
      p.equip.weapon = { item: "bow", count: 1 };
    }
    // simple arrow ativa por padrao: e a municao que vem no kit
    if (!p.equip.ammo) setActiveAmmo(p, "simple-arrow");
  }
  // Kit de treino: 5000 cargas gratis da exercise weapon da vocação
  // + 25 Tibia Coins para comprar mais cargas
  if (typeof ensureTraining === "function") {
    ensureTraining(p);
    const freeWeapon = p.voc === "knight" ? "exercise-sword"
      : p.voc === "paladin" ? "exercise-bow"
      : p.voc === "sorcerer" ? "exercise-wand"
      : p.voc === "druid" ? "exercise-rod"
      : p.voc === "monk" ? "exercise-wraps"
      : "exercise-sword";
    if (p.exercise[freeWeapon] === undefined || p.exercise[freeWeapon] === 0) {
      p.exercise[freeWeapon] = 5000;
    }
    // Também dá 5000 cargas de exercise shield para todos
    if (p.exercise["exercise-shield"] === undefined || p.exercise["exercise-shield"] === 0) {
      p.exercise["exercise-shield"] = 5000;
    }
  }
  if (!options.skipCoins && typeof accountAddCoins === "function") {
    if (typeof accountApiConfigured === "function" && accountApiConfigured())
      accountAddCoins(typeof sessionToken === "function" ? sessionToken() : "", 25);
    else accountAddCoins(25);
  }
  return p;
}

function createCharacter(name, voc, sex) {
  const p = newPlayer(name, voc, sex);
  giveStarterKit(p);
  normalizePlayer(p);
  saveCharacterToRoster(p);
  return p;
}

/* Desenha o retrato de cada personagem na lista, com o outfit atual dele.
   Os sprites podem ainda estar carregando, então tenta de novo por alguns frames. */
function paintCharPortraits(chars, tries) {
  tries = tries === undefined ? 24 : tries;
  let missing = false;
  for (const c of chars) {
    const box = document.querySelector(`[data-portrait="${c.id}"]`);
    if (!box || box.dataset.done) continue;
    const url = OutfitRenderer.preview(c, "s");
    if (url) {
      box.innerHTML = `<img src="${url}" alt="">`;
      box.dataset.done = "1";
    } else {
      missing = true;
    }
  }
  if (missing && tries > 0)
    setTimeout(() => paintCharPortraits(chars, tries - 1), 90);
}

/* -------------------------------------------------- change outfit */
function openOutfitModal() {
  const p = G.p;
  ensureOutfit(p);
  // As cores são pré-visualizadas no personagem vivo, mas o Cancelar
  // restaura esta cópia antes de voltar ao seletor.
  const originalColors = p.outfit.colors.slice();
  const draft = { type: p.outfit.type, colors: originalColors.slice() };
  const PARTS = [["Cabeça", 0], ["Corpo", 1], ["Pernas", 2], ["Pés", 3]];
  let part = 0;
  const render = () => {
    $$("#outfit-parts [data-opart]").forEach((b) => b.classList.toggle("primary", +b.dataset.opart === part));
    $$("#outfit-palette [data-ocolor]").forEach((s) => s.classList.toggle("sel", +s.dataset.ocolor === draft.colors[part]));
    // O renderer e o Wardrobe leem p.outfit.colors. Aplicar o draft aqui
    // faz cada clique da paleta atualizar imediatamente base + addons.
    p.outfit.colors = draft.colors.slice();
    const preview=$("#outfit-color-preview");
    if(preview&&typeof AppearanceRenderer!=="undefined"){
      const cv=AppearanceRenderer.preview(p,"s");
      if(cv){cv.style.width="72px";cv.style.height="72px";cv.style.imageRendering="pixelated";
        preview.innerHTML="";preview.appendChild(cv);}
    }
    const ward = $("#cyclo-content");
    if (ward && typeof cycloAppearance === "function") cycloAppearance(p, ward);
  };

  $("#modal-body").innerHTML = `
    <div class="panel-title">Change Outfit
      <span style="flex:1"></span><button class="sm" id="outfit-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="outfit-color-editor mb8">
        <div style="min-width:0;flex:1">
          <div class="small dim mb4">Cores do visual</div>
          <div class="row wrap mb4" id="outfit-parts" style="gap:4px">
            ${PARTS.map(([n, i]) => `<button class="sm" data-opart="${i}">${n}</button>`).join("")}
          </div>
          <div id="outfit-palette" class="outfit-palette outfit-palette-compact">
        ${OUTFIT_PALETTE.map((c, i) =>
          `<span class="swatch" data-ocolor="${i}" style="background:${c}" title="cor ${i}"></span>`).join("")}
        </div>
      </div>
      <div id="outfit-color-preview" class="outfit-preview" style="width:84px;height:84px;flex:none"></div>
      </div>
      <div class="small dim mt8 mb4">Wardrobe — outfits, addons e montarias</div>
      <div id="cyclo-content" class="outfit-wardrobe" style="max-height:330px;overflow:auto"></div>
      <div class="row" style="gap:6px;margin-top:8px">
        <button class="primary" style="flex:1" id="outfit-save">Salvar outfit</button>
        <button style="flex:none" id="outfit-cancel">Cancelar</button>
      </div>
    </div>`;
  $("#modal").classList.add("show", "wide");
  // A antiga tela Aparências da Cyclopedia passa a viver dentro do Change Outfit.
  if (typeof CYCLO !== "undefined") { CYCLO.appModo = "outfit"; CYCLO.filtro = "all"; }

  $$("#outfit-parts [data-opart]").forEach((b) => b.addEventListener("click", () => {
    part = +b.dataset.opart; render();
  }));
  $$("#outfit-palette [data-ocolor]").forEach((s) => s.addEventListener("click", () => {
    draft.colors[part] = +s.dataset.ocolor; render();
  }));
  const close = () => {
    p.outfit.colors=originalColors.slice();
    save();renderAll();openCharacterModal();
  };
  $("#outfit-close").addEventListener("click", close);
  $("#outfit-cancel").addEventListener("click", close);
  $("#outfit-save").addEventListener("click", () => {
    p.outfit = Object.assign({}, p.outfit || {}, { type: draft.type, colors: draft.colors.slice() });
    save();
    toast("Outfit atualizado!");
    renderAll();
    openCharacterModal();
  });
  render();
}

function openCharacterModal() {
  save();
  if (typeof accountApiConfigured === "function" && accountApiConfigured() &&
      typeof sessionToken === "function" && sessionToken() &&
      typeof window.openAccountCharacterPicker === "function") {
    window.openAccountCharacterPicker();
    return;
  }
  const chars = getCharacters();
  const currentId = G.p ? characterId(G.p) : localStorage.getItem(ACTIVE_CHARACTER_KEY);
  $("#modal-body").innerHTML = `
    <div class="panel-title">Trocar personagem
      <span style="flex:1"></span><button class="sm" id="char-close">✕</button>
    </div>
    <div class="panel-body">
      <div class="small dim mb4">Personagens salvos neste navegador</div>
      <div class="account-character-list mb8">
        ${chars.length ? `<div class="account-character-list-head">
          <span></span><span>Nome</span><span>Vocação</span><span>Level</span><span></span>
        </div>` + chars.map((p) => `
          <div class="account-character-card ${p.id === currentId ? "is-current" : ""}">
            <span class="account-character-outfit char-portrait" data-portrait="${p.id}"></span>
            <span class="account-character-name"><b>${p.name}${p.id === currentId ? " · atual" : ""}</b></span>
            <span class="account-character-voc">${vocationName(p)}</span>
            <span class="account-character-level">${p.level}</span>
            <button class="sm primary" data-load-char="${p.id}" ${p.id === currentId ? "disabled" : ""}>Entrar</button>
          </div>`).join("") : `<div class="account-character-empty">Nenhum personagem salvo.</div>`}
      </div>
      <button class="full mb8" id="char-outfit">👕 Change Outfit</button>
      <button class="primary full mb8" id="char-new-toggle">Criar novo personagem</button>
      <div id="char-new-box" class="panel-inset" style="display:none;padding:8px">
        <div class="field"><label>Nome</label><input id="new-char-name" maxlength="20" autocomplete="off"></div>
        <div class="field"><label>Sexo</label><select id="new-char-sex"><option value="male">Masculino</option><option value="female">Feminino</option></select></div>
        <div class="field"><label>Vocação</label><select id="new-char-voc">
          <option value="knight">Knight</option><option value="paladin">Paladin</option>
          <option value="druid">Druid</option><option value="sorcerer">Sorcerer</option>
          <option value="monk">Monk</option>
        </select></div>
        <button class="primary full" id="char-create">Criar e entrar</button>
      </div>
      <div class="tiny dim mt8">Ao trocar/criar personagem a página recarrega para iniciar a sessão limpa.</div>
    </div>`;
  $("#modal").classList.add("show");
  paintCharPortraits(chars);
  $("#char-close").addEventListener("click", () => $("#modal").classList.remove("show"));
  $("#char-outfit").addEventListener("click", () => openOutfitModal());
  $$("#modal-body [data-load-char]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.loadChar;
    // Party em hunt: a entidade já existe nesta instância. Nunca recarregue
    // para a cidade, pois isso criava uma cópia do membro ainda em combate.
    if (G.combat && G.combat.players && G.combat.players.some((e) => String(e.id) === String(id))) {
      if (typeof partyCombatSwitchTo === "function" && partyCombatSwitchTo(id)) {
        $("#modal").classList.remove("show");
        renderAll();
      }
      return;
    }
    const roster = readRoster();
    if (!roster[id] || !roster[id].p) { toast("Personagem não encontrado."); return; }
    save();
    localStorage.setItem(ACTIVE_CHARACTER_KEY, id);
    sessionStorage.setItem(AUTOLOGIN_KEY, id);
    location.reload();
  }));
  $("#char-new-toggle").addEventListener("click", () => {
    const box = $("#char-new-box");
    box.style.display = box.style.display === "none" ? "" : "none";
  });
  $("#char-create").addEventListener("click", () => {
    const name = ($("#new-char-name").value || "").trim();
    if (name.length < 2) { toast("Digite um nome válido"); return; }
    const np = createCharacter(name, $("#new-char-voc").value, $("#new-char-sex").value);
    sessionStorage.setItem(AUTOLOGIN_KEY, characterId(np));
    location.reload();
  });
}

/* ------------------------------------------------------------ login */
/* Login ONLINE (conta + MySQL): abas Entrar/Criar conta, picker de
 * personagem e criação de personagem na conta. */
function initAccountLogin() {
  let selSex = "male", selVoc = "knight";
  let selAppearance = "knight-m";
  let selColors = (typeof DEFAULT_OUTFIT_COLORS !== "undefined" && DEFAULT_OUTFIT_COLORS.knight
    ? DEFAULT_OUTFIT_COLORS.knight : [95, 116, 116, 95]).slice();
  let selLookPart = 0;
  let accountBootGeneration = 0;
  const acc = sessionAccount();

  function msg(t) {
    const el = $("#acc-msg");
    if (el) el.innerHTML = t || "";
  }
  try{
    if(sessionStorage.getItem("tibia-idle-session-expired")){
      sessionStorage.removeItem("tibia-idle-session-expired");
      msg("Sessão expirada — faça login novamente para retomar sua instância.");
    }
  }catch(e){}
  function closeAccountModal() {
    const modal = $("#modal");
    if (modal) modal.classList.remove("show", "wide", "login-modal");
  }
  function openAccountModal(html, wide) {
    const body = $("#modal-body"), modal = $("#modal");
    if (!body || !modal) return false;
    body.innerHTML = html;
    modal.classList.add("show");
    modal.classList.toggle("wide", !!wide);
    // Na tela de login (jogo não started), deixa o background aparecer
    // atrás do modal de seleção de personagens.
    const loginVisible = $("#login") && $("#login").style.display !== "none";
    const gameActive = typeof G !== "undefined" && G && G.p &&
      (G.combat || G.inCity || G.training || ($("#app") && $("#app").classList.contains("ready")));
    modal.classList.toggle("login-modal", !!loginVisible && !gameActive);
    return true;
  }
  function vocOutfit(v, s) {
    const map = { knight:"knight", paladin:"hunter", druid:"summoner",
      sorcerer:"mage", monk:"monk" };
    return (map[v] || "citizen") + "-" + (s === "female" ? "f" : "m");
  }
  function resetCreatorLook() {
    selAppearance = vocOutfit(selVoc, selSex);
    selColors = (typeof DEFAULT_OUTFIT_COLORS !== "undefined" &&
      (DEFAULT_OUTFIT_COLORS[selVoc] || DEFAULT_OUTFIT_COLORS.none)
      ? (DEFAULT_OUTFIT_COLORS[selVoc] || DEFAULT_OUTFIT_COLORS.none) : [78, 68, 58, 76]).slice();
    selLookPart = 0;
  }
  function creatorLookPlayer() {
    const p = { voc: selVoc, sex: selSex,
      outfit: { appearance: selAppearance, colors: selColors.slice(), addons: 0, mount: null } };
    if (typeof ensureOutfit === "function") ensureOutfit(p);
    if (typeof ensureWardrobe === "function") ensureWardrobe(p);
    if (typeof setAppearance === "function") setAppearance(p, selAppearance);
    else if (p.outfit) p.outfit.appearance = selAppearance;
    if (p.outfit) p.outfit.colors = selColors.slice();
    if (typeof syncOutfitLook === "function") syncOutfitLook(p);
    return p;
  }
  function starterOutfitIds() {
    const sexo = selSex === "female" ? "f" : "m";
    const bases = (typeof APP_INICIAIS !== "undefined" && APP_INICIAIS.length)
      ? APP_INICIAIS : ["citizen", "hunter", "mage", "knight", "summoner", "monk"];
    const ids = [];
    for (const base of bases) {
      const id = base + "-" + sexo;
      if (typeof APP_OUTFIT === "undefined" || APP_OUTFIT[id]) ids.push(id);
    }
    const vocId = vocOutfit(selVoc, selSex);
    if (ids.indexOf(vocId) === -1) ids.unshift(vocId);
    return ids;
  }
  function paintCreatorLook() {
    const p = creatorLookPlayer();
    const preview = $("#acc-create-preview");
    if (preview && typeof AppearanceRenderer !== "undefined") {
      const cv = AppearanceRenderer.preview(p, "s");
      if (cv) {
        cv.style.width = "72px"; cv.style.height = "72px";
        cv.style.imageRendering = "pixelated";
        preview.innerHTML = ""; preview.appendChild(cv);
      } else {
        preview.innerHTML = `<div class="tiny dim">…</div>`;
        setTimeout(paintCreatorLook, 90);
      }
    }
    $$("#acc-look-parts [data-opart]").forEach((b) =>
      b.classList.toggle("primary", +b.dataset.opart === selLookPart));
    $$("#acc-look-palette [data-ocolor]").forEach((s) =>
      s.classList.toggle("sel", +s.dataset.ocolor === selColors[selLookPart]));
    const grid = $("#acc-starter-outfits");
    if (grid) {
      grid.innerHTML = starterOutfitIds().map((id) => {
        const o = typeof APP_OUTFIT !== "undefined" ? APP_OUTFIT[id] : null;
        const nome = o ? o.nome : id;
        return `<button class="sm ${id === selAppearance ? "primary" : ""}" data-starter-outfit="${id}">${nome}</button>`;
      }).join("");
      $$("#acc-starter-outfits [data-starter-outfit]").forEach((b) =>
        b.addEventListener("click", () => {
          selAppearance = b.dataset.starterOutfit;
          paintCreatorLook();
        }));
    }
  }
  function accountCharacterPreview(c) {
    const preview = {
      id:String(c.id), name:c.name, voc:c.voc || "knight", promoted:!!c.promoted,
      level:Number(c.level) || 1, sex:c.sex || "male",
      outfit:c.outfit ? JSON.parse(JSON.stringify(c.outfit)) : null,
    };
    if (typeof ensureOutfit === "function") ensureOutfit(preview);
    if (typeof syncOutfitLook === "function") syncOutfitLook(preview);
    return preview;
  }
  function paintAccountPortraits(characters, tries) {
    tries = tries === undefined ? 25 : tries;
    let pending = false;
    for (const c of characters) {
      const host = document.querySelector(`[data-account-portrait="${c.id}"]`);
      if (!host || host.dataset.done === "1") continue;
      const preview = accountCharacterPreview(c);
      const cv = typeof AppearanceRenderer !== "undefined"
        ? AppearanceRenderer.preview(preview, "s") : null;
      if (cv) {
        cv.style.width = "48px"; cv.style.height = "48px";
        cv.style.imageRendering = "pixelated";
        host.innerHTML = ""; host.appendChild(cv); host.dataset.done = "1";
      } else {
        pending = true;
      }
    }
    if (pending && tries > 0) setTimeout(() => paintAccountPortraits(characters, tries - 1), 90);
  }
  function showLeaseConflict(token,summary,lease){
    const until=lease&&lease.expiresAt?new Date(lease.expiresAt).toLocaleTimeString():"em instantes";
    if(!openAccountModal(`<div class="panel-title">Conta já está ativa</div>
      <div class="panel-body account-flow-body">
        <div class="account-identity-warning">Outra aba ou dispositivo controla esta conta até <b>${until}</b>.
          Para impedir recompensas duplicadas, somente uma instância pode simular por vez.</div>
        <button class="danger full mt8" id="acc-lease-takeover">Assumir controle nesta aba</button>
        <button class="full mt8" id="acc-lease-cancel">Cancelar</button>
        <div class="tiny dim center mt8" id="acc-lease-msg"></div>
      </div>`,true))return;
    $("#acc-lease-cancel").onclick=closeAccountModal;
    $("#acc-lease-takeover").onclick=async()=>{
      const button=$("#acc-lease-takeover"),status=$("#acc-lease-msg");button.disabled=true;
      status.textContent="Transferindo controle...";
      try{
        const result=await accountAcquireLease(token,true);
        if(!result.ok){status.textContent=result.msg||"Falha ao transferir controle.";return;}
        closeAccountModal();await enterCharacter(token,summary,true);
      }finally{button.disabled=false;}
    };
  }
  async function enterCharacter(token, summary, leaseReady) {
    const alreadyPlaying = typeof G !== "undefined" && G && G.p;
    if (alreadyPlaying) {
      if (String(G.p.id) === String(summary.id)) { closeAccountModal(); return true; }
      // O picker online também é usado dentro de hunts/bosses. Se o alvo já
      // participa do combate compartilhado, trocar significa apenas transferir
      // o controle para a entidade existente — nunca salvar/recarregar a página.
      const partyEntity=G.combat&&Array.isArray(G.combat.players)&&
        G.combat.players.find((ent)=>String(ent&&(ent.id||(ent.p&&ent.p.id)))===String(summary.id));
      const partyState=G.p._partyOnline||null;
      const partyMember=partyState&&[partyState.leader].concat(partyState.members||[])
        .some((member)=>String(member&&member.id)===String(summary.id));
      if(G.combat&&(partyEntity||partyMember)){
        const switched=typeof partyCombatSwitchOnlineTo==="function"
          ? await partyCombatSwitchOnlineTo(summary.id)
          : typeof partyCombatSwitchTo==="function"&&partyCombatSwitchTo(summary.id);
        if(switched)closeAccountModal();
        return !!switched;
      }
      if (typeof save === "function") save();
      try { sessionStorage.setItem("tibia-idle-online-autoload", String(summary.id)); } catch (e) {}
      location.reload(); return true;
    }
    if(!leaseReady&&typeof accountAcquireLease==="function"){
      msg("Reservando controle da conta...");
      const lease=await accountAcquireLease(sessionToken()||token,false);
      if(!lease.ok){
        msg("");
        if(lease.unauthorized){
          msg(lease.msg||"Sessão expirada — faça login novamente.");
          return;
        }
        showLeaseConflict(token,summary,lease);return;
      }
    }
    msg("Carregando <b>" + summary.name + "</b>...");
    const loaded = typeof accountLoadCharacter === "function"
      ? await accountLoadCharacter(token, summary.id) : { ok:false };
    if (!loaded.ok || !loaded.character) {
      if(typeof accountReleaseLease==="function")await accountReleaseLease(token);
      msg(loaded.msg || "Não foi possível carregar o personagem.");
      return;
    }
    const character = loaded.character;
    let raw = character.data || {};
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch (e) { raw = {}; }
    }
    const p = normalizePlayer(Object.assign({}, raw, {
      id:String(character.id), name:character.name || summary.name,
      voc:character.voc || raw.voc || "knight",
      level:Number(character.level) || raw.level || 1,
    }));
    try { sessionStorage.setItem("tibia-idle-char", String(character.id)); } catch (e) {}
    closeAccountModal();
    startGame(p);
  }
  function paintCreatorVocations() {
    const grid = $("#acc-voc-grid");
    if (!grid) return;
    const vocs = ["knight", "paladin", "druid", "sorcerer", "monk"];
    grid.innerHTML = vocs.map((v) => `
      <div class="voc-card ${v === selVoc ? "sel" : ""}" data-voc="${v}">
        <img src="assets/outfit/${vocOutfit(v, selSex)}_s.png" alt="">
        <div class="vn">${VOCATIONS[v].name}</div>
        <div class="vd">${VOCATIONS[v].desc}</div>
      </div>`).join("");
    $$("#acc-voc-grid .voc-card").forEach((card) =>
      card.addEventListener("click", () => {
        selVoc = card.dataset.voc;
        resetCreatorLook();
        paintCreatorVocations();
        paintCreatorLook();
      }));
  }
  function showCharacterCreator(token, account, characters) {
    const PARTS = [["Cabeça", 0], ["Corpo", 1], ["Pernas", 2], ["Pés", 3]];
    if (!openAccountModal(`
      <div class="panel-title">Criar personagem
        <span style="flex:1"></span><button class="sm" id="acc-create-back">← Voltar</button>
      </div>
      <div class="panel-body account-flow-body">
        <div class="field"><label>Nome do personagem</label>
          <input id="acc-char-name" maxlength="20" placeholder="Nome do personagem" autocomplete="off"></div>
        <div class="small dim mb4">Sexo — define permanentemente quais outfits e addons estarão disponíveis</div>
        <div class="row mb8 account-sex-choice" style="gap:5px">
          <button data-sex="male" class="primary sm acc-sex"><b>MALE</b><span>Masculino</span></button>
          <button data-sex="female" class="sm acc-sex"><b>FEMALE</b><span>Feminino</span></button>
        </div>
        <div class="small dim mb4">Vocação</div>
        <div class="voc-grid mb8" id="acc-voc-grid"></div>
        <div class="small dim mb4">Visual inicial — cores e outfit da vocação</div>
        <div class="creator-look-editor mb8">
          <div id="acc-create-preview" class="outfit-preview" style="width:84px;height:84px;flex:none"></div>
          <div style="min-width:0;flex:1">
            <div class="row wrap mb4" id="acc-look-parts" style="gap:4px">
              ${PARTS.map(([n, i]) => `<button class="sm" data-opart="${i}">${n}</button>`).join("")}
            </div>
            <div id="acc-look-palette" class="outfit-palette outfit-palette-compact">
              ${(typeof OUTFIT_PALETTE !== "undefined" ? OUTFIT_PALETTE : []).map((c, i) =>
                `<span class="swatch" data-ocolor="${i}" style="background:${c}" title="cor ${i}"></span>`).join("")}
            </div>
            <div class="tiny dim mt4 mb4">Outfits iniciais desta conta (addons e montarias compram-se com gold depois)</div>
            <div class="row wrap" id="acc-starter-outfits" style="gap:4px"></div>
          </div>
        </div>
        <button class="primary full" id="acc-btn-create-char">Criar personagem</button>
        <div class="tiny dim center mt8" id="acc-flow-msg"></div>
      </div>`, true)) return;
    selSex = "male"; selVoc = "knight"; resetCreatorLook();
    paintCreatorVocations(); paintCreatorLook();
    $$("#modal-body .acc-sex").forEach((button) => button.addEventListener("click", () => {
      selSex = button.dataset.sex;
      $$("#modal-body .acc-sex").forEach((x) => x.classList.remove("primary"));
      button.classList.add("primary");
      resetCreatorLook(); paintCreatorVocations(); paintCreatorLook();
    }));
    $$("#acc-look-parts [data-opart]").forEach((b) => b.addEventListener("click", () => {
      selLookPart = +b.dataset.opart; paintCreatorLook();
    }));
    $$("#acc-look-palette [data-ocolor]").forEach((s) => s.addEventListener("click", () => {
      selColors[selLookPart] = +s.dataset.ocolor; paintCreatorLook();
    }));
    $("#acc-create-back").onclick = () => showPicker(token, account, characters);
    const create = $("#acc-btn-create-char");
    create.onclick = async () => {
      if (create.disabled) return;
      const name = ($("#acc-char-name").value || "").trim();
      const status = $("#acc-flow-msg");
      if (name.length < 2) { status.textContent = "Digite um nome válido."; return; }
      create.disabled = true; status.textContent = "Criando personagem...";
      try {
        const draft = newPlayer(name, selVoc, selSex);
        giveStarterKit(draft,{skipCoins:true}); normalizePlayer(draft);
        // A wardrobe inicial é materializada já com o sexo escolhido; o
        // catálogo nunca mistura outfits/addons MALE e FEMALE.
        if(typeof ensureWardrobe==="function")ensureWardrobe(draft);
        if(typeof setAppearance==="function")setAppearance(draft, selAppearance);
        draft.outfit.colors = selColors.slice();
        if(typeof syncOutfitLook==="function")syncOutfitLook(draft);
        const result = await accountCreateCharacter(token, name, selVoc, draft);
        if (!result.ok) { status.textContent = result.msg || "Falha ao criar personagem."; return; }
        // O bônus inicial de TC é transação exclusiva do servidor.
        const refreshed = await accountMe(token);
        if (refreshed.ok) showPicker(token, refreshed.account, refreshed.characters || []);
        else showPicker(token, account, characters.concat([Object.assign({}, result.character, {
          sex:selSex, outfit:draft.outfit, wardrobe:draft.wardrobe,
        })]));
      } finally {
        create.disabled = false;
      }
    };
    $("#acc-char-name").onkeydown = (e) => { if (e.key === "Enter") create.click(); };
  }
  async function logoutAccount() {
    const wasPlaying = typeof G !== "undefined" && G && G.p;
    if (wasPlaying && typeof save === "function") save();
    if(wasPlaying&&typeof accountLastSavePromise==="function"){
      try{await accountLastSavePromise();}catch(e){}
    }
    if(wasPlaying&&typeof accountLastInstancePromise==="function"){
      try{await accountLastInstancePromise();}catch(e){}
    }
    if(typeof accountStopSync==="function")accountStopSync();
    if(typeof hideGlobalChat==="function")hideGlobalChat();
    if(typeof accountReleaseLease==="function"){
      try{await accountReleaseLease(sessionToken());}catch(e){}
    }
    if(typeof accountLogout==="function"){
      try{await accountLogout(sessionToken());}catch(e){}
    }
    if(typeof accountCharacterCacheClear==="function")accountCharacterCacheClear();
    try {
      sessionStorage.removeItem("tibia-idle-token");
      sessionStorage.removeItem("tibia-idle-account");
      sessionStorage.removeItem("tibia-idle-char");
      sessionStorage.removeItem("tibia-idle-online-autoload");
      sessionStorage.removeItem(AUTOLOGIN_KEY);
    } catch (e) {}
    closeAccountModal();
    if (wasPlaying) { location.reload(); return; }
    $("#login").style.display = "";
    $("#app").classList.remove("ready");
    msg("Logout realizado.");
  }
  function showIdentityRepair(token,account,characters,summary){
    selSex=summary.sex||"male";selVoc=["knight","paladin","druid","sorcerer","monk"].includes(summary.voc)?summary.voc:"knight";
    if(!openAccountModal(`
      <div class="panel-title">Reparar ${summary.name}
        <span style="flex:1"></span><button class="sm" id="acc-repair-back">← Voltar</button>
      </div>
      <div class="panel-body account-flow-body">
        <div class="account-identity-warning">Este personagem recebeu dados de <b>${summary.dataOwnerName||"outro personagem"}</b>
          em uma versão antiga. Escolha a identidade correta. O level ${summary.level} será mantido e o kit inicial será recriado.</div>
        <div class="row mb8" style="gap:5px"><button data-sex="male" class="sm acc-sex ${selSex==="male"?"primary":""}">Masculino</button>
          <button data-sex="female" class="sm acc-sex ${selSex==="female"?"primary":""}">Feminino</button></div>
        <div class="small dim mb4">Vocação correta</div><div class="voc-grid mb8" id="acc-voc-grid"></div>
        <button class="primary full" id="acc-confirm-repair">Reparar identidade</button>
        <div class="tiny dim center mt8" id="acc-repair-msg"></div>
      </div>`,true))return;
    paintCreatorVocations();
    $$("#modal-body .acc-sex").forEach(button=>button.onclick=()=>{
      selSex=button.dataset.sex;$$("#modal-body .acc-sex").forEach(x=>x.classList.remove("primary"));
      button.classList.add("primary");paintCreatorVocations();
    });
    $("#acc-repair-back").onclick=()=>showPicker(token,account,characters);
    const confirm=$("#acc-confirm-repair");confirm.onclick=async()=>{
      if(confirm.disabled)return;confirm.disabled=true;const status=$("#acc-repair-msg");status.textContent="Reparando...";
      try{
        const draft=newPlayer(summary.name,selVoc,selSex);giveStarterKit(draft,{skipCoins:true});
        draft.id=String(summary.id);draft.level=Number(summary.level)||1;draft.exp=expForLevel(draft.level);
        const mx=maxStats(draft);draft.hp=mx.hp;draft.mp=mx.mp;
        const result=await accountRepairCharacter(token,summary.id,selVoc,draft);
        if(!result.ok){status.textContent=result.msg||"Falha ao reparar.";return;}
        const refreshed=await accountMe(token);
        if(refreshed.ok)showPicker(token,refreshed.account,refreshed.characters||[]);
      }finally{confirm.disabled=false;}
    };
  }
  function showPicker(token, account, characters) {
    characters = Array.isArray(characters) ? characters : [];
    if(typeof accountCharacterCacheWrite==="function")accountCharacterCacheWrite(characters);
    try {
      sessionStorage.setItem("tibia-idle-token", token);
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(account));
    } catch (e) {}
    if(typeof syncVipFromAccount==="function")syncVipFromAccount(account);
    if(typeof accountSetGold==="function"&&account&&account.gold!==undefined)
      accountSetGold(Math.max(0,Number(account.gold)||0));
    if(typeof accountSetCoins==="function"&&account&&account.coins!==undefined)
      accountSetCoins(Math.max(0,Number(account.coins)||0));
    if(typeof accountStartSync==="function")accountStartSync(token).catch(()=>{});
    const cards = characters.length ? characters.map((c) => `
      <button class="account-character-card ${c.identityMismatch?"identity-mismatch":""}"
        ${c.identityMismatch?`data-repair-char="${c.id}"`:`data-acc-char="${c.id}"`}>
        <span class="account-character-outfit" data-account-portrait="${c.id}"></span>
        <span class="account-character-name">
          <b>${c.name}</b>
          ${c.identityMismatch?`<span class="identity-error">Dados cruzados com ${c.dataOwnerName||"outro personagem"}</span>`:""}
        </span>
        <span class="account-character-voc">${vocationName({voc:c.voc || "knight",promoted:!!c.promoted})}</span>
        <span class="account-character-level">${Number(c.level) || 1}</span>
        <span class="account-character-enter">${c.identityMismatch?"REPARAR":"ENTRAR ›"}</span>
      </button>`).join("") :
      `<div class="account-character-empty">Nenhum personagem nesta conta.</div>`;
    if (!openAccountModal(`
      <div class="panel-title">Personagens de ${account.login || "sua conta"}
        <span style="flex:1"></span><span class="tiny dim">${account.coins || 0} Tibia Coins</span>
      </div>
      <div class="panel-body account-flow-body">
        <div class="account-character-list">${characters.length ? `<div class="account-character-list-head">
          <span></span><span>Nome</span><span>Vocação</span><span>Level</span><span></span>
        </div>` : ""}${cards}</div>
        <button class="primary full mt8" id="acc-open-create-char">Criar personagem</button>
        <button class="full mt8" id="acc-customize-char" ${typeof G!=="undefined"&&G&&G.p?"":"disabled"}>👕 Personalizar personagem</button>
        <button class="danger full mt8" id="acc-logout">Logout</button>
      </div>`, true)) return;
    paintAccountPortraits(characters);
    $$("#modal-body [data-acc-char]").forEach((row) => row.addEventListener("click", () => {
      const summary = characters.find((c) => String(c.id) === String(row.dataset.accChar));
      if (summary) enterCharacter(token, summary);
    }));
    $$("#modal-body [data-repair-char]").forEach(row=>row.addEventListener("click",()=>{
      const summary=characters.find(c=>String(c.id)===String(row.dataset.repairChar));
      if(summary)showIdentityRepair(token,account,characters,summary);
    }));
    $("#acc-open-create-char").onclick = () => showCharacterCreator(token, account, characters);
    const customize=$("#acc-customize-char");
    if(customize)customize.onclick=()=>{
      if(typeof G==="undefined"||!G||!G.p){msg("Entre em um personagem antes de personalizá-lo.");return;}
      closeAccountModal();openOutfitModal();
    };
    $("#acc-logout").onclick = logoutAccount;
  }
  function openRegisterModal() {
    if (!openAccountModal(`
      <div class="panel-title">Criar conta
        <span style="flex:1"></span><button class="sm" id="acc-register-cancel">✕</button>
      </div>
      <form class="panel-body account-flow-body" id="acc-register-form" method="post" action="#" onsubmit="return false;">
        <div class="field"><label for="acc-new-login">Login</label>
          <input id="acc-new-login" name="username" maxlength="32" placeholder="escolha um login" autocomplete="username"></div>
        <div class="field"><label for="acc-new-password">Senha</label>
          <input id="acc-new-password" name="password" type="password" maxlength="64" placeholder="••••••" autocomplete="new-password"></div>
        <button class="primary full" id="acc-btn-register" type="submit">Criar conta</button>
        <div class="tiny dim center mt8" id="acc-register-msg"></div>
      </form>`)) return;
    $("#acc-register-cancel").onclick = closeAccountModal;
    const register = $("#acc-btn-register");
    $("#acc-register-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (register.disabled) return;
      const login = ($("#acc-new-login").value || "").trim();
      const pass = $("#acc-new-password").value || "";
      const status = $("#acc-register-msg");
      if (!login || !pass) { status.textContent = "Informe login e senha."; return; }
      register.disabled = true; status.textContent = "Criando conta...";
      try {
        const result = await accountRegister(login, pass);
        if (!result.ok) { status.textContent = result.msg || "Falha ao criar conta."; return; }
        closeAccountModal();
        $("#acc-login").value = login; $("#acc-password").value = "";
        msg("Conta criada! Informe sua senha para entrar.");
        $("#acc-password").focus();
      } finally {
        register.disabled = false;
      }
    });
    $("#acc-new-login").focus();
  }

  $("#acc-open-register").addEventListener("click", openRegisterModal);
  $("#account-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#acc-btn-login");
    if (button.disabled) return;
    const login = ($("#acc-login").value || "").trim();
    const pass = $("#acc-password").value || "";
    if (!login || !pass) { msg("Informe login e senha"); return; }
    button.disabled = true; msg("Entrando...");
    const bootGen=++accountBootGeneration;
    try {
      const result = await accountLogin(login, pass);
      if (bootGen!==accountBootGeneration) return;
      if (!result.ok) { msg(result.msg || "Falha no login"); return; }
      msg(""); showPicker(result.token, result.account, result.characters);
    } finally {
      button.disabled = false;
    }
  });

  // Sessão existente em refresh: reabre diretamente o modal de personagens.
  const token = sessionToken();
  if (token && acc) {
    msg("Reconectando...");
    const bootGen=++accountBootGeneration;
    accountMe(token).then((result) => {
      if (bootGen!==accountBootGeneration) return;
      if (result.ok) {
        msg("");if(typeof accountStartSync==="function")accountStartSync(token).catch(()=>{});
        let autoId="";try{autoId=sessionStorage.getItem("tibia-idle-online-autoload")||"";
          sessionStorage.removeItem("tibia-idle-online-autoload");}catch(e){}
        const target=(result.characters||[]).find(c=>String(c.id)===String(autoId));
        if(target)enterCharacter(sessionToken()||token,target);
        else showPicker(sessionToken()||token, result.account, result.characters || []);
      } else { logoutAccount(); msg("Sessão expirada — faça login novamente."); }
    });
  }
  // Reutilizado pelo botão Trocar personagem no modo online.
  window.openAccountCharacterPicker = async function () {
    const currentToken = sessionToken();
    if (!currentToken) return false;
    const result = await accountMe(currentToken);
    if (!result.ok) { logoutAccount(); return false; }
    showPicker(currentToken, result.account, result.characters || []);
    return true;
  };
}
function initLogin() {
  // Boot online-first: o HTML já mostra #account-login. O create local
  // legado (#local-login / "Criar personagem e caçar") nunca entra no
  // primeiro paint — só reaparece se a API de contas não estiver configurada.
  const online = typeof accountApiConfigured === "function" && accountApiConfigured();
  const accLogin = $("#account-login");
  const localLogin = $("#local-login");
  const continueBox = $("#continue-box");
  if (online) {
    if (accLogin) accLogin.style.display = "";
    if (localLogin) { localLogin.style.display = "none"; localLogin.hidden = true; }
    if (continueBox) continueBox.style.display = "none";
    initAccountLogin();
    return;
  }

  // Offline legado: libera o create local; criação pós-login da conta
  // continua em showCharacterCreator (modal), não nesta tela.
  if (accLogin) accLogin.style.display = "none";
  if (localLogin) { localLogin.hidden = false; localLogin.style.display = ""; }

  const saved = load();

  // veio de "Trocar personagem"/"Criar e entrar": entra direto, sem passar
  // pela tela de criação.
  let autoId = null;
  try { autoId = sessionStorage.getItem(AUTOLOGIN_KEY); } catch (e) { autoId = null; }
  if (autoId) {
    try { sessionStorage.removeItem(AUTOLOGIN_KEY); } catch (e) {}
    const roster = readRoster();
    if (roster[autoId] && roster[autoId].p) {
      const target = normalizePlayer(roster[autoId].p);
      target.id = autoId;
      localStorage.setItem(ACTIVE_CHARACTER_KEY, autoId);
      startGame(target);
      return;
    }
  }

  if (saved) {
    $("#continue-box").style.display = "";
    $("#saved-name").textContent = saved.name;
    $("#saved-info").textContent =
      `${vocationName(saved)} · ${typeof t === "function" ? t("login.levelOf") : "nível"} ${saved.level}`;
    $("#btn-continue").addEventListener("click", () => startGame(saved));
  }

  let selVoc = "knight", selSex = "male";
  const vocs = ["knight", "paladin", "druid", "sorcerer", "monk"];
  const outfitOf = (v, s) => {
    const map = { knight: "knight", paladin: "hunter", druid: "summoner",
                  sorcerer: "mage", monk: "monk" };
    return map[v] + "-" + (s === "female" ? "f" : "m");
  };
  function paintVocs() {
    const grid = $("#voc-grid");
    if (!grid) return;
    grid.innerHTML = vocs.map((v) => `
      <div class="voc-card ${v === selVoc ? "sel" : ""}" data-voc="${v}">
        <img src="assets/outfit/${outfitOf(v, selSex)}_s.png" alt="">
        <div class="vn">${VOCATIONS[v].name}</div>
        <div class="vd">${VOCATIONS[v].desc}</div>
      </div>`).join("");
    $$("#voc-grid .voc-card").forEach((c) =>
      c.addEventListener("click", () => { selVoc = c.dataset.voc; paintVocs(); }));
  }
  window.refreshVocGrid = paintVocs;
  paintVocs();

  $$("#local-login [data-sex]").forEach((b) => {
    b.addEventListener("click", () => {
      selSex = b.dataset.sex;
      $$("#local-login [data-sex]").forEach((x) => x.classList.remove("primary"));
      b.classList.add("primary");
      paintVocs();
    });
  });

  const btnCreate = $("#btn-create");
  if (btnCreate) btnCreate.addEventListener("click", () => {
    const name = ($("#char-name").value || "").trim();
    if (name.length < 2) { toast("Digite um nome válido"); return; }
    const p = createCharacter(name, selVoc, selSex);
    startGame(p);
  });

  const charName = $("#char-name");
  if (charName) charName.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && btnCreate) btnCreate.click();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTooltip();
  initLogin();
});
