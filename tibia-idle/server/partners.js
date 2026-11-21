/* partners.js — Parceiros de live: streamers com voucher próprio exibidos
 * no modal "Parceiros" da topbar. Cada entrada:
 *   id       — slug interno
 *   name     — nome exibido no card
 *   channel  — login do canal Twitch (usado no follow-gate e no link)
 *   level    — nível do parceiro no programa (exibido como "Nv. X")
 *   voucher  — código de voucher do servidor (revelado só após o follow)
 *
 * GET /api/partners?token=<sessão> devolve a lista com status de live
 * (helix/streams via app token), tempo de live, avatar e o voucher —
 * mascarado como "*****" até o jogador seguir o canal (mesmo gate do
 * voucher BUTO__PVP em accounts.social.twitch.follows[channel]).
 * Ordenação: online primeiro, quem está há MAIS tempo em live na frente. */
"use strict";

const twitch = require("./twitch");

const PARTNERS = [
  {
    id: "buto-pvp",
    name: "Buto PVP",
    channel: "buto_pvp",
    url: "https://www.twitch.tv/buto_pvp",
    instagram: "https://www.instagram.com/buto__pvp",
    level: 1,
    voucher: "BUTO__PVP",
  },
  {
    id: "bruno-flowers",
    name: "Bruno Flowers",
    channel: "bruno_flowers",
    url: "https://www.twitch.tv/bruno_flowers",
    instagram: "",
    level: 1,
    voucher: "FLOWERS0800",
  },
];

function channels() {
  return PARTNERS.map((p) => p.channel);
}

async function partnersList(acc) {
  const logins = channels();
  let users = {}, streams = {};
  if (twitch.configured()) {
    try { users = await twitch.getUsers(logins); } catch (e) {}
    try { streams = await twitch.getStreams(logins); } catch (e) {}
  }
  const now = Date.now();
  const list = PARTNERS.map((p) => {
    const u = users[p.channel] || null;
    const s = streams[p.channel] || null;
    const following = twitch.followsChannel(acc, p.channel);
    return {
      id: p.id,
      name: u && u.displayName ? u.displayName : p.name,
      channel: p.channel,
      url: p.url,
      instagram: p.instagram || "",
      level: p.level,
      avatar: u ? u.avatar : "",
      following,
      voucher: following ? p.voucher : "*****",
      voucherHidden: !following,
      live: s ? {
        online: true,
        title: s.title, game: s.game, viewers: s.viewers,
        startedAt: s.startedAt, thumb: s.thumb,
        uptimeMin: Math.max(0, Math.floor((now - Date.parse(s.startedAt || 0)) / 60000)),
      } : { online: false },
    };
  });
  /* Online primeiro; entre eles, quem está há mais tempo em live na frente.
   * Entre offline, mantém a ordem de cadastro (level/nome futuros). */
  list.sort((a, b) => {
    const ao = a.live && a.live.online ? 1 : 0;
    const bo = b.live && b.live.online ? 1 : 0;
    if (ao !== bo) return bo - ao;
    if (ao) return (b.live.uptimeMin || 0) - (a.live.uptimeMin || 0);
    return 0;
  });
  return list;
}

module.exports = { PARTNERS, channels, partnersList };
