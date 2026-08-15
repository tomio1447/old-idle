#!/usr/bin/env python3
"""Apply TibiaWiki creature-product NPC prices onto game/js/gamedata.js.

Updates `sell` (sell-all / autosell) and `npcSell` (analyser prefers npcSell).
Writes a report of mapped/unmapped items. Does NOT commit.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GAMEDATA = ROOT / "game" / "js" / "gamedata.js"
WIKI = HERE / "_wiki_creature_products.json"
REPORT = HERE / "_creature_product_price_report.json"

# Manual aliases: wiki title -> game slug (when normalize fails)
ALIASES = {
    "demonic essence": "demonic-essence",
    "lizard leather": "lizard-leather",
    "minotaur leather": "minotaur-leather",
    "green dragon leather": "green-dragon-leather",
    "red dragon leather": "red-dragon-leather",
    "turtle shell": "turtle-shell",
    "spider silk": "spider-silk",
    "rope belt": "rope-belt",
    "orc tooth": "orc-tooth",
    "cyclops toe": "cyclops-toe",
    "ogre ear stud": "ogre-ear-stud",
    "ogre nose ring": "ogre-nose-ring",
    "lion's mane": "lion-s-mane",
    "werelion claw": "werelion-claw",
}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("\u2019", "'").replace("`", "'")
    s = s.replace("'s ", "s ").replace("'s", "s")
    s = s.replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def name_keys(name: str) -> list[str]:
    """Generate slug candidates for wiki/game title variants."""
    raw = unicodedata.normalize("NFKD", name or "")
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    raw = raw.lower().replace("\u2019", "'").replace("`", "'")
    variants = [
        raw,
        raw.replace("'s", "s"),
        re.sub(r"'s\b", " s", raw),
        re.sub(r"'s\b", "-s", raw),
        raw.replace("'", ""),
    ]
    keys = []
    seen = set()
    for v in variants:
        k = slugify(v)
        if k and k not in seen:
            seen.add(k)
            keys.append(k)
        # also: dragons-tail <-> dragon-s-tail
        if k.endswith("s-") is False and "s-" in k:
            pass
        m = re.sub(r"([a-z])s-", r"\1-s-", k)
        if m != k and m not in seen:
            seen.add(m)
            keys.append(m)
        m2 = re.sub(r"([a-z])-s-", r"\1s-", k)
        if m2 != k and m2 not in seen:
            seen.add(m2)
            keys.append(m2)
    return keys


def load_gamedata(path: Path):
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"window\.GAMEDATA\s*=\s*(\{.*\})\s*;?\s*$", txt, re.S)
    if not m:
        raise SystemExit("could not parse GAMEDATA")
    return json.loads(m.group(1)), txt, m


def main() -> None:
    wiki = json.loads(WIKI.read_text(encoding="utf-8"))
    data, txt, m = load_gamedata(GAMEDATA)
    items = data["items"]

    by_norm: dict[str, str] = {}
    for slug, it in items.items():
        for key in name_keys(slug) + name_keys(it.get("n") or ""):
            by_norm.setdefault(key, slug)
        by_norm.setdefault(slugify(slug), slug)

    updated = []
    unchanged = []
    unmapped_wiki = []
    mapped_slugs = set()

    for entry in wiki:
        name = entry["name"]
        price = int(entry.get("npcPrice") or 0)
        keys = name_keys(name)
        slug = ALIASES.get(name.lower())
        if not slug:
            for key in keys:
                slug = by_norm.get(key)
                if slug:
                    break
        if not slug or slug not in items:
            unmapped_wiki.append({
                "name": name,
                "npcPrice": price,
                "slug_guess": keys[0] if keys else "",
            })
            continue

        it = items[slug]
        mapped_slugs.add(slug)
        old_sell = int(it.get("sell") or 0)
        old_npc = int(it.get("npcSell") or 0)
        # Prefer wiki NPC price; keep higher existing npcSell only if it was
        # already from a known buyer and wiki says 0? No — wiki is source of
        # truth for creature products. Always set both.
        changed = old_sell != price or old_npc != price
        it["sell"] = price
        if price > 0:
            it["npcSell"] = price
        elif "npcSell" in it and old_npc and price == 0:
            # Wiki says unsellable; clear npcSell so analyser doesn't invent value
            del it["npcSell"]

        rec = {
            "slug": slug,
            "name": name,
            "oldSell": old_sell,
            "oldNpcSell": old_npc,
            "newPrice": price,
            "changed": changed,
        }
        (updated if changed else unchanged).append(rec)

    # Game loot-like items that look like creature products but had no wiki hit
    currency = {"gold-coin", "platinum-coin", "crystal-coin"}
    equip_types = {
        "sword", "axe", "club", "distance", "shield", "armor", "accessory",
        "supply", "ammo", "magic", "fist", "helmet", "legs", "boots", "ring",
        "amulet", "quiver", "container", "weapon",
    }
    skip_names = {
        "backpack", "bag", "torch", "rope", "shovel", "pick", "crowbar",
        "machete", "scythe", "sickle", "hoe", "watch", "vial", "letter",
        "book", "present", "doll", "teddy-bear", "cookie", "bread", "meat",
        "ham", "cheese", "fish", "egg", "banana", "orange", "carrot",
        "pumpkin", "melon", "grapes", "brown-bread", "moldy-cheese",
        "rotten-meat", "candy-cane", "brown-flask", "green-flask",
        "blue-bottle", "silver-key", "golden-key", "crystal-key",
        "some-wood", "stone", "piece-of-iron", "golden-trash",
        "health-potion", "mana-potion", "blank-rune",
    }
    unmapped_game = []
    for slug, it in items.items():
        if slug in mapped_slugs or slug in currency or slug in skip_names:
            continue
        slot = it.get("s")
        typ = it.get("t")
        if slot and slot not in (None, "loot", "misc", "material"):
            continue
        if typ in equip_types:
            continue
        if typ not in (None, "loot", "misc", "material", "soulwar", "resource"):
            continue
        # Heuristic: placeholder sell 1 or known product-ish
        sell = int(it.get("sell") or 0)
        unmapped_game.append({
            "slug": slug,
            "name": it.get("n"),
            "sell": sell,
            "npcSell": it.get("npcSell"),
        })

    # Rewrite gamedata.js compact like original (single-line JSON after assignment)
    new_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    new_txt = txt[: m.start(1)] + new_json + txt[m.end(1) :]
    if not new_txt.rstrip().endswith(";"):
        # original may already have trailing content; keep as-is from slice
        pass
    GAMEDATA.write_text(new_txt, encoding="utf-8")

    report = {
        "wikiTotal": len(wiki),
        "wikiNonzero": sum(1 for e in wiki if int(e.get("npcPrice") or 0) > 0),
        "updatedCount": len(updated),
        "unchangedCount": len(unchanged),
        "unmappedWikiCount": len(unmapped_wiki),
        "unmappedGameLootCount": len(unmapped_game),
        "updated": updated,
        "unchanged": unchanged,
        "unmappedWiki": unmapped_wiki,
        "unmappedGameLoot": unmapped_game,
    }
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print("updated", len(updated))
    print("unchanged", len(unchanged))
    print("unmapped wiki", len(unmapped_wiki))
    print("unmapped game loot-like", len(unmapped_game))
    print("report", REPORT)


if __name__ == "__main__":
    main()
