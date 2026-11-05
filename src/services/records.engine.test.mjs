import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCsv, parseCsvStream, queryRecordIndices, summarizeRecords } from './records.engine.mjs'

test('parses quoted CSV values and required display fields', () => {
  const records = parseCsv('id,name,bmi,category,risk_level\n1,"Lee, Alex",24.2,Normal,Low\n')
  assert.deepEqual(records, [{ id: '1', name: 'Lee, Alex', bmi: 24.2, category: 'Normal', risk_level: 'Low' }])
})

test('parses quoted fields across stream chunks and stops at the requested limit', async () => {
  const chunks = ['id,name,bmi,category,risk_level\n1,"Lee, ', 'Alex",24.2,Normal,Low\n2,Sam,30,Obese,High\n']
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(new TextEncoder().encode(chunk)))
      controller.close()
    }
  })
  assert.deepEqual(await parseCsvStream(stream, 1), [
    { id: '1', name: 'Lee, Alex', bmi: 24.2, category: 'Normal', risk_level: 'Low' }
  ])
})

test('skips repeated headers in concatenated CSV exports', () => {
  const records = parseCsv('id,name,bmi,category,risk_level\n1,Alex,22,Normal,Low\nid,name,bmi,category,risk_level\n2,Sam,30,Obese,High\n')
  assert.deepEqual(records.map(record => record.id), ['1', '2'])
})

test('searches across fields, filters category, and sorts', () => {
  const records = [
    { id: '2', name: 'Sam Lee', bmi: 30, category: 'Obese', risk_level: 'High' },
    { id: '1', name: 'Alex Kim', bmi: 22, category: 'Normal', risk_level: 'Low' },
    { id: '3', name: 'Alex Park', bmi: 24, category: 'Normal', risk_level: 'Low' }
  ]
  assert.deepEqual(
    [...queryRecordIndices(records, { query: 'alex', category: 'Normal', sortBy: 'bmi', descending: true })],
    [2, 1]
  )
  assert.deepEqual([...queryRecordIndices(records, { query: 'high' })], [0])
})

test('handles empty datasets and duplicate IDs', () => {
  assert.deepEqual(summarizeRecords([]), { count: 0, averageBmi: 0, duplicateIds: 0 })
  assert.equal(summarizeRecords([
    { id: '1', bmi: 20 },
    { id: '1', bmi: 22 }
  ]).duplicateIds, 1)
  assert.equal(queryRecordIndices([], {}).length, 0)
})

test('searches and sorts the requested scalability sizes', () => {
  for (const size of [143, 1000, 10000]) {
    const records = Array.from({ length: size }, (_, index) => ({
      id: String(index + 1),
      name: `Person ${index + 1}`,
      bmi: 18 + index % 20,
      category: 'Normal',
      risk_level: 'Low'
    }))
    assert.equal(queryRecordIndices(records, { query: 'person 1', sortBy: 'name' }).length > 0, true)
    assert.equal(queryRecordIndices(records, { category: 'Missing' }).length, 0)
  }
})