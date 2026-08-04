# IdeaNet

Build visual networks of connected ideas — nodes on a canvas, linked by
relationships you name yourself. Designed around mapping a problem into
candidate solutions and down into concrete actions, but nothing is hard-coded
to that vocabulary: node types, colours, sizes and edge labels are all user
defined, so the same tool works for course notes, research, or a stuck draft.

## Run it

```bash
npm install
npm run dev
```

## Deploy (GitHub Pages)

Pushing to `main` builds the app and publishes it via
`.github/workflows/deploy-pages.yml`. One-time setup: **Settings → Pages →
Build and deployment → Source: GitHub Actions**. The site then serves at
`https://<owner>.github.io/ideanet/`.

Because it's a project site under `/ideanet/`, the production build sets Vite's
`base` accordingly (see `vite.config.js`); override with `VITE_BASE` if the repo
is renamed or served from a custom domain. The deployed site uses the default
localStorage adapter — to point Pages at the AWS backend, flip the export in
`src/api/index.js` to `./aws` and set the four `VITE_*` values as repository
**Variables** (used by the workflow's build step).

## How it's put together

```
src/
  constants.js       palette, defaults, small helpers
  graph.js           adjacency index, collapse logic, radial auto-layout
  Canvas.jsx         the SVG canvas: pan, zoom, drag, connect, focus
  ui.jsx             Shell, Btn, Tag, shared panel styling
  MiniPreview.jsx    thumbnail graph used on cards
  pages/             Landing, Auth, Dashboard, Editor (Editor doubles as the
                     read-only public viewer via `readOnly`)
  api/
    index.js         the only import path for persistence
    local.js         working localStorage adapter
    aws.js           AWS adapter — Cognito + our HTTP API
```

**Everything talks to `api/` and nothing else.** Swapping the demo store for
AWS is a one-line change in `api/index.js`.

## Persistence adapters

Two interchangeable backends behind the same surface. Pick one by flipping the
single export in `src/api/index.js`:

```js
export { api, summarize, score } from "./local"; // localStorage, offline dev
// export { api, summarize, score } from "./aws"; // Cognito + DynamoDB
```

- **`local`** (default) — accounts and networks in `localStorage`, no setup.
  This is the offline dev path; it stays working and intact.
- **`aws`** — real auth (Cognito) and storage (DynamoDB behind our own HTTP
  API). Provision it once with the CDK stack in [`infra/`](./infra/README.md),
  then copy the deploy outputs into `.env`:

  ```bash
  cp .env.example .env      # fill VITE_* from `cd infra && npx cdk deploy`
  # flip the export in src/api/index.js to ./aws, then:
  npm run dev
  ```

  `.env` is gitignored — never commit real values. See `.env.example` for the
  four variables (`VITE_AWS_REGION`, `VITE_COGNITO_USER_POOL_ID`,
  `VITE_COGNITO_CLIENT_ID`, `VITE_API_BASE_URL`).

  Two behaviours differ from the demo store, by design:
  - **Likes are sign-in-gated.** On AWS a like belongs to a user, not a device,
    so a signed-out visitor's like is a no-op; they can still open and read any
    public network.
  - **View counts are eventually consistent.** Opening a public network is a
    pure read; the view is counted asynchronously (buffered through SQS and
    rolled up), so the number can lag an open by a few seconds.

## Canvas

Hand-rolled SVG rather than `@xyflow/react`. The node and edge shapes stay
react-flow-compatible (`{ id, x, y }` / `{ id, source, target }`) so porting
is mechanical if we change our minds — but the custom canvas gives tighter
control over the glow, the dim-on-focus behaviour, and the eased transitions
than react-flow's renderer does.

| Action              | How                                        |
| ------------------- | ------------------------------------------ |
| Add a node          | double-click empty canvas                  |
| Connect two nodes   | drag the cyan dot on a node's edge         |
| Move a node         | drag it                                    |
| Focus a node        | click it, or pick it from search           |
| Collapse a branch   | click the badge under a node               |
| Clear selection     | `Esc`, or click empty canvas               |
| Delete selection    | `Delete` / `Backspace`                     |

## Data model

```js
NodeType { id, name, color, size }
Node     { id, label, typeId, notes, x, y, collapsed }
Edge     { id, source, target, label, directed }
Network  { id, title, description, tags[], ownerId, ownerName,
           visibility, nodeTypes[], nodes[], edges[], likes, views,
           createdAt, updatedAt }
```

Node types and edge labels are plain data, not enums. Everything is JSON
serializable, so a network round-trips through storage, export, or an API
without translation.

## Public gallery

Public networks are readable without an account. Ranking is
`likes × 8 + views + a small recency lift` — see `score()` in `api/local.js`.

## Not done yet

- Frontend deployment. The CDK stack provisions S3 + CloudFront hosting but
  nothing is deployed to it yet — see [`infra/README.md`](./infra/README.md).
- Email verification. The Cognito pool auto-confirms new accounts (a pre-signup
  trigger) so signup matches the local flow; real verification isn't wired up.
- `api/local.js` still stores accounts in `localStorage` in plain text. It's the
  offline demo store, not security — use the `aws` adapter for real auth.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch and PR naming.
