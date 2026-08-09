-- @Title: Global-Idle - Lock Canvas 24x15
-- @Description: Locks export validation to a 24x15 rectangle and reports tiles outside it.
-- @Author: Global-Idle
-- @Version: 1.0.0
--
-- Copy to Canary's Map Editor/scripts and restart the editor.
-- This script never changes tiles. It blocks the Global-Idle export workflow
-- by reporting every tile/item outside the locked rectangle.

if not app.hasMap() then
  print("[Global-Idle] No map open.")
  return
end

local dlg = Dialog({ title = "Global-Idle Canvas Lock", width = 430 })
dlg:label({ text = "Define the first ground SQM of the fixed 24 x 15 canvas." })
dlg:separator()
dlg:number({ id = "x", label = "First ground X:", value = 147, min = 0, max = 65535 })
dlg:number({ id = "y", label = "First ground Y:", value = 156, min = 0, max = 65535 })
dlg:number({ id = "z", label = "Floor Z:", value = 2, min = 0, max = 15 })
dlg:separator()
dlg:button({ id = "go", text = "Lock / Validate Canvas", focus = true, onclick = function(d) d:close() end })
dlg:show()

local x0, y0, z = math.floor(dlg.data.x), math.floor(dlg.data.y), math.floor(dlg.data.z)
local W, H = 24, 15
local x1, y1 = x0 + W - 1, y0 + H - 1
local map = app.map
local outside, missingGround, empty = {}, {}, {}
local byPos = {}

for tile in map.tiles do
  if tile.z == z then
    byPos[tile.x .. ":" .. tile.y] = tile
    local hasItems = tile.items and #tile.items > 0
    if (tile.hasGround or hasItems or tile.hasCreature or tile.hasSpawn) and
       (tile.x < x0 or tile.x > x1 or tile.y < y0 or tile.y > y1) then
      table.insert(outside, string.format("%d,%d", tile.x, tile.y))
    end
  end
end

for y = y0, y1 do
  for x = x0, x1 do
    local tile = byPos[x .. ":" .. y]
    if not tile then table.insert(empty, string.format("%d,%d", x, y))
    elseif not tile.hasGround then table.insert(missingGround, string.format("%d,%d", x, y)) end
  end
end

print("[Global-Idle] ----------------------------------------")
print(string.format("[Global-Idle] Locked canvas: (%d,%d,%d) → (%d,%d,%d)  24x15", x0, y0, z, x1, y1, z))
print(string.format("[Global-Idle] Outside tiles: %d", #outside))
print(string.format("[Global-Idle] Empty SQMs: %d", #empty))
print(string.format("[Global-Idle] SQMs without ground: %d", #missingGround))
if #outside > 0 then print("[Global-Idle] OUTSIDE (remove before export): " .. table.concat(outside, " | ")) end
if #empty > 0 then print("[Global-Idle] EMPTY: " .. table.concat(empty, " | ")) end
if #missingGround > 0 then print("[Global-Idle] NO GROUND: " .. table.concat(missingGround, " | ")) end
if #outside == 0 and #empty == 0 and #missingGround == 0 then
  print("[Global-Idle] OK: canvas is locked and export-safe.")
else
  print("[Global-Idle] FAILED: do not export this map to Global-Idle yet.")
end
