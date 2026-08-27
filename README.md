# MLTT Matchup

A fully static, accessible head-to-head viewer for historical Major League Table Tennis results. Search two players, compare their records, and filter every verified direct meeting across singles, doubles, and Golden Game rotations.

This is an independent historical viewer and is not affiliated with or endorsed by Major League Table Tennis. Results are sourced from MLTT's public result viewer; MLTT and its marks belong to Major League Table Tennis.

## Local development

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

## Data and validation

The committed `public/data/mltt.json` keeps the site available when the official source is temporarily unreachable.

```bash
npm run fetch:data
npm run validate:data
npm test
npm run build
npm run preview
```

The fetcher uses MLTT's public `web.mltt.com` result endpoints, caches intermediate responses for six hours, validates required fields, normalizes players by official source identity, and writes the dataset atomically. Golden Game opponents are paired only by corresponding official lineup positions. A mismatched or incomplete lineup is skipped and reported instead of inferred.

## Deployment

`.github/workflows/deploy-pages.yml` builds and deploys from `main` with the official GitHub Pages Actions. It also refreshes the dataset every Tuesday and on manual dispatch, commits only changed normalized output, and falls back to the last committed valid dataset if MLTT is unavailable.
