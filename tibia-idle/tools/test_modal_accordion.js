/* Regressão: categorias dos catálogos HUNTS e BOSSES viram abas
 * (accordion) — todas minimizadas por padrão; expandir uma aba
 * minimiza as demais; busca do modal de hunts abre as abas com
 * resultados (modo multi). */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const game = path.join(__dirname, "..", "game");
const js = path.join(game, "js");
function must(v, m) { if (!v) throw Error(m); }

const ui = fs.readFileSync(path.join(js, "ui.js"), "utf8");
const gameSrc = fs.readFileSync(path.join(js, "game.js"), "utf8");
const css = fs.readFileSync(path.join(game, "css", "layout.css"), "utf8");
const html = fs.readFileSync(path.join(game, "index.html"), "utf8");

/* ---------- markup estático ---------- */
for (const [src, name] of [[ui, "ui.js"], [gameSrc, "game.js"]])
  for (const token of ["accordion-section", "accordion-head",
    'class="hunts-group collapsed"', "bindCatalogAccordion"])
    must(src.includes(token), name + " sem " + token);
must(css.includes("#bosses-modal-list { display: flex; flex-direction: column;") &&
     css.includes(".accordion-section .hunts-group.collapsed { display: none; }") &&
     css.includes(".accordion-section .hunt-cat-title::before") &&
     css.includes('content: "▸"'),
  "CSS das abas de categoria ausente ou incompleto");
for (const ref of ['css/layout.css?v=', 'js/ui.js?v=accordion-v1', 'js/game.js?v=accordion-v1'])
  must(html.includes(ref), "cache-bust ausente: " + ref);

/* ---------- lógica real do accordion (vm + DOM fake) ---------- */
const start = ui.indexOf("function bindCatalogAccordion");
const openBrace = ui.indexOf("{", start);
let depth = 0, end = -1;
for (let i = openBrace; i < ui.length; i++) {
  if (ui[i] === "{") depth++;
  else if (ui[i] === "}" && --depth === 0) { end = i + 1; break; }
}
must(start >= 0 && end > start, "bindCatalogAccordion não encontrado em ui.js");

class FakeClassList {
  constructor(init) { this.set = new Set(String(init || "").split(/\s+/).filter(Boolean)); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  toggle(c, v) {
    if (v === undefined) { this.set.has(c) ? this.set.delete(c) : this.set.add(c); }
    else { v ? this.set.add(c) : this.set.delete(c); }
  }
}
function fakeEl(cls, children) {
  const el = {
    classList: new FakeClassList(cls), attrs: {}, listeners: {}, cards: [],
    children: children || [],
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    fire(t, ev) { (this.listeners[t] || []).forEach((fn) => fn(ev || { preventDefault() {} })); },
    querySelector(sel) {
      if (sel === ".hunt-cat-title") return this.head;
      if (sel === ".hunts-group") return this.group;
      if (sel === ".hunt-modal-card") return this.cards[0] || null;
      return null;
    },
    querySelectorAll(sel) { return sel === ".accordion-section" ? this.sections : []; },
    head: null, group: null, sections: [],
  };
  return el;
}
function buildRoot() {
  const root = fakeEl("", []);
  const secs = [];
  for (let i = 0; i < 3; i++) {
    const sec = fakeEl("accordion-section", []);
    const head = fakeEl("hunt-cat-title accordion-head", []);
    head.attrs["aria-expanded"] = "false"; // como renderizado no HTML
    const group = fakeEl("hunts-group collapsed", []);
    sec.head = head; sec.group = group; sec.sections = secs;
    secs.push(sec); root.children.push(sec);
  }
  root.sections = secs;
  return root;
}
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(ui.slice(start, end), ctx, { filename: "bindCatalogAccordion" });

// accordion: padrão tudo minimizado; abrir uma minimiza as demais.
{
  const root = buildRoot();
  vm.runInContext("bindCatalogAccordion", ctx)(root, "accordion");
  for (const s of root.children) {
    must(s.group.classList.contains("collapsed"), "padrão deveria ser minimizado");
    must(s.head.attrs["aria-expanded"] === "false", "aria-expanded inicial deveria ser false");
  }
  root.children[1].head.fire("click");
  must(!root.children[1].group.classList.contains("collapsed") && root.children[1].classList.contains("open"),
    "clique não expandiu a aba 2");
  must(root.children[0].group.classList.contains("collapsed") &&
       root.children[2].group.classList.contains("collapsed"),
    "expandir uma aba não minimizou as demais");
  must(root.children[1].head.attrs["aria-expanded"] === "true", "aria-expanded não virou true");
  root.children[2].head.fire("click");
  must(!root.children[2].group.classList.contains("collapsed") &&
       root.children[1].group.classList.contains("collapsed") &&
       root.children[0].group.classList.contains("collapsed"),
    "trocar de aba não fechou a anterior");
  root.children[2].head.fire("click");
  for (const s of root.children)
    must(s.group.classList.contains("collapsed"), "clicar na aba aberta deveria minimizar tudo");
  // teclado (Enter) também expande.
  root.children[0].head.fire("keydown", { key: "Enter", preventDefault() {} });
  must(!root.children[0].group.classList.contains("collapsed") &&
       root.children[1].group.classList.contains("collapsed"),
    "Enter não expandiu a aba 1 (accordion)");
}

// multi (busca): várias abas abertas ao mesmo tempo; clique só alterna a sua.
{
  const root = buildRoot();
  const acc = vm.runInContext("bindCatalogAccordion", ctx)(root, "multi");
  acc.open(root.children[0]); acc.open(root.children[2]);
  must(!root.children[0].group.classList.contains("collapsed") &&
       !root.children[2].group.classList.contains("collapsed") &&
       root.children[1].group.classList.contains("collapsed"),
    "modo multi não mantém várias abas abertas");
  root.children[1].head.fire("click");
  must(!root.children[0].group.classList.contains("collapsed") &&
       !root.children[1].group.classList.contains("collapsed") &&
       !root.children[2].group.classList.contains("collapsed"),
    "clique em modo multi fechou as outras abas");
}

/* ---------- renderHunts: busca esconde abas sem resultado ---------- */
must(ui.includes('if (busca && !cards) return "";') &&
     ui.includes('bindCatalogAccordion(root, busca ? "multi" : "accordion")'),
  "renderHunts sem comportamento de busca das abas");

console.log("ok: abas de categoria minimizadas por padrão, accordion fecha as demais e busca abre os resultados (hunts/bosses)");
