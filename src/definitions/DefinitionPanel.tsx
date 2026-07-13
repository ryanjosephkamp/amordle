import { useEffect, useState } from 'react'
import { Button, Panel } from '../ui'
import { lookupDefinitions } from './definitionService'
import { getGoogleDefinitionSearchLabel, getGoogleDefinitionSearchUrl } from './googleSearch'
import type { DefinitionLookupRequest, DefinitionLookupResult } from './types'

interface DefinitionPanelProps extends DefinitionLookupRequest {
  readonly enabled: boolean
}

export function DefinitionPanel({ enabled, mode, scope, word, wordLength }: DefinitionPanelProps) {
  const [lookup, setLookup] = useState<{ readonly key: string; readonly result: DefinitionLookupResult } | undefined>()
  const normalizedWord = word.trim().toLocaleLowerCase('en-US')
  const lookupKey = `${mode}:${scope}:${wordLength}:${normalizedWord}`
  const result = lookup?.key === lookupKey ? lookup.result : undefined

  useEffect(() => {
    if (!enabled || !normalizedWord) {
      return
    }

    let active = true
    void lookupDefinitions({ mode, scope, word: normalizedWord, wordLength }).then((lookupResult) => {
      if (active) {
        setLookup({ key: lookupKey, result: lookupResult })
      }
    })

    return () => {
      active = false
    }
  }, [enabled, lookupKey, mode, normalizedWord, scope, wordLength])

  if (!enabled || !normalizedWord) {
    return null
  }

  const searchUrl = getGoogleDefinitionSearchUrl(normalizedWord)

  return (
    <Panel className="space-y-3" tone="muted">
      <div className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">Definitions</p>
        <h3 className="text-xl font-bold text-white">{normalizedWord.toLocaleUpperCase('en-US')}</h3>
      </div>

      {!result ? <p className="text-sm leading-6 text-slate-300">Looking up definitions…</p> : null}

      {result?.ok ? (
        <div className="space-y-2 text-sm leading-6 text-slate-200">
          <p className="font-semibold text-cyan-100">Source: {result.source}</p>
          <ul className="space-y-2">
            {result.definitions.slice(0, 3).map((entry, index) => (
              <li className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3" key={`${entry.definition}-${index}`}>
                {entry.partOfSpeech ? <p className="font-semibold text-cyan-100">{entry.partOfSpeech}</p> : null}
                <p>{entry.definition}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result && !result.ok ? (
        <p className="text-sm leading-6 text-slate-300">
          No definition source returned a usable result. Use the Google search button to look up this word externally.
        </p>
      ) : null}

      <a href={searchUrl} rel="noopener noreferrer" target="_blank">
        <Button variant="secondary">{getGoogleDefinitionSearchLabel(normalizedWord)}</Button>
      </a>
    </Panel>
  )
}
