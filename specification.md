# Declarative, Schema-Driven, Serverless LIS/QMS System  
## Unified Architecture Specification (Updated)

## 1. Introduction

This document defines the architecture for a schema-driven, serverless Laboratory Information System (LIS) and Quality Management System (QMS). The system runs entirely as a client-side application (e.g., GitHub Pages). All business logic, workflows, and validation logic are derived from declarative schema bundles. There is no separate “LIS mode” or “QMS mode”; instead, the schema defines all strictness and required behaviors.

The system supports both research and regulated workflows by loading different schema bundles while keeping the application code identical.

---

## 2. Scope and Limitations

The system does not provide server-side audit trails, timestamp authority, or identity validation. Therefore, it cannot independently satisfy 21 CFR Part 11 or ALCOA+ requirements. It **can** act as a validated template/structure enforcement tool supporting broader regulated environments where external audit mechanisms (e.g., GitHub history, review workflows, timestamp services) provide compliance controls.

---

## 3. Browser and Platform Considerations

### 3.1 Browser Requirements
The system relies on the File System Access API, which is only available in:

- Chrome  
- Edge  
- Chromium-based browsers  

Safari, Firefox, and mobile browsers are not supported for full functionality.  
Fallback storage (OPFS/IndexedDB) may be used for limited read-only or draft functionality.

### 3.2 Persistent Directory Access
The user designates the repository root as the persistent working directory.  
All reads and writes occur beneath this root.  
This avoids prompting the user for directory access for each record.

---

## 4. Architectural Layers

### 4.1 UI Layer (Vue 3 + TipTap)
- File tree reflecting the repository structure  
- Main Markdown viewer/editor  
- TipTap-based document editor with controlled fields  
- Sidebar LLM assistant  
- No business rules in UI components; all derived from schema

### 4.2 Workflow Layer (XState)
- Declarative record lifecycles  
- State transitions defined via `.machine.yaml` files  
- Guards for validation and signoffs  
- Regulated workflows use the same engine but stricter schema

### 4.3 Schema-Driven Domain Logic
Entirely composed of pure functions generated from declarative configuration.

### 4.4 Validation Layer (Zod)
Generated from YAML record schemas.  
Validates:
- YAML front matter  
- Markdown-side controlled fields  
- Signoff fields  
- Prefilled fields  
- Controlled vocabularies  
- File naming compliance

### 4.5 File I/O Layer
- Persistent directory access at repo root  
- Read/write files under user-selected root  
- Git commit helpers (external or local)  
- No server dependency

### 4.6 LLM Assistance Layer
- LLM receives:  
  - Current file  
  - Schema  
  - Workflow state  
  - Validation rules  
  - **Local vocabularies and ontologies**  
- LLM produces patches or structured suggestions  
- LLM never writes files directly; all changes require user confirmation

### 4.7 Record Graph + JSON-LD Queries
- JSON-LD metadata is treated as the canonical graph language. `src/records/jsonLdFrontmatter.js` normalizes every record into `@context`, `@id`, `@type`, and structured `data` sections using bundle-specific config (see §5.3).
- `src/graph/useRecordGraph.js` orchestrates graph rebuilds whenever the repo handle or schema bundle changes. It pulls Markdown files via `src/graph/collectRecordFiles.js`, hydrates them with JSON-LD metadata, and constructs a snapshot through `src/graph/graphBuilder.js`.
- Each node includes derived IRIs, record type, semantic tags, biology entities, and relationship edges defined in the bundle (`relationships.recordTypes`). Backlinks are generated so parent/child/related traversals remain O(1).
- The UI’s primary exploration surface is `src/app/GraphTreePanel.vue`, embedded in the File Workbench. It renders schema-aware trees, supports inline child creation (respecting workflow and relationship rules), and keeps selection synchronized with the active file.
- Declarative graph queries live at `/graph/<schema-set>/queries.yaml`, loaded via `src/schema-bundles/useSchemaBundle.js` and evaluated by `src/graph/useGraphQuery.js`. Filters operate on JSON-LD paths (e.g., `metadata.@type`, `data.operations.samples[]`) so schema authors can define saved searches and expansion rules without touching the UI.

