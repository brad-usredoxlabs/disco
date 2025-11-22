// Helper for loading schema/<schema-set>/manifest.yaml

import { SchemaManifest } from "./types";
import { loadYaml } from "./loader-utils";

export async function loadManifest(
  schemaSet: string
): Promise<SchemaManifest> {
  const path = `schema/${schemaSet}/manifest.yaml`;
  const manifest = (await loadYaml(path)) as SchemaManifest;
  return manifest;
}
