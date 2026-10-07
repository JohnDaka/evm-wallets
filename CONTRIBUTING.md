# Contributing

## Development

```sh
pnpm install
pnpm typecheck       # the sources, the specs and their helpers
pnpm lint            # ESLint and Prettier; `pnpm format` fixes what it can
pnpm test            # node:test, straight from TypeScript (Node 24)
pnpm test:coverage   # the same, failing below 100% of lines, branches or functions
pnpm build           # dist/: CommonJS and type declarations
```

- Specs sit next to the sources (`*.spec.ts`) and run on fakes from `src/testing`, which is neither built nor published.
- `window.ethereum` is read once, when the package loads, so the detection specs load it on each page in a Node process of its own (`src/testing/pages.ts`). The coverage report counts those processes too.
- No magic values: a text is compared through a named constant (an `as const` object and its type), and every number is a named, documented constant. `pnpm lint` enforces both in the sources; the README's examples follow the same rule.
- CI runs `typecheck`, `lint`, `test:coverage` and `build` on every push to `main`.

## Releasing

Raise `version` in `package.json` in a pull request. After it is merged, run `pnpm release` on a clean checkout: it tags `main` with `v<version>` and pushes the tag, and the `publish` workflow tests, builds and publishes to npm.

Publishing uses npm trusted publishing: no token is stored anywhere. The first version is published by hand from a clean checkout (`pnpm install`, `npm login`, then `npm publish --provenance=false`: provenance can only be made inside GitHub Actions); after that the package's npm settings name this repository's `publish.yml` as its Trusted Publisher.
