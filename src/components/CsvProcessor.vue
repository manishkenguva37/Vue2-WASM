<template>
  <div>
    <h2>CSV BMI Processor (Vue 2 + Worker + WASM)</h2>
    <input type="file" @change="load" />
    <p v-if="loading">Processing…</p>

    <table v-if="rows.length">
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>BMI</th>
        <th>Category</th>
        <th>Risk</th>
      </tr>

      <tr v-for="r in rows" :key="r.id">
        <td>{{ r.id }}</td>
        <td>{{ r.name }}</td>
        <td>{{ r.bmi.toFixed(1) }}</td>
        <td>{{ r.category }}</td>
        <td>{{ r.risk_level }}</td>
      </tr>
    </table>
  </div>
</template>

<script>
import { processInWorker } from '../services/worker.client'

export default {
  data() {
    return {
      loading: false,
      rows: []
    }
  },
  methods: {
    load(e) {
      const file = e.target.files[0]
      if (!file) return

      this.loading = true

      const reader = new FileReader()
      reader.onload = async () => {
        const data = reader.result
          .trim()
          .split('\n')
          .map(l => l.split(','))

        this.rows = await processInWorker(data)
        this.loading = false
      }

      reader.readAsText(file)
    }
  }
}
</script>