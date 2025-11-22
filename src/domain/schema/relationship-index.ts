// Build derived relationship indexes from relationships.yaml config.

import {
  RelationshipsConfig,
  RelationshipIndex,
  RelationshipDescriptor,
} from "./types";

export function buildRelationshipIndex(
  relationships: RelationshipsConfig
): RelationshipIndex {
  const all: RelationshipDescriptor[] = [];

  for (const [recordType, cfg] of Object.entries(
    relationships.recordTypes
  )) {
    const add = (
      kind: "parent" | "child" | "related",
      relGroup?: Record<
        string,
        { field: string; recordType: string; cardinality: string }
      >
    ) => {
      if (!relGroup) return;
      for (const [name, rel] of Object.entries(relGroup)) {
        all.push({
          fromType: recordType,
          toType: rel.recordType,
          viaField: rel.field,
          kind,
          name,
          cardinality: rel.cardinality,
        });
      }
    };

    add("parent", cfg.parents);
    add("child", cfg.children);
    add("related", cfg.related);
  }

  const byFromType: Record<string, RelationshipDescriptor[]> = {};
  const byToType: Record<string, RelationshipDescriptor[]> = {};

  for (const r of all) {
    (byFromType[r.fromType] ||= []).push(r);
    (byToType[r.toType] ||= []).push(r);
  }

  return { all, byFromType, byToType };
}
