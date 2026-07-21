import type { ReactNode } from 'react'

interface SoloResultHandoffProps {
  readonly attemptsUsed: number
  readonly children: ReactNode
  readonly evidence?: ReactNode
  readonly mode: 'go' | 'og'
  readonly puzzleCount?: number
  readonly scope: 'daily' | 'practice'
  readonly solvedPuzzleCount?: number
  readonly status: 'lost' | 'won'
  readonly wordLength: number
}

export function SoloResultHandoff({
  attemptsUsed,
  children,
  evidence,
  mode,
  puzzleCount,
  scope,
  solvedPuzzleCount,
  status,
  wordLength,
}: SoloResultHandoffProps) {
  const isGo = mode === 'go'
  const verdict = status === 'won'
    ? isGo ? 'CHAIN COMPLETE' : 'PUZZLE SOLVED'
    : isGo ? 'CHAIN ENDED' : 'PUZZLE ENDED'

  return (
    <section
      aria-label={`${mode.toLocaleUpperCase('en-US')} result`}
      className="brrrdle-solo-result-handoff"
      data-result-status={status}
    >
      <p className="brrrdle-solo-result-eyebrow">
        {scope.toLocaleUpperCase('en-US')} · {mode.toLocaleUpperCase('en-US')} · {wordLength}L
      </p>
      <h3>{verdict}</h3>
      <div className="brrrdle-solo-result-facts">
        {isGo ? (
          <>
            <p>{solvedPuzzleCount ?? 0} of {puzzleCount ?? 0} puzzles solved</p>
            <p>{attemptsUsed} total guesses</p>
          </>
        ) : (
          <p>{status === 'won' ? `Solved in ${attemptsUsed} guesses` : `Ended after ${attemptsUsed} guesses`}</p>
        )}
      </div>
      {evidence ? <div className="brrrdle-solo-result-evidence">{evidence}</div> : null}
      <div className="brrrdle-solo-result-actions">{children}</div>
    </section>
  )
}
