/* Regressão: login -> cadastro modal -> picker -> criação/logout. */
"use strict";
const fs=require("fs"),path=require("path");
const game=path.join(__dirname,"..","game");
const html=fs.readFileSync(path.join(game,"index.html"),"utf8");
const js=fs.readFileSync(path.join(game,"js","game.js"),"utf8");
const css=fs.readFileSync(path.join(game,"css","layout.css"),"utf8");
const server=fs.readFileSync(path.join(__dirname,"..","server","server.js"),"utf8");
function must(ok,msg){if(!ok)throw Error(msg);}
must(html.includes('id="account-login-form"')&&html.includes('id="acc-login"')&&
  html.includes('id="acc-password"')&&html.includes('id="acc-btn-login"')&&
  html.includes('id="acc-open-register"')&&html.includes('type="submit"')&&
  html.includes(">Entrar</button>"),
  "tela inicial não contém o formulário de login/criar conta");
must(html.includes('id="account-login-form"')&&html.includes('onsubmit="return false;"')&&
  html.includes('action="#"'),
  "form de login deve bloquear navegação nativa (POST / → JSON)");
must(js.includes('id="acc-register-form" method="post" action="#" onsubmit="return false;"'),
  "form de registro também deve bloquear navegação nativa");
must(server.includes("res.writeHead(303")&&server.includes('Location: "/"')&&
  server.includes("Form POST acidental"),
  "POST não-API deve redirecionar 303 para / em vez de JSON catch-all");
/* Boot sem sessão: login da conta é o primeiro paint; create local legado fica oculto. */
const accLoginIdx=html.indexOf('id="account-login"');
const localLoginIdx=html.indexOf('id="local-login"');
must(accLoginIdx>=0&&localLoginIdx>accLoginIdx,"account-login deve vir antes de local-login no HTML");
const accOpen=html.slice(accLoginIdx,accLoginIdx+80);
const localBlock=html.slice(localLoginIdx,html.indexOf("</div>",html.indexOf("btn-create",localLoginIdx))+6);
must(!/style\s*=\s*["'][^"']*display\s*:\s*none/i.test(accOpen),
  "account-login não pode nascer oculto (FOUC do create legado)");
must(/style\s*=\s*["'][^"']*display\s*:\s*none/i.test(localBlock)&&/\bhidden\b/.test(localBlock),
  "local-login legado deve nascer oculto no boot");
must(localBlock.includes("Criar personagem e caçar")&&localBlock.includes("Ex: Bubble"),
  "textos do create legado devem permanecer só dentro do bloco oculto");
must(js.includes("Boot online-first")&&js.includes("localLogin.hidden = true")&&
  js.includes("initAccountLogin()"),
  "initLogin online não esconde o create local legado");
must(js.includes("function showCharacterCreator")&&js.includes('id="acc-btn-create-char"')&&
  !js.includes('data-i18n="login.createChar"'),
  "criação pós-login da conta deve existir; create legado não pode ser o fluxo da conta");
must(js.includes('$("#account-login-form").addEventListener("submit"')&&
  js.includes('id="acc-register-form"')&&
  js.includes('$("#acc-register-form").addEventListener("submit"'),
  "login/cadastro não usam submit semântico (Enter/formulário)");
must(!html.includes('id="acc-panel-register"')&&!html.includes('id="acc-char-picker"')&&
  !html.includes('data-acc-tab'),"cadastro/picker ainda estão embutidos na tela inicial");
must(js.includes("function openRegisterModal()")&&js.includes('id="acc-new-login"')&&
  js.includes('id="acc-new-password"')&&js.includes("closeAccountModal();")&&
  js.includes('msg("Conta criada! Informe sua senha para entrar.")'),
  "criação de conta não abre/fecha modal voltando ao login");
must(js.includes("function showPicker(token, account, characters)")&&
  js.includes('class="account-character-card ${c.identityMismatch')&&js.includes('data-account-portrait')&&
  js.includes("account-character-name")&&js.includes("account-character-voc")&&
  js.includes("account-character-level")&&js.includes('vocationName({voc:c.voc || "knight"'),
  "picker não mostra lista com outfit, nome, vocação e level");
const picker=js.indexOf("function showPicker(token, account, characters)");
const create=js.indexOf('id="acc-open-create-char"',picker),customize=js.indexOf('id="acc-customize-char"',picker),logout=js.indexOf('id="acc-logout"',picker);
must(create>picker&&customize>create&&logout>customize,"botões Criar/Personalizar/Logout estão ausentes ou fora de ordem");
must(js.includes('closeAccountModal();openOutfitModal();'),"Personalizar não abre o editor do personagem ativo");
must(js.includes("function showCharacterCreator")&&js.includes("const refreshed = await accountMe(token)")&&
  js.includes("showPicker(token, refreshed.account, refreshed.characters || [])"),
  "personagem criado não retorna ao picker atualizado");
must(js.includes('sessionStorage.removeItem("tibia-idle-token")')&&
  js.includes('window.openAccountCharacterPicker'),"logout/troca online não reutilizam o picker da conta");
must(css.includes(".account-character-list")&&css.includes(".account-character-list-head")&&
  css.includes(".account-character-card")&&css.includes(".account-character-outfit")&&
  css.includes(".account-character-voc")&&css.includes(".account-character-level"),
  "picker de personagens sem layout em lista");
must(server.includes("function accountCharacterSummary")&&server.includes("sex:data.sex")&&
  server.includes("outfit:data.outfit")&&
  (server.match(/characters: characters\.map\(accountCharacterSummary\)/g)||[]).length===2,
  "API não retorna outfit/cores/sexo no resumo da conta");
must(js.includes("startHuntAfterLease")&&js.includes("lease.unauthorized")&&
  js.includes("ONLINE_SESSION_INVALID=true;ONLINE_RUNTIME_RETRY_AT=Number.POSITIVE_INFINITY"),
  "hunt/recovery online devem parar em 401 de sessão em vez de martelar lease/acquire");
must(server.includes("function bodyWithSessionToken")&&server.includes("bearerToken(req)"),
  "lease deve aceitar token do body ou Authorization Bearer");
console.log("OK: fluxo conta/login, picker visual, criação de personagem e logout validados.");
