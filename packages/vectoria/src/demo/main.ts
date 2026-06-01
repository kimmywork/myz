import { HybridSearchEngine } from "../lib/hybrid-search"
import { VectorStore } from "../lib/db"
import { OpenAIEmbedder } from "../lib/openai-embedder"

let engine: HybridSearchEngine | null = null

// DOM Elements
const providerSelect = document.getElementById("provider") as HTMLSelectElement
const endpointInput = document.getElementById("endpoint") as HTMLInputElement
const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement
const modelInput = document.getElementById("model") as HTMLInputElement
const thresholdInput = document.getElementById("threshold") as HTMLInputElement
const initBtn = document.getElementById("initBtn") as HTMLButtonElement
const statusSpan = document.getElementById("status") as HTMLSpanElement
const docTextInput = document.getElementById("docText") as HTMLTextAreaElement
const docTagsInput = document.getElementById("docTags") as HTMLInputElement
const queryInput = document.getElementById("query") as HTMLInputElement
const topKInput = document.getElementById("topK") as HTMLInputElement
const resultsDiv = document.getElementById("results") as HTMLDivElement
const logDiv = document.getElementById("log") as HTMLDivElement
const docCountSpan = document.getElementById("docCount") as HTMLSpanElement
const hnswNodesSpan = document.getElementById("hnswNodes") as HTMLSpanElement
const bm25TermsSpan = document.getElementById("bm25Terms") as HTMLSpanElement

