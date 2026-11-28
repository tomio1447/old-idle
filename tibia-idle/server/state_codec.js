/*
 * state_codec.js — codificação do blob `state`/`state_z` de account_instances.
 *
 * Dois ganhos em cima do JSON bruto anterior (~580KB por instância):
 *
 * 1) THIN: members[].p e state.players[].p são derivados de
 *    authority.players — materializeAuthority os reconstrói a cada leitura.
 *    Persistir as três cópias (~85% do blob) é desperdício: no save os `p`
 *    vão null e na leitura o materialize devolve. Copy-on-write — o
 *    descritor vivo em memória nunca é mutado pelo encode.
 *
 * 2) BINÁRIO: coluna state_z (MEDIUMBLOB) guarda gzip do JSON thin com
 *    prefixo mágico "GIS1" — ~30KB vs ~580KB. zlib é built-in do Node,
 *    sem dependência nova no container. `state` continua recebendo o JSON
 *    thin (debug/SQL legível); state_z é o preferido nas leituras.
 *
 * Leitura tolerante: Buffer gzip → JSON em Buffer/string legado → objeto
 * (JsonStore). Não há migração de dados: rows antigas em JSON viram
 * thin+gzip na próxima escrita.
 */
"use strict";

const zlib = require("zlib");
const STATE_Z_MAGIC = Buffer.from("GIS1", "latin1");
const GZIP_LEVEL = Math.max(1, Math.min(9, Number(process.env.INSTANCE_STATE_GZIP_LEVEL) || 4));

/* Blob thin = members[].p ausentes (regeneráveis por materializeAuthority).
 * Antes a detecção exigia authority.pvpBattle — agora vale para qualquer
 * instância. */
function descriptorIsThin(d) {
  return !!(d && typeof d === "object" && d.authority &&
    Array.isArray(d.members) && d.members.some((m) => m && !m.p));
}

/* Cópia rasa com members[].p e state.players[].p zerados — não muta o
 * descritor vivo (o cache quente continua completo). */
function thinDescriptorForBlob(desc) {
  if (!desc || typeof desc !== "object" || !desc.authority) return desc;
  const members = Array.isArray(desc.members)
    ? desc.members.map((m) => (m && m.p ? Object.assign({}, m, { p: null }) : m))
    : desc.members;
  const state = desc.state && typeof desc.state === "object"
    ? Object.assign({}, desc.state, {
      players: Array.isArray(desc.state.players)
        ? desc.state.players.map((e) => (e && e.p ? Object.assign({}, e, { p: null }) : e))
        : desc.state.players })
    : desc.state;
  return Object.assign({}, desc, { members, state });
}

/* Encode para escrita: aceita objeto ou JSON string. Devolve {json,z} —
 * `json` vai para `state`, `z` (magic+gzip) para `state_z`. */
function encodeInstanceState(descOrJson) {
  let desc = descOrJson;
  if (typeof desc === "string") { try { desc = JSON.parse(desc); } catch (e) { desc = null; } }
  if (!desc || typeof desc !== "object") {
    const fallback = typeof descOrJson === "string" ? descOrJson : "";
    return { json: fallback, z: null };
  }
  const json = JSON.stringify(thinDescriptorForBlob(desc));
  return { json, z: Buffer.concat([STATE_Z_MAGIC, zlib.gzipSync(json, { level: GZIP_LEVEL })]) };
}

/* Decode: state_z (Buffer gzip "GIS1") > state (JSON string/Buffer) >
 * objeto vivo (JsonStore/cache). Devolve o descritor (thin — quem precisa
 * dos derivados chama materializeIfThin). */
function decodeInstanceState(raw) {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw)) {
    if (raw.length > 4 && raw[0] === STATE_Z_MAGIC[0] && raw[1] === STATE_Z_MAGIC[1] &&
        raw[2] === STATE_Z_MAGIC[2] && raw[3] === STATE_Z_MAGIC[3]) {
      try { return JSON.parse(zlib.gunzipSync(raw.subarray(4)).toString("utf8")); }
      catch (e) { return null; }
    }
    try { return JSON.parse(raw.toString("utf8")); } catch (e) { return null; }
  }
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch (e) { return null; } }
  if (typeof raw === "object") return raw;
  return null;
}

/* Prefere state_z quando a row traz as duas colunas (SELECT *). */
function decodeInstanceRow(row) {
  if (!row) return null;
  return decodeInstanceState(row.state_z != null ? row.state_z : row.state);
}

/* Thin → full: materializeAuthority regenera members[].p/state.players[].p.
 * materializeFn = engine's materializeAuthority (injetado pelo caller para
 * o codec não precisar conhecer o engine). */
function materializeIfThin(desc, materializeFn) {
  if (desc && descriptorIsThin(desc) && typeof materializeFn === "function")
    return materializeFn(desc);
  return desc;
}

module.exports = { STATE_Z_MAGIC, descriptorIsThin, thinDescriptorForBlob,
  encodeInstanceState, decodeInstanceState, decodeInstanceRow, materializeIfThin };
