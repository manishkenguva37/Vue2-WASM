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