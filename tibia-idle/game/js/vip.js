/*
 * vip.js — Sistema de Conta VIP do servidor old-idle.
 *
 * Fonte de verdade online: account.vipUntil (timestamp ms) vindo do login/me.
 * Offline/local: localStorage oti_vip (legado).
 *
 * Benefícios VIP:
 *   - Fast Revive: 15s (vs 30s normal)
 *   - Cooldown Wheel: 30% menos CD em Gift of Life e Avatar
 *   - Imbuement Protegido: não consome em zonas de proteção
 *   - Familiar Otimizado: +30% dano de familiar
 *   - Bônus EXP: +10% em cada kill
 *   - Crítico Adicional: +3% chance de crítico
 *   - Velocidade Exercise: +10% velocidade
 *   - Full Bless: recebe todas as 7 bênçãos ao comprar
 *   - Regeneração: +10 HP e +20 MP a cada 3s
 *   - Prioridade de Login: fila prioritária
 *   - Ausência de Casa: 10 dias (vs 7 normal)
 *   - Bônus Proficiência: +10% EXP de arma
 *   - Autoseller da Loot Pouch
 *   - Controle manual SQM (AUTO off / WASD / clique)
 */
"use strict";

const VIP_KEY = "oti_vip";

function sessionVipUntil() {
  try {
    const raw = sessionStorage.getItem("tibia-idle-account");
    if (!raw) return 0;
    const acc = JSON.parse(raw);
    return Math.max(0, Math.floor(Number(acc && (acc.vipUntil || acc.vip_until)) || 0));
  } catch (e) { return 0; }
}

function syncVipFromAccount(account) {
  if (!account) return;
  const until = Math.max(0, Math.floor(Number(account.vipUntil || account.vip_until) || 0));
  try {
    const raw = sessionStorage.getItem("tibia-idle-account");
    const acc = raw ? JSON.parse(raw) : {};
    acc.vipUntil = until;
    acc.vip = until > Date.now();
    sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
  } catch (e) {}
  try {
    const v = { active: until > Date.now(), expires: until };
    localStorage.setItem(VIP_KEY, JSON.stringify(v));
  } catch (e) {}
}

/* Verifica se a conta é VIP */
function isVip() {
  const until = sessionVipUntil();
  if (until > Date.now()) return true;
  try {
    const v = JSON.parse(localStorage.getItem(VIP_KEY));
    if (!v || !v.active) return false;
    if (v.expires && Date.now() > v.expires) {
      v.active = false;
      localStorage.setItem(VIP_KEY, JSON.stringify(v));
      return false;
    }
    return true;
  } catch { return false; }
}

/* Ativa VIP por X dias */
function activateVip(days) {
  const v = JSON.parse(localStorage.getItem(VIP_KEY) || "{}");
  const now = Date.now();
  const currentExp = (v.active && v.expires && v.expires > now) ? v.expires : now;
  v.active = true;
  v.expires = currentExp + days * 24 * 3600 * 1000;
  localStorage.setItem(VIP_KEY, JSON.stringify(v));
  try {
    const raw = sessionStorage.getItem("tibia-idle-account");
    if (raw) {
      const acc = JSON.parse(raw);
      acc.vipUntil = v.expires;
      acc.vip = true;
      sessionStorage.setItem("tibia-idle-account", JSON.stringify(acc));
    }
  } catch (e) {}
  return v;
}

/* Desativa VIP */
function deactivateVip() {
  const v = JSON.parse(localStorage.getItem(VIP_KEY) || "{}");
  v.active = false;
  localStorage.setItem(VIP_KEY, JSON.stringify(v));
}

/* Tempo restante de VIP em ms */
function vipTimeLeft() {
  const until = sessionVipUntil();
  if (until > Date.now()) return until - Date.now();
  if (!isVip()) return 0;
  try {
    const v = JSON.parse(localStorage.getItem(VIP_KEY));
    return Math.max(0, (v.expires || 0) - Date.now());
  } catch { return 0; }
}

function reviveTime() {
  return isVip() ? 15000 : 30000;
}
function vipExpBonus() {
  return isVip() ? 1.10 : 1.0;
}
function vipCritBonus() {
  return isVip() ? 0.03 : 0;
}
function vipExerciseSpeed() {
  return isVip() ? 1.10 : 1.0;
}
function vipFamiliarDamage() {
  return isVip() ? 1.30 : 1.0;
}
function vipWheelCooldown() {
  return isVip() ? 0.70 : 1.0;
}
function vipRegenHp() {
  return isVip() ? 10 : 0;
}
function vipRegenMp() {
  return isVip() ? 20 : 0;
}
function vipFullBless() {
  return isVip();
}
function vipProficiencyBonus() {
  return isVip() ? 1.10 : 1.0;
}
function vipHouseDays() {
  return isVip() ? 10 : 7;
}
function vipImbuementProtected() {
  return isVip();
}
function vipAutoSellAllowed() {
  return isVip();
}
function vipManualControlAllowed() {
  return isVip();
}

function fmtVipTime() {
  const ms = vipTimeLeft();
  if (ms <= 0) return "—";
  const days = Math.floor(ms / (24 * 3600 * 1000));
  const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
  return `${hours}h ${mins}m`;
}
