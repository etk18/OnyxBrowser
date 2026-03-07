<p align="center">
  <img src="assets/icon.ico" width="80" />
</p>

<h1 align="center">OnyxBrowser</h1>

<p align="center">
  <b>The Agentic Web Engine</b><br/>
  <sub>Public Beta v0.1.0 — An AI-native Electron browser with Rust-powered ad blocking, semantic memory, spatial DOM mapping, Web3 wallet, and voice control.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0--beta-00F2EA?style=flat-square" />
  <img src="https://img.shields.io/badge/Electron-40+-47848F?style=flat-square&logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Rust-NAPI-DEA584?style=flat-square&logo=rust&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/LangChain-0.3+-1C3C3C?style=flat-square&logo=langchain&logoColor=white" />
  <img src="https://img.shields.io/badge/ChromaDB-Vector_Memory-FF6F61?style=flat-square" />
</p>

---

## What is Onyx?

Onyx is a **full-featured desktop web browser** built with Electron, React, and Vite — supercharged with an **autonomous AI agent** that can navigate, click, type, scrape, and summarise web pages on your behalf.

Unlike bolt-on browser extensions, the AI agent lives at the core of the architecture: a dedicated **FastAPI + LangChain** backend powered by Groq (Llama 3.3 70B) processes natural-language commands (typed **or spoken**) and returns structured DOM actions that the Electron renderer executes in real-time.

> **Think of it as Chrome meets an AI co-pilot — built from scratch.**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                        │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ Window Mgmt  │  │  Onyx Shield  │  │  Spatial DOM Mapper  │  │
│  │  Downloads   │  │  (Rust+Cliqz) │  │  (Vimium-style IPC)  │  │
│  └──────────────┘  └───────────────┘  └──────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                   Electron Renderer (React)                      │
│  ┌─────────┐ ┌────────┐ ┌──────────────┐ ┌───────────────────┐ │
│  │ Omnibox │ │ TabBar │ │ AI Sidebar   │ │   Wallet Modal    │ │
│  │         │ │        │ │ + Voice      │ │   (ethers.js)     │ │
│  └─────────┘ └────────┘ └──────┬───────┘ └───────────────────┘ │
│                                │                                 │
│          ┌─────────────────────┼──────────────────┐              │
│          │   onyxApi.js        │    executor.js    │              │
│          │   (HTTP client)     │  (DOM actions +   │              │
│          │                     │   spatial map)    │              │
│          └─────────────────────┼──────────────────┘              │
├────────────────────────────────┼─────────────────────────────────┤
│               FastAPI Backend  │ (localhost:8000)                 │
│  ┌─────────────────┐  ┌───────┴────────┐  ┌──────────────────┐ │
│  │  routers/agent   │  │  LangChain LLM │  │  ChromaDB Vector │ │
│  │  /execute        │  │ (Groq/OpenAI)  │  │  Memory Store    │ │
│  │  /voice          │  │ PydanticParser │  │                  │ │
│  │  /memory/ingest  │  └────────────────┘  └──────────────────┘ │
│  └─────────────────┘                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Features

### Browser Core
| Feature | Description |
|---|---|
| **Tabbed Browsing** | Multi-tab interface with favicon extraction, audio indicators, and tab management |
| **Smart Omnibox** | URL bar with auto-detection of URLs vs search queries, multi-engine support (Google, Bing, DuckDuckGo, Brave) |
| **Onyx Shield** | Dual-layer ad/tracker blocker — Rust NAPI engine (HashSet, 50+ domains) + Cliqz filter engine with live blocked-count badge |
| **Download Manager** | Full download lifecycle — progress tracking, pause, resume, cancel |
| **Bookmarks & History** | Persistent local storage via `electron-store`, with searchable history page |
| **Session Restore** | Automatically saves and restores open tabs across sessions |
| **Find in Page** | In-page text search with match highlighting |
| **Security Indicators** | HTTPS lock icon with certificate status detection |
| **Incognito Mode** | Private browsing with isolated session data |
| **Context Menu** | Right-click menus with "Open in New Tab", Save Image, Copy Link, etc. |
| **Chrome Extension Loader** | Load unpacked Chrome extensions (MV2/MV3) from Settings |
| **Crash Recovery** | Auto-reloads renderer on process crashes without losing the main window |

