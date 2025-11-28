import { collectRecordFiles } from './collectRecordFiles'
import { buildGraphSnapshot } from './graphBuilder'

export async function buildRecordGraph(repoConnection, schemaBundle) {
  if (!schemaBundle) {
    return {
      nodesById: {},
      nodesByPath: {},
      nodes: [],
      stats: { total: 0, biology: { totalEntities: 0, domains: {}, roles: {}, ontologies: {} } }
    }
  }

  const files = await collectRecordFiles(repoConnection, schemaBundle.naming || {})
  return buildGraphSnapshot(files, schemaBundle)
}
