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
  const result = wasm.process(e.data)
  self.postMessage(result)
}