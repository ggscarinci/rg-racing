import { randomInt, randomUUID, createHash } from 'node:crypto';

export class RuleError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
export const must = (ok, message, status) => { if (!ok) throw new RuleError(message, status); };
export const uid = () => randomUUID();
const clone = value => structuredClone(value);
const text = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const number = (value, min, max, label) => {
  must(value !== '' && value !== null && value !== undefined, `${label} é obrigatório.`);
  const n = Number(value);
  must(Number.isInteger(n) && n >= min && n <= max, `${label} inválido.`);
  return n;
};
export function shuffle(values, rng = randomInt) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function initialState(demo = false) {
  const eventId = uid();
  const state = {
    version: 1, activeEventId: eventId, activeHeatId: null,
    events: [{ id: eventId, name: demo ? 'Copa Indoor • Etapa de demonstração' : 'Meu campeonato de kart',
      location: demo ? 'Kartódromo • Ambiente de demonstração' : '', date: new Date().toISOString().slice(0, 10),
      timezone: 'America/Sao_Paulo', swapSeconds: 5, returnSwappedKart: false, autoAdvance: true,
      discardCount: 1, links: [], demo }],
    pilots: [], karts: [], heats: []
  };
  if (!demo) return state;
  const names = ['Amanda Marques', 'Bárbara Louly', 'Cícera Domingues', 'Danny Lima', 'Gabi Abdala', 'Helena Ferraz', 'Joci Oliveira', 'Júlia Zorzeto', 'Juliana Petruschky', 'Layza Gadia', 'Luane Cuminato', 'Pietra Gravina', 'Pyetra Leão', 'Roberta Marques', 'Vanessa Bronzoli', 'Via Alves'];
  state.pilots = names.map((name, i) => ({ id: uid(), eventId, name, state: ['SP','GO','SC','DF','PR'][i % 5] }));
  state.karts = [2,3,5,11,21,25,26,28,30,37,43,45,46,48,55,58,63,66,69,70].map(n => ({ eventId, number: n, status: 'available' }));
  const today = new Date().toISOString().slice(0, 10);
  state.heats = [
    ['Feminina', 1, 1, '14:00'], ['Feminina', 2, 1, '14:25'], ['95 KG', 1, 1, '14:50'], ['Super Sênior', 1, 1, '15:15']
  ].map(([category, series, round, time]) => ({ id: uid(), eventId, category, series, round,
    scheduledAt: `${today}T${time}:00-03:00`, actualAt: null, status: 'scheduled',
    pilotIds: category === 'Feminina' ? state.pilots.map(p => p.id) : [],
    kartNumbers: state.karts.map(k => k.number), draw: null, results: [] }));
  state.activeHeatId = state.heats[0].id;
  return state;
}

