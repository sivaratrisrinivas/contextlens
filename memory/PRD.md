# Context Lens - AI-Powered Paper Reading App

## Problem Statement
Build a paper reading web app with AI-powered contextual word lookup. Every word in the paper is individually clickable. Clicking a word opens a side panel explaining that word using the surrounding text as context. Responses are pre-cached per (word + context fingerprint) so the same lookup never calls the API twice.

## Architecture
- **Backend**: FastAPI + MongoDB + Gemini 3 Flash (via emergentintegrations)
- **Frontend**: React + Tailwind CSS + Framer Motion + Shadcn UI
- **AI**: Gemini 3 Flash for contextual word explanations
- **Caching**: SHA256 fingerprint of (word + context) stored in MongoDB

## User Personas
- Researchers reading academic papers
- Students studying complex material
- Anyone wanting AI-assisted reading comprehension

## Core Requirements
- Paste text or upload PDF papers
- Every word clickable with AI explanation in side panel
- Pre-cached responses (no duplicate API calls)
- Bookmark/save explanations for later reference
- Futuristic glassmorphism UI (Jony Ive 2050 aesthetic)

## What's Been Implemented (2026-03-29)
- Full paper CRUD (create via text paste or PDF upload, list, view, delete)
- Tokenized clickable word reader with surrounding context extraction
- AI-powered side panel with Gemini 3 Flash explanations
- Response caching (MongoDB + frontend local cache)
- Bookmark system (save, list, search, delete explanations)
- Glass-morphism UI with animated background blobs
- Outfit + Manrope typography, cyan/fuchsia/acid-green accents

## Prioritized Backlog
### P0 (Done)
- Paper text input + PDF upload
- Word-click AI lookup with caching
- Bookmark/save system
- Responsive dark theme UI

### P1
- PDF upload via object storage (currently server-side only)
- Paragraph-level context highlighting
- Word frequency analysis

### P2
- Multi-user support with auth
- Paper collections/folders
- Export bookmarks as study notes
- Highlight and annotate passages
