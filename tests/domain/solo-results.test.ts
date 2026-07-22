import { describe, expect, it } from 'vitest';

import { createOgSession, revealOgAnswer, submitOgGuess } from '../../src/domain/game';
import { advanceGoSession, createGoSession, submitGoGuess } from '../../src/domain/go';
import {
  buildSoloDefinitionResults,
  buildSoloShareText,
  googleDefinitionFallbackUrl,
  soloResultWords,
} from '../../src/domain/solo-results';

const at = '2026-07-22T12:00:00.000Z';
const answers = ['apple', 'baker', 'cider', 'delta', 'ember'];

function completedGo() {
  let session = createGoSession({ id: 'private-session-id', answers, scope: 'daily', now: at });
  const valid = new Set(answers);
  for (let index = 0; index < answers.length; index += 1) {
    const submitted = submitGoGuess(session, answers[index] ?? '', valid, at);
    if (!submitted.ok) throw new Error('GO result fixture failed.');
    session = submitted.session;
    if (session.pendingAdvance) session = advanceGoSession(session, at);
  }
  return session;
}

describe('Solo result definitions', () => {
  it('returns no answer-bearing result before terminal access is authorized', () => {
    const playing = createOgSession({ id: 'active', answer: 'apple', scope: 'daily', now: at });
    expect(
      buildSoloDefinitionResults({
        session: playing,
        definitions: { apple: [{ text: 'A fruit.' }] },
        answerAccessAuthorized: true,
      }),
    ).toEqual([]);
    const revealed = revealOgAnswer(playing, true, at);
    expect(
      buildSoloDefinitionResults({
        session: revealed,
        definitions: { apple: [{ text: 'A fruit.' }] },
        answerAccessAuthorized: false,
      }),
    ).toEqual([]);
  });

  it('uses curated metadata and an explicit Google fallback once per GO answer', () => {
    const session = completedGo();
    const results = buildSoloDefinitionResults({
      session,
      definitions: {
        apple: [{ partOfSpeech: 'noun', text: 'A fruit.' }],
        ember: [{ text: 'A glowing coal.' }],
      },
      answerAccessAuthorized: true,
    });
    expect(soloResultWords(session)).toEqual(answers);
    expect(results).toHaveLength(5);
    expect(results.filter((result) => result.word === 'ember')).toHaveLength(1);
    expect(results[0]).toEqual({
      word: 'apple',
      source: 'curated',
      definitions: [{ partOfSpeech: 'noun', text: 'A fruit.' }],
    });
    expect(results[1]).toMatchObject({
      word: 'baker',
      source: 'google-fallback',
      fallbackUrl: googleDefinitionFallbackUrl('baker'),
    });
    expect(results[1]?.fallbackUrl).toBe('https://www.google.com/search?q=define%20baker');
  });
});

describe('privacy-safe Solo sharing', () => {
  it('withholds non-final results and omits answers and private session ids', () => {
    const session = completedGo();
    expect(
      buildSoloShareText({ session, dateKey: '2026-07-22', finalized: false }),
    ).toBeUndefined();
    const shared = buildSoloShareText({ session, dateKey: '2026-07-22', finalized: true });
    expect(shared).toContain('Amordle GO · Daily 2026-07-22');
    expect(shared).toContain('Won · 5/5 solved · 5 accepted guesses');
    expect(shared?.match(/Puzzle \d\/5/g)).toHaveLength(5);
    expect(shared?.match(/🟩🟩🟩🟩🟩/g)).toHaveLength(5);
    expect(shared).not.toContain('private-session-id');
    for (const answer of answers) expect(shared?.toLowerCase()).not.toContain(answer);
  });

  it('accurately labels a finalized OG loss without revealing the answer in share text', () => {
    const initial = createOgSession({
      id: 'og-private',
      answer: 'apple',
      scope: 'practice',
      maxAttempts: 1,
      now: at,
    });
    const submitted = submitOgGuess(initial, 'baker', new Set(['apple', 'baker']), { now: at });
    if (!submitted.ok) throw new Error('OG loss fixture failed.');
    const shared = buildSoloShareText({ session: submitted.session, finalized: true });
    expect(shared).toContain('Amordle OG · Practice');
    expect(shared).toContain('Lost · 0/1 solved · 1 accepted guess');
    expect(shared?.toLowerCase()).not.toContain('apple');
  });
});
