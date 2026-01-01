// FILE: src/domain/records/crud.ts
// Core CRUD service for record files (front matter + markdown),
// wired to the schema bundle + naming config, but storage-agnostic.

import { SchemaBundle } from "../schema/types";
import { LoadedRecordFile, loadRecordFile } from "./file-loader";
import { Validator } from "./validator";
import { resolveBaseDir, generateFilename } from "../naming/resolver";

export interface RecordStorage {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface CreateRecordParams {
  recordType: string;
  schemaSet: string;
  metadata: Record<string, unknown>;
}

export interface UpdateRecordParams {
  path: string;
  frontMatter: any;
}

export interface DeleteRecordParams {
  path: string;
  recordType: string;
  id: string;
}

export interface CloneRecordParams {
  sourcePath: string;
  overrides?: Record<string, unknown>;
}

export interface CrudContext {
  schemaBundle: SchemaBundle;
  validator: Validator;
  storage: RecordStorage;
}

// Serialize record as pure YAML (no Markdown body)
function serializeRecord(frontMatter: any): string {
  return JSON.stringify(frontMatter, null, 2);
}

export async function createRecord(
  ctx: CrudContext,
  params: CreateRecordParams
): Promise<{ path: string; frontMatter: any; markdown: string }> {
  const { recordType, metadata } = params;
  const { schemaBundle, validator, storage } = ctx;

  const naming = schemaBundle.naming;
  const recordNaming = naming[recordType];
  if (!recordNaming) {
    throw new Error("No naming config for recordType=" + recordType);
  }

  const idField = recordNaming.idField;
  const frontMatter: any = { ...metadata };

  if (!frontMatter[idField]) {
    frontMatter[idField] =
      recordType.toUpperCase() + "-TEMP-" + Date.now();
  }

  const validationResult = validator.validate(
    recordType,
    normalizeFrontMatterShape(frontMatter)
  );
  if (!validationResult.valid) {
    throw new Error(
      "Validation failed for new " +
        recordType +
        ": " +
        validationResult.errors.join("; ")
    );
  }

  const baseDir = resolveBaseDir(naming, recordType);
  const filename = generateFilename(naming, {
    recordType,
    metadata: frontMatter,
  });

  const path = baseDir + "/" + filename;
  const content = serializeRecord(frontMatter);
  await storage.writeFile(path, content);

  return { path, frontMatter, markdown: "" };
}

export async function readRecord(
  _ctx: CrudContext,
  path: string
): Promise<LoadedRecordFile> {
  return await loadRecordFile(path);
}

export async function updateRecord(
  ctx: CrudContext,
  params: UpdateRecordParams,
  recordType: string
): Promise<void> {
  const { schemaBundle, validator, storage } = ctx;
  const { path, frontMatter, markdown } = params;

  if (!schemaBundle.recordSchemas[recordType]) {
    console.warn("No schema registered for recordType=" + recordType);
  }

  const result = validator.validate(
    recordType,
    normalizeFrontMatterShape(frontMatter)
  );
  if (!result.valid) {
    throw new Error(
      "Validation failed for " +
        recordType +
        " at " +
        path +
        ": " +
        result.errors.join("; ")
    );
  }

  const content = serializeRecord(frontMatter);
  await storage.writeFile(path, content);
}

export async function deleteRecord(
  ctx: CrudContext,
  params: DeleteRecordParams
): Promise<void> {
  const { storage } = ctx;
  await storage.deleteFile(params.path);
}

function normalizeFrontMatterShape(frontMatter: any): any {
  if (!frontMatter || typeof frontMatter !== "object") {
    return frontMatter;
  }
  if (!frontMatter.metadata && !frontMatter.data) {
    return frontMatter;
  }
  const flattened: any = { ...(frontMatter.metadata || {}) };
  const sections = frontMatter.data || {};
  Object.values(sections).forEach((section: any) => {
    if (section && typeof section === "object") {
      Object.entries(section).forEach(([key, value]) => {
        flattened[key] = value;
      });
    }
  });
  return flattened;
}

export async function cloneRecord(
  ctx: CrudContext,
  params: CloneRecordParams,
  recordType: string
): Promise<{ path: string; frontMatter: any; markdown: string }> {
  const { sourcePath, overrides } = params;
  const source = await loadRecordFile(sourcePath);

  const newFrontMatter = {
    ...source.frontMatter,
    ...(overrides ?? {}),
  };

  delete newFrontMatter.id;
  delete newFrontMatter.version;
  delete newFrontMatter.approval;

  return createRecord(ctx, {
    recordType,
    schemaSet: ctx.schemaBundle.schemaSet,
    metadata: newFrontMatter,
    markdown: "",
  });
}
