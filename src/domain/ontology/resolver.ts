// FILE: src/domain/ontology/resolver.ts
// Placeholder for ontology and vocabulary lookup helpers.

export interface OntologyTerm {
  label: string;
  identifier: string;
  ontology?: string;
}

// In the future, this module can:
// - Load local vocab/*.yaml
// - Provide search/autocomplete across terms
// - Optionally delegate to external services via an API proxy.

export async function lookupLocalTerm(
  sourceFile: string,
  id: string
): Promise<OntologyTerm | null> {
  console.warn("lookupLocalTerm is not yet implemented", {
    sourceFile,
    id,
  });
  return null;
}
