# Northern Region Football fixtures

A tiny SSR site that fetches fixtures from the Northern Region Football API and renders a plain HTML page listing every upcoming Purple 10M game from today through the end of the season. Lives at [purple.rpaul.net](https://purple.rpaul.net).

The whole thing is a single AWS Lambda behind CloudFront — no client-side JS, no database, no framework. Source is in `backend/`; see `backend/README.md` for local dev and deploy details, and `PROGRESS.md` for the AWS deploy state.
