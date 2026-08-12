/* Regressão: login -> cadastro modal -> picker -> criação/logout. */
"use strict";
const fs=require("fs"),path=require("path");
const game=path.join(__dirname,"..","game");
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const js=fs.readFileSync(path.join(game,"js","game.js"),"utf8");
const css=fs.readFileSync(path.join(game,"css","layout.css"),"utf8");
const server=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
must(html.includes('id="acc-login"')&&html.includes('id="acc-password"')&&
  html.includes('id="acc-btn-login"')&&html.includes('id="acc-open-register"'),
  "tela inicial não contém somente login/criar conta");
must(!html.includes('id="acc-panel-register"')&&!html.includes('id="acc-char-picker"')&&
  !html.includes('data-acc-tab'),"cadastro/picker ainda estão embutidos na tela inicial");
must(js.includes("function openRegisterModal()")&&js.includes('id="acc-new-login"')&&
  js.includes('id="acc-new-password"')&&js.includes("closeAccountModal();")&&
  js.includes('msg("Conta criada! Informe sua senha para entrar.")'),
  "criação de conta não abre/fecha modal voltando ao login");
must(js.includes("function showPicker(token, account, characters)")&&
  js.includes('class="account-character-card ${c.identityMismatch')&&js.includes('data-account-portrait')&&
  js.includes('Level ${Number(c.level) || 1} · ${vocationName'),
  "picker não mostra cards com outfit, level e vocação");
const picker=js.indexOf("function showPicker(token, account, characters)");
const create=js.indexOf('id="acc-open-create-char"',picker),customize=js.indexOf('id="acc-customize-char"',picker),logout=js.indexOf('id="acc-logout"',picker);
must(create>picker&&customize>create&&logout>customize,"botões Criar/Personalizar/Logout estão ausentes ou fora de ordem");
must(js.includes('closeAccountModal();openOutfitModal();'),"Personalizar não abre o editor do personagem ativo");
must(js.includes("function showCharacterCreator")&&js.includes("const refreshed = await accountMe(token)")&&
  js.includes("showPicker(token, refreshed.account, refreshed.characters || [])"),
  "personagem criado não retorna ao picker atualizado");
must(js.includes('sessionStorage.removeItem("tibia-idle-token")')&&
  js.includes('window.openAccountCharacterPicker'),"logout/troca online não reutilizam o picker da conta");
must(css.includes(".account-character-list")&&css.includes(".account-character-card")&&
  css.includes(".account-character-outfit"),"picker de personagens sem layout próprio");
must(server.includes("function accountCharacterSummary")&&server.includes("sex:data.sex")&&
  server.includes("outfit:data.outfit")&&
  (server.match(/characters: characters\.map\(accountCharacterSummary\)/g)||[]).length===2,
  "API não retorna outfit/cores/sexo no resumo da conta");
console.log("OK: fluxo conta/login, picker visual, criação de personagem e logout validados.");
