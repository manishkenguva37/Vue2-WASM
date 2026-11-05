import { parseCsv, parseCsvStream, queryRecordIndices, summarizeRecords } from './records.engine.mjs'

const WASM_THRESHOLD = 10000

let worker
let requestId = 0
let workerRecords
let initializationPromise
let workerBackend = 'javascript'
const pendingRequests = new Map()

function getCategories(records) {
  return [...new Set(records.map(record => record.category).filter(Boolean))].sort()
}

function resetWorker(error) {
  worker?.terminate()
  worker = undefined
  workerRecords = undefined
  initializationPromise = undefined
  pendingRequests.forEach(({ reject }) => reject(error))
  pendingRequests.clear()
}

function getWorker() {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker

  try {
    worker = new Worker(new URL('../workers/record.worker.js', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
  worker.onmessage = event => {
    const { id, error, ...result } = event.data
    const request = pendingRequests.get(id)
    if (!request) return
    pendingRequests.delete(id)
    if (error) request.reject(new Error(error))
    else request.resolve(result)
  }
  worker.onerror = event => resetWorker(new Error(event.message || 'Record worker failed.'))
  return worker
}

function requestWorker(type, payload, transfer = []) {
  const activeWorker = getWorker()
  if (!activeWorker) return Promise.reject(new Error('Web Workers are unavailable.'))

  const id = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    activeWorker.postMessage({ id, type, ...payload }, transfer)
  })
}

async function initializeWorker(records) {
  if (workerRecords === records) return
  if (!initializationPromise) {
    initializationPromise = requestWorker('initialize', { records })
      .then(() => {
        workerRecords = records
      })
      .finally(() => {
        initializationPromise = undefined
      })
  }
  await initializationPromise
  if (workerRecords !== records) return initializeWorker(records)
}

export async function loadCsvUrl(url, limit = Infinity) {
  const startedAt = performance.now()
  const response = await fetch(url)
  const apiMs = performance.now() - startedAt
  if (!response.ok) throw new Error(`Request failed (${response.status})`)

  if (getWorker() && response.body) {
    try {
      const result = await requestWorker('loadStream', { stream: response.body, limit }, [response.body])
      workerRecords = result.records
        return { ...result, apiMs }
    } catch (error) {
      resetWorker(error)
    }
  }

  const input = response.bodyUsed || response.body?.locked
    ? await fetch(url)
    : response
  if (!input.ok) throw new Error(`Request failed (${input.status})`)
  const records = response.body
    ? await parseCsvStream(input.body, limit)
    : parseCsv(await input.text(), limit)
    return { records, backend: 'javascript', apiMs, categories: getCategories(records) }
}

export async function loadCsvFile(file) {
  if (getWorker()) {
    try {
      const result = await requestWorker('loadFile', { file })
      workerRecords = result.records
        return result
    } catch (error) {
      resetWorker(error)
    }
  }

  const records = file.stream
    ? await parseCsvStream(file.stream())
    : parseCsv(await file.text())
    return { records, backend: 'javascript', categories: getCategories(records) }
}

export async function queryRecords(records, options) {
  if (records.length < WASM_THRESHOLD || !getWorker()) {
    workerBackend = 'javascript'
    return { indices: queryRecordIndices(records, options), backend: workerBackend }
  }

  try {
    await initializeWorker(records)
    const result = await requestWorker('query', { options })
    workerBackend = result.backend
    return { indices: result.indices, backend: result.backend }
  } catch (error) {
    resetWorker(error)
    workerBackend = 'javascript'
    return { indices: queryRecordIndices(records, options), backend: workerBackend }
  }
}

export async function summarizeRecordsWithWorker(records) {
  if (records.length < WASM_THRESHOLD || !getWorker()) {
    return summarizeRecords(records)
  }

  try {
    await initializeWorker(records)
    const result = await requestWorker('summary', {})
    workerBackend = result.backend
    return result.summary
  } catch (error) {
    resetWorker(error)
    workerBackend = 'javascript'
    return summarizeRecords(records)
  }
}

export function getRecordEngineBackend() {
  return workerBackend
}

export function disposeRecordWorker() {
  resetWorker(new Error('Record worker was disposed.'))
}