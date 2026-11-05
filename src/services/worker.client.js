const worker = new Worker(
  new URL('../workers/wasm.worker.js', import.meta.url),
  { type: 'module' }
)

export function processInWorker(data) {
  return new Promise(resolve => {
    worker.onmessage = e => resolve(e.data)
    worker.postMessage(data)
  })
}

export function processInWorkerWithProgress(data, onProgress) {
  return new Promise(resolve => {
    worker.onmessage = e => {
      const { type, results, done } = e.data
      
      if (type === 'progress' && onProgress) {
        onProgress(results)
      }
      
      if (done) {
        resolve()
      }
    }
    
    // Send data with header info
    worker.postMessage({
      type: 'processWithProgress',
      data: data,
      chunkSize: 1000 // Process 1000 rows at a time
    })
  })
}