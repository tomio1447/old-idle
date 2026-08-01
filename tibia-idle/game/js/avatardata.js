/* avatardata.js — avatars oficiais do Canary/Tibia 15.x.
 * Gerado por tools/import_avatar_outfits.py.
 * looktypes: Steel 1593, Light 1594, Storm 1595, Nature 1596, Balance 1823. */
"use strict";
window.AVATAR_OUTFITS = [{"id":"avatar-steel","nome":"Avatar of Steel","looktype":1593,"sexo":"avatar","premium":false,"addons":0,"avatarVoc":"knight","cols":9,"rows":4,"dx":0,"dy":0,"cw":64,"ch":64,"ox":0,"oy":0},{"id":"avatar-light","nome":"Avatar of Light","looktype":1594,"sexo":"avatar","premium":false,"addons":0,"avatarVoc":"paladin","cols":9,"rows":4,"dx":0,"dy":0,"cw":64,"ch":64,"ox":0,"oy":0},{"id":"avatar-storm","nome":"Avatar of Storm","looktype":1595,"sexo":"avatar","premium":false,"addons":0,"avatarVoc":"sorcerer","cols":9,"rows":4,"dx":0,"dy":0,"cw":64,"ch":64,"ox":0,"oy":0},{"id":"avatar-nature","nome":"Avatar of Nature","looktype":1596,"sexo":"avatar","premium":false,"addons":0,"avatarVoc":"druid","cols":9,"rows":4,"dx":0,"dy":0,"cw":64,"ch":64,"ox":0,"oy":0},{"id":"avatar-balance","nome":"Avatar of Balance","looktype":1823,"sexo":"avatar","premium":false,"addons":0,"avatarVoc":"monk","cols":9,"rows":4,"dx":0,"dy":0,"cw":64,"ch":64,"ox":0,"oy":0}];
window.AVATAR_OUTFIT_BY_VOC = {"knight":"avatar-steel","paladin":"avatar-light","sorcerer":"avatar-storm","druid":"avatar-nature","monk":"avatar-balance"};
if (window.APPEARANCES) {
  window.APPEARANCES.outfits = window.APPEARANCES.outfits || [];
  const __avatarIds = new Set(window.APPEARANCES.outfits.map(o => o.id));
  for (const o of window.AVATAR_OUTFITS) if (!__avatarIds.has(o.id)) window.APPEARANCES.outfits.push(o);
}
