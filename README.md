<p align="center">
  <img src="assets/icon.ico" width="80" />
</p>

<h1 align="center">OnyxBrowser</h1>

<p align="center">
  <b>The High-Performance Agentic Browser</b><br/>
  <sub>An AI-native Electron browser with a FastAPI + LangChain autonomous agent backend and voice control.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-40+-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/LangChain-0.3+-1C3C3C?logo=langchain&logoColor=white" />
  <img src="https://img.shields.io/badge/Playwright-1.49+-2EAD33?logo=playwright&logoColor=white" />
</p>

---

## ✨ What is Onyx?

Onyx is a **full-featured desktop web browser** built with Electron, React, and Vite — supercharged with an **autonomous AI agent** that can navigate, click, type, scrape, and summarise web pages on your behalf.

Unlike bolt-on browser extensions, the AI agent lives at the core of the architecture: a dedicated **FastAPI + LangChain** backend powered by Groq or OpenAI processes natural-language commands (typed **or spoken**) and returns structured DOM actions that the Electron renderer executes in real-time.

> **Think of it as Chrome meets an AI co-pilot — built from scratch.**

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
│  ┌──────────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │ Window Mgmt  │  │ Ad-Block │  │  Smart DOM Traversal   │ │
│  │  Downloads   │  │ (Cliqz)  │  │   Engine (IPC)         │ │
│  └──────────────┘  └──────────┘  └────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                   Electron Renderer (React)                   │
│  ┌─────────┐ ┌────────┐ ┌──────────────┐ ┌───────────────┐ │
│  │ Omnibox │ │ TabBar │ │ AI Sidebar   │ │  Web3 Panel   │ │
│  │         │ │        │ │ + Voice 🎤   │ │               │ │
│  └─────────┘ └────────┘ └──────┬───────┘ └───────────────┘ │
│                                │                             │
│          ┌─────────────────────┼──────────────────┐          │
│          │   onyxApi.js        │    executor.js    │          │
│          │   (HTTP client)     │   (DOM actions)   │          │
│          └─────────────────────┼──────────────────┘          │
├────────────────────────────────┼─────────────────────────────┤
│               FastAPI Backend  │ (localhost:8000)             │
│  ┌─────────────────┐  ┌───────┴────────┐  ┌──────────────┐ │
│  │  routers/agent   │→ │  LangChain LLM │→ │  Playwright  │ │
│  │  /execute        │  │ (Groq/OpenAI)  │  │   Scraper    │ │
│  │  /voice          │  │ PydanticParser │  │              │ │
│  └─────────────────┘  └────────────────┘  └──────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Features

