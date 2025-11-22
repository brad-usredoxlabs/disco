# DIsCo Pages 2.0

Schema-driven rewrite of the legacy DIsCo Pages experience. The entire Vite/Vue
application now lives at the repository root so each phase of
`tmp/disco-pages-2.0-plan.md` can land in git history.

## Getting started

```bash
npm install
npm run dev
```

Use a Chromium-based browser when running the dev server; the File System Access
API is required to connect the repo tree.

## Layout

```
src/
  app/              # AppShell, FileWorkbench, layout components
  fs/               # File System Access helpers + RepoConnection
  ui/               # Reusable widgets (tree, modal, panels, TipTap wrapper)
  assets/
  schema-bundles/   # Placeholder for declarative schema bundles
  domain/           # Existing pure domain engine shared across apps
  App.vue, main.js, style.css
```

## Next steps

* Continue with Phase 2+ milestones in `tmp/disco-pages-2.0-plan.md`.
* Commit after each phase now that the app lives at the repo root.
