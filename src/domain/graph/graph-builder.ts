// FILE: src/domain/graph/graph-builder.ts
// Optional helper for building record dependency graphs using the RelationshipIndex.

import { RelationshipIndex } from "../schema/types";

export interface GraphNode {
  id: string; // record identifier (e.g. front-matter id)
  recordType: string;
}

export interface GraphEdge {
  from: GraphNode;
  to: GraphNode;
  kind: "parent" | "child" | "related";
  name: string;
}

export interface RecordGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Placeholder: In the future, implement a function that, given a starting record
// and the RelationshipIndex, walks the workspace and builds a graph of related records.
export function buildRecordGraph(
  _start: GraphNode,
  _relationships: RelationshipIndex
): RecordGraph {
  console.warn("buildRecordGraph is not yet implemented");
  return { nodes: [], edges: [] };
}
