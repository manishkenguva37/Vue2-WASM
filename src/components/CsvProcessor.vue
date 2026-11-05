<template>
  <main class="record-app">
    <header class="app-header">
      <div>
        <p class="eyebrow">BMI DATASET</p>
        <h1>Record Explorer</h1>
      </div>
      <label class="upload-control">
        <span>Open CSV</span>
        <input type="file" accept=".csv,text/csv" @change="load" :disabled="loading" />
      </label>
    </header>

    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <p v-if="loading" class="loading-message" role="status">Loading and indexing records…</p>

    <section v-if="rows.length" class="workspace" aria-label="Record explorer">
      <div class="toolbar">
        <label class="search-control">
          <span>Search records</span>
          <input v-model="searchQuery" type="search" placeholder="Name, ID, category, risk" />
        </label>
        <label>
          <span>Category</span>
          <select v-model="selectedCategory">
            <option value="">All categories</option>
            <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
          </select>
        </label>
        <label>
          <span>Sort by</span>
          <select v-model="sortBy">
            <option value="id">ID</option>
            <option value="name">Name</option>
            <option value="bmi">BMI</option>
            <option value="category">Category</option>
          </select>
        </label>
        <button class="direction-control" type="button" @click="descending = !descending">
          {{ descending ? 'Descending' : 'Ascending' }}
        </button>
      </div>

      <div class="summary" aria-live="polite">
        <span><strong>{{ summary.count.toLocaleString() }}</strong> records</span>
        <span><strong>{{ visibleIndices.length.toLocaleString() }}</strong> shown</span>
        <span>Average BMI <strong>{{ summary.averageBmi.toFixed(1) }}</strong></span>
        <span><strong>{{ summary.duplicateIds.toLocaleString() }}</strong> duplicate IDs</span>
        <span class="engine-label">{{ backendLabel }}</span>
      </div>

      <div class="virtualized-container">
        <div class="virtual-table-header">
        <div class="virtual-table-row">
          <div class="virtual-table-cell header-cell">ID</div>
          <div class="virtual-table-cell header-cell">Name</div>
          <div class="virtual-table-cell header-cell">BMI</div>
          <div class="virtual-table-cell header-cell">Category</div>
          <div class="virtual-table-cell header-cell">Risk</div>
        </div>
      </div>

      <div class="virtual-table-body" @scroll="onScroll">
        <div :style="{ height: topSpacerHeight + 'px' }"></div>
        <div 
          v-for="(r, idx) in visibleRows" 
          :key="startIndex + idx"
          :class="['virtual-table-row', { 'even-row': (startIndex + idx) % 2 === 0 }]"
        >
          <div class="virtual-table-cell">{{ r.id }}</div>
          <div class="virtual-table-cell">{{ r.name }}</div>
          <div class="virtual-table-cell">{{ r.bmi.toFixed(1) }}</div>
          <div class="virtual-table-cell">{{ r.category }}</div>
          <div class="virtual-table-cell">{{ r.risk_level }}</div>
        </div>
        <div :style="{ height: bottomSpacerHeight + 'px' }"></div>
      </div>
      <p v-if="visibleIndices.length === 0" class="empty-state">No records match these filters.</p>
    </div>
    </section>
  </main>
</template>

<script>
import {
  disposeRecordWorker,
  getRecordEngineBackend,
  loadCsvFile,
  loadCsvUrl,
  queryRecords,
  summarizeRecordsWithWorker
} from '../services/worker.client'
import sampleCsvUrl from '../../sample.csv?url'

const defaultCsvUrl = import.meta.env.VITE_RECORDS_API_URL || sampleCsvUrl

