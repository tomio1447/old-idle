const fs=require('fs'),path=require('path');const g=path.join(__dirname,'..','game','js');
const game=fs.readFileSync(path.join(g,'game.js'),'utf8'),ui=fs.readFileSync(path.join(g,'party-ui.js'),'utf8'),
  party=fs.readFileSync(path.join(g,'party.js'),'utf8'),index=fs.readFileSync(path.join(__dirname,'..','game','index.html'),'utf8');
for(const [s,r] of [[game,/G\.combat\.players\.some/],[game,/partyCombatSwitchTo\(id\)/],[ui,/partyCombatSwitchTo\(id\)/],
  [party,/partyCombatSaveAll\(\)/],[party,/localStorage\.setItem\(ACTIVE_CHARACTER_KEY, String\(ent\.id\)\)/],
  [party,/onlineAuthorityCombat\(\).*persistActiveInstance\(\)/s],[game,/const localActiveId=.*previous\.player/],
  [game,/G\.combat\.player=localActive;G\.p=localActive\.p/],[index,/js\/party\.js\?v=five-vocations-v1/],
  [index,/js\/game\.js\?v=shared-instance-v2/]])
  if(!r.test(s))throw Error('troca segura/compartilhada de party ausente');
console.log('OK: troca de personagem em party reutiliza uma instância e persiste o personagem ativo sem reload.');
