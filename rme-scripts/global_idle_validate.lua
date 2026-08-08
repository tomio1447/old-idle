-- @Title: Global-Idle - Validate 24x15 Map
-- @Description: Validates a fixed Global-Idle arena without modifying the map.
-- @Author: Global-Idle
-- @Version: 1.0.0
--
-- Copy this file to Canary's Map Editor/scripts and restart the editor.
-- The Global-Idle runtime uses a fixed 24x15 SQM viewport at Z=2.

if not app.hasMap() then
  print("[Global-Idle] No map open.")
  return
end

local dlg = Dialog({ title = "Global-Idle Map Validator", width = 420 })
dlg:label({ text = "Validates a fixed 24 x 15 Global-Idle arena." })
dlg:separator()
dlg:number({ id = "x", label = "Top-left X:", value = 1000, min = 0, max = 65535 })
dlg:number({ id = "y", label = "Top-left Y:", value = 1000, min = 0, max = 65535 })
dlg:number({ id = "z", label = "Floor Z:", value = 2, min = 0, max = 15 })
dlg:separator()
dlg:button({ id = "go", text = "Validate 24 x 15", focus = true, onclick = function(d) d:close() end })
dlg:show()

local x0, y0, z = math.floor(dlg.data.x), math.floor(dlg.data.y), math.floor(dlg.data.z)
local W, H = 24, 15
local map = app.map
local missingGround, emptyTiles, multiNearEdge = {}, {}, {}

-- Index tiles from the RME map API by coordinate.
local byPos = {}
for tile in map.tiles do
  if tile.z == z then byPos[tile.x .. ":" .. tile.y] = tile end
end

for y = y0, y0 + H - 1 do
  for x = x0, x0 + W - 1 do
    local tile = byPos[x .. ":" .. y]
    if not tile then
      table.insert(emptyTiles, string.format("%d,%d", x, y))
    elseif not tile.hasGround then
      table.insert(missingGround, string.format("%d,%d", x, y))
    end
  end
end

print("[Global-Idle] ----------------------------------------")
print(string.format("[Global-Idle] Area: (%d,%d,%d)  %dx%d", x0, y0, z, W, H))
print(string.format("[Global-Idle] Empty SQMs: %d", #emptyTiles))
print(string.format("[Global-Idle] SQMs without ground: %d", #missingGround))
if #emptyTiles > 0 then print("[Global-Idle] Empty: " .. table.concat(emptyTiles, " | ")) end
if #missingGround > 0 then print("[Global-Idle] No ground: " .. table.concat(missingGround, " | ")) end
if #emptyTiles == 0 and #missingGround == 0 then
  print("[Global-Idle] OK: fixed 24x15 area has ground on every SQM.")
else
  print("[Global-Idle] FAILED: check coordinates above before exporting.")
end
