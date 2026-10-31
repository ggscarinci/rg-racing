export function ranking(state, eventId, category, withDiscard = true) {
  const event = state.events.find(e => e.id === eventId);
  const heats = state.heats.filter(h => h.eventId === eventId && h.category === category && h.results.length);
  const rows = state.pilots.filter(p => p.eventId === eventId).map(pilot => {
    const entries = heats.flatMap(h => h.results.filter(r => r.pilotId === pilot.id).map(r => ({ ...r, heatId: h.id, series: h.series, round: h.round, score: r.points + r.penalty })));
    const discard = withDiscard ? Math.min(event.discardCount, Math.max(0, entries.length - 1)) : 0;
    const discarded = [...entries].sort((a,b) => a.score-b.score).slice(0, discard).map(e => e.heatId);
    const counted = entries.filter(e => !discarded.includes(e.heatId));
    return { pilot, entries: entries.map(e => ({ ...e, discarded: discarded.includes(e.heatId) })),
      total: counted.reduce((s,e) => s+e.score, 0), wins: counted.filter(e => e.position === 1).length,
      best: Math.min(...counted.map(e => e.position)) };
  }).filter(r => r.entries.length);
  return rows.sort((a,b) => b.total-a.total || b.wins-a.wins || a.best-b.best || a.pilot.name.localeCompare(b.pilot.name, 'pt-BR'));
}
