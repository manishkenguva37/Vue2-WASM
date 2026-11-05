import assert from 'node:assert/strict'
import test from 'node:test'
import { disposeRecordWorker, queryRecords } from './worker.client.js'

const workerInstances = []

class MockWorker {
  constructor() {
    this.messages = []
    this.terminated = false
    workerInstances.push(this)
  }

  postMessage(message) {
    this.messages.push(message)
    if (message.type === 'initialize') {
      queueMicrotask(() => this.onmessage({ data: { id: message.id, backend: 'wasm' } }))
      return
    }

    if (message.type === 'query') {
      const index = message.options.query === 'first' ? 1 : 2
      const delay = message.options.query === 'first' ? 10 : 0
      setTimeout(() => this.onmessage({
        data: { id: message.id, indices: Uint32Array.of(index), backend: 'wasm' }
      }), delay)
    }
  }

  terminate() {
    this.terminated = true
  }
}

test('correlates rapid worker queries and terminates the worker on dispose', async () => {
  globalThis.Worker = MockWorker
  const records = Array.from({ length: 10000 }, (_, index) => ({
    id: String(index), name: `Person ${index}`, bmi: 22, category: 'Normal', risk_level: 'Low'
  }))

  try {
    const firstQuery = queryRecords(records, { query: 'first' })
    const secondQuery = queryRecords(records, { query: 'second' })
    const [first, second] = await Promise.all([firstQuery, secondQuery])
    const worker = workerInstances.at(-1)

    assert.deepEqual([...first.indices], [1])
    assert.deepEqual([...second.indices], [2])
    assert.equal(worker.messages.filter(message => message.type === 'initialize').length, 1)
    assert.equal(worker.messages.filter(message => message.type === 'query').length, 2)
    assert.ok(worker.messages
      .filter(message => message.type === 'query')
      .every(message => !Object.hasOwn(message, 'records')))

    disposeRecordWorker()
    assert.equal(worker.terminated, true)
  } finally {
    delete globalThis.Worker
    disposeRecordWorker()
    workerInstances.length = 0
  }
})

test('uses the JavaScript engine when workers are unavailable', async () => {
  const records = [{ id: '1', name: 'Alex', bmi: 24, category: 'Normal', risk_level: 'Low' }]
  const result = await queryRecords(records, { query: 'alex' })
  assert.equal(result.backend, 'javascript')
  assert.deepEqual([...result.indices], [0])
})