export const getEvent = (state, id = state.activeEventId) => {
  const event = state.events.find(e => e.id === id);
  must(event, 'Evento não encontrado.', 404); return event;
};
export const getHeat = (state, id = state.activeHeatId) => {
  const heat = state.heats.find(h => h.id === id);
  must(heat, 'Bateria não encontrada.', 404); return heat;
};
const operational = heat => must(!['on_track','finished'].includes(heat.status), 'A bateria já foi para a pista. Trocas são permitidas antes da bateria.');
const kartAvailable = (state, heat, n) => state.karts.some(k => k.eventId === heat.eventId && k.number === n && k.status === 'available');
const reservedElsewhere = (state, heat, n) => state.heats.some(h => h.id !== heat.id && h.eventId === heat.eventId && ['drawing','closed','on_track'].includes(h.status) && Object.values(h.draw?.assignments ?? {}).includes(n));
const spareKarts = (state, heat, excluded) => (heat.draw?.pool ?? []).filter(n => n !== excluded && kartAvailable(state, heat, n) && !reservedElsewhere(state, heat, n));
function reveal(state, heat, now) {
  const draw = heat.draw;
  const pilotId = draw.order[draw.cursor];
  const oldKart = draw.phase === 'swaps' ? draw.assignments[pilotId] : null;
  const options = spareKarts(state, heat, oldKart);
  if (!options.length) {
    draw.waitingForKart = true; draw.dueAt = null; draw.current = null;
    return;
  }
  // Initial pool order was independently shuffled at preparation; returned karts are inserted randomly.
  const kart = options[0];
  draw.pool = draw.pool.filter(n => n !== kart);
  draw.assignments[pilotId] = kart;
  if (oldKart !== null) {
    if (draw.policy.returnSwappedKart && kartAvailable(state, heat, oldKart)) {
      draw.pool.splice(randomInt(draw.pool.length + 1), 0, oldKart);
    } else draw.retired.push(oldKart);
    const request = draw.requests.find(r => r.pilotId === pilotId && r.status === 'pending');
    if (request) { request.status = 'fulfilled'; request.newKart = kart; request.fulfilledAt = now; }
  }
  draw.waitingForKart = false;
  draw.current = { pilotId, kart, oldKart, at: now, kind: oldKart === null ? 'initial' : 'swap' };
  draw.history.push(clone(draw.current));
  draw.dueAt = now + draw.policy.swapSeconds * 1000;
  draw.awaitingNext = false;
}
function finishTurn(state, heat, now) {
  const draw = heat.draw;
  if (draw.current) draw.previous = clone(draw.current);
  draw.current = null; draw.dueAt = null; draw.remainingMs = null;
  draw.cursor++;
  if (draw.cursor >= draw.order.length) {
    draw.phase = draw.requests.some(r => r.status === 'pending') ? 'swap_ready' : 'complete';
    draw.awaitingNext = false;
    if (draw.phase === 'complete') heat.status = 'closed';
  } else if (draw.policy.autoAdvance) reveal(state, heat, now);
  else draw.awaitingNext = true;
}

// The server's persisted deadline is authoritative; a restart never skips unseen pilots.
export function tick(state, now = Date.now()) {
  let changed = false;
  for (const heat of state.heats) {
    const draw = heat.draw;
    if (draw?.waitingForKart && ['drawing','swaps'].includes(draw.phase) && spareKarts(state, heat, draw.phase === 'swaps' ? draw.assignments[draw.order[draw.cursor]] : null).length) {
      reveal(state, heat, now); changed = true;
    }
    if (draw && !draw.paused && draw.dueAt !== null && now >= draw.dueAt && ['drawing','swaps'].includes(draw.phase)) {
      finishTurn(state, heat, now); changed = true;
    }
  }
  return changed;
}

