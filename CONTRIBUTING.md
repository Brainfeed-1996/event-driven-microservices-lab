# Contributing

## Development

- Node.js 22+
- Docker (for compose smoke tests)

Install dependencies:

```bash
npm install
```

Run quality gates locally:

```bash
npm run lint
npm test
docker compose up -d --build
```

## Pull Requests

- Keep changes scoped and documented.
- Update contracts + tests when events change.
- Ensure CI is green before requesting review.
- Never commit secrets or `.env` files with credentials.
