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
    aws.js           contract for the real backend — signatures, no bodies
```

**Everything talks to `api/` and nothing else.** Swapping the demo store for
AWS is a one-line change in `api/index.js`.

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

- Real auth. `api/local.js` stores accounts in `localStorage` in plain text.
  It is a stand-in for Cognito and is not security.
- The AWS adapter (`api/aws.js` is signatures only).
- View counting at scale — writing a counter on every read will contend once
  something gets popular. Decide on buffering before launch.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch and PR naming.
