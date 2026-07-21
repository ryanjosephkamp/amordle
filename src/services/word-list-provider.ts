import {
  createCachedWordListProvider,
  createWordList,
  type Difficulty,
  type WordList,
  type WordListProvider,
} from '../domain/words';
import { ManifestService } from './manifest-service';

/**
 * The retained catalog has one expert pool. Casual and Standard use stable,
 * nested quality-preserving slices; accepted guesses always use the complete
 * vocabulary for the selected length.
 */
export function partitionAnswers(
  answers: readonly string[],
): Record<Difficulty, readonly string[]> {
  const casualEnd = Math.max(1, Math.ceil(answers.length * 0.35));
  const standardEnd = Math.max(casualEnd, Math.ceil(answers.length * 0.7));
  return {
    casual: answers.slice(0, casualEnd),
    standard: answers.slice(0, standardEnd),
    expert: answers,
  };
}

export class ManifestWordListProvider implements WordListProvider {
  constructor(private readonly manifest = new ManifestService()) {}

  async load(wordLength: number, signal?: AbortSignal): Promise<WordList> {
    if (signal?.aborted) throw signal.reason;
    const document = await this.manifest.loadLength(wordLength);
    if (signal?.aborted) throw signal.reason;
    const answers = document.answers.map(({ word }) => word);
    return createWordList({
      revision: document.metadata.version,
      wordLength,
      answers: partitionAnswers(answers),
      validGuesses: document.validGuesses,
    });
  }
}

export const wordListProvider = createCachedWordListProvider(new ManifestWordListProvider());
