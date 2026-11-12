# Verification

Run from `tibia-idle/`:
- `node tools/test_gnomprona.js`: all three Gnomprona hunts, OTBM bounds/connected spawn areas, modal rendering, monster/loot assets and prices, account hazard, Primal Bag and equipment parity.
- `python tools/import_gnomprona_assets.py`: publish Weagons 2/3 from `game/beta-maps`, import missing tiles/loot icons, patterns and collision flags. Defaults to `../refs/tibia860`; override with `TIBIA860`.
- `node tools/test_annihilator.js`: reward chest displays/interactions, authoritative one-time claims, real-map access to the exit teleport at (1037, 1022, 7), lobby return and restart recovery.
- `node tools/test_bloodrotten.js`: map/floor/positions of all five rooms, native loot and sprites, summon caps and respawn, pillar telegraphs/damage, database-level admission, authoritative checkpoint recovery, Bakragore world-boss lobby (5 seats, level 600), Bakragore's Burden taint validation/scaling and the once-per-character quest reward.
- `python tools/import_bloodrotten_assets.py`: publish Vemiath, Chagorz, Murcion, Ichgahal and Bakragore from `game/beta-maps/bossesroom`, validate native loot icons and import tiles/patterns plus the static lookTypeEx pillar sprite. Uses `TIBIA860` or `../refs/tibia860`.
- Bakragore is exclusive to the World Boss lobby (warzoneId "bakragore", up to 5 players). Direct boss/hunt instance PUTs are rejected (`WORLD_BOSS_LOBBY_REQUIRED` / `INVALID_BLOODROTTEN_INSTANCE`). Lobby members contribute earned taints via POST `/api/world-boss/burden`; the frozen `burdenTotal` scales Elder Bloodjaws (+1/taint, max 8) and boss HP (+5%/taint) in the authoritative Bloodrotten tick. Victory grants the Blood Rotten Quest reward (Figurine of Bakragore + Bag You Covet) once per character.
- `node tools/test_charge_stack_destroy.js`: accessory charges, stacking and depletion.
- `node tools/test_depot_drag.js`: depot drag/drop, context-menu cleanup, city modal styling and immediate equipment previews with delayed/rejected requests.
- `node tools/test_stash_equip_persist.js`: server-authoritative Supply Stash equipment and withdrawal.

The authoritative engine loads client item registration scripts, including `game/js/magma-bubble.js`. Loot registrations must preserve existing equipment definitions (slots, stats and charge metadata).

Authority simulation uses fixed 200 ms steps. Tests calling `advanceAuthorityState` must advance at least 200 ms to process combat deaths or timers; shorter intervals only accumulate carry time.

Additional inventory/quest verification from `tibia-idle/`:
- `node tools/test_depot_authority.js`: Depot API ownership/lease checks, persistence across hydration, party container deltas and instance/charge preservation.
- `node tools/test_inventory_sync_order.js`: delayed polling must not undo confirmed inventory actions or regress character revisions.
- `node tools/test_boss_quests.js`: Bosses Quests category and progress panels; these entries must not create combat lobbies.
- Explicitly approved map updates can use `python tools/import_gnomprona_assets.py --publish-map gnomprona_weagon3.otbm`; the default importer still refuses to overwrite divergent maps.
- User-approved balance: every Bloodrotten boss has a base 10% drop chance for one Bag You Covet. It has no NPC buyer; keep sell/npcSell at zero.
