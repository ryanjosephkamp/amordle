# English OpenList Awordle Artifacts

Generated on `2026-05-28T01:39:10.899912+00:00` for release `2026-05-28`.

This folder contains primary JSON artifacts for lowercase ASCII words from 2 through 35 letters, derived from English OpenList.

## Primary files

`words_length_{N}.json` files are the primary Awordle artifacts. Each file includes `metadata.curation`, curated `answers`, and complete `validGuesses` word arrays. `answers` are generated with the `stratified_quality_score_v1` method; `validGuesses` remains the full per-length list.

## Transitional compatibility files

`brrrdle_words.txt` and `brrrdle_words.json` are length-5 compatibility outputs kept for one transition period and will be removed in a future major update.

These generated files are published to Hugging Face dataset paths, not committed as repository `latest/` or `data/brrrdle/` folders.
