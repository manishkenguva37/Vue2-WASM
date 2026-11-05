let wasm

async function init() {
  if (!wasm) {
    const mod = await import('../../wasm/processor/pkg/processor')
    await mod.default()
    wasm = mod
  }
}

self.onmessage = async e => {
  await init()
  
  if (e.data.type === 'processWithProgress') {
    // Process data in chunks and send progress
    const { data, chunkSize } = e.data
    const header = data[0] // Keep the header
    const records = data.slice(1) // Skip header
    
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize)
      const chunkData = [header, ...chunk]
      const result = wasm.process(chunkData)
      
      self.postMessage({
        type: 'progress',
        results: result,
        done: false
      })
    }
    
    // Signal completion
    self.postMessage({
      type: 'progress',
      results: [],
      done: true
    })
  } else {
    // Legacy processing (all at once)
    const result = wasm.process(e.data)
    self.postMessage(result)
  }
}