### 4.8 Plate Layout Editor
- Plate layout records (`recordType: plateLayout`, e.g., files under `09_PLATE_LAYOUTS/`) can be opened directly from the File Tree or by visiting `http://localhost:5174/?plateEditorPath=<path>&plateEditorBundle=<bundle>` (same query params also work on the primary Vite server). `src/app/AppShell.vue` watches the `plateEditorPath` query parameter and launches a standalone editor window so plate design work can happen outside the general markdown workbench.
- `src/plate-editor/PlateEditorShell.vue` is the top-level Vue shell that loads the selected Markdown file, parses JSON-LD front matter, and binds it to the dedicated plate editor store (`src/plate-editor/store/usePlateEditorStore.js`). It keeps the record hash in sync so the “Save plate layout” button only activates when well assignments or timeline events change.
- Visual editing lives in `src/plate-editor/components`: `PlateGrid.vue` renders wells + selection overlays, `ApplyBar.vue` applies materials/roles to a selection, and `MaterialDetailsDrawer.vue` manages the shared material library. Supporting composables and services (`composables/useMaterialLibrary.js`, `services/materialLibraryWriter.js`, `utils/layoutUtils.js`) encapsulate grid geometry, presets, and persistence. `LabwareGrid.vue` + `TransferStepSidecar.vue` provide dual-grid, protocol-style transfer step building with separate source/target selections.
- Schema authors define allowable plate specs via `spec/plate-editor/PlateEditorSpec.*` (role catalog, well geometry, default events). The registry in `src/plate-editor/specRegistry.js` exposes those specs, and `schema/computable-lab/plate-layout.schema.yaml` links each record to a spec through the `editorSpecId` field so layouts render with the right template.

### 4.9 Robot Adapter Tooling
- Lightweight conversion scripts live under `scripts/adapters/`. `plate-events-to-pylabrobot.mjs` emits a JSON command list that PyLabRobot developers can consume, while `plate-events-to-pyalab.mjs` prints a human-readable step list compatible with pyalab/Vialab workflows.
- Both adapters reuse `scripts/adapters/lib/plateEventConverter.mjs`, which parses plate layout records (via `src/records/frontMatter.js`), normalizes legacy and structured events, and exposes helper mappers (`toPyLabRobotCommands`, `toPyalabSteps`). This keeps robot-specific hints optional and prevents schema drift.
- Example PlateEvents for transfer/incubate/read/wash/custom scenarios are documented in `tmp/plate-event-examples.md` so operators and adapter authors can copy canonical YAML snippets directly into records.
- Plate editor transfer steps now emit protocol-style `details.mapping` plus derived `target.wells`, so adapters and the derivation pipeline can replay mappings into per-well contents.

### 4.10 Stabilization & Migration
- `scripts/migrations/backfill-plate-events.mjs` upgrades legacy plate layouts by converting `wells.inputs` entries into JSON-LD PlateEvents. It can run in dry-run mode or target specific files, and the core logic lives in `scripts/migrations/lib/backfillPlateEvents.mjs`.
- Regression coverage lives in `tests/backfillPlateEvents.test.mjs` and `tests/plateEventDeriver.test.mjs`, ensuring derived wells stay in sync with PlateEvents and the migration keeps emitting canonical transfer payloads.

### 4.11 Protocol Templates
- Protocol records now define labware roles, parameter schemas, and ordered event templates (see `schema/computable-lab/protocol.schema.yaml` plus `datatypes/protocol-event*.schema.yaml`).  
- The Protocol Editor (`src/protocol-editor/ProtocolEditorShell.vue`) provides Info/Labware/Events/Preview tabs so users can manage roles, author event templates, and review the simulated timeline without touching plate layouts directly.  
- `src/protocols/instantiateProtocol.js` expands a protocol + binding context into concrete PlateEvents; `scripts/protocols/run-protocol.mjs` wraps this into a CLI for generating run records.  
- Example assets live under `tmp/protocol-prototypes/ros-mmp-insulin/` (protocol, run, PlateEvents), and `docs/ProtocolEditorSpec.md` documents the UX + AI brief so new contributors can follow the model.

### 4.12 Run Activities & Multi-Segment Execution
- Runs now serialize an ordered `data.activities` array (see `schema/computable-lab/run.schema.yaml`), turning the run record into the canonical timeline of protocol segments, acquisitions, and sample operations. Plate state is derived by replaying each segment’s embedded `plate_events`, and sample provenance lives alongside `sample_operation` entries (supporting labware sources, destination send-outs, produced sample metadata, splits, and file attachments).
- The CLI at `scripts/protocols/run-protocol.mjs` instantiates a protocol segment and **appends** it to an existing run instead of overwriting files. Each invocation binds its own `labware`/`parameters`, so you can layer “seed cells → T=24 imaging → insulin protocol → fluorescent reads → send-outs” into one record.
- `src/app/RunActivitiesPanel.vue` (rendered inside `FieldInspector.vue` for `recordType: run`) is the primary UI for viewing and editing the timeline. It surfaces run-level bindings/parameters, supports reordering, and provides quick actions to add acquisitions tied back to the latest segment’s PlateEvents. Sample operations expose inline editors for produced samples, splits, and attachments.
- Migration helpers under `scripts/migrations/backfill-run-activities.mjs` convert legacy run records (`data.operations.events`) into the new activity model so the Plate Editor, adapters, and query tooling all consume a single timeline structure.

---

## 5. Record and Schema Formats

