# Context Lens — AI-Powered Paper Reading App

A radically minimal paper reading web app where every word is clickable for instant, AI-powered contextual explanations. Built with a Jony Ive-inspired design philosophy — the interface disappears and the content becomes the experience.

---

## Features

- **Clickable Word Lookup** — Every word in your paper is interactive. Click any word and a frosted-glass side panel slides in with an AI-generated explanation using the surrounding text as context.
- **Smart PDF Parsing** — Upload book-length PDFs. The parser intelligently strips front matter (copyright, TOC, preface, dedication) and back matter (index, bibliography, appendix, glossary) to extract only the body content.
- **Paste Text** — Alternatively, paste raw text directly. Paragraph structure is preserved.
- **Pre-Cached Responses** — Every lookup is fingerprinted via SHA-256 hash of (word + context). The same lookup never calls the AI twice. Cached results load instantly.
- **Batch Prefetch** — When you open a paper, all previously cached lookups are fetched in one call. Returning readers get instant results.
- **Bookmark Explanations** — Save any word explanation for later. Search and manage your saved vocabulary.
- **O(1) Amortized Lookups** — Fingerprints are pre-computed at tokenization time. Local cache uses a Map for constant-time access. MongoDB indexes ensure fast server-side retrieval.

---

## Tech Stack

| Layer      | Technology                                      |
|------------|--------------------------------------------------|
| Frontend   | React, Tailwind CSS, Framer Motion, Shadcn/UI   |
| Backend    | FastAPI, Motor (async MongoDB driver)            |
| Database   | MongoDB                                          |
| AI         | Gemini 3 Flash via Emergent Integrations         |
| Typography | Newsreader (serif, reading), Manrope (UI)        |

---

## Project Structure

```
/app
├── backend/
│   ├── server.py          # FastAPI app — papers, lookups, bookmarks CRUD
│   ├── pdf_parser.py      # Smart body matter extraction from PDFs
│   ├── requirements.txt   # Python dependencies
│   └── .env               # MONGO_URL, DB_NAME, EMERGENT_LLM_KEY
├── frontend/
│   ├── src/
│   │   ├── App.js                   # Main app with view routing
│   │   ├── index.js                 # Entry point
│   │   ├── index.css                # Global styles, Tailwind, CSS vars
│   │   └── components/
│   │       ├── Logo.jsx             # Aperture icon + Context Lens wordmark
│   │       ├── PaperReader.jsx      # Reader with tokenized clickable words
│   │       ├── PaperUpload.jsx      # Modal with text/PDF upload tabs
│   │       ├── PaperList.jsx        # Minimal paper listing
│   │       ├── BookmarksList.jsx    # Saved explanations with search
│   │       └── ui/                  # Shadcn UI components
│   ├── package.json
│   └── .env               # REACT_APP_BACKEND_URL
└── memory/
    └── PRD.md             # Product requirements document
```

---

## API Endpoints

| Method   | Endpoint                            | Description                          |
|----------|-------------------------------------|--------------------------------------|
| `GET`    | `/api/health`                       | Health check                         |
| `POST`   | `/api/papers`                       | Create paper (FormData: title + content/file) |
| `GET`    | `/api/papers`                       | List all papers                      |
| `GET`    | `/api/papers/{id}`                  | Get single paper                     |
| `DELETE` | `/api/papers/{id}`                  | Delete paper + related bookmarks     |
| `POST`   | `/api/lookup`                       | AI word lookup (JSON: word, context, paper_id) |
| `GET`    | `/api/lookup/cache/{fingerprint}`   | Check single cache entry             |
| `GET`    | `/api/lookup/paper-cache/{paper_id}`| Batch fetch all cached lookups       |
| `POST`   | `/api/bookmarks`                    | Save a word explanation              |
| `GET`    | `/api/bookmarks`                    | List all bookmarks                   |
| `DELETE` | `/api/bookmarks/{id}`               | Remove bookmark                      |

---

## Design Philosophy

Inspired by Jony Ive's radical minimalism:

- **Light theme** — Off-white app background (#F5F5F7), pure white paper surface (#FFFFFF)
- **Zero cognitive load** — All navigation uses icons only. No labels, no descriptions, no badges
- **Frosted glass panels** — Side panel uses `backdrop-blur-3xl` with 80% white opacity
- **Typography as the hero** — Newsreader serif for reading, Manrope for UI elements
- **Content is the experience** — The interface disappears. The paper is all you see

---

## Environment Variables

### Backend (`/app/backend/.env`)
```
MONGO_URL=<mongodb connection string>
DB_NAME=<database name>
EMERGENT_LLM_KEY=<emergent universal key>
CORS_ORIGINS=*
```

### Frontend (`/app/frontend/.env`)
```
REACT_APP_BACKEND_URL=<backend URL>
```

---

## Getting Started

1. Install backend dependencies:
   ```bash
   cd backend && pip install -r requirements.txt
   ```

2. Install frontend dependencies:
   ```bash
   cd frontend && yarn install
   ```

3. Configure `.env` files with your MongoDB URL and Emergent LLM key.

4. Start services:
   ```bash
   sudo supervisorctl start backend frontend
   ```

---

## License

Private — All rights reserved.