### AI Agent (Onyx Intelligence)
| Feature | Description |
|---|---|
| **Natural Language Commands** | Tell the agent what to do in plain English — *"open amazon and search for headphones"* |
| **Voice Commands** | Click the mic button and speak — auto-transcribed via Groq Whisper and executed |
| **Spatial DOM Mapping** | Vimium-style element numbering — the agent calls `analyze_ui` to get a numbered map of all interactive elements, then targets by ID |
| **Semantic Vector Memory** | Pages are silently embedded into ChromaDB on load; the agent recalls relevant browsing history when answering queries |
| **DOM Execution Engine** | Translates AI-generated `BrowserActionPlan` into sequential IPC commands with live status updates |
| **ReAct Loop** | 5-step autonomous reasoning loop with thought → action → observation cycles |
| **Smart DOM Traversal** | Multi-strategy element finder: `onyxId` (spatial map) → CSS selectors → attribute matching → text-content fuzzy matching |
| **Onyx Pulse Highlights** | Cyan glow animation on targeted elements so you can see exactly what the agent is interacting with |
| **Structured Output** | LangChain `PydanticOutputParser` guarantees type-safe `BrowserActionPlan` responses with ordered action sequences |
| **Dual LLM Support** | Groq (Llama 3.3 70B — fast & free) or OpenAI (GPT-4o-mini) — auto-selects based on available API keys |
| **Backend Health Check** | Green/red status dot in the sidebar header shows backend connectivity in real-time |
| **Graceful Degradation** | Auto-falls back from Intelligence → Lite mode if the backend is unreachable |

### Web3
| Feature | Description |
|---|---|
| **Native Wallet** | Integrated ethers.js wallet modal for connecting Ethereum wallets |
| **dApp Ready** | Built-in `window.ethereum` provider for interacting with decentralised applications |

---

## Project Structure

```
OnyxBrowser/
├── electron/
│   ├── main.js                # Main process — window, IPC, Onyx Shield, spatial DOM, agent actions
│   ├── preload.js             # Context bridge — exposes browserAPI to renderer
│   └── webview-preload.js     # Webview preload — ad-block observer injection
├── src/
│   ├── App.jsx                # Root component — tabs, navigation, sidebar, internal pages
│   ├── App.css                # Global styles (dark theme, glassmorphism, Onyx Glass)
│   ├── components/
│   │   ├── AISidebar.jsx      # Dual-mode AI sidebar (Intelligence + Lite)
│   │   ├── HomePage.jsx       # New-tab start page
│   │   ├── Omnibox.jsx        # URL / search bar
│   │   ├── TopBar.jsx         # Tab strip + BETA badge + window controls
│   │   ├── OnyxLedger.jsx     # Update log / changelog timeline (onyx://ledger)
│   │   ├── SettingsModal.jsx  # Settings — search engine, ad-block, cache, extensions
│   │   ├── WalletModal.jsx    # Ethereum wallet connect modal
│   │   ├── FindBar.jsx        # In-page search
│   │   ├── HistoryPage.jsx    # Browsing history viewer
│   │   └── Favicon.jsx        # Favicon extractor with fallback
│   ├── hooks/
│   │   ├── useVoiceCommand.js # Groq Whisper voice transcription hook
│   │   └── useWallet.js       # ethers.js wallet state hook
│   ├── services/
│   │   ├── onyxApi.js         # FastAPI backend HTTP client
│   │   ├── agent.js           # Frontend ReAct loop (Lite fallback)
│   │   └── ai.js              # LLM API client (Groq / OpenAI)
│   └── utils/
│       ├── executor.js        # DOM execution engine (BrowserAction → IPC, spatial map support)
│       └── domMapper.js       # Vimium-style DOM mapper script (injectable IIFE)
├── backend/                    # FastAPI Python backend
│   ├── main.py                # FastAPI app, CORS, health, memory ingest endpoint
│   ├── schemas.py             # Pydantic models (AgentRequest, MemoryIngestRequest, etc.)
│   ├── routers/
│   │   └── agent.py           # POST /api/agent/execute & /voice
│   ├── services/
│   │   ├── llm_agent.py       # LangChain brain + PydanticOutputParser + memory context
│   │   └── memory.py          # ChromaDB semantic vector memory (ingest + search)
│   ├── requirements.txt       # Python dependencies
│   └── .env.example           # API key template
├── onyx-shield/                # Rust NAPI ad-block engine
│   ├── Cargo.toml             # Rust crate config (napi, url, LTO release)
│   ├── src/lib.rs             # HashSet-based domain blocker (50+ domains)
│   └── package.json           # NAPI build scripts + platform triples
├── website/                    # Marketing website (React 19 + Framer Motion)
│   └── src/
│       ├── App.jsx            # Page layout
│       └── components/        # Hero, Features, OnyxLedger, Download, Guide, Footer
├── assets/                     # App icons (icon.icns, icon.ico)
├── extensions/                 # Bundled Chrome extensions (uBlock Origin)
├── .github/workflows/
│   └── build.yml              # CI/CD — Win + Mac builds, Rust compilation, GitHub Releases
├── package.json               # Node deps, build scripts, electron-builder config
└── vite.config.js             # Vite configuration
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **Python** >= 3.11
- **Rust** toolchain (for building Onyx Shield) — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Groq** or **OpenAI** API key (for the AI agent)

### 1. Build Onyx Shield (Rust)

```bash
cd onyx-shield
npm install
npm run build
cd ..
```

### 2. Install the Frontend

```bash
npm install
```

### 3. Install the Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add at least one API key:

```env
GROQ_API_KEY=gsk_your_key_here        # Recommended — fast & free tier
OPENAI_API_KEY=sk-your_key_here       # Alternative
```

### 5. Start Everything

**Terminal 1 — Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Browser:**
```bash
npm run dev
```

The browser window opens automatically. The AI sidebar shows a **green dot** when connected to the backend.

---

## Voice Commands

1. Open the AI sidebar (lightning icon in the top bar)
2. Click the **microphone button** — it pulses cyan when listening
3. Speak your command: *"Open YouTube and search for lofi music"*
4. The transcript is sent to Groq Whisper for transcription, then auto-submitted to the agent pipeline

> Voice transcription uses Groq's `whisper-large-v3-turbo` model for fast, accurate results.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service info & status |
| `GET` | `/health` | Liveness probe |
| `POST` | `/api/agent/execute` | Execute an agentic browser task |
| `POST` | `/api/agent/voice` | Process a voice command transcript |
| `POST` | `/api/memory/ingest` | Ingest a page into vector memory (async) |

### Example: Agent Execute

```bash
curl -X POST http://localhost:8000/api/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "user_prompt": "search for mechanical keyboards",
    "current_url": "https://www.google.com"
  }'
