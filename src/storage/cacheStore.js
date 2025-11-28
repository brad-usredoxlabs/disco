import { createStore, del, get, set } from 'idb-keyval'

const schemaStore = createStore('disco-cache', 'schema-bundles')
const shardStore = createStore('disco-cache', 'search-shards')

export async function readSchemaBundleCache(key) {
  if (!key) return null
  try {
    return await get(key, schemaStore)
  } catch {
    return null
  }
}

export async function writeSchemaBundleCache(key, value) {
  if (!key || !value) return
  try {
    await set(key, { ...value, savedAt: Date.now() }, schemaStore)
  } catch {
    /* ignore */
  }
}

export async function clearSchemaBundleCache(key) {
  if (!key) return
  try {
    await del(key, schemaStore)
  } catch {
    /* ignore */
  }
}

export async function readShardCache() {
  try {
    return await get('shards', shardStore)
  } catch {
    return null
  }
}

export async function writeShardCache(value) {
  if (!value) return
  try {
    await set('shards', { ...value, savedAt: Date.now() }, shardStore)
  } catch {
    /* ignore */
  }
}

export async function clearShardCache() {
  try {
    await del('shards', shardStore)
  } catch {
    /* ignore */
  }
}
