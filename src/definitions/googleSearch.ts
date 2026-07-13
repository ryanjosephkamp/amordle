function normalizeSearchWord(word: string): string {
  return word.trim().toLocaleLowerCase('en-US')
}

export function getGoogleDefinitionSearchLabel(word: string): string {
  return `Search Google for ‘${normalizeSearchWord(word).toLocaleUpperCase('en-US')}’`
}

export function getGoogleDefinitionSearchUrl(word: string): string {
  const query = new URLSearchParams({ q: `define ${normalizeSearchWord(word)}` })
  return `https://www.google.com/search?${query.toString()}`
}
