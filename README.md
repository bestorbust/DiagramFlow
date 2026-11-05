# DiagramFlow

**A Vision-Grounded Framework for Automated Software Architecture Compliance & Remediation**

DiagramFlow deterministically reconciles software architecture diagram images against written system specifications. It uses classical computer vision (Fully Optical Computer Vision — FOCV) to extract visual topologies without spatial hallucination, and stateful Large Language Models (LangGraph) to extract and ground formal requirements with exact verbatim citations.

---

## 1. System Architecture

```
[ Architecture Diagram Image ]                 [ Written Requirements Specification ]
              │                                                   │
   (FOCV Computer Vision)                                (LangGraph Requirements)
              ▼                                                   ▼
┌───────────────────────────┐                       ┌───────────────────────────┐
│ Visual Evidence Graph     │                       │ Requirements Graph        │
│ G_V = (V_V, E_V, C_V, U_V)│                       │ G_R = (V_R, E_R, Z_R, K)  │
└─────────────┬─────────────┘                       └─────────────┬─────────────┘
              │                                                   │
              └─────────────────────► ◄───────────────────────────┘
                                       │
                      ┌────────────────┴────────────────┐
                      │   Bipartite Graph Diff Engine   │
                      │  (Missing, Zombie, Inverted)    │
                      └────────────────┬────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Hybrid Target    │         │ Requirements-    │         │ Grounded RAG     │
│ Remediation View │         │ Only Reference   │         │ Conversational   │
│ (Mermaid Graph)  │         │ (Mermaid Graph)  │         │ Assistant        │
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

---

## 2. Prerequisites & Quickstart

### Prerequisites
- **Python 3.10 – 3.12**
- **Node.js 18 – 22** & **npm**
- **Tesseract OCR (v5.0+)** installed and on system PATH (or at `C:\Program Files\Tesseract-OCR\tesseract.exe`).

### One-Time Environment Setup
```bash
# 1. Create and activate a Python virtual environment
python -m venv .venv
# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# On Linux / macOS:
source .venv/bin/activate

# 2. Install backend, CV, and LLM dependencies
pip install -r requirements.txt

# 3. Configure API keys
cp .env.example .env
# Edit .env and supply your OPENROUTER_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY

# 4. Install frontend dependencies and build the UI bundle
cd frontend
npm install
npm run build
cd ..
```

---

## 3. How to Run: Combined vs. Separate Subsystems

DiagramFlow is fully modular. You can run all services combined in a single process, or execute each subsystem (Computer Vision, LLM, Backend API, Frontend) completely independently.

---

### Option A: All-in-One Combined System (Recommended)

Starts the unified application serving the React UI, REST API, and interactive Swagger documentation on a single port:

```bash
python run_all.py
```

- **Web Application:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive OpenAPI Documentation:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **API Health Check:** [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

---

### Option B: Standalone Computer Vision (FOCV) Engine

Run the computer vision engine directly on any architecture diagram image (PNG, JPEG, WebP) without starting web services or requiring LLM API keys:

```bash
# Process a single diagram image
python cv/run_focv.py --input path/to/diagram.png --output-dir outputs/

# Process an entire folder of diagrams in batch mode
python cv/run_focv.py --input path/to/diagrams_folder/ --output-dir outputs/ --batch
```

**Outputs generated in `outputs/`:**
1. `*_architecture.json`: Semantic graph (components, recognized labels, classified shapes, connector paths, and arrow directions).
2. `*_evidence.json`: Pixel-grounded evidence (exact bounding boxes $[x,y,w,h]$, contour geometries, OCR confidence scores, and uncertainty records $U_V$).
3. `*_overlay.png`: Visual overlay highlighting detected components (green boxes) and skeletonized connector trajectories (red lines with yellow arrows).

---

### Option C: Standalone LLM Engine (Audit & Chat)

Execute the requirements extraction, bipartite graph differencing, and conversational agent independently:

```bash
# 1. Run full LangGraph discrepancy audit and Mermaid target synthesis
python llm/run_audit.py --arch outputs/diagram_architecture.json --req path/to/requirements.txt --output llm/audit_reports/

