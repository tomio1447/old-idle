# Global-Idle - pending Oracle VM patch

**Policy:** hold all VM updates. This package is for **local testing first**, then a later explicit sync to `/opt/global-idle`.

| Field | Value |
|--------|--------|
| Branch HEAD | `cursor/fix-online-save-pvp-admin` @ `ed39dcaf` (+ prior `8ab1fbd2` world-boss) |
| Patch date | 2026-08-16 |
| Zip | `dist-patch/global-idle-patch-20260816.zip` |
| Source | current working-tree copies (not a git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>") |
| VM action | **Do not scp / do not pm2** until local checklist passes |

Also mirrored at: `scripts/patch-vm-pending.md` (same content pointer).

---

## Inventory vs HEAD vs recently deployed

### Already in branch HEAD (likely on VM if last full `deploy-oracle-alpha.ps1` ran after these commits)

| System | Commit / note |
|--------|----------------|
| Megalomania lobby + personal QTEs + boss assets | `ed39dcaf` |
| World Boss lobby / combat FX / stash / depth / economy | `8ab1fbd2` |
| Alpha announce modal / maintenance | `23c96948` |
| Online save 409 / PVP / admin forge | `32d16f61` |

Last Oracle syncs used a **full tibia-idle tarball** (excluding `node_modules`, `.env`, `server/data`, `tools/_wheel_src`). Anything committed or present in the WT at that moment is on the VM; **this pending delta is everything still dirty vs HEAD**.

### Pending vs HEAD (this patch) - systems

| Tag / system | What changed | PM2? |
|--------------|--------------|------|
| **party-invite-uq-v1** | UNIQUE only on pending invites (`pending_invitee_id`); accept/stale inbox; client Duplicate→friendly msg; party size comment 5 | **Yes** + schema migrate on boot |
| **UTF-8 / index** | Same invite index migration in `db.js` / `database.sql` (pool already `utf8mb4`; not a charset rewrite) | **Yes** (db.js runs ALTER on start) |
| **yellow-rings-fix-v1** | `effectdata` + `effects.json`: yellow-rings → yellow-sparkles | No* |
| **block-hit-fix-v1** | `effectdata` + `effects.json`: remove block-hit→block-effect (Cobra Assassin Sparky Beam / Floating Block) | No* |
| **fx-sqm-align-v1** | `effectTileOrigin` floor anchor; blood/rings/64px strips stay on SQM | No* |
| **phys combo** | `render.addEffect(..., comboKey)` + `game.js` hit-log/float combo for physical | No* |
| **hatred-defer-v2** | Boss arena spawn delay 5s; do not clear hatred/spite/malice while pending; bind mechanics after spawn | **Yes** |
| **malice-qte-12s** | Maze QTE duration 5s → **12s** (client + authoritative) | **Yes** |
| **malice-modal-anim-v1** / **malice-maze-move-v1** | Malice boss modal animation + maze move polish (`render` / cyclopedia / reward / world-boss / account-client) | No* / **Yes** if engine |
| **wb-modal-ux-v1** | World Boss overlay card, minimize → chip, CSS | No* |
| **party-zone-403 / mega** | WB never reports `zone=boss`; toast on boss 403; mega lobby 404 stop-poll; party sync before create; mega server 403→409 | **Yes** (party + mega) |
| **temple-clear-cond-v1** | Temple / party cond clear on city return (`party.js` / `city-ui.js`) | **Yes** (party) |
| **null guards** | `player.js` / `ui.js` early return if `!p` | No* |
| **cidade-reward-bang-v1** | `!` on CIDADE button + Reward card when chest pending | No* |
| **malice-assets-v2** | Cache bust + gif aliases for Malice loot icons | No* |
| **gran-con-prio-v1** | `comboEscolhe` prefers `exori-gran-con` when dense pack / multi-target; mirrored in `authoritative_engine`; cache-bust `combo.js?v=gran-con-prio-v1` | **Yes** |
| **exori-con-st-prio-v1** | ST slots (`exori-con` / strikes) fire in packs; `min>1` no longer marks ST as AoE; cast-fail tries next combo slot; AoE picker defaults min=2 | **Yes** |
| **diamond-ethereal-missile-v1** | `CONST_ANI_DIAMONDARROW` → `diamond-arrow` strip; ethereal spear spells → `ethereal-spear` (not wooden `spear`); spellfx + engine + importers | **Yes** |
| **goshnar-taint-list-v1** | Status-bar taint tooltip: official-style header + bullet list of active penalties (dynamic N); `soulwar.js` / `ui.js` / `icondata.js` / `layout.css` + cache-bust | No* |
| **charge-stack-destroy-v1** | Charge/time rings & amulets: destroy only depleted instance; stack only when full; partials as bag instances; soft boots decay; countdown overlay + cond-bar-only | **Yes** |
| **cond-bar-viewport-off-v1** | OTC HUD cond-bar viewport off / layout (`otc-hud.js` / `otc-hud.css`) | No* |
| **helper-equip-picker-v1** / **helper-equip-toggle-v1** | Helper Equipamento picker + Ativo toggle (accessories / layout) | No* |
| **goshnar-yasir-v1** / **yasir-loot-meta-v1** | Yasir buy prices + Soul War loot meta (`yasir-prices.js` / `soulwar.js` + hard-loot tests) | No* |
| **scarlett-esteira-smooth-v1** | Scarlett boss esteira / QTE smooth (`scarlett-boss.js` / `game.js` / `layout.css`) | No* |
| **party-checkpoint-v1** | Party checkpoint restore tests + related client/server paths | **Yes** if server party touched |
| **stack-count-frames-v1** | Stackable bag/loot count frames via ~62 `*_stack.png` strips + `weapons.js` helpers; cache-bust `weapons.js?v=stack-count-frames-v1` | No* |
| **mount-zpattern-v1** | Mounted pose zPattern=1 + OTC mount compose; ~720 `.mounted.base` / ~668 `.mounted.mask` outfit sheets; `appearance` / `appearancedata` / `preload`; cache-bust `?v=mount-zpattern-v1` | No* |

\*Client-only: nginx static reload / hard refresh (Ctrl+F5) enough; **still restart PM2** if you also copy server files in the same wave.

---

## Files to copy (relative to `tibia-idle/` / `/opt/global-idle/`)

### Client - copy + hard refresh

```
game/index.html
game/css/layout.css
game/css/otc-hud.css
game/data/spellfx.json
game/assets/effects/effects.json
game/assets/item/figurine-of-malice.gif
game/assets/item/malice-s-horn.gif
game/assets/item/malice-s-spine.gif
game/assets/item/malices-horn.gif
game/assets/item/malices-spine.gif
game/js/weapons.js
game/assets/item/*_stack.png
game/js/appearance.js
game/js/appearancedata.js
game/js/preload.js
game/assets/appearance/outfit/*.mounted.base.png
game/assets/appearance/outfit/*.mounted.mask.png
game/js/accessories.js
game/js/accessorydata.js
game/js/account-client.js
game/js/city-ui.js
game/js/combat.js
game/js/combo.js
game/js/cyclopedia-ui.js
game/js/effectdata.js
game/js/game.js
game/js/icondata.js
game/js/megalomania-lobby.js
game/js/otc-hud.js
game/js/party-ui.js
game/js/party.js
game/js/patch_clientfx.js
game/js/player.js
game/js/render.js
game/js/reward-chest.js
game/js/scarlett-boss.js
game/js/soulwar.js
game/js/supply-stash-data.js
game/js/ui.js
game/js/world-boss-ui.js
game/js/yasir-prices.js
```

### Server - copy + **PM2 restart required**

```
server/authoritative_engine.js
server/database.sql
server/db.js
server/megalomania_lobby.js
server/party.js
```

On first boot after `db.js` lands, expect automatic:

- `ALTER TABLE party_invites` add generated `pending_invitee_id`
- drop/recreate `uq_invite_pending` → `UNIQUE(pending_invitee_id)`

Keep VM `.env` / `server/.env` / `server/data` untouched.

### Tools (local verification; optional on VM)

```
tools/import_monsters.py
tools/import_spell_effects.py
tools/migrate_json_to_mysql.js
tools/test_boss_reward_online.js
tools/test_charge_stack_destroy.js
tools/test_stackable_count_frames.js
tools/extract_stack_sprites.py
tools/extract_mounted_sheets.py
tools/test_mount_zpattern.js
tools/test_account_outfit_mounts.js
tools/test_combat_fx_expire.js
tools/test_combat_fx_sqm_align.js
tools/test_creature_sprite_anchors.js
tools/test_damage_analyser.js
tools/test_dense_pack_ai.js
tools/test_goshnars_greed.js
tools/test_goshnars_hatred.js
tools/test_goshnars_malice.js
tools/test_goshnars_spite.js
tools/test_gran_con_combo_priority.js
tools/test_hard_hunts_cobra.js
tools/test_hard_loot_npc_prices.js
tools/test_healthbar_canary_layout.js
tools/test_interface_boss_visuals.js
tools/test_knight_spell_fx_combo.js
tools/test_malice_boss_modal_anim.js
tools/test_online_party_runtime_hydration.js
tools/test_party_checkpoint_restore.js
tools/test_party_invite_unique.js
tools/test_party_zone_403_fix.js
tools/test_physical_hit_block_miss_fx.js
tools/test_render_overlap_bottom_up.js
tools/test_scarlett_boss.js
tools/test_sinister_dust_render.js
tools/test_sqm_auto_walk.js
```

Suggested local smoke:

```powershell
cd tibia-idle
node tools/test_party_invite_unique.js
node tools/test_party_zone_403_fix.js
node tools/test_combat_fx_sqm_align.js
node tools/test_goshnars_hatred.js
node tools/test_goshnars_malice.js
node tools/test_physical_hit_block_miss_fx.js
node tools/test_gran_con_combo_priority.js
node tools/test_dense_pack_ai.js
node tools/test_charge_stack_destroy.js
node tools/test_stackable_count_frames.js
node tools/test_mount_zpattern.js
node tools/test_scarlett_boss.js
node tools/test_hard_loot_npc_prices.js
```

---

## Explicit EXCLUDES (do not ship)

| Path | Why |
|------|-----|
| `game/data/areas.json` | **WIP wipe** (~23k lines - stub). Would break hunts/spells on VM. |
| `logof.png`, `logos..png` (repo root) | Branding junk / not app assets |
| `server/_cf_check.txt`, `start-cf-tunnel.vbs`, `start-cloudflared-quick.bat`, `start-server-8001.bat` | Local CF tunnel / Windows helpers |
| `tools/_wheel_src/**` | Extracted OTC wheel sources |
| `game/maps/nagas_marapur-*.xml` | Unrelated map WIP unless intentional |
| `game/assets/ground/soulwar.png` | Untracked; not wired in this delta |
| `game/maps/README.md`, `tools/build_soulwar_boss_rooms.js` | Map-tooling docs/scripts; not runtime |
| `server/node_modules/**`, `.env`, `server/data/**` | Always exclude on deploy |

---

## Local test checklist (per system)

### Party invite unique + index

- [ ] Create party in city → invite works
- [ ] Accept invite → member joins; re-open Party → **no stale invite** for self
- [ ] Leave party → get invited again → accept **without** `Duplicate entry ...accepted`
- [ ] Double-click Accept → friendly msg / no 500
- [ ] After server restart, `party_invites` has `pending_invitee_id` + unique on that column only

### Party zone 403 / World Boss isolation

- [ ] Enter World Boss → party zone stays city / no boss-req 403 spam
- [ ] Leader invites only from city/training
- [ ] Boss zone report failure shows toast (not only Network error)

### Megalomania lobby

- [ ] In party → open mega lobby → clear toast; no create spam
- [ ] Old server without routes → poll stops (404), no ping storm
- [ ] Party conflict responses are 409 (not mistaken auth 403)

### Hatred / Spite / Malice defer + QTE 12s

- [ ] Enter Hatred/Spite/Malice → ~5s spawn delay, camera stable
- [ ] Mechanics (Dread's Torment / etc.) **activate after** boss appears
- [ ] Malice maze: blue→red window is **12s**
- [ ] During spawn wait, minigame UI does not hard-reset incorrectly

### Yellow rings + FX SQM align + phys combo

- [ ] Yellow rings FX uses ring strip (not sparkles/wall crop)
- [ ] 64px effects (divine barrage / crit) sit on correct SQM (not south tile)
- [ ] Party multi-hit physical → one blood FX + summed floater/log in short window

### World Boss modal UX

- [ ] Overlay shows title + minimize
- [ ] Minimize → top chip; click chip restores for same event window

### Null guards

- [ ] UI paths with `G.p` missing do not throw (login/transition)

### Reward `!` notification (`cidade-reward-bang-v1`)

- [ ] Pending boss reward → `!` on **CIDADE** topbar button
- [ ] Same on Reward card inside city modal; count if >1
- [ ] After claim/open all → bang clears

### Gran Con / exori con ST priority (`gran-con-prio-v1` + `exori-con-st-prio-v1`)

- [ ] Dense pack → `#1` **exori-gran-con** or **exori-con** fires (not only AoE)
- [ ] With gran on CD and exori-con `#2` → filler **exori con** fires before AoE
- [ ] Knight `#1` exori-ico still fires in a pack of 2+
- [ ] Legacy ST slots with `min=2` are clamped to `min=1` and still cast
- [ ] Cache-bust: `combo.js` / `combat.js` / `ui.js` `?v=exori-con-st-prio-v1`
- [ ] `node tools/test_gran_con_combo_priority.js` and `node tools/test_dense_pack_ai.js` pass locally

### Diamond / ethereal missile (`diamond-ethereal-missile-v1`)

- [ ] Bow/crossbow + diamond arrow → flying projectile is **diamond-arrow** strip (blue crystal), not wooden spear/arrow
- [ ] Exori con / gran con → **ethereal-spear** strip (not wooden spear)
- [ ] Cache-bust: `patch_clientfx.js?v=diamond-ethereal-missile-v1` + `spellfx.json` on server path

### Charge stack destroy (`charge-stack-destroy-v1`)

- [ ] Charge ring/amulet: depleting one instance destroys only that stack entry
- [ ] Full stacks merge; partials stay separate bag instances
- [ ] Soft boots decay + countdown overlay / cond-bar-only
- [ ] Cache-bust: `player.js` / `accessories.js` / `accessorydata.js` / `supply-stash-data.js` / `ui.js` `?v=charge-stack-destroy-v1`
- [ ] `node tools/test_charge_stack_destroy.js` passes

### Helper equip picker + Ativo toggle (`helper-equip-picker-v1` / `helper-equip-toggle-v1`)

- [ ] Helper → Equipamento → Amuleto/Anel: **Ativo** starts **off** for new/unset helpers
- [ ] Click EMERGENCIAL/PADRÃO → modal with search, icon rows, Usar / Em uso / Remover (Nenhum)
- [ ] Turn **Ativo** on → equips emergency if HP low, else standard (if configured)
- [ ] Turn **Ativo** off while wearing emergency → restores standard (or unequips if no standard)

### Goshnar taint list tooltip (`goshnar-taint-list-v1`)

- [ ] With ≥1 Soul War taint → status-bar icon + `N/5`
- [ ] Hover tooltip: header + **bullet list** of only active penalties
- [ ] Hard refresh picks up `?v=goshnar-taint-list-v1`

### Yasir / Soul War loot (`goshnar-yasir-v1` / `yasir-loot-meta-v1`)

- [ ] Yasir prices cover Goshnar / Soul War loot keys
- [ ] Hard refresh: `yasir-prices.js?v=goshnar-yasir-v1`, `soulwar.js?v=yasir-loot-meta-v1`
- [ ] `node tools/test_hard_loot_npc_prices.js` passes

### Scarlett esteira (`scarlett-esteira-smooth-v1`)

- [ ] Scarlett conveyor / QTE feels smooth; no stutter on local `:8001`
- [ ] Cache-bust: `scarlett-boss.js` / `game.js` / `layout.css` `?v=scarlett-esteira-smooth-v1`
- [ ] `node tools/test_scarlett_boss.js` passes

### Cond-bar HUD (`cond-bar-viewport-off-v1`)

- [ ] OTC HUD cond-bar respects viewport-off layout after hard refresh


### Stackable count frames (`stack-count-frames-v1`)

- [ ] Stackable bag/loot icons use count-frame strips (`*_stack.png`), not a single static sprite
- [ ] Frame selection matches stack size thresholds in `weapons.js` helpers
- [ ] Cache-bust: `weapons.js?v=stack-count-frames-v1` (hard refresh)
- [ ] `node tools/test_stackable_count_frames.js` passes

### Mount zPattern (`mount-zpattern-v1`)

- [ ] Mounted outfits use zPattern=1 sheets (`.mounted.base` / `.mounted.mask`) and OTC mount compose
- [ ] Cache-bust: `appearance.js` / `appearancedata.js` / `preload.js` `?v=mount-zpattern-v1` (hard refresh)
- [ ] `node tools/test_mount_zpattern.js` passes

---

## WIP notes


| Item | Status |
|------|--------|
| Helper equip Baiak picker + Ativo toggle | **Included** |
| Reward `!` (cidade bang) | **Included** |
| Gran Con / exori con ST priority | **Included** |
| Diamond / ethereal missiles | **Included** |
| Goshnar taint list tooltip | **Included** |
| Charge stack destroy | **Included** |
| Stackable count frames | **Included** (`stack-count-frames-v1`) |
| Mount zPattern sheets + compose | **Included** (`mount-zpattern-v1`) |
| Yasir prices + Soul War loot meta | **Included** (`yasir-prices.js`) |
| Scarlett esteira smooth | **Included** |
| Cond-bar viewport / otc-hud | **Included** |
| `areas.json` wipe | **Excluded** - restore from git before any deploy that touches data |
| Malice `.gif` aliases | Included (png already in HEAD); optional if VM already resolves png |
| Nagas Marapur XML | Excluded |
| CF tunnel scripts | Excluded |

---

## Later VM apply (when you lift the hold)

1. Confirm local checklist green on `:8001`.
2. Prefer copying **only** the paths listed above (or unzip this package over `/opt/global-idle` with care).
3. Preserve `/opt/global-idle/.env` and `server/.env`.
4. `pm2 restart global-idle` (required for server + index migration).
5. Hard refresh clients (cache-bust query strings already updated in `index.html`).
6. Do **not** run full-tree tar that would overwrite `areas.json` with the wiped local stub.

Zip contents mirror the include list (**1600 files** including README). Unpack root = `tibia-idle/` layout (`game/`, `server/`, `tools/`).
