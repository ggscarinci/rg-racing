import { ranking } from '/stats.js';

const $ = (s, r = document) => r.querySelector(s);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  flag: '<path d="M4 21V3m0 1h7l2 3h7v10h-7l-2-3H4"/>',
  shuffle: '<path d="m16 3 4 4-4 4m0 2 4 4-4 4M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-2 4-5m2-3c1-1 2-2 4-2h3"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
  kart: '<path d="M4 16h16l-2-7H7zm-1 1v3m18-3v3M8 9l2-4h5l3 4M2 13h3m14 0h3M7 16v4m10-4v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 3v6m-4 1h8"/>',
  settings: '<path d="m9 3-1 3-3 1-2 4 2 3v4l4 3 3-2 4 1 3-3-1-4 3-3-2-4-4-1-2-3z"/><circle cx="12" cy="12" r="3"/>',
  tv: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 23h8m-4-4v4M8 1l4 4 4-4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  sound: '<path d="m3 9 4 0 5-5v16l-5-5H3zm13-3a9 9 0 0 1 0 12m-1-9a4 4 0 0 1 0 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  exit: '<path d="M10 3H3v18h7m4-14 5 5-5 5m-6-5h11"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.flag}</svg>`;
const brand = `<a href="/" class="brand" aria-label="RG Racing início"><img class="brand-logo" src="/assets/rg-racing-logo.png" alt="RG Racing" width="365" height="182" decoding="async"></a>`;
const statusNames = {scheduled:'Agendado',parc:'Parque fechado',drawing:'Em sorteio',closed:'Sorteio encerrado',on_track:'Na pista',finished:'Encerrada'};
const phaseNames = {ready:'Pronto para começar',drawing:'Sorteio em andamento',swap_ready:'Aguardando sorteio das trocas',swaps:'Sorteio das trocas',complete:'Sorteio encerrado'};
const badge = (name, value = name) => `<span class="badge ${e(name)}">${e(value)}</span>`;
const query = new URLSearchParams(location.search);
const isAdmin = location.pathname.replace(/\/$/, '') === '/admin';
const isTV = location.pathname.replace(/\/$/, '') === '/tv';
const themeKey = 'rg-racing.admin-theme';
let adminTheme = 'light';
try { if (localStorage.getItem(themeKey) === 'dark') adminTheme = 'dark'; } catch {}
function themeToggle() {
  return `<button class="btn small theme-toggle" data-action="theme" aria-label="Ativar tema ${adminTheme==='dark'?'claro':'escuro'} na gestão" aria-pressed="${adminTheme==='dark'}">${icon(adminTheme==='dark'?'sun':'moon')}<span>Tema ${adminTheme==='dark'?'claro':'escuro'}</span></button>`;
}
function applyTheme() {
  const selected = isAdmin ? adminTheme : 'light';
  document.body.dataset.theme = selected;
  document.documentElement.style.colorScheme = selected;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', selected==='dark'?'#10141d':'#ffffff');
  document.querySelectorAll('[data-action="theme"]').forEach(button => {
    button.innerHTML = `${icon(adminTheme==='dark'?'sun':'moon')}<span>Tema ${adminTheme==='dark'?'claro':'escuro'}</span>`;
    button.setAttribute('aria-label', `Ativar tema ${adminTheme==='dark'?'claro':'escuro'} na gestão`);
    button.setAttribute('aria-pressed', String(adminTheme==='dark'));
  });
}
applyTheme();
addEventListener('storage', message => {
  if (message.key === themeKey && isAdmin) { adminTheme = message.newValue === 'dark' ? 'dark' : 'light'; applyTheme(); }
});
let S, session = {}, view = query.get('tab') || 'draw', online = false, offset = 0, stream;
let eventId = query.get('evento'), heatId = query.get('bateria'), category = query.get('cat'), discard = true;
let lastMessageAt = Date.now();
let search = '', pilotId = query.get('id'), sound = false, audioContext, lastBeep = '', busy = false;
const app = $('#app'), modal = $('#modal');
const event = () => S.events.find(x => x.id === eventId) || S.events.find(x => x.id === S.activeEventId) || S.events[0];
const heats = () => S.heats.filter(x => x.eventId === event().id).sort((a,b) => Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt));
const pilots = () => S.pilots.filter(x => x.eventId === event().id).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
const karts = () => S.karts.filter(x => x.eventId === event().id).sort((a,b) => a.number-b.number);
const heat = () => heats().find(x => x.id === heatId) || heats().find(x => x.id === S.activeHeatId) || heats()[0];
const pilot = id => S.pilots.find(x => x.id === id) || {name:'Aguardando piloto',state:''};
const heatLabel = h => `${h.category} · Série ${h.series} · Bateria ${h.round}`;
const time = value => value ? new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:event().timezone}) : '—';
const date = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'});
const contextQuery = () => `?evento=${encodeURIComponent(event().id)}`;
const person = id => `<span class="pilot-name">${pilot(id).state ? `<span class="uf">${e(pilot(id).state)}</span>` : ''}${e(pilot(id).name)}</span>`;
const empty = (title, description = '', symbol = 'flag') => `<div class="empty">${icon(symbol)}<h3>${e(title)}</h3><p>${e(description)}</p></div>`;
const actionButton = (action, label, symbol = '', cls = '', extra = '') => `<button class="btn ${cls}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${label}</button>`;
const selectEvents = () => `<label class="sr-only" for="event-picker">Evento</label><select id="event-picker">${S.events.map(x => `<option value="${x.id}" ${event().id === x.id ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select>`;
function toast(message, error = false) {
  const node = $('#toast'); node.textContent = message; node.className = error ? 'show error' : 'show';
  clearTimeout(toast.timeout); toast.timeout = setTimeout(() => node.className = '', 6000);
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: {'Content-Type':'application/json', ...options.headers} });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Falha na conexão.'); error.status = response.status; throw error; }
  return data;
}
async function refresh(force = true) {
  S = await api(isAdmin && session.authenticated ? '/api/admin/state' : '/api/state');
  offset = S.serverNow - Date.now();
  if (force) render(true);
}
async function mutate(action, data = {}, message = 'Alteração salva.') {
  if (busy) return false;
  if (!online) { toast('Sem conexão com o servidor. Aguarde a reconexão.', true); return false; }
  busy = true;
  document.querySelectorAll('.mutation').forEach(el => el.disabled = true);
  try {
    await api('/api/admin/command', { method:'POST', headers:{'If-Match':String(S.version),'Idempotency-Key':crypto.randomUUID()},
      body:JSON.stringify({action,data:{eventId:event().id,heatId:heat()?.id,...data}}) });
    await refresh(false); modal.close(); render(true); if (message) toast(message); return true;
  } catch(error) {
    if (error.status === 401) session.authenticated = false;
    await refresh(false).catch(() => {});
    toast(error.message, true); render(); return false;
  } finally { busy = false; netStatus(); }
}
function netStatus() {
  document.querySelectorAll('[data-connection]').forEach(el => { el.className = `connection ${online ? '' : 'offline'}`; el.textContent = online ? 'Ao vivo' : 'Sem conexão • reconectando'; });
  document.querySelectorAll('.mutation').forEach(el => el.disabled = !online || busy || el.dataset.locked === 'true');
}
function connect() {
  stream = new EventSource('/api/stream');
  stream.addEventListener('state', message => {
    const next = JSON.parse(message.data); lastMessageAt=Date.now(); online = true; offset = next.serverNow-Date.now();
    S = {...next, audit:S?.audit};
    if(isAdmin&&session.authenticated){api('/api/admin/state').then(value=>{if(value.version>=S.version){S=value;render();}}).catch(()=>{});}
    render(); netStatus();
  });
  stream.addEventListener('heartbeat', message => { lastMessageAt=Date.now();offset=JSON.parse(message.data).serverNow-Date.now();online=true;netStatus(); });
  stream.onerror = () => { online = false; netStatus(); updateClocks(); };
}
function render(force = false) {
  if (!S) return;
  if (!force && (modal.open || document.activeElement?.matches('input,textarea,select'))) { netStatus(); return; }
  const scrolls = [...document.querySelectorAll('[data-scroll]')].map(x => [x.dataset.scroll,x.scrollTop]);
  document.title = `${isAdmin ? 'Operação' : isTV ? 'Sorteio ao vivo' : 'Campeonato'} • RG Racing`;
  document.body.className = isTV ? 'tv-body' : isAdmin ? 'admin-body' : 'public-body';
  applyTheme();
  app.innerHTML = isAdmin ? session.authenticated ? adminLayout() : loginPage() : isTV ? tvPage() : publicLayout();
  for (const [key, top] of scrolls) { const el = document.querySelector(`[data-scroll="${key}"]`); if (el) el.scrollTop = top; }
  netStatus(); updateClocks();
}
function adminLayout() {
  const nav = [['draw','shuffle','Parque fechado'],['pilots','users','Pilotos'],['karts','kart','Frota de karts'],['schedule','clock','Baterias e cronograma'],['results','trophy','Resultados'],['settings','settings','Configurações'],['audit','list','Histórico de operações']];
  const title = nav.find(x => x[0] === view)?.[2] || 'Parque fechado';
  return `<div class="admin-shell"><aside class="sidebar">${brand}<div class="workspace-label">PAINEL DA ORGANIZAÇÃO</div><nav aria-label="Gestão">${nav.map(([id,symbol,label]) => `<button data-view="${id}" class="nav-item ${view===id?'active':''}">${icon(symbol)}<span>${label}</span>${id==='draw'?'<span class="nav-dot"></span>':''}</button>`).join('')}</nav><div class="sidebar-bottom"><a href="/" target="_blank" class="nav-item">${icon(externalIcon())}Portal do evento ${icon('external')}</a><div class="operator"><span class="avatar">OP</span><span><b>${e(session.username)}</b><small>Controle de prova</small></span><button class="icon-btn" data-action="logout" aria-label="Sair">${icon('exit')}</button></div></div></aside>
  <div class="admin-workspace"><header class="admin-header"><div class="breadcrumb">Operação <span>/</span> <strong>${e(title)}</strong></div><div class="header-actions">${themeToggle()}<span data-connection></span><button class="icon-btn" data-action="logout" aria-label="Sair da operação" title="Sair">${icon('exit')}</button><a href="/tv${contextQuery()}" target="_blank" class="btn small">${icon('tv')}Abrir TV ${icon('external')}</a></div></header>
  <main id="main" class="admin-main"><div class="page-heading"><div><div class="eyebrow">RG RACING / CONTROLE DE PROVA</div><h1>${e(title)}</h1><p>${view==='draw'?'Cada piloto, cada kart, no seu tempo.':e(event().name)}</p></div><div class="heading-controls">${selectEvents()}${actionButton('new-event','Novo evento','plus','small')}</div></div>
  ${event().demo ? '<div class="demo-note">AMBIENTE DE DEMONSTRAÇÃO <span>Os pilotos e as baterias abaixo são exemplos. Crie um evento para começar.</span></div>' : ''}
  ${view === 'draw' ? drawAdmin() : view === 'pilots' ? pilotsAdmin() : view === 'karts' ? kartsAdmin() : view === 'schedule' ? scheduleAdmin() : view === 'results' ? resultsAdmin() : view === 'settings' ? settingsAdmin() : auditAdmin()}
  <footer class="admin-footer"><span>RG Racing · Gestão de kart indoor</span><span>Atualização em tempo real · horário de ${e(event().timezone)}</span></footer></main></div></div>`;
}
function externalIcon() { return 'flag'; }
function metrics() {
  const h = heat(), d = h?.draw, assigned = Object.keys(d?.assignments || {}).length;
  return `<div class="metrics">${[
    ['Pilotos na bateria', h?.pilotIds.length || 0, 'users', 'Inscritos confirmados'],
    ['Karts disponíveis', karts().filter(k => k.status==='available').length, 'kart', `${karts().filter(k=>k.status==='maintenance').length} em manutenção`],
    ['Pedidos de troca', d?.requests.filter(r=>r.status==='pending').length || 0, 'shuffle', `${d?.requests.filter(r=>r.status==='fulfilled').length || 0} trocas realizadas`],
    ['Sorteio concluído', `${h?.pilotIds.length ? Math.floor(assigned/h.pilotIds.length*100) : 0}%`, 'flag', `${assigned} de ${h?.pilotIds.length || 0} pilotos sorteados`]
  ].map(([label,value,symbol,sub]) => `<div class="metric"><span>${label}${icon(symbol)}</span><strong>${value}</strong><small>${sub}</small></div>`).join('')}</div>`;
}
function heatPicker() {
  return `<label class="sr-only" for="heat-picker">Bateria</label><select id="heat-picker">${heats().map(h=>`<option value="${h.id}" ${heat()?.id===h.id?'selected':''}>${e(heatLabel(h))}</option>`).join('')}</select>`;
}
function drawAdmin() {
  const h = heat(), d = h?.draw;
  return `${metrics()}<div class="heat-toolbar"><div><span class="eyebrow">BATERIA SELECIONADA</span>${heats().length ? heatPicker() : '<span>Nenhuma bateria cadastrada</span>'}</div><div>${h ? badge(h.status,statusNames[h.status]) : ''}${actionButton('new-heat','Nova bateria','plus','small')}</div></div>
  ${!h ? empty('Prepare a primeira bateria','Cadastre os pilotos e karts e crie uma bateria para começar.','shuffle') : `
  <div class="draw-layout"><section class="draw-panel panel"><div class="panel-heading"><div><span class="eyebrow">PARQUE FECHADO</span><h2>Sorteio de karts</h2></div><span class="live-indicator"><i></i>TRANSMISSÃO AO VIVO</span></div>${drawBoard(h)}<div class="draw-controls">${drawControls(h)}<span class="control-hint">${d?.policy.swapSeconds ?? event().swapSeconds}s para solicitar troca</span></div></section>
  <aside class="panel queue-panel"><div class="panel-heading"><h2>Ordem de sorteio</h2><span class="count">${h.pilotIds.length}</span></div>${queue(h)}</aside></div>
  <div class="two-columns"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">CONTROLE DA ORGANIZAÇÃO</span><h2>Trocas de kart</h2></div>${icon('shuffle')}</div>${requests(h)}<div class="panel-foot">${d?`Kart devolvido ${d.policy.returnSwappedKart?'volta ao sorteio':'fica fora do sorteio'}. Regra fixada ao preparar.`:'A regra de devolução é definida nas configurações.'}</div></section><section class="panel"><div class="panel-heading"><h2>${d?'Karts reserva':'Karts da bateria'}</h2><span class="count">${d ? d.reserveCount ?? d.pool?.length ?? 0 : h.kartNumbers.length}</span></div><div class="kart-strip">${(d ? d.pool || [] : h.kartNumbers).map(n=>`<span class="kart-chip">${n}</span>`).join('') || `<p class="muted">${d?'Consulte ou adicione reservas no controle interno.':'Selecione os karts antes de preparar o sorteio.'}</p>`}</div><div class="panel-foot">${!d ? actionButton('formation','Selecionar pilotos e karts','users','small') : actionButton('add-reserve','Adicionar kart reserva','plus','small mutation', ['on_track','finished'].includes(h.status)?'data-locked="true" disabled':'')}</div></section></div>
  <section class="panel assignments"><div class="panel-heading"><div><span class="eyebrow">LISTAGEM COMPLETA</span><h2>Pilotos e karts atribuídos</h2></div>${actionButton('export-csv','Exportar CSV','list','small')}</div>${assignments(h,true)}</section>`}`;
}
function drawBoard(h) {
  const d = h.draw, current = d?.current, previous = d?.previous;
  const nextId = d && ['drawing','swaps','ready'].includes(d.phase) ? d.order[d.current ? d.cursor+1 : d.cursor] : null;
  const currentPilot = current ? pilot(current.pilotId) : null;
  const label = !d ? 'Aguardando preparação' : d.paused ? 'Sorteio pausado' : d.waitingForKart ? 'Aguardando kart reserva' : phaseNames[d.phase];
  return `<div class="draw-stage"><div class="stage-meta"><span class="stage-status"><i class="${d?.paused?'amber':''}"></i>${label}</span><span>${e(h.category)} · S${h.series} / B${h.round}</span></div><div class="draw-trio">
    <div class="draw-slot last"><span class="eyebrow">ÚLTIMO SORTEADO</span><h3>${previous ? e(pilot(previous.pilotId).name) : 'Aguardando'}</h3><div class="slot-kart">${previous?.kart ?? '—'}</div><small>${previous ? 'KART ATRIBUÍDO' : 'O primeiro piloto vem aí'}</small></div>
    <div class="draw-slot current"><span class="eyebrow">${current?.kind==='swap'?'TROCA · NA VEZ':'AGORA · NA VEZ'}</span><h3>${currentPilot?e(currentPilot.name):d?.phase==='complete'?'Sorteio encerrado':d?.phase==='swap_ready'?'Hora das trocas':d?.waitingForKart?'Sem kart reserva':'Prontos para largar?'}</h3><div class="current-kart">${current?.kart ?? (d?.phase==='complete'?'✓':'—')}</div><div class="timer-footer"><span>${current?.oldKart ? `KART ANTERIOR <b>${current.oldKart}</b>` : current ? 'JANELA PARA TROCA' : d?.phase==='complete'?'CONFIRA A LISTAGEM ABAIXO':'AGUARDANDO CONTROLE DE PROVA'}</span><div class="countdown" data-timer aria-label="Tempo restante para troca"><strong data-seconds>—</strong><small>SEG</small></div></div></div>
    <div class="draw-slot next"><span class="eyebrow">PRÓXIMO A SORTEAR</span><h3>${nextId ? e(pilot(nextId).name) : 'Aguardando'}</h3><div class="slot-kart">${nextId?'?':'—'}</div><small>${nextId?'PREPARE-SE':'Acompanhe o controle de prova'}</small></div>
  </div><div class="stage-progress"><span style="width:${h.pilotIds.length ? Object.keys(d?.assignments||{}).length/h.pilotIds.length*100 : 0}%"></span></div></div>`;
}
function drawControls(h) {
  const d = h.draw;
  if (!d) return `${h.status==='scheduled'?actionButton('mark-parc','Parque fechado','flag','mutation'):''}${actionButton('formation','Configurar bateria','users')}${actionButton('prepare','Embaralhar e preparar','shuffle','primary mutation')}`;
  if (['on_track','finished'].includes(h.status)) return badge(h.status,statusNames[h.status]);
  let out = '';
  if (d.phase === 'ready') out += actionButton('start','Iniciar sorteio','play','primary mutation');
  if (d.current) {
    out += actionButton(d.paused?'resume':'pause', d.paused?'Retomar sorteio':'Pausar sorteio',d.paused?'play':'pause','mutation');
    if (d.phase==='drawing') {
      const requested=d.requests.some(r=>r.pilotId===d.current.pilotId&&r.status==='pending');
      out += actionButton('request-current',requested?'Troca solicitada':'Solicitar troca',requested?'check':'shuffle','primary mutation', d.paused||requested?'data-locked="true" disabled':'');
    }
  }
  if (d.awaitingNext) out += actionButton('next','Sortear próximo','arrow','primary mutation');
  if (d.phase==='swap_ready') out += actionButton('start-swaps','Sortear as trocas','shuffle','primary mutation');
  if (d.waitingForKart) out += actionButton('add-reserve','Adicionar kart reserva','plus','primary mutation');
  if (d.phase==='complete') out += actionButton('on-track','Liberar para a pista','flag','primary mutation');
  return out;
}
function queue(h) {
  const d = h.draw, order = d?.initialOrder || [...h.pilotIds].sort((a,b)=>pilot(a).name.localeCompare(pilot(b).name,'pt-BR'));
  return `<div class="queue-subtitle">${d?'Pilotos embaralhados · karts revelados na vez':'Ordem alfabética · aguardando embaralhamento'}</div><ol class="draw-queue" data-scroll="queue">${order.map((id,i)=>`<li class="${d?.current?.pilotId===id?'is-current':''} ${Object.hasOwn(d?.assignments||{},id)?'is-drawn':''}"><span class="order-number">${String(i+1).padStart(2,'0')}</span><span>${e(pilot(id).name)}<small>${e(pilot(id).state || 'Piloto')}</small></span><b class="queue-kart">${d?.assignments[id] ?? '—'}</b></li>`).join('') || '<li class="muted">Nenhum piloto nesta bateria.</li>'}</ol>`;
}
function requests(h) {
  const rs = h.draw?.requests || [];
  if (!rs.length) return empty('Nenhum pedido de troca','Os pedidos feitos na janela de tempo aparecem aqui.','shuffle');
  return `<ul class="request-list">${rs.map((r,i)=>`<li><span class="order-number">${String(i+1).padStart(2,'0')}</span><div>${person(r.pilotId)}<small>${r.override?'Autorização da gestão':'Solicitado na janela'} · kart ${r.oldKart}</small></div>${badge(r.status==='pending'?'parc':'closed',r.status==='pending'?'Na fila':`Novo kart ${r.newKart}`)}</li>`).join('')}</ul>`;
}
function assignments(h, controls = false) {
  const ids = [...h.pilotIds].sort((a,b)=>pilot(a).name.localeCompare(pilot(b).name,'pt-BR'));
  return `<div class="table-wrap"><table><thead><tr><th>Piloto</th><th>Kart</th><th>Status</th>${controls?'<th class="right">Gestão</th>':''}</tr></thead><tbody>${ids.map(id=>{
    const n = h.draw?.assignments[id], pending = h.draw?.requests.some(r=>r.pilotId===id&&r.status==='pending');
    return `<tr><td><a href="/piloto${contextQuery()}&id=${id}">${person(id)}</a></td><td><span class="table-kart">${n??'—'}</span></td><td>${pending?badge('parc','Troca pendente'):n?badge('closed','Sorteado'):badge('scheduled','Aguardando')}</td>${controls?`<td class="right">${n&&!['on_track','finished'].includes(h.status)?actionButton('manage-swap','Gerenciar troca','shuffle','small',`data-pilot="${id}"`):'—'}</td>`:''}</tr>`;
  }).join('') || '<tr><td colspan="4">Nenhum piloto cadastrado nesta bateria.</td></tr>'}</tbody></table></div>`;
}
function pilotsAdmin() {
  return `<section class="panel"><div class="panel-heading"><div><span class="eyebrow">INSCRIÇÕES</span><h2>${pilots().length} pilotos cadastrados</h2></div>${actionButton('import-pilots','Adicionar pilotos','plus','primary')}</div><p class="panel-description">Cadastre um piloto por linha. Use Nome;UF para incluir o estado. Depois, selecione os inscritos de cada bateria.</p><div class="table-wrap"><table><thead><tr><th>#</th><th>Piloto</th><th>Baterias</th><th></th></tr></thead><tbody>${pilots().map((p,i)=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td>${person(p.id)}</td><td>${heats().filter(h=>h.pilotIds.includes(p.id)).length}</td><td class="right">${actionButton('remove-pilot','Excluir','','small subtle',`data-pilot="${p.id}"`)}</td></tr>`).join('')}</tbody></table></div>${!pilots().length?empty('Seu grid começa aqui','Adicione os primeiros pilotos do evento.','users'):''}</section>`;
}
function kartsAdmin() {
  return `<div class="section-toolbar"><p>Controle a disponibilidade da frota antes de cada sorteio.</p>${actionButton('import-karts','Adicionar karts','plus','primary')}</div><div class="fleet-grid">${karts().map(k=>`<article class="panel fleet-card ${k.status}"><div>${badge(k.status==='available'?'closed':'parc',k.status==='available'?'Disponível':'Manutenção')}${icon('kart')}</div><strong><span>KART</span>${k.number}</strong>${actionButton('kart-status',k.status==='available'?'Enviar à manutenção':'Liberar para sorteio','', 'small mutation',`data-number="${k.number}" data-status="${k.status==='available'?'maintenance':'available'}"`)}</article>`).join('')}</div>${!karts().length?empty('Cadastre sua frota','Os números disponíveis serão usados no sorteio.','kart'):''}<section class="panel info-panel">${icon('trophy')}<div><h3>Ranking de performance dos karts</h3><p>Será calculado após a integração com a cronometragem. Nenhum índice de performance é estimado nesta versão.</p></div></section>`;
}
function delayMs() { const last = heats().filter(h=>h.actualAt).sort((a,b)=>b.actualAt-a.actualAt)[0]; return last ? last.actualAt-Date.parse(last.scheduledAt) : 0; }
function delayNote() { const minutes = Math.round(delayMs()/60000); return minutes ? `${Math.abs(minutes)} min ${minutes>0?'de atraso':'de adiantamento'} · previsão a partir da última largada` : 'Cronograma no horário previsto'; }
function scheduleAdmin() {
  return `<div class="section-toolbar"><span class="schedule-delay">${icon('clock')}${e(delayNote())}</span>${actionButton('new-heat','Nova bateria','plus','primary')}</div><section class="panel">${scheduleTable(true)}</section>`;
}
function scheduleTable(admin = false) {
  return `<div class="table-wrap"><table class="schedule-table"><thead><tr><th>Categoria / bateria</th><th>Agendado</th><th>Previsto / real</th><th>Pilotos</th><th>Status</th><th></th></tr></thead><tbody>${heats().filter(h=>!search || h.pilotIds.some(id=>pilot(id).name.toLowerCase().includes(search.toLowerCase()))).map(h=>`<tr class="${h.status==='on_track'?'highlight-row':''}"><td><b>${e(h.category)}</b><small>Série ${h.series} · Bateria ${h.round}</small></td><td class="time-cell">${time(h.scheduledAt)}</td><td class="time-cell">${time(h.actualAt || Date.parse(h.scheduledAt)+delayMs())}<small>${h.actualAt?'Largada real':'Previsão'}</small></td><td>${h.pilotIds.length}</td><td>${badge(h.status,statusNames[h.status])}</td><td class="right">${admin?actionButton('select-heat','Abrir','','small',`data-heat="${h.id}"`):`<a class="btn small" href="/tv${contextQuery()}&bateria=${h.id}">Ver bateria ${icon('arrow')}</a>`}</td></tr>${!admin?`<tr class="formation-row"><td colspan="6"><details><summary>Ver formação da bateria</summary><div class="formation-names">${[...h.pilotIds].sort((a,b)=>pilot(a).name.localeCompare(pilot(b).name,'pt-BR')).map(id=>`<span>${person(id)}<b>${h.draw?.assignments[id]??'—'}</b></span>`).join('') || 'Formação ainda não publicada.'}</div></details></td></tr>`:''}`).join('') || '<tr><td colspan="6">Nenhuma bateria encontrada.</td></tr>'}</tbody></table></div>`;
}
function resultsAdmin() {
  const h = heat();
  return `<div class="heat-toolbar"><div>${heatPicker()}</div>${h?badge(h.status,statusNames[h.status]):''}</div>${!h?empty('Nenhuma bateria cadastrada'):h.status!=='finished'?`<section class="panel">${empty('Aguardando encerramento da bateria','O resultado fica disponível para lançamento depois que a bateria encerrar na pista.','trophy')}${h.status==='on_track'?`<div class="panel-foot">${actionButton('finish','Encerrar bateria','flag','primary mutation')}</div>`:''}</section>`:`<section class="panel"><div class="panel-heading"><div><span class="eyebrow">LANÇAMENTO MANUAL</span><h2>Resultado · ${e(h.category)}</h2></div><a href="/ranking${contextQuery()}" target="_blank" class="btn small">Ver classificação ${icon('external')}</a></div><p class="panel-description">Preencha posição e pontos para publicar. Ajustes positivos ou negativos somam aos pontos. Linhas sem posição ficam fora do resultado.</p><form id="results-form"><div class="table-wrap"><table><thead><tr><th>Piloto</th><th>Posição</th><th>Pontos</th><th>Ajuste</th><th>Melhor volta (ms)</th><th>Observação</th></tr></thead><tbody>${h.pilotIds.map(id=>{const r=h.results.find(r=>r.pilotId===id)||{};return `<tr data-result-pilot="${id}"><td>${person(id)}</td><td><input aria-label="Posição de ${e(pilot(id).name)}" name="position" type="number" min="1" max="${h.pilotIds.length}" value="${r.position??''}"></td><td><input aria-label="Pontos de ${e(pilot(id).name)}" name="points" type="number" min="0" max="1000" value="${r.points??0}"></td><td><input aria-label="Ajuste de ${e(pilot(id).name)}" name="penalty" type="number" min="-1000" max="1000" value="${r.penalty??0}"></td><td><input aria-label="Melhor volta de ${e(pilot(id).name)}" name="bestLapMs" type="number" min="1" value="${r.bestLapMs??''}"></td><td><input aria-label="Observação de ${e(pilot(id).name)}" name="note" value="${e(r.note||'')}" maxlength="250"></td></tr>`}).join('')}</tbody></table></div><div class="panel-foot"><button class="btn primary mutation" type="submit">${icon('check')}Publicar resultado</button></div></form></section>`}`;
}
function settingsAdmin() {
  const ev = event();
  return `<div class="settings-grid"><section class="panel"><div class="panel-heading"><h2>Evento e regras do sorteio</h2></div><form id="settings-form" class="form-body"><label>Nome do evento<input name="name" value="${e(ev.name)}" required maxlength="120"></label><label>Local<input name="location" value="${e(ev.location)}" maxlength="120"></label><div class="form-row"><label>Data<input name="date" type="date" value="${e(ev.date)}" required></label><label>Fuso horário<select name="timezone">${['America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha'].map(x=>`<option ${ev.timezone===x?'selected':''}>${x}</option>`).join('')}</select></label></div><div class="form-row"><label>Janela para troca (segundos)<input name="swapSeconds" type="number" min="1" max="60" value="${ev.swapSeconds}" required></label><label>Descartes na classificação<input name="discardCount" type="number" min="0" max="10" value="${ev.discardCount}" required></label></div><label class="check-label"><input name="returnSwappedKart" type="checkbox" ${ev.returnSwappedKart?'checked':''}><span>O kart devolvido volta ao sorteio<small>Após atribuir a substituição, o kart antigo pode ser sorteado para outro piloto.</small></span></label><label class="check-label"><input name="autoAdvance" type="checkbox" ${ev.autoAdvance?'checked':''}><span>Avançar automaticamente<small>O próximo piloto é chamado ao fim da contagem.</small></span></label><div class="inline-note">As regras ficam registradas ao preparar cada sorteio. Alterações valem para os próximos sorteios. Desempate da classificação: pontos, vitórias, melhor posição e ordem alfabética.</div><button type="submit" class="btn primary mutation">Salvar configurações</button></form></section>
  <div><section class="panel"><div class="panel-heading"><h2>Links do portal</h2></div><form id="links-form" class="form-body"><p class="muted">Um por linha: título;https://endereco.com.br</p><label>Links públicos<textarea name="links" rows="7" placeholder="Regulamento;https://...&#10;Transmissão;https://...">${e(ev.links.map(l=>`${l.title};${l.url}`).join('\n'))}</textarea></label><button class="btn mutation">Salvar links</button></form></section><section class="panel password-panel"><div class="panel-heading"><h2>Acesso da operação</h2></div><form id="password-form" class="form-body"><label>Senha atual<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>Nova senha<input name="newPassword" type="password" autocomplete="new-password" minlength="12" required></label><button class="btn">Alterar senha</button></form></section><a class="btn export-button" href="/api/admin/export">${icon('list')}Exportar dados e auditoria</a></div></div>`;
}
function auditAdmin() {
  return `<section class="panel"><div class="panel-heading"><h2>Registro de operações</h2>${actionButton('refresh-audit','Atualizar','list','small')}</div><p class="panel-description">Sorteios, trocas, autorizações e alterações ficam registrados com operador, horário e hash encadeado. A exportação inclui o histórico completo.</p><div class="table-wrap"><table><thead><tr><th>Data / hora</th><th>Operador</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>${(S.audit||[]).map(a=>`<tr><td>${e(new Date(a.at).toLocaleString('pt-BR',{timeZone:event().timezone}))}</td><td>${e(a.actor)}</td><td><code>${e(a.action)}</code></td><td><details><summary>Ver registro #${a.id}</summary><pre>${e(a.detail)}</pre></details></td></tr>`).join('') || '<tr><td colspan="4">Use Atualizar para consultar os registros.</td></tr>'}</tbody></table></div></section>`;
}
function loginPage() {
  return `<div class="login-layout"><div class="login-intro">${brand}<div><span class="eyebrow">ORGANIZAÇÃO NO CONTROLE</span><h1>A próxima largada<br>começa aqui<span>.</span></h1><p>Sorteios, parque fechado e informação ao vivo. Toda a operação em um só lugar.</p><div class="racing-lines"><i></i><i></i><i></i><i></i></div></div><small>RG RACING · CONTROLE DE PROVA</small></div><main id="main" class="login-main"><div class="login-tools">${themeToggle()}</div><div class="login-box"><span class="eyebrow">ÁREA DA ORGANIZAÇÃO</span><h2>Acesse o controle de prova</h2><p>Entre para gerenciar o evento e os sorteios.</p><form id="login-form"><label>Usuário<input name="username" autocomplete="username" required value="${session.demo?'operador':''}"></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="btn primary" type="submit">Entrar na operação ${icon('arrow')}</button></form>${session.demo?'<div class="inline-note"><b>Demonstração</b><br>Usuário: operador · Senha: kart-demo-2026</div>':''}<a href="/" class="back-link">← Voltar ao portal público</a></div></main></div>`;
}
function publicLayout() {
  const path = location.pathname.replace(/\/$/,'') || '/';
  const links = [['/','Evento'],['/tv','Sorteio ao vivo'],['/cronograma','Cronograma'],['/ranking','Classificação'],['/piloto','Área do piloto']];
  return `<header class="public-header">${brand}<nav aria-label="Evento">${links.map(([url,label])=>`<a href="${url}${contextQuery()}" class="${path===url?'active':''}">${label}</a>`).join('')}</nav><span data-connection></span><a href="/admin" class="btn small operator-link">Organização ${icon('arrow')}</a></header><main id="main" class="public-main">${event().demo?'<div class="demo-note">DEMONSTRAÇÃO <span>Dados ilustrativos para conhecer o sistema.</span></div>':''}<div class="public-event-select">${selectEvents()}</div>${path==='/cronograma'?publicSchedule():path==='/ranking'?publicRanking():path==='/piloto'?pilotPage():path==='/karts'?kartPerformance():landing()}</main><footer class="public-footer">${brand}<p>RG Racing · Kart indoor<br><small>Informação da organização em tempo real.</small></p><a href="/admin">Acesso da organização ${icon('arrow')}</a></footer>`;
}
function landing() {
  const h = heat();
  const cards = [['/tv','shuffle','Sorteio ao vivo','Veja seu kart e acompanhe as trocas.'],['/cronograma','clock','Cronograma e baterias','Saiba quando você entra na pista.'],['/ranking','trophy','Resultados e classificação','Cada bateria conta. Confira os pontos.'],['/piloto','person','Área do piloto','Seu kart, suas baterias e seus resultados.'],['/karts','kart','Performance dos karts','Acompanhe a frota do campeonato.']];
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><i></i> RG RACING · KART INDOOR</div><h1>O evento acontece.<br>Você acompanha<span>.</span></h1><p>${e(event().name)}</p><div class="hero-meta">${icon('flag')}${date(event().date)} ${event().location?`<span>•</span>${e(event().location)}`:''}</div><a href="/tv${contextQuery()}" class="btn primary">Acompanhar sorteio ${icon('arrow')}</a></div><div class="hero-race"><div class="track-art" aria-hidden="true"><svg viewBox="0 0 500 400" fill="none"><path d="M55 300V155c0-60 70-102 124-80l82 34c50 21 62-46 108-46 63 0 86 70 46 109l-84 82c-28 27-8 52 16 52h55c41 0 43 61 0 61H124c-43 0-69-27-69-67Z" stroke="currentColor" stroke-width="38"/><path d="M55 300V155c0-60 70-102 124-80l82 34c50 21 62-46 108-46 63 0 86 70 46 109l-84 82c-28 27-8 52 16 52h55c41 0 43 61 0 61H124c-43 0-69-27-69-67Z" stroke="var(--accent)" stroke-width="2" stroke-dasharray="8 8"/></svg><span class="track-pin">${icon('flag')}</span></div><div class="hero-live"><span class="eyebrow">ACONTECENDO AGORA</span><strong>${h?e(h.category):'Aguardando o evento'}</strong><span>${h?`Série ${h.series} · Bateria ${h.round}`:'O cronograma será publicado aqui'}</span>${h?badge(h.status,statusNames[h.status]):''}</div></div></section><div class="section-title"><div><span class="eyebrow">CENTRAL DO CAMPEONATO</span><h2>Seu acesso à pista.</h2></div><span data-connection></span></div><div class="portal-grid">${cards.map(([url,symbol,title,desc],i)=>`<a href="${url}${contextQuery()}" class="portal-card ${i===0?'featured':''}"><span class="portal-icon">${icon(symbol)}</span><span class="portal-number">0${i+1}</span><h3>${title}</h3><p>${desc}</p><span class="portal-arrow">${icon('arrow')}</span></a>`).join('')}${event().links.map((link,i)=>`<a href="${e(link.url)}" class="portal-card" target="_blank" rel="noopener noreferrer"><span class="portal-icon">${icon('external')}</span><span class="portal-number">${String(i+6).padStart(2,'0')}</span><h3>${e(link.title)}</h3><p>Informações e links da organização.</p><span class="portal-arrow">${icon('external')}</span></a>`).join('')}</div><section class="how-it-works"><span class="eyebrow">COMO FUNCIONA O SORTEIO</span><div><h2>O mesmo ponto de partida<br>para todo o grid.</h2><p>Os pilotos entram em ordem alfabética. Pilotos e karts são embaralhados separadamente. Cada número revelado abre uma janela de ${event().swapSeconds} segundos para solicitar uma troca à organização. As trocas entram em uma fila para um novo sorteio.</p></div></section>`;
}
function publicSchedule() {
  return `<div class="page-heading"><div><span class="eyebrow">ACOMPANHE O ANDAMENTO</span><h1>Cronograma do evento</h1><p>${e(event().name)}</p></div></div><div class="section-toolbar"><span class="schedule-delay">${icon('clock')}${e(delayNote())}</span><form class="search-form" id="search-form"><label class="sr-only" for="pilot-search">Pesquisar piloto</label><input id="pilot-search" name="search" placeholder="Pesquisar piloto nas baterias" value="${e(search)}"><button class="btn">Buscar</button></form></div><section class="panel">${scheduleTable()}</section>`;
}
function publicRanking() {
  const cats = [...new Set(heats().map(h=>h.category))]; if (!cats.includes(category)) category = cats[0];
  const rows = category ? ranking(S,event().id,category,discard) : [];
  const rankedHeats = heats().filter(h=>h.category===category&&h.results.length);
  return `<div class="page-heading"><div><span class="eyebrow">CADA BATERIA CONTA</span><h1>Resultados e classificação</h1><p>${e(event().name)}</p></div>${badge('closed','Atualização ao vivo')}</div><div class="ranking-filters"><div class="chip-group">${cats.map(c=>`<button class="chip ${c===category?'selected':''}" data-category="${e(c)}">${e(c)}</button>`).join('')}</div><div class="chip-group"><button class="chip ${discard?'selected':''}" data-discard="yes">Com descarte</button><button class="chip ${!discard?'selected':''}" data-discard="no">Sem descarte</button></div></div><section class="panel">${rows.length?`<div class="table-wrap"><table class="ranking-table"><thead><tr><th>Pos.</th><th>Competidor</th>${rankedHeats.map(h=>`<th>S${h.series} / B${h.round}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td><b class="position p${i+1}">${i+1}º</b></td><td><a href="/piloto${contextQuery()}&id=${r.pilot.id}">${person(r.pilot.id)}</a></td>${rankedHeats.map(h=>{const entry=r.entries.find(x=>x.heatId===h.id);return `<td class="${entry?.discarded?'discarded':''}" title="${e(entry?.note||'')}">${entry?`${entry.position}º <small>(${entry.score})</small>`:'—'}</td>`}).join('')}<td class="total">${r.total}</td></tr>`).join('')}</tbody></table></div>`:empty('A corrida pelos pontos ainda vai começar','A classificação aparece assim que a organização publicar o primeiro resultado.','trophy')}</section><p class="ranking-note">Lançamento pela organização. ${discard?`Até ${event().discardCount} pior(es) resultado(s) por piloto são descartados, mantendo ao menos uma bateria.`:'Todos os resultados são somados.'} Desempate por vitórias, melhor posição e ordem alfabética.</p>${rankedHeats.map(h=>`<section class="panel result-card"><div class="panel-heading"><h2>${e(heatLabel(h))}</h2><span>${time(h.actualAt)}</span></div><div class="table-wrap"><table><thead><tr><th>Posição</th><th>Piloto</th><th>Kart</th><th>Pontos</th><th>Advertências / ajustes</th></tr></thead><tbody>${[...h.results].sort((a,b)=>a.position-b.position).map(r=>`<tr><td>${r.position}º</td><td>${person(r.pilotId)}</td><td>${h.draw?.assignments[r.pilotId]??'—'}</td><td>${r.points+r.penalty}</td><td>${r.penalty?`<b>${r.penalty>0?'+':''}${r.penalty}</b> · `:''}${e(r.note)||'—'}</td></tr>`).join('')}</tbody></table></div></section>`).join('')}`;
}
function pilotPage() {
  const p = pilots().find(p=>p.id===pilotId), myHeats = p ? heats().filter(h=>h.pilotIds.includes(p.id)) : [];
  const entries = myHeats.flatMap(h=>h.results.filter(r=>r.pilotId===p.id).map(r=>({...r,heat:h})));
  const laps = entries.map(r=>r.bestLapMs).filter(Boolean);
  return `<div class="page-heading"><div><span class="eyebrow">SEU LUGAR NO GRID</span><h1>Área do piloto</h1><p>Encontre suas baterias, seu kart e seus resultados.</p></div></div><form id="pilot-form" class="pilot-selector panel"><label for="pilot-picker">Selecione seu nome</label><select id="pilot-picker" name="pilotId"><option value="">Escolha um piloto</option>${pilots().map(x=>`<option value="${x.id}" ${p?.id===x.id?'selected':''}>${e(x.name)}</option>`).join('')}</select><button class="btn primary">Ver meu painel ${icon('arrow')}</button></form>${!p?empty('A pista espera por você','Selecione seu nome para acompanhar seu evento.','person'):`<section class="pilot-hero"><span class="avatar">${e(p.name.split(' ').map(n=>n[0]).slice(0,2).join(''))}</span><div><span class="eyebrow">PILOTO · ${e(p.state||'BRASIL')}</span><h2>${e(p.name)}</h2></div><span class="pilot-stat"><strong>${myHeats.length}</strong>BATERIAS</span><span class="pilot-stat"><strong>${entries.filter(r=>r.position<=3).length}</strong>PÓDIOS</span><span class="pilot-stat"><strong>${laps.length?(Math.min(...laps)/1000).toFixed(3)+'s':'—'}</strong>MELHOR VOLTA</span></section><div class="pilot-heat-grid">${myHeats.map(h=>{const r=h.results.find(r=>r.pilotId===p.id);return `<article class="panel"><div class="panel-heading"><h3>${e(h.category)}</h3>${badge(h.status,statusNames[h.status])}</div><div class="form-body"><span>Série ${h.series} · Bateria ${h.round} · ${time(h.scheduledAt)}</span><div class="pilot-kart"><span>${r?'POSIÇÃO FINAL':'SEU KART'}</span><strong>${r?r.position+'º':h.draw?.assignments[p.id]??'—'}</strong></div><p>${r?`${r.points+r.penalty} pontos${r.note?' · '+e(r.note):''}`:h.draw?.assignments[p.id]?'Apresente-se ao parque fechado.':'Aguarde o sorteio do seu kart.'}</p></div></article>`}).join('') || empty('Nenhuma bateria publicada para este piloto')}</div>`}`;
}
function kartPerformance() {
  return `<div class="page-heading"><div><span class="eyebrow">FROTA DO EVENTO</span><h1>Performance dos karts</h1><p>${e(event().name)}</p></div></div><section class="panel">${empty('A cronometragem entra na próxima etapa','O ranking de performance será publicado quando a integração de tempos estiver ativa.','kart')}</section><div class="fleet-grid">${karts().map(k=>`<article class="panel fleet-card"><div>${badge(k.status==='available'?'closed':'parc',k.status==='available'?'Disponível':'Manutenção')}${icon('kart')}</div><strong><span>KART</span>${k.number}</strong><small>Tempos ainda não integrados</small></article>`).join('')}</div>`;
}
function tvPage() {
  const h = heat(), scheduleMode = query.get('modo')==='cronograma';
  return `<div class="tv-shell"><header class="tv-header">${brand}<div class="tv-event"><strong>${e(event().name)}</strong><span>${h?e(heatLabel(h)):e(event().location)}</span></div><div class="tv-clock"><span data-clock></span><span data-connection></span></div></header>${event().demo?'<div class="tv-demo">AMBIENTE DE DEMONSTRAÇÃO · DADOS ILUSTRATIVOS</div>':''}<main id="main" class="tv-main">${scheduleMode?tvSchedule():h?`<div class="tv-section-heading"><span class="eyebrow">SORTEIO DE KARTS</span><div>${badge(h.status,statusNames[h.status])}<span>${Object.keys(h.draw?.assignments||{}).length} / ${h.pilotIds.length} pilotos</span></div></div><div class="tv-draw-grid"><div class="tv-main-stage">${drawBoard(h)}<div class="tv-lower"><section><h2>Pedidos de troca</h2>${requests(h)}</section><section><h2>Listagem de karts</h2><div class="tv-assignment-scroll" data-scroll="assignments">${assignments(h)}</div></section></div></div><aside class="tv-queue"><div class="panel-heading"><h2>Ordem de sorteio</h2><span class="count">${h.pilotIds.length}</span></div>${queue(h)}</aside></div>`:empty('Aguardando a primeira bateria','A organização publicará o sorteio em breve.','flag')}</main><footer class="tv-footer"><div><b>A SEGUIR</b>${heats().filter(x=>x.id!==h?.id&&x.status==='scheduled').slice(0,3).map(x=>`<span>${time(x.scheduledAt)} · ${e(x.category)} · S${x.series}/B${x.round}</span>`).join('')||'<span>Aguarde o cronograma da organização</span>'}</div><div class="tv-buttons"><a href="/tv${contextQuery()}${scheduleMode?'':'&modo=cronograma'}" class="icon-btn" aria-label="${scheduleMode?'Mostrar sorteio':'Mostrar cronograma'}">${icon(scheduleMode?'shuffle':'clock')}</a><button data-action="sound" class="icon-btn ${sound?'enabled':''}" aria-label="${sound?'Desativar som':'Ativar som da contagem'}" title="${sound?'Som ativado':'Ativar som da contagem'}">${icon('sound')}</button><button data-action="fullscreen" class="icon-btn" aria-label="Tela cheia">${icon('expand')}</button><a href="/" class="icon-btn" aria-label="Voltar ao portal">${icon('exit')}</a></div></footer></div>`;
}
function tvSchedule() {
  const list = heats(), active = [['on_track','Na pista'],['drawing','Em sorteio'],['parc','Parque fechado']];
  return `<div class="tv-section-heading"><span class="eyebrow">CRONOGRAMA DO DIA</span><span>${e(delayNote())}</span></div><div class="tv-schedule-columns">${active.map(([status,title])=>{const h=list.find(x=>x.status===status||(status==='parc'&&x.status==='closed'));return `<section class="tv-schedule-column"><span class="eyebrow">${title}</span>${h?`<h2>${e(h.category)}</h2><p>Série ${h.series} · Bateria ${h.round} · ${time(h.scheduledAt)}</p>${assignments(h)}`:empty('Aguardando','O controle de prova atualizará esta coluna.','clock')}</section>`}).join('')}</div>`;
}
function openModal(title, content, kind, submit = 'Salvar') {
  modal.innerHTML = `<form id="modal-form" data-kind="${kind}"><div class="modal-heading"><div><span class="eyebrow">RG RACING · OPERAÇÃO</span><h2>${title}</h2></div><button class="icon-btn" type="button" data-action="close-modal" aria-label="Fechar">✕</button></div><div class="modal-content">${content}</div><div class="modal-footer"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button type="submit" class="btn primary mutation">${submit}${icon('arrow')}</button></div></form>`;
  modal.showModal(); netStatus();
}
function formationModal() {
  const h = heat();
  openModal('Formação da bateria',`<p>Selecione os pilotos e os karts desta bateria. Deixe karts excedentes para as trocas.</p><div class="formation-picker"><fieldset><legend>Pilotos (${pilots().length})</legend><label class="check-label"><input type="checkbox" data-select-all="pilot">Selecionar todos</label><div class="checkbox-scroll">${pilots().map(p=>`<label class="check-label"><input type="checkbox" name="pilot" value="${p.id}" ${h.pilotIds.includes(p.id)?'checked':''}>${e(p.name)}</label>`).join('')}</div></fieldset><fieldset><legend>Karts disponíveis</legend><label class="check-label"><input type="checkbox" data-select-all="kart">Selecionar todos</label><div class="checkbox-scroll">${karts().filter(k=>k.status==='available').map(k=>`<label class="check-label"><input type="checkbox" name="kart" value="${k.number}" ${h.kartNumbers.includes(k.number)?'checked':''}>Kart ${k.number}</label>`).join('')}</div></fieldset></div>`,'formation');
}
const events = {
  'new-event': () => openModal('Novo evento','<label>Nome do evento<input name="name" required maxlength="120" placeholder="Campeonato · Etapa 1"></label><label>Data<input name="date" type="date" required></label><p>O novo evento começa com pilotos, karts e baterias próprios.</p>','new-event','Criar evento'),
  'new-heat': () => openModal('Nova bateria',`<label>Categoria<input name="category" required maxlength="60" placeholder="Ex.: Sênior"></label><div class="form-row"><label>Série<input name="series" type="number" value="1" min="1" max="99" required></label><label>Bateria<input name="round" type="number" value="1" min="1" max="99" required></label></div><label>Horário agendado (no fuso abaixo)<input name="scheduledLocal" type="datetime-local" required></label><label>Fuso do horário<select name="utcOffset"><option value="-03:00">Brasília (UTC−3)</option><option value="-04:00">Manaus (UTC−4)</option><option value="-05:00">Rio Branco (UTC−5)</option><option value="-02:00">Noronha (UTC−2)</option></select></label><label class="check-label"><input name="allPilots" type="checkbox" checked>Inscrever todos os pilotos do evento</label>`,'new-heat','Criar bateria'),
  'formation': formationModal,
  'prepare': () => openModal('Preparar sorteio',`<p>Os <b>${heat().pilotIds.length} pilotos</b> e os <b>${heat().kartNumbers.length} karts</b> serão embaralhados separadamente e a ordem ficará travada para esta bateria.</p><div class="inline-note">Janela: ${event().swapSeconds}s · avanço ${event().autoAdvance?'automático':'manual'} · kart devolvido ${event().returnSwappedKart?'volta':'não volta'} ao sorteio.</div>`,'prepare','Embaralhar e preparar'),
  'mark-parc': () => mutate('heat.status',{status:'parc'},'Bateria no parque fechado.'),
  'start': () => mutate('draw.start',{},'Sorteio iniciado.'),
  'pause': () => mutate('draw.pause',{},'Sorteio pausado.'),
  'resume': () => mutate('draw.resume',{},'Contagem retomada.'),
  'next': () => mutate('draw.next',{},''),
  'request-current': () => mutate('draw.request-swap',{pilotId:heat().draw.current.pilotId},'Pedido de troca entrou na fila.'),
  'start-swaps': () => mutate('draw.start-swaps',{},'Sorteio das trocas iniciado.'),
  'on-track': () => openModal('Liberar bateria para a pista',`<p>O sorteio e as trocas foram encerrados. Liberar <b>${e(heatLabel(heat()))}</b> registra o horário real da largada.</p>`,'on-track','Liberar para a pista'),
  'finish': () => mutate('heat.status',{status:'finished'},'Bateria encerrada. Lance o resultado.'),
  'add-reserve': async () => { await refresh(false); const d=heat().draw; const available=karts().filter(k=>k.status==='available'&&!Object.values(d.assignments).includes(k.number)&&!d.pool.includes(k.number)&&!d.retired.includes(k.number)); openModal('Adicionar kart reserva',`<label>Kart<select name="number" required><option value="">Selecione</option>${available.map(k=>`<option value="${k.number}">${k.number}</option>`).join('')}</select></label><p>Cadastre novos números na Frota de karts antes de incluí-los aqui.</p>`,'add-reserve','Adicionar ao sorteio'); },
  'manage-swap': button => { const id=button.dataset.pilot; openModal('Gerenciar troca',`<input type="hidden" name="pilotId" value="${id}"><p>${person(id)} · Kart <b>${heat().draw.assignments[id]}</b></p><label>Como realizar<select name="mode"><option value="request">Incluir na fila de sorteio das trocas</option><option value="replace">Troca administrativa imediata (kart aleatório)</option></select></label><label>Motivo da autorização<textarea name="reason" required minlength="5" maxlength="500" rows="3" placeholder="Ex.: defeito identificado no kart após a janela"></textarea></label><div class="inline-note">A organização pode autorizar uma troca após o prazo, antes da bateria. O motivo fica no histórico interno.</div>`,'manage-swap','Autorizar troca'); },
  'import-pilots': () => openModal('Adicionar pilotos','<label>Um piloto por linha<textarea name="pilots" rows="10" required placeholder="Ana Silva;GO&#10;Bruno Costa;SP"></textarea></label><p>Nome;UF. A listagem será organizada em ordem alfabética.</p>','import-pilots','Cadastrar pilotos'),
  'import-karts': () => openModal('Adicionar karts','<label>Números dos karts<textarea name="numbers" rows="5" required placeholder="1, 2, 3, 5, 8, 11"></textarea></label><p>Separe por vírgula, espaço ou quebra de linha.</p>','import-karts','Cadastrar karts'),
  'remove-pilot': button => openModal('Excluir piloto',`<input type="hidden" name="pilotId" value="${button.dataset.pilot}"><p>Excluir <b>${e(pilot(button.dataset.pilot).name)}</b> deste evento? Só é possível excluir pilotos sem bateria vinculada.</p>`,'remove-pilot','Excluir'),
  'kart-status': button => mutate('kart.status',{number:Number(button.dataset.number),status:button.dataset.status}),
  'select-heat': async button => { heatId=button.dataset.heat; view='draw'; await mutate('heat.select',{heatId},'Bateria selecionada.'); },
  'close-modal': () => { modal.close(); render(true); },
  'refresh-audit': () => refresh(),
  'logout': async () => { await api('/api/logout',{method:'POST',body:'{}'}); session={...session,authenticated:false}; render(true); },
  'theme': () => {
    adminTheme = adminTheme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(themeKey, adminTheme); } catch {}
    applyTheme();
  },
  'fullscreen': () => (document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>toast('Use a opção de tela cheia do navegador.')),
  'sound': () => { sound=!sound; if(sound){audioContext??=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();} render(true); },
  'export-csv': () => { const h=heat(); const rows=[['Piloto','UF','Kart'],...[...h.pilotIds].sort((a,b)=>pilot(a).name.localeCompare(pilot(b).name,'pt-BR')).map(id=>[pilot(id).name,pilot(id).state,h.draw?.assignments[id]??''])]; const safe=v=>`"${String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`; const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(safe).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rg-racing-karts.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
};
document.addEventListener('click', async ev => {
  const button=ev.target.closest('[data-action],[data-view],[data-category],[data-discard]'); if(!button) return;
  try {
    if(button.dataset.view) { view=button.dataset.view; if(view==='audit'||view==='draw') await refresh(false); render(true); }
    else if(button.dataset.category) { category=button.dataset.category; render(true); }
    else if(button.dataset.discard) { discard=button.dataset.discard==='yes'; render(true); }
    else if(events[button.dataset.action]) await events[button.dataset.action](button);
  } catch(error) { toast(error.message,true); }
});
document.addEventListener('change', async ev => {
  try {
    if(ev.target.id==='event-picker') {
      eventId=ev.target.value; heatId=null;
      if(isAdmin) await mutate('event.select',{eventId},'Evento selecionado.'); else render(true);
    }
    if(ev.target.id==='heat-picker') { heatId=ev.target.value; await mutate('heat.select',{heatId},'Bateria selecionada.'); }
    if(ev.target.dataset.selectAll) modal.querySelectorAll(`input[name="${ev.target.dataset.selectAll}"]`).forEach(x=>x.checked=ev.target.checked);
  } catch(error) { toast(error.message,true); }
});
document.addEventListener('submit', async ev => {
  ev.preventDefault(); const form=ev.target, fd=new FormData(form), data=Object.fromEntries(fd.entries());
  try {
    if(form.id==='login-form') { const value=await api('/api/login',{method:'POST',body:JSON.stringify(data)}); session={...session,authenticated:true,username:value.username}; await refresh(); }
    else if(form.id==='search-form') { search=data.search.trim(); render(true); }
    else if(form.id==='pilot-form') { pilotId=data.pilotId; query.set('id',pilotId); history.replaceState({},'',`${location.pathname}?${query}`); render(true); }
    else if(form.id==='settings-form') await mutate('event.update',{...data,returnSwappedKart:fd.has('returnSwappedKart'),autoAdvance:fd.has('autoAdvance')});
    else if(form.id==='links-form') await mutate('event.update',{links:data.links.split('\n').filter(x=>x.trim()).map(line=>{const sep=line.indexOf(';');if(sep<1)throw new Error('Use título;https://endereco para cada link.');return {title:line.slice(0,sep).trim(),url:line.slice(sep+1).trim()};})});
    else if(form.id==='password-form') { await api('/api/admin/password',{method:'POST',body:JSON.stringify(data)});session.authenticated=false;render(true);toast('Senha alterada. Entre novamente.'); }
    else if(form.id==='results-form') { const results=[...form.querySelectorAll('[data-result-pilot]')].filter(tr=>$('[name="position"]',tr).value).map(tr=>({pilotId:tr.dataset.resultPilot,...Object.fromEntries([...tr.querySelectorAll('input')].map(x=>[x.name,x.value]))}));await mutate('results.save',{heatId:heat().id,results},'Resultado publicado.'); }
    else if(form.id==='modal-form') {
      const kind=form.dataset.kind;
      if(kind==='new-event') { const ok=await mutate('event.create',data,'Evento criado.'); if(ok){eventId=S.activeEventId;heatId=null;render(true);} }
      else if(kind==='new-heat') { const ok=await mutate('heat.create',{...data,scheduledAt:data.scheduledLocal+':00'+data.utcOffset,pilotIds:fd.has('allPilots')?pilots().map(x=>x.id):[]},'Bateria criada. Selecione os karts antes de preparar.');if(ok){heatId=S.activeHeatId;view='draw';render(true);} }
      else if(kind==='formation') await mutate('heat.update',{pilotIds:fd.getAll('pilot'),kartNumbers:fd.getAll('kart').map(Number)},'Formação salva.');
      else if(kind==='prepare') await mutate('draw.prepare',{},'Ordem embaralhada e registrada.');
      else if(kind==='on-track') await mutate('heat.status',{status:'on_track'},'Bateria liberada. Horário de largada registrado.');
      else if(kind==='add-reserve') await mutate('draw.add-kart',{number:Number(data.number)},'Kart adicionado.');
      else if(kind==='manage-swap') await mutate(data.mode==='replace'?'draw.replace':'draw.request-swap',{pilotId:data.pilotId,reason:data.reason},'Troca autorizada e registrada.');
      else if(kind==='import-pilots') await mutate('pilot.add',{pilots:data.pilots.split('\n').filter(x=>x.trim()).map(line=>{const [name,state='']=line.split(';');return {name:name.trim(),state:state.trim()};})},'Pilotos cadastrados.');
      else if(kind==='import-karts') await mutate('kart.add',{numbers:data.numbers.trim().split(/[\s,;]+/).map(Number)},'Karts cadastrados.');
      else if(kind==='remove-pilot') await mutate('pilot.remove',{pilotId:data.pilotId},'Piloto excluído.');
    }
  } catch(error) { toast(error.message,true); }
});
function updateClocks() {
  if(!S) return;
  const d=heat()?.draw, remaining=d?.paused?d.remainingMs:d?.dueAt?Math.max(0,d.dueAt-Date.now()-offset):0;
  const seconds=Math.ceil(remaining/1000), active=!!d?.current;
  document.querySelectorAll('[data-clock]').forEach(el=>el.textContent=time(Date.now()+offset));
  document.querySelectorAll('[data-timer]').forEach(el=>{
    $('[data-seconds]',el).textContent=!online?'!':active?seconds:'—';
    el.style.setProperty('--progress',`${active?remaining/(d.policy.swapSeconds*1000)*100:0}%`);
    el.classList.toggle('urgent',active&&seconds<=2);el.classList.toggle('paused',!!d?.paused);
    el.setAttribute('aria-label',!online?'Conexão perdida':d?.paused?`Pausado: ${seconds} segundos restantes`:`${seconds} segundos para solicitar troca`);
  });
  const key=`${d?.current?.at}-${seconds}`;
  if(sound&&online&&active&&!d.paused&&seconds>0&&key!==lastBeep&&audioContext?.state==='running') {
    lastBeep=key;const osc=audioContext.createOscillator(),gain=audioContext.createGain();
    osc.frequency.value=seconds===1?880:660;gain.gain.setValueAtTime(0.12,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audioContext.currentTime+0.09);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+0.1);
  }
}
addEventListener('offline',()=>{online=false;netStatus();updateClocks();});
addEventListener('online',()=>{stream?.close();connect();});
setInterval(()=>{if(online&&Date.now()-lastMessageAt>22000){online=false;netStatus();}},1000);
setInterval(updateClocks,100);
if(isTV&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  let last=0, direction=new Map();
  function scrollLists(now){if(now-last>50){last=now;document.querySelectorAll('[data-scroll]').forEach(el=>{if(el.scrollHeight<=el.clientHeight)return;const key=el.dataset.scroll;const dir=direction.get(key)||1;el.scrollTop+=dir; if(el.scrollTop>=el.scrollHeight-el.clientHeight)direction.set(key,-1);else if(el.scrollTop<=0)direction.set(key,1);});}requestAnimationFrame(scrollLists);}requestAnimationFrame(scrollLists);
}
async function boot(){try { session=await api('/api/session');await refresh(false);render(true);connect(); }catch(error){app.innerHTML=`<main id="main" class="startup-error">${brand}${empty('Não foi possível conectar',error.message,'clock')}<button class="btn primary" id="retry">Tentar novamente</button></main>`;$('#retry').addEventListener('click',boot);}}
boot();
