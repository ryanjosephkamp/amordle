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
  displayName: string;
  accentColor: string | null;
  flairKey: string | null;
  avatarUrl: string | null;
  bio: string | null;
  updatedAt: string;
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
