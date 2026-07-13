export interface PayToContinueInput {
  readonly completionPercentage: number
  readonly continuationCount: number
  readonly wordLength: number
}

export function calculatePayToContinueCost(input: PayToContinueInput): number {
  const wordLength = Math.max(2, Math.floor(input.wordLength))
  const completionPercentage = Math.min(100, Math.max(0, input.completionPercentage))
  const continuationMultiplier = Math.max(1, Math.floor(input.continuationCount) + 1)
  const lengthCost = Math.ceil(wordLength / 2)
  const progressDiscount = Math.floor((completionPercentage / 100) * lengthCost)
  return Math.max(1, (lengthCost - progressDiscount + 3) * continuationMultiplier)
}
