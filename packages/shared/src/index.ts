// Public contracts only. Do not put server secrets or private hands here.
export type GameId = 'holdem' | 'seotda';

export interface HealthResponse {
  status: 'ok';
  service: 'boardgame-server';
}
