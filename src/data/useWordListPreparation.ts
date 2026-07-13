import { useCallback, useEffect, useReducer, useState } from 'react'
import type { PlayScope } from '../game/types.js'
import { loadBundledWordList, prepareBundledWordList } from './loadWordList.js'

interface PreparationState {
  readonly key: string
  readonly message?: string
  readonly status: 'idle' | 'loading' | 'error'
}

export interface WordListPreparationState {
  readonly error?: string
  readonly isReady: boolean
  readonly retry: () => void
}

export function useWordListPreparation(scope: PlayScope, length: number): WordListPreparationState {
  const key = `${scope}:${length}`
  const [attempt, retryAttempt] = useReducer((value: number) => value + 1, 0)
  const [state, setState] = useState<PreparationState>({ key, status: 'idle' })
  const retry = useCallback(() => {
    setState({ key, status: 'idle' })
    retryAttempt()
  }, [key])
  const current = loadBundledWordList(scope, length)

  useEffect(() => {
    if (loadBundledWordList(scope, length).ok) {
      return
    }

    let active = true
    void prepareBundledWordList(scope, length).then((result) => {
      if (!active) return
      setState(result.ok
        ? { key, status: 'idle' }
        : { key, message: result.message, status: 'error' })
    })
    return () => {
      active = false
    }
  }, [attempt, key, length, scope])

  if (current.ok) {
    return { isReady: true, retry }
  }

  const currentState = state.key === key ? state : { key, status: 'loading' as const }
  return {
    error: currentState.status === 'error' ? currentState.message : undefined,
    isReady: false,
    retry,
  }
}

export function useWordListSetPreparation(lengths: readonly number[]): WordListPreparationState {
  const key = [...new Set(lengths)].sort((a, b) => a - b).join(',')
  const [attempt, retryAttempt] = useReducer((value: number) => value + 1, 0)
  const [state, setState] = useState<PreparationState>({ key, status: 'idle' })
  const retry = useCallback(() => {
    setState({ key, status: 'idle' })
    retryAttempt()
  }, [key])
  const requestedLengths = key ? key.split(',').map(Number) : []
  const isReady = requestedLengths.every((length) => loadBundledWordList('practice', length).ok)

  useEffect(() => {
    const activeLengths = key ? key.split(',').map(Number) : []
    if (activeLengths.every((length) => loadBundledWordList('practice', length).ok)) {
      return
    }

    let active = true
    void Promise.all(activeLengths.map((length) => prepareBundledWordList('practice', length))).then((results) => {
      if (!active) return
      const failure = results.find((result) => !result.ok)
      setState(failure && !failure.ok
        ? { key, message: failure.message, status: 'error' }
        : { key, status: 'idle' })
    })
    return () => {
      active = false
    }
  }, [attempt, key])

  if (isReady) {
    return { isReady: true, retry }
  }
  const currentState = state.key === key ? state : { key, status: 'loading' as const }
  return {
    error: currentState.status === 'error' ? currentState.message : undefined,
    isReady: false,
    retry,
  }
}
