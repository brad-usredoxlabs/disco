// Main entry point for loading a schema bundle (schemas, UI, relationships, naming, ontology).

import {
  SchemaBundle,
  RecordSchemas,
  UiConfigs,
  RelationshipsConfig,
  NamingConfig,
  OntologyConfig,
} from "./types";
import { buildRelationshipIndex } from "./relationship-index";
import { loadManifest } from "./manifest";
import { loadYaml } from "./loader-utils";

export async function loadSchemaBundle(
  schemaSet: string
): Promise<SchemaBundle> {
  // 1. Load relationships and naming
  const relationshipsPath = `schema/${schemaSet}/relationships.yaml`;
  const namingPath = `naming/${schemaSet}.yaml`;

  const relationships = (await loadYaml(
    relationshipsPath
  )) as RelationshipsConfig;
  const naming = (await loadYaml(namingPath)) as NamingConfig;

  // 2. Load manifest describing record schemas and UI configs
  const manifest = await loadManifest(schemaSet);

  // 3. Load record schemas
  const recordSchemas: RecordSchemas = {};
  for (const fname of manifest.recordSchemas) {
    const recordType = fname.replace(/\.schema\.yaml$/, "");
    recordSchemas[recordType] = await loadYaml(
      `schema/${schemaSet}/${fname}`
    );
  }

  // 4. Load UI configs (optional)
  const uiConfigs: UiConfigs = {};
  if (manifest.uiConfigs) {
    for (const fname of manifest.uiConfigs) {
      const recordType = fname.replace(/\.ui\.yaml$/, "");
      uiConfigs[recordType] = await loadYaml(
        `schema/${schemaSet}/${fname}`
      );
    }
  }

  // 5. Load ontology config if present
  let ontology: OntologyConfig | undefined;
  if (manifest.ontology) {
    ontology = (await loadYaml(
      `schema/${schemaSet}/${manifest.ontology}`
    )) as OntologyConfig;
  }

  // 6. Build relationship index
  const relationshipIndex = buildRelationshipIndex(relationships);

  return {
    schemaSet,
    recordSchemas,
    uiConfigs,
    relationships,
    naming,
    ontology,
    relationshipIndex,
  };
}
