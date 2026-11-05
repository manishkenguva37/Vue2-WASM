const SEARCH_FIELDS = ['id', 'name', 'category', 'risk_level']

export function parseCsv(csvText, limit = Infinity) {
  return createCsvParser(limit).push(csvText, true).records
}

export function createCsvParser(limit = Infinity) {
  let row = []
  let field = ''
  let inQuotes = false
  let pendingQuote = false
  let headers
  let done = false
  const records = []

  const finishRow = () => {
    row.push(field.trim())
    field = ''
    if (!row.some(value => value !== '')) {
      row = []
      return
    }

    if (!headers) {
      headers = row.map((header, index) =>
        index === 0 ? header.replace(/^\uFEFF/, '') : header
      )
      const required = ['id', 'name', 'bmi', 'category', 'risk_level']
      if (required.some(name => !headers.includes(name))) {
        throw new Error('CSV must include id, name, bmi, category, and risk_level columns.')
      }
    } else if (row.length === headers.length && row.every((value, index) => value === headers[index])) {
      row = []
      return
    } else if (records.length < limit) {
      const value = name => row[headers.indexOf(name)] || ''
      records.push({
        id: value('id'),
        name: value('name'),
        bmi: Number(value('bmi')) || 0,
        category: value('category'),
        risk_level: value('risk_level')
      })
      if (records.length >= limit) done = true
    }

    row = []
  }

  return {
    records,
    push(text, final = false) {
      if (done) return { done, records }
      let index = 0

      if (pendingQuote) {
        if (text[index] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
        pendingQuote = false
      }

      for (; index < text.length && !done; index += 1) {
        const character = text[index]

        if (character === '"') {
          if (inQuotes && index === text.length - 1 && !final) {
            pendingQuote = true
          } else if (inQuotes && text[index + 1] === '"') {
            field += '"'
            index += 1
          } else {
            inQuotes = !inQuotes
          }
        } else if (character === ',' && !inQuotes) {
          row.push(field.trim())
          field = ''
        } else if (character === '\n' && !inQuotes) {
          finishRow()
        } else if (character !== '\r' || inQuotes) {
          field += character
        }
      }

      if (final && !done) {
        if (pendingQuote) {
          inQuotes = false
          pendingQuote = false
        }
        finishRow()
        done = true
      }

      return { done, records }
    }
  }
}

export async function parseCsvStream(stream, limit = Infinity) {
  const parser = createCsvParser(limit)
  const reader = stream.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { value, done } = await reader.read()
    const parsed = parser.push(done ? decoder.decode() : decoder.decode(value, { stream: true }), done)
    if (parsed.done) {
      if (!done) await reader.cancel()
      break
    }
    if (done) break
  }

  return parser.records
}

export function queryRecordIndices(records, options = {}) {
  const query = String(options.query || '').trim().toLocaleLowerCase()
  const category = options.category || ''
  const sortBy = options.sortBy || 'id'
  const descending = Boolean(options.descending)
  const indices = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (category && record.category !== category) continue
    if (query && !SEARCH_FIELDS.some(field =>
      String(record[field] ?? '').toLocaleLowerCase().includes(query)
    )) continue
    indices.push(index)
  }

  const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0
  indices.sort((leftIndex, rightIndex) => {
    const left = records[leftIndex]
    const right = records[rightIndex]
    const comparison = sortBy === 'bmi'
      ? left.bmi - right.bmi
      : compareText(String(left[sortBy] ?? ''), String(right[sortBy] ?? ''))
    const tieBreak = compareText(left.id, right.id)
    const result = comparison || tieBreak
    return descending ? -result : result
  })

  return Uint32Array.from(indices)
}

export function summarizeRecords(records) {
  const ids = new Set()
  let duplicateIds = 0
  let bmiTotal = 0

  for (const record of records) {
    if (ids.has(record.id)) duplicateIds += 1
    else ids.add(record.id)
    bmiTotal += record.bmi
  }

  return {
    count: records.length,
    averageBmi: records.length ? bmiTotal / records.length : 0,
    duplicateIds
  }
}