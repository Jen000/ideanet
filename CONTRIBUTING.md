# How we name things

Four prefixes. That's the whole system.

| Prefix  | Use it for                                      |
| ------- | ----------------------------------------------- |
| `feat`  | new behaviour a user would notice               |
| `fix`   | something was broken, now it isn't              |
| `chore` | deps, config, tooling, refactors, cleanup       |
| `docs`  | README, comments, this file                     |

**Branch:** `prefix/short-description` in kebab-case.

```
feat/node-collapse
fix/edge-arrow-offset
chore/tailwind-config
```

**PR title:** the same thing with a colon and spaces.

```
feat: collapse and expand branches
fix: arrowheads overlap large nodes
chore: move api behind a single adapter
```

**Squash-merge every PR.** The PR title becomes the commit message, so `git log`
on `main` reads as a clean list of what shipped. Nothing else to remember.

Keep the description under ~8 words. If it needs more than that, the PR is
probably doing two things and should be two PRs.