# 2. Launch interactive grounded architecture chat CLI
python llm/chat_cli.py --arch outputs/diagram_architecture.json --req path/to/requirements.txt
```

---

### Option D: Standalone Backend API

Run the FastAPI backend service independently with hot-reloading:

```bash
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```
- **API Base URL:** `http://127.0.0.1:8000`
- **Swagger Documentation:** `http://127.0.0.1:8000/docs`
- **ReDoc:** `http://127.0.0.1:8000/redoc`

---

### Option E: Standalone Frontend Development Server

Run the React + Vite frontend with Hot Module Replacement (HMR). API requests are automatically reverse-proxied to `:8000`:

```bash
cd frontend
npm run dev
```
- **Vite Dev Server:** [http://localhost:5173](http://localhost:5173)

---

## 4. Docker Deployment

A multi-stage Dockerfile packages the pre-built React frontend, Python backend, and Tesseract OCR into a production-ready container:

```bash
# Build Docker image
docker build -t diagramflow .

# Run container
docker run --env-file .env -e DIAGRAMFLOW_ENV=production -e DIAGRAMFLOW_HOST=0.0.0.0 -p 8000:8000 -v diagramflow-data:/app/data -v diagramflow-artifacts:/app/backend/static diagramflow
```

---

## 5. Repository Structure

```
DiagramFlow/
├── backend/                  # FastAPI backend service
│   ├── app.py                # REST endpoints, authentication & static mounting
│   ├── pipeline_runner.py    # Concurrent CV + LLM execution coordinator
│   ├── database.py           # SQLite database with Write-Ahead Logging (WAL)
│   ├── auth.py               # JWT authentication & PBKDF2 password hashing
│   ├── document_parser.py    # Universal document extractor (PDF, DOCX, MD, TXT, JSON, YAML)
│   └── settings.py           # Configuration parameters & environment variables
│
├── cv/                       # Standalone Computer Vision (FOCV) engine
│   ├── src/                  # Core vision pipeline modules
│   │   ├── pipeline.py       # Parallel multi-pass CV orchestrator
│   │   ├── ocr_engine.py     # Hybrid CLAHE + Multi-PSM OCR ensemble
│   │   ├── shape_detector.py # Douglas-Peucker polygon approximation & contours
│   │   ├── connector_tracer.py # Zhang-Suen skeletonization & arrowhead vectors
│   │   ├── graph_builder.py  # Graph serialization for architecture & evidence
│   │   └── preprocessing.py  # Background polarity normalization & bilateral filters
│   └── run_focv.py           # Standalone CV CLI runner
│
├── llm/                      # Standalone LLM & LangGraph engine
│   ├── graph/                # LangGraph state machine & bipartite differencing
│   │   ├── workflow.py       # Stateful requirements audit execution graph
│   │   ├── grounding.py      # Strict verbatim citation verification
│   │   └── nodes.py          # LLM extraction & synthesis nodes
│   ├── providers/            # Multi-model gateway with client-side failover
│   │   └── llm_factory.py    # 12-tier OpenRouter fallback chain & Groq fallback
│   ├── rag/                  # Grounded retrieval-augmented generation
│   │   ├── chatbot.py        # Conversational architecture expert agent
│   │   └── retriever.py      # BM25 + vector similarity evidence retriever
│   ├── prompts/              # Strict structured system prompts
│   ├── run_audit.py          # Standalone LLM audit runner CLI
│   └── chat_cli.py           # Standalone grounded architecture chat CLI
│
├── frontend/                 # React 18 + Tailwind CSS Vite web application
│   ├── src/                  # UI components, icons & state hooks
│   ├── package.json          # Frontend dependencies & scripts
│   └── vite.config.js        # Vite build & reverse-proxy configuration
│
├── data/                     # Application database storage (SQLite WAL)
├── run_all.py                # Unified single-command full-stack launcher
├── requirements.txt          # Python runtime dependencies
├── Dockerfile                # Production multi-stage Docker build
├── .env.example              # Environment variables template
└── .gitignore                # Git exclusions (no tests, no PDFs, no temporary caches)
```
