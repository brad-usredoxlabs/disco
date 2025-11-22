# DIsCo Pages 2.0 — Phase 1 shell

This directory contains the fresh Vite/Vue 3 application that will host the schema-driven
rewrite of DIsCo Pages. Phase 1 focuses on the bare-metal shell: a Chromium File System
Access prompt, reusable UI widgets, and the folder layout required by later phases.

## Getting started

```bash
cd tmp/disco-pages-2.0
npm install
npm run dev
```

## Layout

```
src/
  app/              # AppShell and high-level layout
  fs/               # File System Access helpers
  ui/
    file-tree/      # Schema-driven tree viewer components
    modal/
    panels/
    tiptap/
    collapsible/
  domain/           # Symlink to ../../src/domain
  schema-bundles/   # Placeholder for declarative bundles
  assets/
  main.js
```

## Next steps

* Phase 2 wires the RepoConnection service to the File System Access helper in `src/fs`.
* Schema bundle loading, validation, and record workflows layer on top of this shell in later phases.
