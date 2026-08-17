/* loyalty.js — Loyalty Points (Global-Idle ranks).
 *
 * Points = (addons owned + mounts owned) * 0.5 + (VIP ? 5 : 0).
 * Rank = highest tier whose threshold ≤ points.
 *
 * Skill bonus: flat +N on effective fighting skills / ML (same path as Wheel),
 * does not mutate saved skill levels.
 * Exp bonus: % multiplier on combat/hunt EXP (same stacking style as Prey).
 *
 * Shared by browser UI and Node authoritative_engine.
 */
"use strict";

const LOYALTY_RANKS = [
  { title: "Scout of Global-Idle", points: 0, skill: 0, expPct: 0 },
  { title: "Sentinel of Global-Idle", points: 5, skill: 1, expPct: 0 },
  { title: "Steward of Global-Idle", points: 15, skill: 2, expPct: 0 },
  { title: "Warden of Global-Idle", points: 25, skill: 3, expPct: 2 },
  { title: "Squire of Global-Idle", points: 35, skill: 4, expPct: 3 },
  { title: "Warrior of Global-Idle", points: 50, skill: 5, expPct: 3 },
  { title: "Keeper of Global-Idle", points: 60, skill: 6, expPct: 5 },
  { title: "Guardian of Global-Idle", points: 70, skill: 7, expPct: 5 },
  { title: "Sage of Global-Idle", points: 80, skill: 8, expPct: 5 },
  { title: "Savant of Global-Idle", points: 90, skill: 9, expPct: 5 },
  { title: "Enlightened of Global-Idle", points: 100, skill: 10, expPct: 7 },
];

function loyaltyVipActive(p) {
  if (typeof accountIsVip === "function") return !!accountIsVip(p);
  if (p && Number(p.vipUntil) > Date.now()) return true;
  if (typeof isVip === "function") return !!isVip();
  return false;
}

/* Wardrobe addons: buyAddon stores sequential 0/1/2; lookAddons may use bitflags 1|2|3. */
function loyaltyAddonUnits(raw) {
  const v = Math.max(0, Math.min(3, Math.floor(Number(raw) || 0)));
  if (v === 3) return 2;
  return v;
}

function loyaltyAddonCount(p) {
  const outfits = p && p.wardrobe && p.wardrobe.outfits;
  if (!outfits || typeof outfits !== "object") return 0;
  let n = 0;
  for (const id of Object.keys(outfits)) n += loyaltyAddonUnits(outfits[id]);
  return n;
}

function loyaltyMountCount(p) {
  const mounts = p && p.wardrobe && p.wardrobe.mounts;
  if (!mounts || typeof mounts !== "object") return 0;
  let n = 0;
  for (const id of Object.keys(mounts)) if (mounts[id]) n++;
  return n;
}

function loyaltyPoints(p) {
  const addons = loyaltyAddonCount(p);
  const mounts = loyaltyMountCount(p);
  const vip = loyaltyVipActive(p) ? 5 : 0;
  return addons * 0.5 + mounts * 0.5 + vip;
}

function loyaltyRankForPoints(points) {
  const pts = Math.max(0, Number(points) || 0);
  let rank = LOYALTY_RANKS[0];
  for (let i = 0; i < LOYALTY_RANKS.length; i++) {
    if (pts >= LOYALTY_RANKS[i].points) rank = LOYALTY_RANKS[i];
    else break;
  }
  return rank;
}

function loyaltyRank(p) {
  return loyaltyRankForPoints(loyaltyPoints(p));
}

function loyaltyNextRank(p) {
  const pts = loyaltyPoints(p);
  for (let i = 0; i < LOYALTY_RANKS.length; i++) {
    if (LOYALTY_RANKS[i].points > pts) return LOYALTY_RANKS[i];
  }
  return null;
}

/* Flat +N on effective skills (Wheel-style). Applies to all fighting skills + ML. */
function loyaltySkillBonus(p) {
  return loyaltyRank(p).skill | 0;
}

/* Percent EXP bonus (0 / 2 / 3 / 5 / 7). */
function loyaltyExpBonusPct(p) {
  return loyaltyRank(p).expPct | 0;
}

function loyaltyExpMultiplier(p) {
  const pct = loyaltyExpBonusPct(p);
  return pct > 0 ? 1 + pct / 100 : 1;
}

