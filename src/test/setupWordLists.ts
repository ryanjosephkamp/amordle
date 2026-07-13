import { prepareAllBundledWordLists } from '../data/loadWordList.js'

const results = await prepareAllBundledWordLists()
const failure = results.find((result) => !result.ok)

if (failure && !failure.ok) {
  throw new Error(`Test word-list preparation failed: ${failure.reason}`)
}
