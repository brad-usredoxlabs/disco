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

