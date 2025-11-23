const counterCache = new Map()

async function readCounter(repoConnection, counterFile) {
  if (!counterFile) return 0
  if (counterCache.has(counterFile)) {
    return counterCache.get(counterFile)
  }
  try {
    const text = await repoConnection.readFile(`/${counterFile}`)
    const value = Number(text.trim()) || 0
    counterCache.set(counterFile, value)
    return value
  } catch (err) {
    counterCache.set(counterFile, 0)
    return 0
  }
}

async function writeCounter(repoConnection, counterFile, value) {
  if (!counterFile) return
  counterCache.set(counterFile, value)
  await repoConnection.writeFile(`/${counterFile}`, String(value))
}

function formatId(format = 'PRJ-{counter:0000}', counterValue, prefix) {
  const padded = String(counterValue).padStart(4, '0')
  return (format || '{counter:0000}')
    .replace('{counter:0000}', padded)
    .replace('{counter}', counterValue)
    .replace('{{counter}}', counterValue)
    .replace('{{counter:0000}}', padded)
}

export async function previewId(repoConnection, namingRule) {
  if (!namingRule?.idGeneration) return { id: '', counter: 0 }
  const { idGeneration } = namingRule
  const counterValue = (await readCounter(repoConnection, idGeneration.counterFile)) + 1
  const formatted = formatId(idGeneration.format, counterValue, idGeneration.prefix)
  const id = idGeneration.prefix ? `${idGeneration.prefix}${formatted.replace(idGeneration.prefix, '')}` : formatted
  return { id, counter: counterValue }
}

export async function commitId(repoConnection, namingRule, counterValue) {
  if (!namingRule?.idGeneration || !counterValue) return
  await writeCounter(repoConnection, namingRule.idGeneration.counterFile, counterValue)
}
