/* SSE autenticado: histórico curto por conta, replay por cursor e heartbeat. */
"use strict";
const crypto=require("crypto");
class SyncBus{
  constructor(options){options=options||{};this.historyLimit=Number(options.historyLimit)||256;
    this.ticketTtlMs=Number(options.ticketTtlMs)||10*60*1000;this.sequence=0;
    this.histories=new Map();this.clients=new Map();this.tickets=new Map();}
  issueTicket(accountId,sessionToken){const ticket=crypto.randomBytes(32).toString("hex"),now=Date.now();
    this.tickets.set(ticket,{accountId:Number(accountId),sessionToken:String(sessionToken),expiresAt:now+this.ticketTtlMs});
    this.cleanup(now);return {ticket,expiresAt:now+this.ticketTtlMs};}
  consumeTicket(ticket){const row=this.tickets.get(String(ticket||""));
    if(!row||row.expiresAt<=Date.now()){if(row)this.tickets.delete(String(ticket));return null;}return row;}
  cleanup(now){now=now||Date.now();for(const [key,row] of this.tickets)if(row.expiresAt<=now)this.tickets.delete(key);}
  publish(accountId,type,data){accountId=Number(accountId);const event={id:++this.sequence,type:String(type),at:Date.now(),data:data||{}};
    const history=this.histories.get(accountId)||[];history.push(event);while(history.length>this.historyLimit)history.shift();this.histories.set(accountId,history);
    for(const client of this.clients.get(accountId)||[])this.write(client.res,event);
    return event;}
  write(res,event){if(res.destroyed||res.writableEnded)return;
    res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(Object.assign({at:event.at},event.data))}\n\n`);}
  subscribe(accountId,res,lastEventId,expiresAt){accountId=Number(accountId);lastEventId=Math.max(0,Number(lastEventId)||0);
    let set=this.clients.get(accountId);if(!set){set=new Set();this.clients.set(accountId,set);}const client={res};set.add(client);
    const history=this.histories.get(accountId)||[];
    if(lastEventId>this.sequence)
      this.write(res,{id:++this.sequence,type:"snapshot-required",at:Date.now(),data:{reason:"server-reset"}});
    else if(lastEventId&&history.length&&lastEventId<history[0].id-1)
      this.write(res,{id:++this.sequence,type:"snapshot-required",at:Date.now(),data:{reason:"cursor-expired"}});
    else for(const event of history)if(event.id>lastEventId)this.write(res,event);
    this.write(res,{id:++this.sequence,type:"ready",at:Date.now(),data:{cursor:this.sequence}});
    const heartbeat=setInterval(()=>{if(!res.destroyed&&!res.writableEnded)res.write(`: heartbeat ${Date.now()}\n\n`);},15000);
    if(heartbeat.unref)heartbeat.unref();
    const expiry=expiresAt?setTimeout(()=>{if(!res.writableEnded)res.end();},Math.max(1,Number(expiresAt)-Date.now())):null;
    if(expiry&&expiry.unref)expiry.unref();
    const close=()=>{clearInterval(heartbeat);if(expiry)clearTimeout(expiry);set.delete(client);if(!set.size)this.clients.delete(accountId);};
    res.on("close",close);res.on("error",close);return close;}
  cursor(){return this.sequence;}
  clientCount(){let count=0;for(const set of this.clients.values())count+=set.size;return count;}
}
module.exports={SyncBus};
