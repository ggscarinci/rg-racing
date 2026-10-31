import test from 'node:test';
import assert from 'node:assert/strict';
import { command, initialState, tick, shuffle, publicState, ranking, saveResults } from '../src/engine.mjs';

function setup({ count = 3, reserve = 2, returns = false, auto = true } = {}) {
  const s = initialState(true), ev = s.events[0], h = s.heats[0];
  ev.returnSwappedKart = returns; ev.autoAdvance = auto;
  h.pilotIds = h.pilotIds.slice(0,count); h.kartNumbers = s.karts.slice(0,count+reserve).map(k=>k.number);
  command(s,'draw.prepare',{},1000); return {s,h,ev};
}
function finish(s, h, now = 1000) {
  let steps=0;
  while (h.draw.dueAt !== null) { now=h.draw.dueAt;tick(s,now);assert.ok(++steps<100); }
  return now;
}
test('shuffle preserves all entries and does not mutate the input', () => {
  const a=[1,2,3,4,5];assert.deepEqual(shuffle(a,()=>0),[2,3,4,5,1]);assert.deepEqual(a,[1,2,3,4,5]);
  for(let i=0;i<100;i++)assert.deepEqual(shuffle(a).sort(),a);
});
test('initial draw assigns unique karts, five seconds per pilot, previous and next remain correct', () => {
  const {s,h}=setup();const order=[...h.draw.initialOrder], kartOrder=[...h.draw.initialKarts];
  command(s,'draw.start',{},1000);
  assert.equal(h.draw.current.pilotId,order[0]);assert.equal(h.draw.current.kart,kartOrder[0]);assert.equal(h.draw.dueAt,6000);
  assert.equal(tick(s,5999),false);assert.equal(tick(s,6000),true);
  assert.equal(h.draw.previous.pilotId,order[0]);assert.equal(h.draw.current.pilotId,order[1]);assert.equal(h.draw.dueAt,11000);
  finish(s,h);assert.equal(h.draw.phase,'complete');assert.equal(h.status,'closed');
  assert.equal(new Set(Object.values(h.draw.assignments)).size,3);
});
test('public state cannot reveal future kart numbers or internal reasons', () => {
  const {s,h}=setup();command(s,'draw.start',{},1000);
  command(s,'draw.request-swap',{pilotId:h.draw.current.pilotId,reason:'internal-secret'},1001);
  const p=publicState(s,1200).heats[0].draw;
  assert.equal(p.pool,undefined);assert.equal(p.initialKarts,undefined);assert.equal(p.retired,undefined);
  assert.equal(p.requests[0].reason,undefined);assert.equal(p.reserveCount,4);assert.equal(Object.keys(p.assignments).length,1);
});
test('expired windows require a management reason and duplicate requests are rejected', () => {
  const {s,h}=setup();command(s,'draw.start',{},1000);const first=h.draw.current.pilotId;
  tick(s,6000);assert.throws(()=>command(s,'draw.request-swap',{pilotId:first},6001),/motivo/);
  command(s,'draw.request-swap',{pilotId:first,reason:'Defeito identificado'},6001);
  assert.equal(h.draw.requests[0].override,true);
  assert.throws(()=>command(s,'draw.request-swap',{pilotId:first,reason:'Defeito identificado'},6002),/pendente/);
});
for (const returns of [false,true]) test(`swap assigns a different spare and respects return policy (${returns})`, () => {
  const {s,h}=setup({returns});command(s,'draw.start',{},1000);
  const id=h.draw.current.pilotId, old=h.draw.current.kart;
  command(s,'draw.request-swap',{pilotId:id},1001);finish(s,h);
  assert.equal(h.draw.phase,'swap_ready');command(s,'draw.start-swaps',{},20000);
  assert.notEqual(h.draw.assignments[id],old);assert.equal(h.draw.pool.includes(old),returns);assert.equal(h.draw.retired.includes(old),!returns);
  finish(s,h);assert.equal(h.draw.phase,'complete');assert.equal(h.draw.requests[0].status,'fulfilled');
});
test('late administrative request reopens swaps after the draw ends, but never after going on track', () => {
  const {s,h}=setup();command(s,'draw.start',{},1000);finish(s,h);
  const id=h.pilotIds[0];command(s,'draw.request-swap',{pilotId:id,reason:'Falha mecânica verificada'},30000);
  assert.equal(h.draw.phase,'swap_ready');assert.equal(h.status,'drawing');
  command(s,'draw.start-swaps',{},30001);finish(s,h);command(s,'heat.status',{status:'on_track'},50000);
  assert.throws(()=>command(s,'draw.request-swap',{pilotId:id,reason:'Falha mecânica verificada'},50001),/pista/);
});
test('administrative immediate exchange is audited in history and preserves uniqueness', () => {
  const {s,h}=setup({returns:true});command(s,'draw.start',{},1000);finish(s,h);
  const id=h.pilotIds[0], old=h.draw.assignments[id];
  command(s,'draw.replace',{pilotId:id,reason:'Motor com falha recorrente'},30000);
  assert.notEqual(h.draw.assignments[id],old);assert.ok(h.draw.pool.includes(old));
  assert.equal(h.draw.history.at(-1).kind,'override');assert.equal(h.draw.history.at(-1).reason,'Motor com falha recorrente');
  assert.equal(new Set(Object.values(h.draw.assignments)).size,3);
});
test('missing reserve blocks swaps until a new kart is added', () => {
  const {s,h}=setup({reserve:0});command(s,'draw.start',{},1000);
  command(s,'draw.request-swap',{pilotId:h.draw.current.pilotId},1001);finish(s,h);
  command(s,'draw.start-swaps',{},20000);assert.equal(h.draw.waitingForKart,true);assert.equal(h.draw.dueAt,null);
  const extra=s.karts.find(k=>!h.kartNumbers.includes(k.number)).number;
  command(s,'draw.add-kart',{number:extra},25000);assert.equal(h.draw.waitingForKart,false);assert.equal(h.draw.current.kart,extra);
});
test('pause and resume preserve the remaining time; manual advance cannot shorten a window', () => {
  const {s,h}=setup({auto:false});command(s,'draw.start',{},1000);
  assert.throws(()=>command(s,'draw.next',{},2000),/término/);
  command(s,'draw.pause',{},2500);assert.equal(h.draw.remainingMs,3500);assert.equal(tick(s,50000),false);
  command(s,'draw.resume',{},50000);assert.equal(h.draw.dueAt,53500);tick(s,53500);
  assert.equal(h.draw.awaitingNext,true);assert.equal(h.draw.current,null);
  command(s,'draw.next',{},54000);assert.equal(h.draw.dueAt,59000);
});
test('a waiting draw resumes when an existing spare becomes available again', () => {
  const {s,h}=setup({count:1,reserve:1});
  command(s,'draw.start',{},1000);command(s,'draw.request-swap',{pilotId:h.draw.current.pilotId},1001);
  const spare=h.draw.pool[0];command(s,'kart.status',{number:spare,status:'maintenance'},1002);
  finish(s,h);command(s,'draw.start-swaps',{},10000);assert.equal(h.draw.waitingForKart,true);
  command(s,'kart.status',{number:spare,status:'available'},11000);tick(s,11001);
  assert.equal(h.draw.waitingForKart,false);assert.equal(h.draw.current.kart,spare);assert.equal(h.draw.dueAt,16001);
});
test('restart with an overdue timer advances once and grants a full window to the next pilot', () => {
  const {s,h}=setup();command(s,'draw.start',{},1000);
  const recovered=JSON.parse(JSON.stringify(s));tick(recovered,100000);
  const d=recovered.heats[0].draw;assert.equal(d.history.length,2);assert.equal(d.dueAt,105000);
});
test('frozen draw policy and ordering cannot be silently modified', () => {
  const {s,h}=setup();const order=[...h.draw.order];
  command(s,'event.update',{returnSwappedKart:true,swapSeconds:10},1001);
  assert.equal(h.draw.policy.returnSwappedKart,false);assert.equal(h.draw.policy.swapSeconds,5);
  assert.throws(()=>command(s,'draw.prepare',{},1002),/já foi/);
  assert.throws(()=>command(s,'heat.update',{pilotIds:[]},1002),/travada/);assert.deepEqual(h.draw.order,order);
});
test('fleet availability and other active heat assignments are enforced', () => {
  const {s,h}=setup();command(s,'draw.start',{},1000);const assigned=h.draw.current.kart;
  assert.throws(()=>command(s,'kart.status',{number:assigned,status:'maintenance'},1001),/Troque/);
  const spare=h.draw.pool[0];command(s,'kart.status',{number:spare,status:'maintenance'},1002);tick(s,6000);
  assert.notEqual(h.draw.current.kart,spare);
  const h2=s.heats[1];h2.pilotIds=h.pilotIds.slice(0,1);h2.kartNumbers=[assigned];
  assert.throws(()=>command(s,'draw.prepare',{heatId:h2.id},10000),/suficientes/);
});
test('results are event/category isolated; adjustments and lowest score discard are applied', () => {
  const s=initialState(true), ev=s.events[0], h1=s.heats[0], h2=s.heats[1], id=h1.pilotIds[0];
  h1.status='finished';h2.status='finished';
  saveResults(s,{heatId:h1.id,results:[{pilotId:id,position:1,points:35,penalty:-5}]});
  saveResults(s,{heatId:h2.id,results:[{pilotId:id,position:2,points:30,penalty:1}]});
  assert.equal(ranking(s,ev.id,'Feminina',true)[0].total,31);assert.equal(ranking(s,ev.id,'Feminina',false)[0].total,61);
  assert.equal(ranking(s,ev.id,'95 KG',false).length,0);
  assert.throws(()=>saveResults(s,{heatId:h1.id,results:[{pilotId:id,position:1,points:2},{pilotId:id,position:2,points:3}]}),/repetido/);
});
test('unsafe links and cross-event pilots are rejected', () => {
  const s=initialState(true), id=s.pilots[0].id;
  assert.throws(()=>command(s,'event.update',{links:[{title:'X',url:'javascript:alert(1)'}]}),/HTTP/);
  command(s,'event.create',{name:'Outro evento'},1000);
  assert.throws(()=>command(s,'heat.create',{category:'Sênior',series:1,round:1,scheduledAt:'2026-11-01T10:00:00-03:00',pilotIds:[id]}),/Piloto/);
});
