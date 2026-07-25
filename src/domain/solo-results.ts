import type { OgSession, ScoredGuess } from './game';
import type { GoSession } from './go';
import { normalizeWord, type WordDefinition } from './words';

export type SoloResultSession = OgSession | GoSession;

export interface SoloDefinitionResult {
  readonly word: string;
  readonly source: 'curated' | 'google-fallback';
  readonly definitions: readonly WordDefinition[];
  readonly fallbackUrl?: string | undefined;
}

function terminalPuzzles(session: SoloResultSession): readonly OgSession[] {
  if (session.status === 'playing') return [];
  if (session.mode === 'og') return [session];
  const terminalCount =
    session.status === 'won' ? session.puzzles.length : session.currentPuzzleIndex + 1;
  return session.puzzles.slice(0, terminalCount);
}

export function soloResultWords(session: SoloResultSession): readonly string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const puzzle of terminalPuzzles(session)) {
    const word = normalizeWord(puzzle.answer);
    if (!seen.has(word)) {
      seen.add(word);
      words.push(word);
    }
  }
  return words;
}

export function googleDefinitionFallbackUrl(word: string): string {
  const normalized = normalizeWord(word);
  if (!/^[a-z]+$/.test(normalized)) throw new RangeError('A valid word is required.');
  return `https://www.google.com/search?q=${encodeURIComponent(`define ${normalized}`)}`;
}

export function buildSoloDefinitionResults(input: {
  readonly session: SoloResultSession;
  readonly definitions?: Readonly<Record<string, readonly WordDefinition[]>> | undefined;
  readonly answerAccessAuthorized: boolean;
}): readonly SoloDefinitionResult[] {
  if (!input.answerAccessAuthorized || input.session.status === 'playing') return [];
  return soloResultWords(input.session).map((word) => {
    const definitions = input.definitions?.[word] ?? [];
    return definitions.length > 0
      ? { word, source: 'curated' as const, definitions }
      : {
          word,
          source: 'google-fallback' as const,
          definitions: [],
          fallbackUrl: googleDefinitionFallbackUrl(word),
        };
  });
}

const SHARE_TILES = {
  absent: '⬛',
  present: '🟨',
  correct: '🟩',
} as const;

function shareRow(guess: ScoredGuess): string {
  return guess.tiles.map((tile) => SHARE_TILES[tile.state]).join('');
}

export function buildSoloShareText(input: {
  readonly session: SoloResultSession;
  readonly dateKey?: string | undefined;
  readonly finalized: boolean;
}): string | undefined {
  const { session } = input;
  if (!input.finalized || session.status === 'playing') return undefined;
  const puzzles = terminalPuzzles(session);
  const completed = puzzles.filter((puzzle) => puzzle.status === 'won').length;
  const acceptedGuesses = puzzles.reduce((total, puzzle) => total + puzzle.guesses.length, 0);
  const scope =
    session.scope === 'daily' ? `Daily${input.dateKey ? ` ${input.dateKey}` : ''}` : 'Practice';
  const outcome = session.status === 'won' ? 'Won' : 'Lost';
  const lines = [
    `Amordle ${session.mode.toUpperCase()} · ${scope}`,
    `${outcome} · ${completed}/${session.mode === 'go' ? session.puzzles.length : 1} solved · ${acceptedGuesses} accepted ${acceptedGuesses === 1 ? 'guess' : 'guesses'}`,
  ];
  for (let index = 0; index < puzzles.length; index += 1) {
    const puzzle = puzzles[index];
    if (!puzzle) continue;
    if (session.mode === 'go') lines.push(`Puzzle ${index + 1}/${session.puzzles.length}`);
    lines.push(...puzzle.guesses.map(shareRow));
  }
  return lines.join('\n');
}