export default {
  mounted() {
    this.loadSample()
  },
  data() {
    return {
      loading: false,
      error: '',
      rows: [],
      categories: [],
      visibleIndices: new Uint32Array(0),
      summary: { count: 0, averageBmi: 0, duplicateIds: 0 },
      searchQuery: '',
      selectedCategory: '',
      sortBy: 'id',
      descending: false,
      backend: 'javascript',
      loadVersion: 0,
      queryVersion: 0,
      scrollTop: 0,
      rowHeight: 40,
      containerHeight: 600,
      rowBuffer: 10
    }
  },
  beforeDestroy() {
    this.loadVersion += 1
    this.queryVersion += 1
    disposeRecordWorker()
  },
  computed: {
    firstVisibleIndex() {
      return Math.max(0, Math.floor(this.scrollTop / this.rowHeight))
    },
    startIndex() {
      return Math.max(0, this.firstVisibleIndex - this.rowBuffer)
    },
    endIndex() {
      const visibleCount = Math.ceil(this.containerHeight / this.rowHeight)
      return Math.min(
        this.visibleIndices.length,
        this.firstVisibleIndex + visibleCount + this.rowBuffer
      )
    },
    visibleRows() {
      const indices = this.visibleIndices.subarray(this.startIndex, this.endIndex)
      return Array.from(indices, index => this.rows[index])
    },
    topSpacerHeight() {
      return this.startIndex * this.rowHeight
    },
    bottomSpacerHeight() {
      return Math.max(0, (this.visibleIndices.length - this.endIndex) * this.rowHeight)
    },
    backendLabel() {
      return this.backend === 'wasm' ? 'WASM worker' : 'JavaScript'
    }
  },
  watch: {
    searchQuery() {
      this.updateQuery()
    },
    selectedCategory() {
      this.updateQuery()
    },
    sortBy() {
      this.updateQuery()
    },
    descending() {
      this.updateQuery()
    }
  },
  methods: {
    onScroll(e) {
      this.scrollTop = e.target.scrollTop
    },
    async loadSample() {
      const version = ++this.loadVersion
      this.queryVersion += 1
      this.loading = true
      this.error = ''

      try {
        const loaded = await loadCsvUrl(defaultCsvUrl)
        if (version === this.loadVersion) await this.processRecords(loaded, version)
      } catch (error) {
        if (version === this.loadVersion) {
          this.error = `Could not load sample.csv: ${error.message}`
          this.loading = false
        }
      }
    },
    load(e) {
      const file = e.target.files[0]
      if (!file) return

      const version = ++this.loadVersion
      this.queryVersion += 1
      this.loading = true
      this.error = ''
      this.processFile(file, version)
    },
    async processFile(file, version) {
      this.loading = true
      this.error = ''
      try {
        const loaded = await loadCsvFile(file)
        if (version === this.loadVersion) await this.processRecords(loaded, version)
      } catch (error) {
        if (version === this.loadVersion) {
          this.error = `Could not read ${file.name}: ${error.message}`
          this.loading = false
        }
      }
    },
    async processRecords(loaded, version) {
      if (version !== this.loadVersion) return
      this.queryVersion += 1
      this.rows = Object.freeze([])
      this.visibleIndices = new Uint32Array(0)
      this.summary = { count: 0, averageBmi: 0, duplicateIds: 0 }
      this.scrollTop = 0

      try {
        this.rows = Object.freeze(loaded.records)
        this.categories = loaded.categories || [...new Set(loaded.records.map(record => record.category).filter(Boolean))].sort()
        this.backend = loaded.backend
        const summary = await summarizeRecordsWithWorker(this.rows)
        if (version !== this.loadVersion) return
        this.summary = summary
        await this.updateQuery()
      } catch (error) {
        if (version === this.loadVersion) this.error = `Could not process CSV: ${error.message}`
      } finally {
        if (version === this.loadVersion) this.loading = false
      }
    },
    async updateQuery() {
      if (!this.rows.length) return
      const version = ++this.queryVersion
      const options = {
        query: this.searchQuery,
        category: this.selectedCategory,
        sortBy: this.sortBy,
        descending: this.descending
      }

      try {
        const records = this.rows
        const result = await queryRecords(records, options)
        if (version !== this.queryVersion || records !== this.rows) return
        this.visibleIndices = result.indices
        this.backend = result.backend || getRecordEngineBackend()
        this.scrollTop = 0
        const body = this.$el.querySelector('.virtual-table-body')
        if (body) body.scrollTop = 0
      } catch (error) {
        this.error = `Could not update records: ${error.message}`
      }
    }
  }
}
</script>

<style scoped>
.record-app {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 24px;
  color: #202a30;
  font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif;
}

.app-header,
.toolbar,
.summary {
  display: flex;
  align-items: end;
  gap: 16px;
}

.app-header {
  justify-content: space-between;
  padding-bottom: 20px;
  border-bottom: 2px solid #1f7771;
}

.eyebrow {
  margin: 0 0 4px;
  color: #1f7771;
  font-size: 12px;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 30px;
  font-weight: 500;
}

.upload-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  overflow: hidden;
  border: 1px solid #1f7771;
  color: #155e59;
  cursor: pointer;
  font-weight: 600;
}

.upload-control input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
}

.toolbar {
  flex-wrap: wrap;
  padding: 18px 0 14px;
  align-items: end;
}

.toolbar label {
  display: grid;
  gap: 6px;
  color: #536168;
  font-size: 12px;
  font-weight: 600;
}

.toolbar .search-control {
  flex: 1 1 280px;
}

.toolbar input,
.toolbar select {
  min-width: 150px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid #b8c2c2;
  border-radius: 3px;
  background: white;
  color: #202a30;
  font: inherit;
}

.toolbar .search-control input {
  width: 100%;
  box-sizing: border-box;
}

.direction-control {
  height: 38px;
  padding: 0 12px;
  border: 1px solid #b8c2c2;
  border-radius: 3px;
  background: #f4f6f4;
  color: #202a30;
  cursor: pointer;
}

.summary {
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 24px;
  min-height: 42px;
  padding: 0 2px;
  border-top: 1px solid #d8dfdd;
  border-bottom: 1px solid #d8dfdd;
  color: #536168;
  font-size: 13px;
}

.summary strong {
  color: #202a30;
}

.engine-label {
  margin-left: auto;
  color: #1f7771;
  font-weight: 700;
}

.error-message {
  color: #a52a2a;
}

.loading-message,
.empty-state {
  padding: 14px 0;
  color: #536168;
}

.virtualized-container {
  margin-top: 12px;
}

.virtual-table-header {
  display: flex;
  border: 1px solid #ccc;
  border-bottom: none;
  background: #eaf1ef;
}

.virtual-table-body {
  height: min(600px, 70vh);
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
  background: #f5f7f6;
}

.virtual-table-row:not(.header-row) .virtual-table-cell {
  border-right: 1px solid #eee;
}

.virtual-table-row:not(.header-row) .virtual-table-cell:last-child {
  border-right: none;
}

@media (max-width: 640px) {
  .record-app {
    padding: 18px 12px;
  }

  .app-header {
    align-items: start;
    gap: 12px;
  }

  h1 {
    font-size: 25px;
  }

  .virtual-table-cell {
    padding: 8px 5px;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .engine-label {
    margin-left: 0;
  }
}
</style>