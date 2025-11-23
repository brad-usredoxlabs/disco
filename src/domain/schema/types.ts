// Shared types for schema bundles, relationships, naming, and ontology.

export type RecordSchemas = Record<string, unknown>;
export type UiConfigs = Record<string, unknown>;
export type OntologyConfig = unknown;

export interface RelationshipDescriptor {
  fromType: string;
  toType: string;
  viaField: string;
  kind: "parent" | "child" | "related";
  name: string;
  cardinality: string; // e.g. "1", "0..1", "0..*"
}

export interface RelationshipIndex {
  all: RelationshipDescriptor[];
  byFromType: Record<string, RelationshipDescriptor[]>;
  byToType: Record<string, RelationshipDescriptor[]>;
}

export interface RelationshipsConfig {
  recordTypes: {
    [recordType: string]: {
      idField: string;
      slugField?: string;
      parents?: {
        [relName: string]: {
          field: string;
          recordType: string;
          cardinality: string;
        };
      };
      children?: {
        [relName: string]: {
          field: string;
          recordType: string;
          cardinality: string;
        };
      };
      related?: {
        [relName: string]: {
          field: string;
          recordType: string;
          cardinality: string;
        };
      };
    };
  };
}

export interface NamingConfig {
  [recordType: string]: {
    idField: string;
    shortSlugField?: string;
    baseDir: string;
    filenamePattern: string;
    idGeneration?: {
      prefix: string;
      format: string;
      counterFile: string;
    };
    derivedFields?: {
      [name: string]: {
        sourceRecordType: string;
        sourceField: string;
        linkage: { viaField: string };
      };
    };
  };
}

export interface SchemaManifest {
  recordSchemas: string[];
  uiConfigs?: string[];
  ontology?: string;
  assistantConfig?: string;
}

export interface AssistantAction {
  id: string;
  label: string;
  systemPrompt?: string;
  userTemplate?: string;
  include?: string[];
}

export interface AssistantConfig {
  [recordType: string]: {
    actions: AssistantAction[];
  };
}

export interface SchemaBundle {
  schemaSet: string;
  recordSchemas: RecordSchemas;
  uiConfigs: UiConfigs;
  relationships: RelationshipsConfig;
  naming: NamingConfig;
  ontology?: OntologyConfig;
  relationshipIndex: RelationshipIndex;
  assistant?: AssistantConfig;
}