export function command(state, action, data = {}, now = Date.now()) {
  const event = getEvent(state, data.eventId ?? state.activeEventId);
  if (action === 'event.create') {
    const e = { ...clone(event), id: uid(), name: text(data.name), demo: false, links: [], date: text(data.date || new Date().toISOString().slice(0, 10)) };
    must(e.name, 'Informe o nome do evento.');
    state.events.push(e); state.activeEventId = e.id; state.activeHeatId = null;
    return { eventId: e.id };
  }
  if (action === 'event.select') {
    state.activeEventId = event.id;
    state.activeHeatId = state.heats.find(h => h.eventId === event.id)?.id ?? null; return;
  }
  if (action === 'event.update') {
    if (data.name !== undefined) { must(text(data.name), 'Informe o nome do evento.'); event.name = text(data.name); }
    if (data.location !== undefined) event.location = text(data.location);
    if (data.date !== undefined) { must(/^\d{4}-\d{2}-\d{2}$/.test(data.date), 'Data inválida.'); event.date = data.date; }
    if (data.timezone !== undefined) {
      try { new Intl.DateTimeFormat('pt-BR', { timeZone: data.timezone }); } catch { throw new RuleError('Fuso horário inválido.'); }
      event.timezone = data.timezone;
    }
    if (data.swapSeconds !== undefined) event.swapSeconds = number(data.swapSeconds, 1, 60, 'Janela de troca');
    if (data.returnSwappedKart !== undefined) event.returnSwappedKart = data.returnSwappedKart === true;
    if (data.autoAdvance !== undefined) event.autoAdvance = data.autoAdvance === true;
    if (data.discardCount !== undefined) event.discardCount = number(data.discardCount, 0, 10, 'Descartes');
    if (data.links !== undefined) {
      must(Array.isArray(data.links) && data.links.length <= 20, 'Lista de links inválida.');
      event.links = data.links.map(link => {
        let url; try { url = new URL(link.url); } catch { throw new RuleError('Endereço do link inválido.'); }
        must(['https:', 'http:'].includes(url.protocol), 'Use links HTTP ou HTTPS.');
        must(!url.username && !url.password && text(link.title), 'Link inválido.');
        return { title: text(link.title, 80), url: url.href.slice(0, 2048) };
      });
    } return;
  }
  if (action === 'pilot.add') {
    const pilots = data.pilots ?? [data];
    must(Array.isArray(pilots) && pilots.length > 0 && pilots.length <= 500, 'Informe até 500 pilotos.');
    for (const value of pilots) {
      const name = text(value.name), uf = text(value.state, 2).toUpperCase();
      must(name.length >= 2, 'O piloto precisa ter um nome.');
      must(!uf || /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(uf), 'UF inválida.');
      must(!state.pilots.some(p => p.eventId === event.id && p.name.localeCompare(name, 'pt-BR', { sensitivity: 'base' }) === 0), `Piloto já cadastrado: ${name}.`);
      state.pilots.push({ id: uid(), eventId: event.id, name, state: uf });
    } return;
  }
  if (action === 'pilot.remove') {
    must(state.pilots.some(p => p.id === data.pilotId && p.eventId === event.id), 'Piloto não encontrado.', 404);
    must(!state.heats.some(h => h.pilotIds.includes(data.pilotId)), 'Remova o piloto das baterias antes de excluí-lo.');
    state.pilots = state.pilots.filter(p => p.id !== data.pilotId); return;
  }
  if (action === 'kart.add') {
    must(Array.isArray(data.numbers) && data.numbers.length && data.numbers.length <= 500, 'Informe os números dos karts.');
    for (const value of data.numbers) {
      const n = number(value, 1, 9999, 'Número do kart');
      must(!state.karts.some(k => k.eventId === event.id && k.number === n), `O kart ${n} já está cadastrado.`);
      state.karts.push({ eventId: event.id, number: n, status: 'available' });
    } return;
  }
  if (action === 'kart.status') {
    const kart = state.karts.find(k => k.eventId === event.id && k.number === Number(data.number));
    must(kart, 'Kart não encontrado.', 404);
    must(['available','maintenance'].includes(data.status), 'Status inválido.');
    if (data.status === 'maintenance') must(!state.heats.some(h => h.eventId === event.id && ['drawing','closed','on_track'].includes(h.status) && Object.values(h.draw?.assignments ?? {}).includes(kart.number)), 'Troque o kart atribuído antes de enviá-lo à manutenção.');
    kart.status = data.status; return;
  }
  if (action === 'heat.create') {
    must(text(data.category), 'Informe a categoria.');
    must(!isNaN(Date.parse(data.scheduledAt)), 'Horário inválido.');
    const ids = [...new Set(data.pilotIds ?? [])];
    must(ids.every(id => state.pilots.some(p => p.id === id && p.eventId === event.id)), 'Piloto inválido.');
    const heat = { id: uid(), eventId: event.id, category: text(data.category, 60),
      series: number(data.series, 1, 99, 'Série'), round: number(data.round, 1, 99, 'Bateria'),
      scheduledAt: new Date(data.scheduledAt).toISOString(), actualAt: null, status: 'scheduled',
      pilotIds: ids, kartNumbers: [], draw: null, results: [] };
    state.heats.push(heat); state.activeHeatId = heat.id; return { heatId: heat.id };
  }
  const heat = getHeat(state, data.heatId ?? state.activeHeatId);
  must(heat.eventId === event.id, 'A bateria pertence a outro evento.');
  if (action === 'heat.select') { state.activeHeatId = heat.id; return; }
  if (action === 'heat.update') {
    operational(heat); must(!heat.draw, 'A formação fica travada após preparar o sorteio.');
    if (data.pilotIds !== undefined) {
      must(Array.isArray(data.pilotIds), 'Lista de pilotos inválida.');
      const ids = [...new Set(data.pilotIds)];
      must(ids.every(id => state.pilots.some(p => p.id === id && p.eventId === event.id)), 'Piloto inválido.'); heat.pilotIds = ids;
    }
    if (data.kartNumbers !== undefined) {
      must(Array.isArray(data.kartNumbers), 'Lista de karts inválida.');
      const ns = [...new Set(data.kartNumbers.map(Number))];
      must(ns.every(n => kartAvailable(state, heat, n)), 'Selecione apenas karts disponíveis.'); heat.kartNumbers = ns;
    }
    if (data.scheduledAt !== undefined) {
      must(!isNaN(Date.parse(data.scheduledAt)), 'Horário inválido.'); heat.scheduledAt = new Date(data.scheduledAt).toISOString();
    } return;
  }
  if (action === 'heat.status') {
    must(['parc','on_track','finished'].includes(data.status), 'Status inválido.');
    if (data.status === 'parc') must(!heat.draw && heat.status === 'scheduled', 'Bateria já iniciada.');
    if (data.status === 'on_track') {
      must(heat.status === 'closed' && heat.draw?.phase === 'complete', 'Encerre o sorteio e as trocas antes de liberar a pista.');
      must(!state.heats.some(h => h.eventId === event.id && h.id !== heat.id && h.status === 'on_track'), 'Encerre a bateria que está na pista.');
      heat.actualAt = now;
    }
    if (data.status === 'finished') must(heat.status === 'on_track', 'A bateria ainda não está na pista.');
    heat.status = data.status; return;
  }
  operational(heat);
  if (action === 'draw.prepare') {
    must(!heat.draw, 'Este sorteio já foi preparado.');
    must(heat.pilotIds.length, 'Adicione pilotos à bateria.');
    const pool = heat.kartNumbers.filter(n => kartAvailable(state, heat, n) && !reservedElsewhere(state, heat, n));
    must(pool.length >= heat.pilotIds.length, 'Não há karts disponíveis suficientes para todos os pilotos.');
    const alphabetical = [...heat.pilotIds].sort((a,b) => state.pilots.find(p => p.id === a).name.localeCompare(state.pilots.find(p => p.id === b).name, 'pt-BR'));
    const order = shuffle(alphabetical), karts = shuffle(pool.sort((a,b) => a-b));
    const proof = createHash('sha256').update(JSON.stringify({ order, karts })).digest('hex');
    heat.draw = { phase: 'ready', order, initialOrder: [...order], initialKarts: [...karts], proof,
      pool: karts, retired: [], assignments: {}, requests: [], cursor: 0, current: null, previous: null,
      history: [], dueAt: null, paused: false, remainingMs: null, awaitingNext: false, waitingForKart: false,
      policy: { swapSeconds: event.swapSeconds, returnSwappedKart: event.returnSwappedKart, autoAdvance: event.autoAdvance }, preparedAt: now };
    heat.status = 'drawing'; state.activeHeatId = heat.id; return;
  }
  const draw = heat.draw;
  must(draw, 'Prepare o sorteio primeiro.');
  if (action === 'draw.start') { must(draw.phase === 'ready', 'O sorteio já começou.'); draw.phase = 'drawing'; reveal(state, heat, now); return; }
  if (action === 'draw.pause') {
    must(['drawing','swaps'].includes(draw.phase) && draw.current && !draw.paused, 'Não há contagem em andamento.');
    draw.remainingMs = Math.max(0, draw.dueAt - now); draw.dueAt = null; draw.paused = true; return;
  }
  if (action === 'draw.resume') {
    must(draw.paused, 'O sorteio não está pausado.');
    draw.dueAt = now + draw.remainingMs; draw.paused = false; draw.remainingMs = null; return;
  }
  if (action === 'draw.next') {
    must(draw.awaitingNext && !draw.paused, 'Aguarde o término dos cinco segundos.');
    reveal(state, heat, now); return;
  }
  if (action === 'draw.request-swap') {
    must(Object.hasOwn(draw.assignments, data.pilotId), 'O piloto ainda não foi sorteado.');
    const insideWindow = draw.phase === 'drawing' && !draw.paused && draw.current?.pilotId === data.pilotId && draw.dueAt > now;
    must(insideWindow || text(data.reason, 500).length >= 5, 'Fora da janela: informe o motivo da autorização da gestão.');
    must(!draw.requests.some(r => r.pilotId === data.pilotId && r.status === 'pending'), 'Este piloto já tem uma troca pendente.');
    draw.requests.push({ id: uid(), pilotId: data.pilotId, oldKart: draw.assignments[data.pilotId], status: 'pending',
      at: now, override: !insideWindow, reason: insideWindow ? 'Solicitada na janela de troca' : text(data.reason, 500) });
    if (draw.phase === 'complete') { draw.phase = 'swap_ready'; heat.status = 'drawing'; }
    return;
  }
  if (action === 'draw.start-swaps') {
    must(draw.phase === 'swap_ready', 'Aguarde o término do sorteio inicial.');
    const pending = draw.requests.filter(r => r.status === 'pending');
    must(pending.length, 'Não há trocas pendentes.');
    draw.order = shuffle(pending.map(r => r.pilotId)); draw.cursor = 0; draw.phase = 'swaps';
    draw.paused = false; draw.previous = draw.history.at(-1) ?? null;
    reveal(state, heat, now); return;
  }
  if (action === 'draw.add-kart') {
    const n = number(data.number, 1, 9999, 'Número do kart');
    must(kartAvailable(state, heat, n) && !reservedElsewhere(state, heat, n), 'Kart indisponível.');
    must(!Object.values(draw.assignments).includes(n) && !draw.pool.includes(n) && !draw.retired.includes(n), 'Este kart já participou do sorteio.');
    draw.pool.splice(randomInt(draw.pool.length + 1), 0, n); heat.kartNumbers.push(n);
    if (draw.waitingForKart) reveal(state, heat, now); return;
  }
  if (action === 'draw.replace') {
    must(text(data.reason, 500).length >= 5, 'Informe o motivo da troca administrativa.');
    must(Object.hasOwn(draw.assignments, data.pilotId), 'Piloto não sorteado.');
    must(draw.current?.pilotId !== data.pilotId, 'Aguarde o término da janela do piloto antes da troca administrativa.');
    must(!draw.requests.some(r => r.pilotId === data.pilotId && r.status === 'pending'), 'O piloto já está na fila de trocas.');
    const oldKart = draw.assignments[data.pilotId], options = spareKarts(state, heat, oldKart);
    const kart = data.number ? Number(data.number) : shuffle(options)[0];
    must(options.includes(kart), 'Não há kart reserva disponível para esta troca.');
    draw.pool = draw.pool.filter(n => n !== kart); draw.assignments[data.pilotId] = kart;
    if (draw.policy.returnSwappedKart && kartAvailable(state, heat, oldKart)) draw.pool.splice(randomInt(draw.pool.length + 1), 0, oldKart);
    else draw.retired.push(oldKart);
    draw.history.push({ pilotId: data.pilotId, kart, oldKart, kind: 'override', at: now, reason: text(data.reason, 500) }); return;
  }
  throw new RuleError('Ação desconhecida.', 404);
}

