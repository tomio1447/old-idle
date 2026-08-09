-- @Title: Global-Idle - Validate Canvas 24x15
-- @Description: Validates a fixed 24x15 Global-Idle map at Z=2.
if not app.hasMap() then print('[Global-Idle] No map open.'); return end
local d=Dialog({title='Global-Idle 24x15 Validator',width=420})
d:label({text='Set the first ground SQM of the Global-Idle canvas.'})
d:number({id='x',label='First X:',value=147,min=0,max=65535})
d:number({id='y',label='First Y:',value=156,min=0,max=65535})
d:number({id='z',label='Z:',value=2,min=0,max=15})
d:button({id='go',text='Validate 24 x 15',focus=true,onclick=function(x)x:close()end})
d:show()
local x0,y0,z=math.floor(d.data.x),math.floor(d.data.y),math.floor(d.data.z)
local by={}; for t in app.map.tiles do if t.z==z then by[t.x..':'..t.y]=t end end
local empty,noground={},{}
for y=y0,y0+14 do for x=x0,x0+23 do local t=by[x..':'..y]; if not t then table.insert(empty,x..','..y) elseif not t.hasGround then table.insert(noground,x..','..y) end end end
print(string.format('[Global-Idle] Area: (%d,%d,%d) 24x15',x0,y0,z));print('[Global-Idle] Empty SQMs: '..#empty);print('[Global-Idle] SQMs without ground: '..#noground)
if #empty==0 and #noground==0 then print('[Global-Idle] OK: export-safe.') else print('[Global-Idle] FAILED: complete ground before export.') end
