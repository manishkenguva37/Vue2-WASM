const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { once } = require('node:events')

const rowCount = Number(process.argv[2] || 1_000_000)
const inputPath = path.resolve(process.argv[3] || 'sample.csv')
const outputPath = path.resolve(process.argv[4] || `sample-${rowCount}.csv`)

if (!Number.isSafeInteger(rowCount) || rowCount < 1) {
  console.error('Row count must be a positive integer.')
  process.exit(1)
}

if (inputPath === outputPath) {
  console.error('Input and output paths must be different.')
  process.exit(1)
}

async function generateCsv() {
  const input = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity
  })
  const output = fs.createWriteStream(outputPath)
  let header
  let written = 0

  for await (const line of input) {
    if (header === undefined) {
      header = line
      if (!output.write(`${header}\n`)) await once(output, 'drain')
      continue
    }

    if (written === rowCount) break
    if (!output.write(`${line}\n`)) await once(output, 'drain')
    written += 1
  }

  output.end()
  await once(output, 'finish')

  if (written !== rowCount) {
    fs.unlinkSync(outputPath)
    throw new Error(`Input contains only ${written} records; requested ${rowCount}.`)
  }

  console.log(`Copied ${written.toLocaleString()} records from ${inputPath} to ${outputPath}`)
}

generateCsv().catch(error => {
  console.error(`Could not generate CSV: ${error.message}`)
  process.exitCode = 1
})