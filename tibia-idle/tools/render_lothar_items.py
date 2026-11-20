"""Renderiza os icones dos itens de troca do Lothar/Addoner (client 15.x).

Fonte dos ids: appearances.dat (nome oficial -> object id). Quando o nome
bate em varios ids, o items.xml 14.x do Canary decide (id == clientId).
Saida:
  * game/assets/item/<slug>.png          (icone 32x32 por celula)
  * tabela JSON impressa no stdout: {slug: {n, cid, w}} para colar em
    cosmetic-npcs-data.js (COSMETIC_ITEM_DEFS).

Uso: python tools/render_lothar_items.py [--dry]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_15x_sprites import Sprites15x  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "game", "assets", "item")
DRY = "--dry" in sys.argv

# slugs consumidos pelas receitas de cosmetic-npcs-data.js
sys.path.insert(0, os.path.join(ROOT, "tools"))
import subprocess


def recipe_slugs():
    out = subprocess.run(
        ["node", "-e",
         "const r=require('./game/js/cosmetic-npcs-data.js');"
         "const s=new Set();"
         "for(const x of r){for(const a of x.alternatives||[])for(const c of a)s.add(c.slug);"
         " if(x.catalyst)s.add(x.catalyst);}"
         "console.log([...s].join('\\n'));"],
        cwd=ROOT, capture_output=True, text=True)
    return out.stdout.split()


def defined_slugs():
    out = subprocess.run(
        ["node", "-e",
         "const fs=require('fs'),vm=require('vm');"
         "const doc={getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null,"
         "addEventListener:()=>{},createElement:()=>({getContext:()=>null,style:{},classList:{add:()=>{}}}),"
         "body:{classList:{add:()=>{}},appendChild:()=>{},prepend:()=>{}}};"
         "const ls={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};"
         "const ctx={console,setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,"
         "clearInterval:()=>{},document:doc,localStorage:ls,sessionStorage:ls,navigator:{},"
         "location:{href:'',search:''},fetch:()=>Promise.reject(new Error('x')),"
         "requestAnimationFrame:()=>0,addEventListener:()=>{},Image:function(){},"
         "performance:{now:()=>0},URL,customElements:{define:()=>{}},Audio:function(){},"
         "MutationObserver:function(){},ResizeObserver:function(){},Worker:function(){}};"
         "ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;vm.createContext(ctx);"
         "const html=fs.readFileSync('game/index.html','utf8');"
         "for(const m of html.matchAll(/src=\\\"(js\\/[a-z0-9._-]+\\.js)/g)){"
         " try{vm.runInContext(fs.readFileSync('game/'+m[1],'utf8'),ctx,{filename:m[1]});}catch(e){}}"
         "console.log(Object.keys(ctx.GAMEDATA.items).join('\\n'));"],
        cwd=ROOT, capture_output=True, text=True)
    return set(out.stdout.split())


def norm(text):
    t = (text or "").lower()
    t = re.sub(r"^the\s+", "", t)
    t = t.replace(chr(8217), chr(39)).replace(chr(39), "").replace("-", " ")
    return re.sub(r"\s+", " ", t).strip()


def slug_name(slug):
    # "-s-" marca apóstrofo no padrão do projeto: lion-s-heart -> lion's heart
    return slug.replace("-s-", "'s-").replace("-", " ")


def main():
    s15 = Sprites15x()
    meta = json.load(open(os.path.join(ROOT, "tools", "_items14.json")))
    weights14, xml_names = meta["w"], meta["n"]

    by_norm = {}
    for o in s15.appearances.objects.values():
        if o.name:
            by_norm.setdefault(norm(o.name), []).append(o.id)

    # tie-break: quando varios ids tem o mesmo nome, prefere o que consta no
    # items.xml 14.x (id == clientId oficial); senao, o menor id.
    def pick(slug, name):
        ids = by_norm.get(norm(name))
        if not ids:
            return None
        if len(ids) == 1:
            return ids[0]
        xml_ids = set(xml_names.get(norm(name), []))
        hit = [i for i in ids if i in xml_ids]
        return (hit or ids)[0]

    have = defined_slugs()
    table, skipped = {}, []
    for slug in recipe_slugs():
        if slug in have:
            continue
        name = slug_name(slug)
        cid = pick(slug, name)
        if not cid:
            skipped.append(slug)
            continue
        app = s15.appearances.object(cid)
        official = (app.name or name).lower() if app else name
        w = weights14.get(str(cid), 0)
        table[slug] = {"n": official, "cid": cid, "w": w}
        if not DRY:
            img = s15.render_object(cid)
            if img:
                img.save(os.path.join(OUT, slug + ".png"))

    print(json.dumps(table, indent=0, sort_keys=True))
    print("RENDER:", len(table), "SEM MATCH:", skipped, file=sys.stderr)


if __name__ == "__main__":
    main()
