/*
 * vip.js — Sistema de Conta VIP do servidor old-idle.
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
 */
"use strict";

/* ── VIP State ── */
const VIP_KEY = "oti_vip";

/* Verifica se a conta é VIP */
function isVip() {
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
  // Se já é VIP, estende o tempo
  const currentExp = (v.active && v.expires && v.expires > now) ? v.expires : now;
  v.active = true;
  v.expires = currentExp + days * 24 * 3600 * 1000;
  localStorage.setItem(VIP_KEY, JSON.stringify(v));
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
  if (!isVip()) return 0;
  try {
    const v = JSON.parse(localStorage.getItem(VIP_KEY));
    return Math.max(0, (v.expires || 0) - Date.now());
  } catch { return 0; }
}

/* ── VIP Benefit Constants ── */

/* Tempo de revive (ms) */
function reviveTime() {
  return isVip() ? 15000 : 30000;
}

/* Bônus de EXP (1.0 = sem bônus) */
function vipExpBonus() {
  return isVip() ? 1.10 : 1.0;
}

/* Chance de crítico adicional (0-1) */
function vipCritBonus() {
  return isVip() ? 0.03 : 0;
}

/* Velocidade de exercise (multiplicador) */
function vipExerciseSpeed() {
  return isVip() ? 1.10 : 1.0;
}

/* Dano de familiar (multiplicador) */
function vipFamiliarDamage() {
  return isVip() ? 1.30 : 1.0;
}

/* Cooldown da Wheel (multiplicador — 0.7 = 30% menos) */
function vipWheelCooldown() {
  return isVip() ? 0.70 : 1.0;
}

/* Regeneração extra a cada 3s */
function vipRegenHp() {
  return isVip() ? 10 : 0;
}
function vipRegenMp() {
  return isVip() ? 20 : 0;
}

/* Full Bless: se VIP, comprar bless dá todas as 7 */
function vipFullBless() {
  return isVip();
}

/* Bônus de proficiência de arma (multiplicador) */
function vipProficiencyBonus() {
  return isVip() ? 1.10 : 1.0;
}

/* Dias offline sem perder house */
function vipHouseDays() {
  return isVip() ? 10 : 7;
}

/* Imbuement protegido em zona de proteção */
function vipImbuementProtected() {
  return isVip();
}

/* Formata tempo restante de VIP */
function fmtVipTime() {
  const ms = vipTimeLeft();
  if (ms <= 0) return "—";
  const days = Math.floor(ms / (24 * 3600 * 1000));
  const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
  return `${hours}h ${mins}m`;
}