### 🌐 Browser Core
| Feature | Description |
|---|---|
| **Tabbed Browsing** | Multi-tab interface with favicon extraction, audio indicators, and tab management |
| **Smart Omnibox** | URL bar with auto-detection of URLs vs search queries, multi-engine support (Google, Bing, DuckDuckGo, Brave) |
| **Ad Blocker** | Built-in ad & tracker blocker powered by [Cliqz/adblocker-electron](https://github.com/nicedoc/adblocker) with live blocked-count badge |
| **Download Manager** | Full download lifecycle — progress tracking, pause, resume, cancel |
| **Bookmarks & History** | Persistent local storage via `electron-store`, with searchable history page |
| **Session Restore** | Automatically saves and restores open tabs across sessions |
| **Find in Page** | In-page text search with match highlighting |
| **Security Indicators** | HTTPS lock icon with certificate status detection |
| **Incognito Mode** | Private browsing with isolated session data |
| **Context Menu** | Right-click menus with "Open in New Tab", Save Image, Copy Link, etc. |
| **Crash Recovery** | Auto-reloads renderer on process crashes without losing the main window |

### 🤖 AI Agent (Onyx Intelligence)
| Feature | Description |
|---|---|
| **Natural Language Commands** | Tell the agent what to do in plain English — *"open amazon and search for headphones"* |
| **🎤 Voice Commands** | Click the mic button and speak your command — auto-transcribed and executed via `webkitSpeechRecognition` |
| **Dual-Mode Agent** | **Intelligence** (FastAPI + LangChain backend) for action tasks, **Lite** (in-process ReAct loop) as offline fallback |
| **DOM Execution Engine** | Translates AI-generated `BrowserActionPlan` into sequential IPC commands with live status updates |
| **ReAct Loop** | 5-step autonomous reasoning loop with thought → action → observation cycles |
| **Smart DOM Traversal** | Multi-strategy element finder: CSS selectors → attribute matching → text-content fuzzy matching → Shadow DOM traversal |
| **Onyx Pulse Highlights** | Cyan glow animation on targeted elements so you can see exactly what the agent is interacting with |
| **Structured Output** | LangChain `PydanticOutputParser` guarantees type-safe `BrowserActionPlan` responses with ordered action sequences |
| **Dual LLM Support** | Groq (Llama 3.3 70B — fast & free) or OpenAI (GPT-4o-mini) — auto-selects based on available API keys |
| **Backend Health Check** | Green/red status dot in the sidebar header shows backend connectivity in real-time |
| **Graceful Degradation** | Auto-falls back from Intelligence → Lite mode if the backend is unreachable |

### 🔗 Web3
| Feature | Description |
|---|---|
| **Wallet Connect** | Integrated Web3Modal + ethers.js panel for connecting Ethereum wallets |
| **dApp Ready** | Built-in support for interacting with decentralised applications |

---

## 📂 Project Structure

```
OnyxBrowser/
├── electron/
│   ├── main.js                # Main process (window, IPC, ad-blocker, agent actions)
│   └── preload.js             # Context bridge — exposes browserAPI to renderer
├── src/
│   ├── App.jsx                # Root component — tabs, navigation, sidebar
│   ├── App.css                # Global styles (dark theme, glassmorphism)
│   ├── components/
│   │   ├── AISidebar.jsx      # Dual-mode AI sidebar (Intelligence + Lite)
│   │   ├── HomePage.jsx       # New-tab start page
│   │   ├── Omnibox.jsx        # URL / search bar
│   │   ├── TopBar.jsx         # Tab strip + window controls
│   │   ├── FindBar.jsx        # In-page search
│   │   ├── HistoryPage.jsx    # Browsing history viewer
│   │   ├── SettingsModal.jsx  # Settings (search engine, ad-block, cache)
│   │   ├── Web3Panel.jsx      # Ethereum wallet panel
│   │   └── ...
│   ├── hooks/
│   │   └── useVoiceCommand.js # webkitSpeechRecognition hook (continuous, auto-stop)
│   ├── services/
│   │   ├── onyxApi.js         # FastAPI backend HTTP client
│   │   ├── agent.js           # Frontend ReAct loop (Lite fallback)
│   │   └── ai.js              # LLM API client (OpenRouter / Gemma)
│   ├── utils/
│   │   └── executor.js        # DOM execution engine (BrowserAction → IPC)
│   └── adblocker/
│       └── observer.js        # YouTube ad-skip MutationObserver
├── backend/                    # FastAPI Python backend
│   ├── main.py                # FastAPI app, CORS, health routes
│   ├── schemas.py             # Pydantic request/response models
│   ├── routers/
│   │   └── agent.py           # POST /api/agent/execute & /voice
│   ├── services/
│   │   ├── scraper.py         # Async Playwright page scraper
│   │   └── llm_agent.py       # LangChain brain + PydanticOutputParser
│   ├── requirements.txt       # Python dependencies
│   └── .env.example           # API key template
├── assets/                     # App icons (icon.icns, icon.ico)
├── package.json               # Node deps, build scripts, electron-builder config
└── vite.config.js             # Vite configuration
```

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.11
- **Groq** or **OpenAI** API key (for the AI agent)

### 1. Install the Frontend

```bash
cd OnyxBrowser
npm install
```

### 2. Install the Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `backend/.env` and add at least one API key:

```env
GROQ_API_KEY=gsk_your_key_here        # Recommended — fast & free tier
OPENAI_API_KEY=sk-your_key_here       # Alternative
```

### 4. Start Everything

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

## 🎤 Voice Commands

1. Open the AI sidebar (⚡ icon in the top bar)
2. Click the **microphone button** — it pulses cyan when listening
3. Speak your command: *"Open YouTube and search for lofi music"*
4. The transcript auto-submits to the agent pipeline — no typing needed

> Voice recognition uses Chromium's built-in `webkitSpeechRecognition` API. Microphone permissions are automatically granted by Electron.

---

## 🛠️ API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service info & status |
| `GET` | `/health` | Liveness probe |
| `POST` | `/api/agent/execute` | Execute an agentic browser task |
| `POST` | `/api/agent/voice` | Process a voice command transcript |

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
  "thought": "User wants to search. I'll type the query into the Google search box.",
  "actions": [
    {
      "action_type": "type",
      "target_selector": "textarea[name='q']",
      "value": "mechanical keyboards"
    }
  ]
}
```

Interactive API docs are available at **http://localhost:8000/docs** (Swagger UI).

---

## 📦 Build for Production

OnyxBrowser uses **electron-builder** to produce native installers.

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
| Windows | `release/OnyxBrowser-Setup-1.0.0.exe` | NSIS one-click installer |

> **Note:** Cross-compiling Windows from macOS requires Wine. For a native `.exe`, run `npm run build:win` on a Windows machine or use GitHub Actions CI.

### 🔒 Security Hardening
- `nodeIntegration: false` — no Node.js access from renderer
- `contextIsolation: true` — all IPC goes through the preload bridge
- `asar: true` — source code is bundled into an encrypted archive
- Backend bundled as `extraResources` (excludes `venv/`, `.env`, `__pycache__/`)

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | Electron 40+ |
| **Frontend** | React 18, Vite 7 |
| **Styling** | Custom CSS (dark-first, glassmorphism) |
| **Backend** | FastAPI, Uvicorn |
| **AI/LLM** | LangChain, Groq (Llama 3.3), OpenAI (GPT-4o-mini) |
| **Voice** | webkitSpeechRecognition (Chromium native) |
| **Scraping** | Playwright (async, headless Chromium) |
| **Ad Blocking** | @cliqz/adblocker-electron |
| **Web3** | ethers.js, Web3Modal |
| **Storage** | electron-store (local JSON) |
| **Build** | electron-builder (DMG, NSIS) |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push to the branch: `git push origin feat/my-feature`
5. Open a Pull Request

---

## 📄 License

This project is **proprietary software**. All rights reserved © 2026 Eesh Sagar. Unauthorized use, copying, or distribution is strictly prohibited. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ☕ by <b>Eesh Sagar</b>
</p>
