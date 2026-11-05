<template>
  <div>
    <h2>CSV BMI Processor (Vue 2 + Worker + WASM)</h2>
    <input type="file" @change="load" :disabled="loading" />
    
    <div v-if="loading" style="margin-top: 20px;">
      <p><strong>Processing…</strong></p>
      <div style="background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;">
        <div 
          style="background: #4CAF50; height: 24px; transition: width 0.3s; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;"
          :style="{ width: progress + '%' }"
        >
          {{ progress }}%
        </div>
      </div>
      <p style="margin-top: 10px; color: #666;">
        Processed: {{ processedCount.toLocaleString() }} / {{ totalCount.toLocaleString() }} records
      </p>
    </div>

    <div v-if="rows.length" class="virtualized-container">
      <!-- Header -->
      <div class="virtual-table-header">
        <div class="virtual-table-row">
          <div class="virtual-table-cell header-cell">ID</div>
          <div class="virtual-table-cell header-cell">Name</div>
          <div class="virtual-table-cell header-cell">BMI</div>
          <div class="virtual-table-cell header-cell">Category</div>
          <div class="virtual-table-cell header-cell">Risk</div>
        </div>
      </div>
      
      <!-- Scrollable content -->
      <div class="virtual-table-body" @scroll="onScroll">
        <!-- Spacer for scroll height -->
        <div :style="{ height: topSpacerHeight + 'px' }"></div>
        
        <!-- Visible rows -->
        <div 
          v-for="(r, idx) in visibleRows" 
          :key="r.id"
          :class="['virtual-table-row', { 'even-row': (startIndex + idx) % 2 === 0 }]"
        >
          <div class="virtual-table-cell">{{ r.id }}</div>
          <div class="virtual-table-cell">{{ r.name }}</div>
          <div class="virtual-table-cell">{{ r.bmi.toFixed(1) }}</div>
          <div class="virtual-table-cell">{{ r.category }}</div>
          <div class="virtual-table-cell">{{ r.risk_level }}</div>
        </div>
        
        <!-- Bottom spacer -->
        <div :style="{ height: bottomSpacerHeight + 'px' }"></div>
      </div>
    </div>
  </div>
</template>

<script>
import { processInWorkerWithProgress } from '../services/worker.client'

export default {
  data() {
    return {
      loading: false,
      rows: [],
      progress: 0,
      processedCount: 0,
      totalCount: 0,
      scrollTop: 0,
      rowHeight: 40,           // Height of each row in pixels
      containerHeight: 600,    // Height of visible container in pixels
      rowBuffer: 10            // Buffer rows above/below the viewport
    }
  },
  computed: {
    firstVisibleIndex() {
      // Top-most row shown in the viewport
      return Math.max(0, Math.floor(this.scrollTop / this.rowHeight))
    },
    startIndex() {
      return Math.max(0, this.firstVisibleIndex - this.rowBuffer)
    },
    endIndex() {
      const visibleCount = Math.ceil(this.containerHeight / this.rowHeight)
      return Math.min(
        this.rows.length,
        this.firstVisibleIndex + visibleCount + this.rowBuffer
      )
    },
    visibleRows() {
      // Return visible rows plus a buffer above and below
      return this.rows.slice(this.startIndex, this.endIndex)
    },
    topSpacerHeight() {
      // Height of the spacer above visible rows
      return this.startIndex * this.rowHeight
    },
    bottomSpacerHeight() {
      // Height of the spacer below visible rows
      return Math.max(0, (this.rows.length - this.endIndex) * this.rowHeight)
    }
  },
  methods: {
    onScroll(e) {
      // Track scroll position
      this.scrollTop = e.target.scrollTop
    },
    load(e) {
      const file = e.target.files[0]
      if (!file) return

      this.loading = true
      this.rows = []
      this.progress = 0
      this.processedCount = 0
      this.totalCount = 0
      this.scrollTop = 0

      const reader = new FileReader()
      reader.onload = async () => {
        const data = reader.result
          .trim()
          .split('\n')
          .map(l => l.split(','))

        // Total records (minus header)
        this.totalCount = data.length - 1

        await processInWorkerWithProgress(
          data,
          (results) => {
            // Add new results to the table
            this.rows.push(...results)
            this.processedCount = Math.min(this.rows.length, this.totalCount)
            this.progress = Math.round((this.processedCount / this.totalCount) * 100)
          }
        )
        
        this.loading = false
        this.progress = 100
      }

      reader.readAsText(file)
    }
  }
}
</script>

<style scoped>
.virtualized-container {
  margin-top: 20px;
}

.virtual-table-header {
  display: flex;
  border: 1px solid #ccc;
  border-bottom: none;
  background: #f5f5f5;
}

.virtual-table-body {
  height: 600px;
  overflow-y: auto;
  border: 1px solid #ccc;
  border-top: none;
}

.virtual-table-row {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
}

.header-cell,
.virtual-table-cell {
  flex: 1;
  padding: 8px;
  border-bottom: 1px solid #eee;
  box-sizing: border-box;
}

.header-cell {
  font-weight: bold;
}

.virtual-table-row.even-row {
  background: #fafafa;
}

.virtual-table-row:not(.header-row) .virtual-table-cell {
  border-right: 1px solid #eee;
}

.virtual-table-row:not(.header-row) .virtual-table-cell:last-child {
  border-right: none;
}
</style>