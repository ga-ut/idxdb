# Repository Guidelines

## Project Structure & Module Organization

- `index.ts` holds the IdxDB core, including schema helpers, the handler API, and the query builder exported to consumers.
- `test/` contains Bun test suites; `idxdb.test.ts` covers CRUD, indexing, and pagination while `setup.ts` boots `fake-indexeddb` for browser-like tests (preloaded through `bunfig.toml`).
- `dist/` contains Bun-generated outputs: CommonJS (`index.cjs`), ES module (`index.js`), and `.d.ts` declarations—never edit them directly; regenerate with `bun run build`.
- Root configs (`tsconfig.json`, `bunfig.toml`) define compiler targets and test preload behavior; align new modules with these defaults.

## Build, Test, and Development Commands

- `bun install` restores dev dependencies and produces `bun.lock`.
- `bun run build` cleans `dist/`, bundles `index.ts` with `bun build`, then emits `.d.ts` files via `bun x tsc --emitDeclarationOnly`.
- `bun run lint` runs Biome checks; pair with `bun run format` for autofixes where safe.
- `bun test` executes the Bun test suite with the IndexedDB shim preloaded.
- `bun test --watch` reruns relevant suites on file change—useful while iterating on new handlers or query helpers.

## Coding Style & Naming Conventions

- Stick to TypeScript with 2-space indentation and explicit return types when generics or promises are involved.
- Use PascalCase for exported classes (`IdxDB`, `QueryBuilder`), camelCase for functions/methods, and UPPER_CASE for shared constants when introduced.
- Mirror schema naming after IndexedDB stores (e.g., `userSchema`, `ordersSchema`) and keep table keys aligned with `keyPath`.
- Run `bun run build` before submitting PRs and ensure `bun run lint` passes to keep the bundle and types in sync.

## Testing Guidelines

- Add Bun specs under `test/` with the `.test.ts` suffix (e.g., `query-builder.test.ts`); the runner uses `bunfig.toml` for preload hooks.
- Seed `fake-indexeddb` instances in `beforeEach` and clean up with `indexedDB.deleteDatabase` to avoid state bleed.
- Extend coverage for new query operators or transaction flows by asserting both success paths and failure handling.
- Execute `bun test` (or the watch variant) locally before every push; CI expects a clean test run.

## Commit & Pull Request Guidelines

- Existing history uses concise imperative summaries (`init`); keep subject lines under ~70 characters, e.g., `feat: add range filtering`.
- Reference linked issues in bodies, note breaking changes explicitly, and describe manual test steps (e.g., `bun test`) in PR descriptions.
- Include usage snippets or screenshots when altering public APIs so reviewers see the intended integration path.
- Target focused commits per feature/bugfix to keep diffs reviewable and revert-friendly.

---

description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "_.ts, _.tsx, _.html, _.css, _.js, _.jsx, package.json"
alwaysApply: false

---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