function fmtLoyaltyPoints(pts) {
  const n = Math.max(0, Number(pts) || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function openLoyaltyModal() {
  const p = typeof G !== "undefined" && G ? G.p : null;
  if (!p) return;
  if (typeof ensureWardrobe === "function") ensureWardrobe(p);
  const modal = typeof $ === "function" ? $("#modal") : null;
  const body = typeof $ === "function" ? $("#modal-body") : null;
  if (!modal || !body) return;

  const pts = loyaltyPoints(p);
  const rank = loyaltyRankForPoints(pts);
  const next = loyaltyNextRank(p);
  const addons = loyaltyAddonCount(p);
  const mounts = loyaltyMountCount(p);
  const vip = loyaltyVipActive(p);
  const fromCollectibles = addons * 0.5 + mounts * 0.5;

  let progressHtml = "";
  if (next) {
    const need = next.points - pts;
    const span = Math.max(0.001, next.points - rank.points);
    const filled = Math.max(0, Math.min(100, ((pts - rank.points) / span) * 100));
    progressHtml =
      `<div class="loyalty-progress">` +
      `<div class="row small" style="justify-content:space-between;margin-bottom:4px">` +
      `<span class="dim">Próximo: <b style="color:#ffe680">${next.title}</b></span>` +
      `<span class="dim">faltam <b style="color:#9ce84a">${fmtLoyaltyPoints(need)}</b> pts</span>` +
      `</div>` +
      `<div class="bar" style="height:10px"><div class="fill" style="width:${filled.toFixed(1)}%;background:linear-gradient(90deg,#c9a227,#ffe680)"></div></div>` +
      `</div>`;
  } else {
    progressHtml =
      `<div class="loyalty-progress tiny" style="color:#9ce84a">Rank máximo alcançado — pontos acima de 100 ainda contam.</div>`;
  }

  const rows = LOYALTY_RANKS.map((r) => {
    const cur = r.title === rank.title;
    const unlocked = pts >= r.points;
    const expTxt = r.expPct ? `${r.expPct}% exp` : "—";
    return `<tr class="${cur ? "loyalty-row-cur" : ""} ${unlocked ? "loyalty-row-on" : "loyalty-row-off"}">` +
      `<td>${cur ? "▶ " : ""}${r.title}</td>` +
      `<td class="num">${r.points}</td>` +
      `<td class="num">+${r.skill}</td>` +
      `<td class="num">${expTxt}</td>` +
      `</tr>`;
  }).join("");

  body.innerHTML =
    `<div class="panel-title">🏆 Loyalty` +
    `<button class="sm" id="loyalty-close" style="margin-left:auto">Fechar</button></div>` +
    `<div class="loyalty-modal">` +
    `<div class="loyalty-summary">` +
    `<div class="loyalty-stat"><span class="dim">Pontos</span><b class="loyalty-pts">${fmtLoyaltyPoints(pts)}</b></div>` +
    `<div class="loyalty-stat"><span class="dim">Rank atual</span><b class="loyalty-rank">${rank.title}</b></div>` +
    `<div class="loyalty-stat"><span class="dim">Bônus skill</span><b style="color:#7ae87a">+${rank.skill}</b></div>` +
    `<div class="loyalty-stat"><span class="dim">Bônus EXP</span><b style="color:#7ae87a">${rank.expPct ? "+" + rank.expPct + "%" : "—"}</b></div>` +
    `</div>` +
    progressHtml +
    `<div class="loyalty-how tiny dim mt8 mb8">` +
    `Como ganhar pontos: <b style="color:#c8c0b0">+0.5</b> por cada <b style="color:#c8c0b0">addon</b> desbloqueado e ` +
    `<b style="color:#c8c0b0">+0.5</b> por cada <b style="color:#c8c0b0">montaria</b> possuída. ` +
    `Contas <b style="color:#ffe680">VIP</b> recebem <b style="color:#ffe680">+5</b> pontos fixos.<br>` +
    `Agora: ${addons} addon(s) + ${mounts} montaria(s) = ` +
    `<b style="color:#ffe680">${fmtLoyaltyPoints(fromCollectibles)}</b>` +
    (vip ? ` + VIP <b style="color:#ffe680">5</b>` : ` · sem VIP`) +
    `.</div>` +
    `<div class="loyalty-table-wrap"><table class="loyalty-table">` +
    `<thead><tr><th>Título</th><th>Pontos</th><th>Skill</th><th>EXP</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>` +
    `<div class="tiny dim mt8">O bônus de skill soma nas skills efetivas (como a Wheel) sem alterar o save. ` +
    `O bônus de EXP multiplica a experiência de caçada/combate.</div>` +
    `</div>`;

  modal.classList.add("show", "wide");
  const close = typeof $ === "function" ? $("#loyalty-close") : null;
  if (close) {
    close.onclick = () => {
      modal.classList.remove("show", "wide");
    };
  }
}

function bindLoyaltyButton() {
  const btn = typeof $ === "function" ? $("#btn-loyalty") : null;
  if (!btn) return;
  btn.addEventListener("click", () => openLoyaltyModal());
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LOYALTY_RANKS,
    loyaltyAddonCount,
    loyaltyMountCount,
    loyaltyPoints,
    loyaltyRankForPoints,
    loyaltyRank,
    loyaltyNextRank,
    loyaltySkillBonus,
    loyaltyExpBonusPct,
    loyaltyExpMultiplier,
    loyaltyVipActive,
  };
}
