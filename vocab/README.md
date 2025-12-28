# Vocab registry layout (concepts + revisions)

- `vocab/materials/`: material **concept** records (stable id/label/category/tags/xref).
- `vocab/material-revisions/`: immutable material **revision** snapshots (`materialrev:*`) with full fields and status.
- `vocab/features/`: feature **concept** records (stable id/label/...).
- `vocab/feature-revisions/`: immutable feature **revision** snapshots (`featurerev:*`) with full fields and status.

Concepts rarely change; runs/protocols should pin revision IDs. Active revisions are treated as read-only; new changes create new revisions.

## Migration note

The monolithic `vocab/materials.lab.yaml` file is deprecated and no longer used. All materials must be authored as concepts under `vocab/materials/` with revisions under `vocab/material-revisions/` (or via the generated `vocab/materials.index.json`). See `tmp/disco_vocab_migration_spec.md` for full details.