// Logging
function log(message: string, type: "info" | "success" | "error" | "warn" = "info") {
  const entry = document.createElement("div")
  entry.className = type
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`
  logDiv.appendChild(entry)
  logDiv.scrollTop = logDiv.scrollHeight
}

// Update stats
function updateStats() {
  if (!engine) return
  const stats = engine.getStats()
  docCountSpan.textContent = stats.bm25Docs.toString()
  hnswNodesSpan.textContent = stats.vectorNodes.toString()
  bm25TermsSpan.textContent = stats.bm25Terms.toString()
}

// Set status
function setStatus(text: string, type: "ready" | "loading" | "error") {
  statusSpan.textContent = text
  statusSpan.className = `status ${type}`
}

// Initialize provider config based on selection
providerSelect.addEventListener("change", () => {
  if (providerSelect.value === "ollama") {
    endpointInput.value = "http://127.0.0.1:11434/v1"
    apiKeyInput.value = "ollama"
    modelInput.value = "hf.co/jinaai/jina-embeddings-v4-text-retrieval-GGUF:Q4_K_M"
  } else {
    endpointInput.value = "https://api.openai.com/v1"
    apiKeyInput.value = ""
    modelInput.value = "text-embedding-3-small"
  }
})

// Initialize engine
async function initEngine() {
  const endpoint = endpointInput.value.trim()
  const apiKey = apiKeyInput.value.trim()
  const model = modelInput.value.trim()

  if (!endpoint || !apiKey || !model) {
    log("Please fill in all configuration fields", "error")
    return
  }

  initBtn.disabled = true
  setStatus("Initializing...", "loading")
  log("Initializing engine...")

  try {
    const embedder = new OpenAIEmbedder({
      apiKey,
      endpoint,
      modelName: model,
    })

    const db = new VectorStore("vectoria-demo-db", "demo-store")
    engine = new HybridSearchEngine(db, embedder, {
      denseThreshold: parseFloat(thresholdInput.value) || 0.5,
      sparseThreshold: (parseFloat(thresholdInput.value) || 0.5) * 0.6,
      topK: parseInt(topKInput.value) || 5,
    })

    await engine.init()
    updateStats()
    setStatus("Ready", "ready")
    log("Engine initialized successfully!", "success")
  } catch (error) {
    log(`Failed to initialize: ${error}`, "error")
    setStatus("Error", "error")
  } finally {
    initBtn.disabled = false
  }
}

// Make initEngine globally accessible
(window as any).initEngine = initEngine

// Add document
async function addDocument() {
  if (!engine) {
    log("Please initialize the engine first", "error")
    return
  }

  const text = docTextInput.value.trim()
  if (!text) {
    log("Please enter document text", "error")
    return
  }

  const tags = docTagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

  try {
    const doc = await engine.addDocument(text, { tags }, tags)
    log(`Added document: ${doc.id}`, "success")
    docTextInput.value = ""
    docTagsInput.value = ""
    updateStats()
  } catch (error) {
    log(`Failed to add document: ${error}`, "error")
  }
}

// Make addDocument globally accessible
(window as any).addDocument = addDocument

// Add sample documents
async function addSampleDocs() {
  if (!engine) {
    log("Please initialize the engine first", "error")
    return
  }

  const samples = [
    {
      text: "DynamoDB is a fast NoSQL database service by Amazon Web Services for applications that need consistent, single-digit millisecond latency at any scale.",
      tags: ["database", "nosql", "aws"],
    },
    {
      text: "Raft is a consensus algorithm for managing a replicated log. It is designed to be easier to understand than Paxos.",
      tags: ["consensus", "distributed", "algorithm"],
    },
    {
      text: "Paxos is a family of protocols for solving consensus in a network of unreliable processors.",
      tags: ["consensus", "distributed", "protocol"],
    },
    {
      text: "Machine learning is a subset of artificial intelligence that provides systems the ability to automatically learn and improve from experience.",
      tags: ["ai", "machine-learning"],
    },
    {
      text: "Deep learning is part of a broader family of machine learning methods based on artificial neural networks with representation learning.",
      tags: ["ai", "deep-learning", "neural-networks"],
    },
    {
      text: "The Transformer is a deep learning model introduced in 2017, used primarily in the field of natural language processing.",
      tags: ["ai", "transformer", "nlp"],
    },
    {
      text: "Spring Boot is a framework that makes it easy to create stand-alone, production-grade Spring based Applications.",
      tags: ["java", "framework", "spring"],
    },
    {
      text: "React is a JavaScript library for building user interfaces. It is maintained by Meta and a community of individual developers.",
      tags: ["javascript", "frontend", "react"],
    },
    {
      text: "Kubernetes is an open-source container orchestration system for automating software deployment, scaling, and management.",
      tags: ["devops", "containers", "kubernetes"],
    },
    {
      text: "PostgreSQL is a free and open-source relational database management system emphasizing extensibility and SQL compliance.",
      tags: ["database", "sql", "postgresql"],
    },
  ]

  log(`Adding ${samples.length} sample documents...`)

  try {
    await engine.addDocuments(
      samples.map((s) => ({
        text: s.text,
        metadata: { tags: s.tags },
        tags: s.tags,
      }))
    )
    log(`Added ${samples.length} documents successfully!`, "success")
    updateStats()
  } catch (error) {
    log(`Failed to add documents: ${error}`, "error")
  }
}

// Make addSampleDocs globally accessible
(window as any).addSampleDocs = addSampleDocs

// Search
async function search() {
  if (!engine) {
    log("Please initialize the engine first", "error")
    return
  }

  const query = queryInput.value.trim()
  if (!query) {
    log("Please enter a search query", "error")
    return
  }

  const topK = parseInt(topKInput.value) || 5

  log(`Searching for: "${query}" (topK=${topK})`)

  try {
    const results = await engine.search(query, { topK })

    if (results.length === 0) {
      resultsDiv.innerHTML = `
        <p style="color: #666; text-align: center; padding: 2rem;">
          No results found.
        </p>
      `
      log("No results found", "warn")
      return
    }

    log(`Found ${results.length} results`, "success")

    resultsDiv.innerHTML = results
      .map(
        (r, i) => `
        <div class="result-item">
          <div class="score">
            #${i + 1} - Score: ${r.finalScore.toFixed(4)}
            (Dense: ${r.denseScore.toFixed(4)}, Sparse: ${r.sparseScore.toFixed(4)}, RRF: ${r.rrfScore.toFixed(4)})
          </div>
          <div class="text">${r.doc.text}</div>
          <div class="metadata">
            ${r.doc.metadata?.tags ? `Tags: ${r.doc.metadata.tags.join(", ")}` : ""}
            ${r.doc.metadata?.title ? ` | Title: ${r.doc.metadata.title}` : ""}
          </div>
        </div>
      `
      )
      .join("")
  } catch (error) {
    log(`Search failed: ${error}`, "error")
  }
}

// Make search globally accessible
(window as any).search = search

// Clear index
async function clearIndex() {
  if (!engine) {
    log("Please initialize the engine first", "error")
    return
  }

  try {
    await engine.clear()
    updateStats()
    resultsDiv.innerHTML = `
      <p style="color: #666; text-align: center; padding: 2rem;">
        No results yet. Add documents and search.
      </p>
    `
    log("Index cleared", "success")
  } catch (error) {
    log(`Failed to clear index: ${error}`, "error")
  }
}

// Make clearIndex globally accessible
(window as any).clearIndex = clearIndex

// Handle Enter key in search input
queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    search()
  }
})

// Log initial state
log("Vectoria Demo loaded. Configure and initialize the engine to start.")
