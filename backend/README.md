# Purple 10M Fixtures (SSR Lambda)

A single AWS Lambda that fetches fixtures from the NRF API and renders an HTML page. Always shows the full season (today through 31 Dec).

## Endpoint

`GET /` → `text/html` page listing every Purple 10M fixture from today through end of year.

## Local dev

```sh
pnpm install
pnpm dev             # http://localhost:3000
```

`tsx watch` reloads on save. Open the URL in a browser to see the rendered page.

## Build & deploy

```sh
pnpm package        # produces lambda.zip (single handler.js, no runtime deps)
```

- **Runtime:** Node.js 20.x or later (uses built-in `fetch` and `Intl`)
- **Handler:** `handler.handler`
- **Trigger:** API Gateway HTTP API or a Lambda Function URL

Quickest path — Function URL:

```sh
aws lambda create-function \
  --function-name purple-10m \
  --runtime nodejs20.x \
  --role <execution-role-arn> \
  --handler handler.handler \
  --zip-file fileb://lambda.zip

aws lambda create-function-url-config \
  --function-name purple-10m \
  --auth-type NONE
```

Open the returned URL in a browser.

## Notes

- Comp/Grade/Org IDs and the team name are hardcoded in `handler.ts`.
- Times in the API payload are NZ wall-clock with no timezone suffix; the handler treats them as such and renders directly without conversion.
- Today's date is computed in `Pacific/Auckland` so it's correct regardless of which AWS region the Lambda runs in.
- Response is cached for 5 minutes (`Cache-Control: max-age=300`).
