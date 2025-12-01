import { collectRecordFiles } from './collectRecordFiles'
import { buildGraphSnapshot } from './graphBuilder.js'

export async function buildRecordGraph(repoConnection, schemaBundle) {
  if (!schemaBundle) {
    return {
      nodesById: {},
      nodesByPath: {},
      nodesByType: {},
      relationships: {},
      nodes: [],
      stats: { total: 0, biology: { totalEntities: 0, domains: {}, roles: {}, ontologies: {} } }
    }
  }

  const files = await collectRecordFiles(repoConnection, schemaBundle.naming || {})
  return buildGraphSnapshot(files, schemaBundle)
}
