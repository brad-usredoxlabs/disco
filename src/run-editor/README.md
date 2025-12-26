# Run Editor Groundwork

- Source of truth: Runs own `data.activities[].plate_events`; plate layouts are templates/seed data only, and any wells cache is derived.
- Reuse stack: `PlateGrid.vue` + `useGridSelection` for selection, `ApplyBar` + `useMaterialLibrary` for materials, `LabwareGrid.vue` + `TransferStepSidecar.vue` for dual-grid mapping, Explorer overlays/legend/replay (`src/event-graph/*`, `src/explorer/helpers.js`, `ExplorerShell` drawer components).
- Entry point: new `RunEditorShell.vue` under `src/run-editor/`, keeping plate/protocol editors untouched while sharing grids/apply logic and event-graph replay.
- Palette model: run store owns `sourcePalette` + `activeSourceId` and persists it under `run.data.source_palette` (seeding from legacy `labware_bindings` for back-compat). Destination plate is fixed; transfers use palette/destination labware IDs, never abstract roles.
- Next phases: wire a Run-centric store, embed dual grids tied to activities, surface timeline/replay controls using the Explorer cursor/overlay components, and keep palette/run-derived replay in sync with the graph loader.
