import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import init, { RecordEngine } from '../wasm/processor/pkg/processor.js'
import { queryRecordIndices } from '../src/services/records.engine.mjs'

const wasmBytes = fs.readFileSync(new URL('../wasm/processor/pkg/processor_bg.wasm', import.meta.url))
const wasmInitStarted = performance.now()
await init(wasmBytes)
console.log(`WASM module initialization: ${(performance.now() - wasmInitStarted).toFixed(3)} ms`)

function median(values) {
  return values.sort((left, right) => left - right)[Math.floor(values.length / 2)]
}

for (const size of [143, 1000, 10000]) {
  const records = Array.from({ length: size }, (_, index) => ({
    id: String(index + 1),
    name: `Person ${index + 1}`,
    bmi: 18 + index % 20,
    category: index % 4 ? 'Normal' : 'Overweight',
    risk_level: index % 4 ? 'Low' : 'Moderate'
  }))
  structuredClone(records)
  const cloneTimes = []
  for (let round = 0; round < 11; round += 1) {
    const cloneStarted = performance.now()
    structuredClone(records)
    cloneTimes.push(performance.now() - cloneStarted)
  }
  const cloneMs = median(cloneTimes)
  const serializedBytes = Buffer.byteLength(JSON.stringify(records))
  const engineStarted = performance.now()
  const wasmEngine = new RecordEngine(records)
  const engineInitMs = performance.now() - engineStarted
  const options = { query: 'person 1', category: 'Normal', sortBy: 'bmi', descending: true }
  const roundCount = size === 143 ? 101 : size === 1000 ? 51 : 21
  const javascriptTimes = []
  const wasmTimes = []

  queryRecordIndices(records, options)
  wasmEngine.query(options.query, options.category, options.sortBy, options.descending)
  for (let round = 0; round < roundCount; round += 1) {
    let started = performance.now()
    queryRecordIndices(records, options)
    javascriptTimes.push(performance.now() - started)
    started = performance.now()
    wasmEngine.query(options.query, options.category, options.sortBy, options.descending)
    wasmTimes.push(performance.now() - started)
  }

  console.log(
    `${size} rows: JS query ${median(javascriptTimes).toFixed(3)} ms; ` +
    `WASM query ${median(wasmTimes).toFixed(3)} ms; ` +
    `WASM record/index initialization ${engineInitMs.toFixed(3)} ms; ` +
    `structured clone ${cloneMs.toFixed(3)} ms; JSON size ${serializedBytes} bytes`
  )
}