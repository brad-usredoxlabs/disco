// Functions to resolve base directories and filenames from NamingConfig.

import { NamingConfig } from "../schema/types";

export interface FilenameParams {
  recordType: string;
  metadata: Record<string, unknown>; // e.g., front-matter fields
}

// Very simple template replacement ({{fieldName}} or {{nested.field}}).
function applyTemplate(
  template: string,
  values: Record<string, unknown>
): string {
  return template.replace(
    /{{\s*([a-zA-Z0-9_\.]+)\s*}}/g,
    (_, key: string) => {
      const parts = key.split(".");
      let current: any = values;
      for (const p of parts) {
        if (current && typeof current === "object" && p in current) {
          current = current[p];
        } else {
          return "";
        }
      }
      return String(current ?? "");
    }
  );
}

export function resolveBaseDir(
  naming: NamingConfig,
  recordType: string
): string {
  const cfg = naming[recordType];
  if (!cfg) {
    throw new Error(`No naming config for recordType=${recordType}`);
  }
  return cfg.baseDir;
}

export function generateFilename(
  naming: NamingConfig,
  params: FilenameParams
): string {
  const cfg = naming[params.recordType];
  if (!cfg) {
    throw new Error(
      `No naming config for recordType=${params.recordType}`
    );
  }
  return applyTemplate(cfg.filenamePattern, params.metadata);
}
