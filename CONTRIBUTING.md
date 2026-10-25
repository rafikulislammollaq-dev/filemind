# Contributing

1. Fork and clone.
2. `npm ci`
3. `npm run build`
4. `npm test` (must pass)
5. Make changes; add tests.
6. Run `npm run deps:check` before committing.
7. Open a PR.

## Code style
- TypeScript strict mode.
- Validate external inputs.
- No stdout logging (use stderr logger).
- Prefer deterministic tools over speculation.
- Never claim recovery success without validation.

## Adding a format handler
Implement identify/inspect/extract/analyze_integrity/recover/validate in `src/handlers/` and register in the handler registry. Declare dependencies and capabilities.
