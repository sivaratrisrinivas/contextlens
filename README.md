# Context Lens

A radically minimal paper reading app where every word is clickable. Three layers of AI analysis sit behind a single click — definition, rhetorical intent, and assumption stress-testing. Built with a Jony Ive design philosophy where the interface disappears and the text becomes the experience.

---

## What It Does

**Click any word.** A frosted-glass panel slides in with three tabs:

| Tab | What it answers | Example |
|-----|-----------------|---------|
| **Define** | What does this word mean in this context? | "In molecular communication, 'DNA-Based' refers to the physical medium used to encode and transport information..." |
| **Intent** | Why did the author choose this specific word here? | "The author uses 'ergodic' here specifically to rule out path-dependence as a confound..." |
| **Challenge** | What hidden assumptions does this sentence rest on? | "1. **Measurability assumption**: The system's phase space is not partitioned into disjoint invariant sets..." |

Every response is **pre-cached** per (word + context fingerprint). The same lookup never calls the AI twice. Returning readers get instant results via batch prefetch.

---

## Features

- **Three-Layer Analysis** — Define, Intent, Challenge tabs with lazy loading per tab switch
- **Smart PDF Parsing** — Strips front matter (copyright, TOC, preface) and back matter (index, bibliography, appendix) from book PDFs
- **Paste Text** — Paste raw text with paragraph structure preserved
- **Pre-Cached Responses** — SHA-256 fingerprinted, O(1) amortized lookups via Map + MongoDB indexes
- **Batch Prefetch** — All three cache types hydrated in one call on paper load
- **Bookmark Explanations** — Save any word explanation for later reference
- **Sentence Extraction** — Challenge tab automatically detects the full sentence containing the clicked word

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Tailwind CSS, Framer Motion, Shadcn/UI |
| Backend | FastAPI, Motor (async MongoDB) |
| Database | MongoDB |
| AI | Gemini 3 Flash via Emergent Integrations |
| Typography | Newsreader (serif, reading), Manrope (UI) |

---

## Project Structure

```
/app
├── backend/
│   ├── server.py            # FastAPI — papers, lookups, rhetorical, assumptions, bookmarks
│   ├── pdf_parser.py        # Smart body matter extraction from book PDFs
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Environment variables
├── frontend/
│   ├── src/
│   │   ├── App.js           # Main app with view routing + upload modal
│   │   ├── index.js         # React entry point
│   │   ├── index.css        # Global styles, CSS variables, Tailwind config
│   │   └── components/
│   │       ├── Logo.jsx           # Aperture icon + wordmark
│   │       ├── PaperReader.jsx    # 3-tab reader with Define/Intent/Challenge
│   │       ├── PaperUpload.jsx    # Modal with text/PDF upload tabs
│   │       ├── PaperList.jsx      # Minimal paper listing
│   │       ├── BookmarksList.jsx  # Saved explanations with search
│   │       └── ui/               # Shadcn components
│   ├── package.json
│   └── .env                 # Frontend environment variables
└── memory/
    └── PRD.md               # Product requirements document
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/papers` | Create paper (FormData: title + content or file) |
| `GET` | `/api/papers` | List all papers |
| `GET` | `/api/papers/{id}` | Get single paper |
| `DELETE` | `/api/papers/{id}` | Delete paper + related bookmarks |
| `POST` | `/api/lookup` | Word definition (JSON: word, context, paper_id) |
| `GET` | `/api/lookup/paper-cache/{paper_id}` | Batch fetch cached definitions |
| `POST` | `/api/rhetorical` | Rhetorical intent (JSON: word, sentence, context, paper_id) |
| `GET` | `/api/rhetorical/paper-cache/{paper_id}` | Batch fetch cached rhetorical analyses |
| `POST` | `/api/assumptions` | Assumption stress-test (JSON: sentence, context, paper_id) |
| `GET` | `/api/assumptions/paper-cache/{paper_id}` | Batch fetch cached assumption analyses |
| `POST` | `/api/bookmarks` | Save a word explanation |
| `GET` | `/api/bookmarks` | List all bookmarks |
| `DELETE` | `/api/bookmarks/{id}` | Remove bookmark |

---

## Local Setup

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **Yarn**
- **MongoDB** (local instance or Atlas)

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd <repo-name>
```

### 2. Backend Setup

```bash
cd backend

# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env  # Or create .env manually
```

Create a `.env` file in `/backend/` with:

```
MONGO_URL=mongodb://localhost:27017
DB_NAME=context_lens
EMERGENT_LLM_KEY=<your-emergent-universal-key>
CORS_ORIGINS=http://localhost:3000
```

> **Note:** Get an Emergent Universal Key from your [Emergent profile](https://emergentagent.com) under Profile > Universal Key. This single key powers Gemini 3 Flash for all three analysis modes.

Start the backend:

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install

# Configure environment variables
```

Create a `.env` file in `/frontend/` with:

```
REACT_APP_BACKEND_URL=http://localhost:8001
```

Start the frontend:

```bash
yarn start
```

The app will be available at `http://localhost:3000`.

### 4. MongoDB

If using a local MongoDB instance:

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Ubuntu
sudo systemctl start mongod

# Docker
docker run -d -p 27017:27017 --name context-lens-db mongo:7
```

No manual schema setup needed — the backend creates indexes automatically on startup.

---

## How the AI Analysis Works

### Define (Word → Definition)
Standard contextual definition. Feeds the word + ~40 surrounding words to Gemini 3 Flash with a prompt focused on explaining the word's meaning in that specific context.

### Intent (Word → Rhetorical Function)
Not what the word means globally — but **why this word, in this sentence, in this argument**. The prompt asks: "What rhetorical work is this word doing? What would change if the author had used a synonym?" This is the analysis that actually builds comprehension.

### Challenge (Sentence → Assumption Stress-Test)
Identifies the **2-3 hidden assumptions** the sentence rests on. For each assumption: what it is, what would have to be false for the claim to break down, and whether it's typically contested in the field. Like having a senior researcher sit next to you and poke holes in real time.

### Caching Strategy
- **Fingerprint**: SHA-256 hash of `(analysis_type + word/sentence + context)`
- **Backend**: MongoDB with unique indexes on fingerprints — O(log n) B-tree lookup
- **Frontend**: Map-based local cache — O(1) amortized per click
- **Batch prefetch**: On paper load, all three cache types are hydrated in parallel
- **Result**: First lookup = AI call (~2-4s). Every repeat = instant from cache.

---

## Design Philosophy

Inspired by Jony Ive's radical minimalism:

- **Light theme** — Off-white (#F5F5F7) app, pure white (#FFFFFF) paper surface
- **Zero cognitive load** — Icon-only navigation, no labels, no descriptions
- **Frosted glass** — Side panel with `backdrop-blur-3xl` at 80% white opacity
- **Typography as hero** — Newsreader serif for reading, Manrope for UI
- **Content is the experience** — The interface disappears. The paper is all you see.

---

## License

Private — All rights reserved.
