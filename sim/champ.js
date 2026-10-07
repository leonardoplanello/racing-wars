// Campeonato: uma sequencia de pistas de corrida com pontos acumulados. Puro (sem DOM): roda no host e nos testes.

export class Championship {
  /**
   * trackIds: ids das pistas na ordem da playlist; playerIds: ids dos pilotos.
   */
  constructor(trackIds, playerIds) {
    this.tracks = trackIds.slice();
    this.index = 0; // pista atual
    this.totals = new Map(playerIds.map((id) => [id, 0]));
    this.wins = new Map(playerIds.map((id) => [id, 0]));
    this.history = []; // [{ track, results }]
  }

  get trackId() { return this.tracks[this.index]; }
  get nextTrackId() { return this.tracks[this.index + 1] ?? null; }
  get isLast() { return this.index >= this.tracks.length - 1; }
  get round() { return this.index + 1; }

  /** Registra o resultado da pista atual (`results` de Game.endRace: [{id, place, points}]) e devolve a classificacao parcial. */
  addRace(results) {
    this.history.push({ track: this.trackId, results });
    for (const r of results) {
      this.totals.set(r.id, (this.totals.get(r.id) ?? 0) + r.points);
      if (r.place === 1) this.wins.set(r.id, (this.wins.get(r.id) ?? 0) + 1);
    }
    return this.standings();
  }

  /** Avanca para a proxima pista; devolve false se era a ultima. */
  advance() {
    if (this.isLast) return false;
    this.index++;
    return true;
  }

  /**
   * Classificacao: mais pontos; empate -> mais vitorias -> melhor colocacao na ultima pista -> id.
   * Devolve [{ id, points, wins, place }].
   */
  standings() {
    const last = new Map((this.history[this.history.length - 1]?.results ?? []).map((r) => [r.id, r.place]));
    const rows = [...this.totals.keys()].map((id) => ({ id, points: this.totals.get(id), wins: this.wins.get(id) ?? 0, last: last.get(id) ?? 99 }));
    rows.sort((a, b) => (b.points - a.points) || (b.wins - a.wins) || (a.last - b.last) || (a.id - b.id));
    return rows.map((r, i) => ({ id: r.id, points: r.points, wins: r.wins, place: i + 1 }));
  }
}

/**
 * Playlist a partir da pista escolhida: ela e as seguintes da lista de jogaveis (voltando ao comeco), no maximo `count`.
 * list: ids em ordem de menu.
 */
export function playlistFrom(list, startId, count) {
  const i = Math.max(0, list.indexOf(startId));
  const n = Math.min(count, list.length);
  return Array.from({ length: n }, (_, k) => list[(i + k) % list.length]);
}
