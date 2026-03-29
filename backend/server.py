from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import uuid
import io
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone

import pdfplumber
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# LLM
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# --- Models ---
class PaperCreate(BaseModel):
    title: str
    content: str

class PaperResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    content: str
    created_at: str

class LookupRequest(BaseModel):
    word: str
    context: str
    paper_id: str

class LookupResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    word: str
    context: str
    explanation: str
    fingerprint: str
    cached: bool
    created_at: str

class BookmarkCreate(BaseModel):
    word: str
    context: str
    explanation: str
    paper_id: str
    paper_title: str

class BookmarkResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    word: str
    context: str
    explanation: str
    paper_id: str
    paper_title: str
    created_at: str

# --- Helpers ---
def make_fingerprint(word: str, context: str) -> str:
    raw = f"{word.lower().strip()}|{context.strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()

async def get_ai_explanation(word: str, context: str) -> str:
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"lookup-{uuid.uuid4()}",
        system_message=(
            "You are an expert academic reader. When given a word and its surrounding context from an academic paper, "
            "explain the word's meaning in that specific context. Be concise but thorough. "
            "If it's a technical term, explain it simply. If it's a common word used in a specialized way, clarify the nuance. "
            "Keep the explanation under 150 words. Use clear, accessible language."
        )
    ).with_model("gemini", "gemini-3-flash-preview")

    msg = UserMessage(text=f"Word: \"{word}\"\n\nContext: \"{context}\"\n\nExplain this word in the given context.")
    response = await chat.send_message(msg)
    return response

# --- Paper Routes ---
@api_router.post("/papers")
async def create_paper(title: str = Form(...), content: str = Form(None), file: UploadFile = File(None)):
    if not content and not file:
        raise HTTPException(400, "Provide text content or a PDF file")

    paper_content = content or ""

    if file:
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(400, "Only PDF files are supported")
        data = await file.read()
        if len(data) > 50 * 1024 * 1024:  # 50MB limit
            raise HTTPException(400, "PDF file too large (max 50MB)")
        try:
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                pages = []
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        pages.append(text)
                paper_content = "\n\n".join(pages)
            if not paper_content.strip():
                raise HTTPException(400, "Could not extract text from this PDF. The PDF may be image-based or empty.")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"PDF parse error: {e}")
            raise HTTPException(400, f"Failed to parse PDF: {str(e)}")

    if not paper_content.strip():
        raise HTTPException(400, "No text content could be extracted")

    doc = {
        "id": str(uuid.uuid4()),
        "title": title.strip(),
        "content": paper_content.strip(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.papers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/papers", response_model=List[PaperResponse])
async def list_papers():
    papers = await db.papers.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return papers

@api_router.get("/papers/{paper_id}")
async def get_paper(paper_id: str):
    paper = await db.papers.find_one({"id": paper_id}, {"_id": 0})
    if not paper:
        raise HTTPException(404, "Paper not found")
    return paper

@api_router.delete("/papers/{paper_id}")
async def delete_paper(paper_id: str):
    result = await db.papers.delete_one({"id": paper_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Paper not found")
    # Clean up related bookmarks
    await db.bookmarks.delete_many({"paper_id": paper_id})
    return {"status": "deleted"}

# --- Lookup Routes ---
@api_router.post("/lookup")
async def lookup_word(req: LookupRequest):
    fp = make_fingerprint(req.word, req.context)

    # Check cache
    cached = await db.word_cache.find_one({"fingerprint": fp}, {"_id": 0})
    if cached:
        cached["cached"] = True
        return cached

    # Call AI
    try:
        explanation = await get_ai_explanation(req.word, req.context)
    except Exception as e:
        logger.error(f"AI lookup failed: {e}")
        raise HTTPException(500, "AI explanation failed. Please try again.")

    doc = {
        "id": str(uuid.uuid4()),
        "word": req.word,
        "context": req.context,
        "explanation": explanation,
        "fingerprint": fp,
        "paper_id": req.paper_id,
        "cached": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.word_cache.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/lookup/cache/{fingerprint}")
async def check_cache(fingerprint: str):
    cached = await db.word_cache.find_one({"fingerprint": fingerprint}, {"_id": 0})
    if not cached:
        raise HTTPException(404, "Not cached")
    cached["cached"] = True
    return cached

# --- Bookmark Routes ---
@api_router.post("/bookmarks")
async def create_bookmark(req: BookmarkCreate):
    # Check duplicate
    existing = await db.bookmarks.find_one(
        {"word": req.word, "context": req.context, "paper_id": req.paper_id},
        {"_id": 0}
    )
    if existing:
        return existing

    doc = {
        "id": str(uuid.uuid4()),
        "word": req.word,
        "context": req.context,
        "explanation": req.explanation,
        "paper_id": req.paper_id,
        "paper_title": req.paper_title,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.bookmarks.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.get("/bookmarks", response_model=List[BookmarkResponse])
async def list_bookmarks():
    bookmarks = await db.bookmarks.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return bookmarks

@api_router.delete("/bookmarks/{bookmark_id}")
async def delete_bookmark(bookmark_id: str):
    result = await db.bookmarks.delete_one({"id": bookmark_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Bookmark not found")
    return {"status": "deleted"}

# --- Health ---
@api_router.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup():
    # Create indexes
    await db.word_cache.create_index("fingerprint", unique=True)
    await db.papers.create_index("id", unique=True)
    await db.bookmarks.create_index("id", unique=True)
    logger.info("Database indexes created")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