// Results are entered manually until an authenticated timing adapter is implemented.
export function saveResults(state, data) {
  const heat = getHeat(state, data.heatId);
  must(heat.status === 'finished', 'Encerre a bateria na pista antes de lançar o resultado.');
  must(Array.isArray(data.results) && data.results.length <= heat.pilotIds.length, 'Resultado inválido.');
  const pilots = new Set(), positions = new Set();
  heat.results = data.results.map(r => {
    must(heat.pilotIds.includes(r.pilotId) && !pilots.has(r.pilotId), 'Piloto inválido ou repetido.');
    const position = number(r.position, 1, heat.pilotIds.length, 'Posição');
    must(!positions.has(position), 'Há posições repetidas.'); positions.add(position); pilots.add(r.pilotId);
    return { pilotId: r.pilotId, position, points: number(r.points, 0, 1000, 'Pontos'),
      penalty: number(r.penalty ?? 0, -1000, 1000, 'Ajuste'), note: text(r.note, 250),
      bestLapMs: r.bestLapMs ? number(r.bestLapMs, 1, 3600000, 'Melhor volta') : null };
  });
}

export function publicState(state, now = Date.now()) {
  const result = clone(state);
  result.serverNow = now;
  for (const heat of result.heats) if (heat.draw) {
    const draw = heat.draw;
    delete draw.pool; delete draw.initialKarts; delete draw.retired;
    draw.reserveCount = spareKarts(state, getHeat(state, heat.id)).length;
    draw.requests = draw.requests.map(({ reason, ...rest }) => rest);
    draw.history = draw.history.map(({ reason, ...rest }) => rest);
  }
  return result;
}

export { ranking } from '../public/stats.js';
