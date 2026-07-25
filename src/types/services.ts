import type { Json } from './database';

export type ServiceFailureCode =
  | 'configuration'
  | 'authentication'
  | 'authorization'
  | 'conflict'
  | 'network'
  | 'validation'
  | 'persistence'
  | 'unknown';

export type ServiceFailure = {
  code: ServiceFailureCode;
  message: string;
  retryable: boolean;
};

export type EconomySnapshot = {
  coins: number;
  revealOneLetter: number;
  removeIncorrectLetters: number;
  revision: number;
};

export type EconomyMutation = EconomySnapshot & {
  applied: boolean;
  operationId: string;
};

export type PublicProfileProjection = {
  publicProfileId: string;
  displayName: string | null;
  accentColor: 'ice' | 'aurora' | 'cyan' | 'violet' | 'rose' | 'amber';
  flairKey: 'none';
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnedPublicProfileProjection = {
  publicProfileId: string;
  visibility: 'private' | 'public';
  displayName: string | null;
  accentColor: PublicProfileProjection['accentColor'];
  flairKey: PublicProfileProjection['flairKey'];
  avatarUrl: string | null;
  bio: string | null;
  moderationStatus: 'active' | 'hidden' | 'suspended';
  createdAt: string;
  updatedAt: string;
};

export type PublicLeaderboardBucket =
  'multiplayer:og' | 'multiplayer:go' | 'multiplayer:og:daily:v1' | 'multiplayer:go:daily:v1';

export type PublicLeaderboardKey = 'ranked-practice-v1' | 'ranked-daily-v1';

/**
 * The snake-case names intentionally mirror the sanctioned RPC projection.
 * Keeping the wire shape explicit prevents callers from receiving a broad
 * database row with account-owned fields attached.
 */
export type PublicLeaderboardProjection = {
  leaderboard_key: PublicLeaderboardKey;
  rank: number;
  bucket: PublicLeaderboardBucket;
  public_profile_id: string;
  display_name: string;
  accent_color: PublicProfileProjection['accentColor'];
  flair_key: PublicProfileProjection['flairKey'];
  avatar_url: string | null;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  provisional: boolean;
  latest_rating_delta: number;
  latest_rating_movement_at: string | null;
  peak_rating: number;
  profile_updated_at: string;
  leaderboard_updated_at: string;
};

export type PublicSiteStatsProjection = {
  stats_key: 'site-stats-v1';
  generated_at: string;
  public_profiles_active: number;
  ranked_practice_public_players: number;
  ranked_practice_public_player_results: number;
  ranked_practice_public_og_players: number;
  ranked_practice_public_go_players: number;
  leaderboard_updated_at: string | null;
  public_profiles_updated_at: string | null;
};

export type WordAnswerRecord = {
  word: string;
  [key: string]: Json;
};

export type WordListDocument = {
  metadata: {
    length: number;
    source: string;
    version: string;
    generatedAt: string;
    curation?: Json;
  };
  answers: WordAnswerRecord[];
  validGuesses: string[];
};

export type WordListManifestLength = {
  length: number;
  url: string;
  answers: number;
  validGuesses: number;
  status: 'served';
};

export type WordListManifest = {
  revision: string;
  generatedAt: string;
  fetchedAt: string;
  source: {
    datasetId: 'ryanjosephkamp/english-openlist';
    pathPrefix?: 'latest/brrrdle';
    bundledFrom?: string;
  };
  entries: WordListManifestLength[];
};

export type PublicManifestResponse = {
  manifest: WordListManifest | null;
  note?: string;
};

export type CombatProjection = {
  id: string;
  status: string;
  updatedAt: string;
  projection: Json;
};