### 5.1 Record Types (YAML Definition Files)
Record types are defined in YAML under:

schema/<schema-set>/*.schema.yaml

These define:
- Field definitions  
- Required fields  
- Prefilled values  
- Controlled vocabularies  
- Signoff fields  
- Auto-generated metadata  
- Mutability rules  

### 5.2 Records (YAML Front Matter + Markdown)
Individual records follow this format:

```yaml
---
record_type: sop
id: SOP-0007
version: 3.2
title: Sample Storage Procedure
effective_date: 2025-08-10
meta:
  equipment_id: EQ-0003
  ontology_terms:
    organism: NCBITAXON:9606
signoff:
  drafter: null
  reviewer: null
  approver: null
---
````

Markdown content begins **immediately after** the terminating `---` line.

Markdown must not contain additional `---` YAML blocks outside the front matter to avoid breaking parsing.

### 5.3 JSON-LD Configuration
- All record front matter is authored as JSON-LD. `src/records/jsonLdFrontmatter.js` composes the metadata/data envelope, merges form inputs, and injects `@context`, `@id`, and `@type` values.
- JSON-LD settings are bundled per schema under `schema/<schema-set>/jsonld-config.yaml`. Config drives base IRIs, record-type-specific path segments, required class IRIs, biology-derived type mappings, and custom prefixes.
- The same module extracts JSON-LD when loading files, ensuring UI components, validators, and the record graph all work with the exact same semantic payload.
- Graph queries (`/graph/<schema-set>/queries.yaml`) and search helpers (`src/graph/useGraphQuery.js`) reference JSON-LD paths directly, so introducing new ontology-backed fields only requires updating schema + config files.

---

## 6. Domain Logic Layer (Updated Details)

### 6.1 Naming and Routing

Controlled via `naming.yaml`.
Pure functions:

* `resolvePath(recordType, metadata)`
* `generateFilename(recordType, metadata)`
* `relatedRecords(recordType, metadata)`

### 6.2 Prefilled Regulated Fields

Regulatory schema bundles may specify:

* Required version numbers
* SOP identifiers
* Batch IDs
* Product numbers
* Immutable metadata
* Required ontology fields

All prefilled data is stored in front matter and validated by Zod.

---

## 7. Workflow Layer (XState)

All workflow constraints—including regulatory signoffs—live in machine YAML.

Example:

```yaml
states:
  draft:
    on:
      SUBMIT:
        target: in_review
        cond: validation.passed

  in_review:
    on:
      APPROVE:
        target: approved
        cond: signoff.atLeastTwo
```

Strict workflows are activated simply by choosing a schema bundle that defines them.

---

## 8. Validation Layer

Validation is fully declarative:

* Zod schemas generated from YAML
* Field immutability rules applied after approval
* Ontology references validated against local vocabularies
* DVC pointers validated by hash comparison
* Regulated schema bundles enforce stricter rules, not the application

---

## 9. Ontology and Vocabulary Integration

Schemas may require ontology-backed fields:

```yaml
x-ontology:
  source: local
  file: vocab/organisms.yaml
  strict: true
```

LLM assistance receives the vocabularies verbatim as input, enabling:

* Controlled term suggestion
* Ontology-based expansions
* Consistent naming conventions

---

## 10. Binary Asset Handling (DVC)

Binaries are never stored directly in the repo.
Records reference binary assets via:

* `.dvc` pointer files
* `.meta.yaml` sidecars containing:

  * SHA-256 hash
  * File size
  * Acquisition metadata
  * Instrument identifiers

Schemas may require hash verification.

---

## 11. Schema Versioning

Every schema bundle includes:

```yaml
schema_version: 1.4
compatible_with: ["1.3", "1.2"]
```

Migration scripts (declarative or LLM-assisted) handle updates to existing records.

---

## 12. Performance and Scale Notes

Due to browser limitations:

* File trees should be lazily loaded
* Large repos (>5000 files) require IndexedDB caching
* The system is optimized for small-to-medium laboratories
* Multi-GB binary datasets are stored externally, referenced locally

---

## 13. Disaster Recovery and Backup

The system assumes the repository is synchronized with GitHub or another Git host.

Recommended practices for regulated schema sets:

* Mandatory GitHub sync workflow
* External backups
* Record review workflows requiring verification of external backup status

---

## 14. Summary

This unified architecture removes the need for a dual-mode system.
All behavior—research or regulated—is determined entirely by schemas:

* Workflows
* Required fields
* Prefilled metadata
* Signoff requirements
* Controlled vocabularies
* Validation strictness
* Naming rules
* Privilege/immutability constraints

The application itself remains static, serverless, and platform-independent (within Chromium browser constraints).
This approach combines the flexibility required in research settings with the structure and enforceability required for regulated processes, without duplicating logic or fragmenting the codebase.
