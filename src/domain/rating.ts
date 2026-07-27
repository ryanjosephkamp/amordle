export const INITIAL_RATING = 1200;
export const PROVISIONAL_GAMES = 10;
export const PROVISIONAL_K = 40;
export const STANDARD_K = 24;

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function ratingDelta(input: {
  rating: number;
  opponentRating: number;
  score: 0 | 0.5 | 1;
  gamesPlayed: number;
}): number {
  const k = input.gamesPlayed < PROVISIONAL_GAMES ? PROVISIONAL_K : STANDARD_K;
  return Math.round(k * (input.score - expectedScore(input.rating, input.opponentRating)));
}