```

**Response:**
```json
{
  "thought": "User wants to search. I'll analyze the UI first, then type the query.",
  "actions": [
    {
      "action_type": "analyze_ui"
    },
    {
      "action_type": "type",
      "target_id": 3,
      "value": "mechanical keyboards"
    }
  ]
}
```

Interactive API docs are available at **http://localhost:8000/docs** (Swagger UI).

---

## Build for Production

OnyxBrowser uses **electron-builder** to produce native installers. The build pipeline automatically compiles the Rust Onyx Shield engine first.

```bash
# macOS (Apple Silicon) → .dmg
npm run build:mac

# Windows (x64) → .exe installer
npm run build:win

# Both platforms at once
npm run dist
```

| Platform | Output | Installer Type |
|---|---|---|
| macOS | `release/OnyxBrowser-Mac-arm64.dmg` | Drag-and-drop DMG |
| Windows | `release/OnyxBrowser-Setup-0.1.0-beta.exe` | NSIS installer |

### CI/CD

Pushes to `main` trigger GitHub Actions to:
- Install the Rust toolchain and compile Onyx Shield for each platform
- Build the React frontend and Electron app
- Publish installers to **GitHub Releases** automatically (`--publish always`)
- Deploy the marketing website to GitHub Pages (when `website/` files change)

### Security Hardening
- `nodeIntegration: false` — no Node.js access from renderer
- `contextIsolation: true` — all IPC goes through the preload bridge
- `asar: true` — source code is bundled into an encrypted archive
- API keys stored securely via `electron-store` — never bundled in builds
- Backend bundled as `extraResources` (excludes `venv/`, `.env`, `__pycache__/`, `*.db`)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | Electron 40+ |
| **Frontend** | React 18, Vite 7 |
| **Styling** | Custom CSS (dark-first, glassmorphism, Onyx Glass) |
| **Backend** | FastAPI, Uvicorn |
| **AI/LLM** | LangChain, Groq (Llama 3.3 70B), OpenAI (GPT-4o-mini) |
| **Voice** | Groq Whisper (whisper-large-v3-turbo) |
| **Vector Memory** | ChromaDB (persistent, cosine similarity, ONNX embeddings) |
| **Ad Blocking** | Onyx Shield (Rust NAPI) + @cliqz/adblocker-electron |
| **Web3** | ethers.js |
| **Storage** | electron-store (local JSON) |
| **Build** | electron-builder (DMG, NSIS), GitHub Actions CI/CD |
| **Rust** | NAPI-RS, HashSet domain blocker, LTO + strip release profile |

---

## License

This project is **proprietary software**. All rights reserved. Unauthorized use, copying, or distribution is strictly prohibited. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Architected by <b>Eesh Sagar Singh</b> | MAIT, Delhi
</p>
