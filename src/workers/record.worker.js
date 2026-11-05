import { parseCsv, parseCsvStream, queryRecordIndices, summarizeRecords } from '../services/records.engine.mjs'

const WASM_THRESHOLD = 10000
let records = []
let wasmEngine
let wasmModulePromise
let wasmEnginePromise

function loadWasmModule() {
  if (!wasmModulePromise) {
    wasmModulePromise = import('../../wasm/processor/pkg/processor.js')
      .then(async module => {
        await module.default()
        return module
      })
      .catch(() => null)
  }
  return wasmModulePromise
}

async function initialize(recordsToLoad) {
  records = recordsToLoad.length >= WASM_THRESHOLD ? recordsToLoad : []
  wasmEngine = undefined
  wasmEnginePromise = undefined

}

async function getWasmEngine() {
  if (records.length < WASM_THRESHOLD) return undefined
  if (wasmEngine) return wasmEngine
  if (!wasmEnginePromise) {
    wasmEnginePromise = loadWasmModule().then(module => {
      if (!module) return undefined
      try {
        wasmEngine = new module.RecordEngine(records)
        return wasmEngine
      } catch {
        return undefined
      }
    })
  }
  return wasmEnginePromise
}

async function loadCsvStream(stream, limit = Infinity) {
  const loadedRecords = await parseCsvStream(stream, limit)
  await initialize(loadedRecords)
  return loadedRecords
}

function getCategories(loadedRecords) {
  return [...new Set(loadedRecords.map(record => record.category).filter(Boolean))].sort()
}

self.onmessage = async event => {
  const { id, type } = event.data

  try {
    if (type === 'loadStream') {
      const parseStartedAt = performance.now()
      const loadedRecords = await loadCsvStream(event.data.stream, event.data.limit)
      const parseMs = performance.now() - parseStartedAt
      self.postMessage({ id, records: loadedRecords, categories: getCategories(loadedRecords), backend: 'javascript', parseMs })
      return
    }

    if (type === 'loadText') {
      const parseStartedAt = performance.now()
      const loadedRecords = parseCsv(event.data.text, event.data.limit)
      await initialize(loadedRecords)
      const parseMs = performance.now() - parseStartedAt
      self.postMessage({ id, records: loadedRecords, categories: getCategories(loadedRecords), backend: 'javascript', parseMs })
      return
    }

    if (type === 'loadFile') {
      const loadedRecords = await loadCsvStream(event.data.file.stream())
      self.postMessage({ id, records: loadedRecords, categories: getCategories(loadedRecords), backend: 'javascript' })
      return
    }

    if (type === 'initialize') {
      await initialize(event.data.records)
      self.postMessage({ id, backend: 'javascript' })
      return
    }

    if (type === 'query') {
      const engine = await getWasmEngine()
      const indices = engine
        ? engine.query(
          event.data.options.query || '',
          event.data.options.category || '',
          event.data.options.sortBy || 'id',
          Boolean(event.data.options.descending)
        )
        : queryRecordIndices(records, event.data.options)
      const transferableIndices = Uint32Array.from(indices)
      self.postMessage({ id, indices: transferableIndices, backend: engine ? 'wasm' : 'javascript' }, [transferableIndices.buffer])
      return
    }

    if (type === 'summary') {
      const engine = await getWasmEngine()
      const summary = engine ? engine.summary() : summarizeRecords(records)
      self.postMessage({ id, summary, backend: engine ? 'wasm' : 'javascript' })
    }
  } catch (error) {
    self.postMessage({ id, error: error.message || 'Record processing failed.' })
  }
}