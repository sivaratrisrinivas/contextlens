"""
Smart PDF body matter extraction.
Detects and strips front matter (TOC, copyright, preface, dedication)
and back matter (index, bibliography, appendix, glossary, about author)
from book PDFs, returning only the main body content.

Time complexity: O(P) where P = number of pages (single linear scan with constant-time scoring per page).
"""

import re
import logging

logger = logging.getLogger(__name__)

# --- Front matter keyword patterns (case-insensitive) ---
FRONT_MATTER_STRONG = [
    r'\bcopyright\b', r'\ball rights reserved\b', r'\bisbn\b',
    r'\bpublished by\b', r'\bprinting history\b', r'\blibrary of congress\b',
    r'\btrademark\b', r'\bprinted in\b',
]

FRONT_MATTER_MEDIUM = [
    r'\btable of contents\b', r'\bcontents\b',
    r'\bdedication\b', r'\bdedicated to\b', r'\bfor my\b',
    r'\backnowledgments?\b', r'\bforeword\b', r'\bpreface\b',
    r'\babout this book\b', r'\bhow to use this book\b',
    r'\bprologue\b', r'\bepigraph\b',
]

# TOC detection: lines ending with page numbers like "Chapter 1 .... 15"
TOC_LINE_PATTERN = re.compile(r'.{5,}\s+\.{2,}\s*\d+\s*$|.{5,}\s{3,}\d+\s*$', re.MULTILINE)

# --- Back matter keyword patterns ---
BACK_MATTER_STRONG = [
    r'\bindex\b', r'\bbibliography\b', r'\breferences\b', r'\bworks cited\b',
    r'\bendnotes\b', r'\bglossary\b',
]

BACK_MATTER_MEDIUM = [
    r'\bappendix\b', r'\babout the authors?\b', r'\bauthor\s?bio\b',
    r'\bfurther reading\b', r'\bsuggested reading\b',
    r'\balso by\b', r'\bother books by\b', r'\bnotes\b',
    r'\bcolophon\b', r'\babout the publisher\b',
]

# Index page detection: many short alphabetical entries with page numbers
INDEX_LINE_PATTERN = re.compile(r'^[A-Z].{2,50},?\s+\d[\d,\s\-]*$', re.MULTILINE)


def _score_front_matter(text: str, page_num: int, total_pages: int) -> float:
    """Score how likely a page is front matter. Higher = more likely front matter."""
    score = 0.0
    text_lower = text.lower()
    char_count = len(text.strip())

    # Very short pages at the start are likely title/half-title/blank
    if char_count < 100 and page_num < 5:
        score += 3.0

    # Strong front matter indicators
    for pat in FRONT_MATTER_STRONG:
        if re.search(pat, text_lower):
            score += 5.0

    # Medium indicators
    for pat in FRONT_MATTER_MEDIUM:
        if re.search(pat, text_lower):
            score += 3.0

    # TOC detection: many lines ending with page numbers
    toc_matches = TOC_LINE_PATTERN.findall(text)
    if len(toc_matches) >= 3:
        score += 6.0

    # Position bias: earlier pages are more likely front matter
    if page_num < total_pages * 0.05:
        score += 1.0

    # Roman numeral page markers (i, ii, iii, iv, etc.)
    if re.search(r'\b[ivxlc]{1,6}\b', text_lower) and char_count < 300:
        score += 1.5

    return score


def _score_back_matter(text: str, page_num: int, total_pages: int) -> float:
    """Score how likely a page is back matter. Higher = more likely back matter."""
    score = 0.0
    text_lower = text.lower()
    char_count = len(text.strip())

    # Strong back matter indicators
    for pat in BACK_MATTER_STRONG:
        if re.search(pat, text_lower):
            score += 5.0

    # Medium indicators
    for pat in BACK_MATTER_MEDIUM:
        if re.search(pat, text_lower):
            score += 3.0

    # Index page detection: many short entries with page numbers
    index_matches = INDEX_LINE_PATTERN.findall(text)
    if len(index_matches) >= 5:
        score += 7.0

    # Position bias: later pages more likely back matter
    if page_num > total_pages * 0.85:
        score += 1.0

    # Very short final pages
    if char_count < 100 and page_num > total_pages * 0.9:
        score += 2.0

    return score


def _detect_chapter_start(text: str) -> bool:
    """Check if a page likely starts a chapter (body content begins)."""
    text_lower = text.lower().strip()
    # Chapter headings
    if re.search(r'^chapter\s+[0-9ivxlc]+', text_lower, re.MULTILINE):
        return True
    if re.search(r'^part\s+(one|two|three|four|[0-9ivxlc]+)', text_lower, re.MULTILINE):
        return True
    # Numbered sections like "1" or "1." at top of page
    if re.match(r'^\d{1,3}[.\s]', text_lower):
        return True
    return False


def extract_body_matter(pages: list[str]) -> str:
    """
    Given a list of page texts (ordered), identify and strip front/back matter.
    Returns the body content only.

    Algorithm: O(P) single pass scoring, then boundary detection.
    """
    total = len(pages)
    if total == 0:
        return ""

    # For very short documents (< 6 pages), return everything
    if total < 6:
        return "\n\n".join(p for p in pages if p.strip())

    # Score every page - O(P) with constant work per page
    front_scores = []
    back_scores = []
    for i, page_text in enumerate(pages):
        front_scores.append(_score_front_matter(page_text, i, total))
        back_scores.append(_score_back_matter(page_text, i, total))

    # Find front matter boundary: scan forward through early pages
    # Stop when front matter score drops and body content begins
    front_end = 0
    max_front_scan = min(total, max(5, int(total * 0.15)))  # Scan at most 15% of pages

    for i in range(max_front_scan):
        if front_scores[i] >= 3.0:
            front_end = i + 1  # This page is front matter, skip it
        elif _detect_chapter_start(pages[i]) and i > 0:
            front_end = i  # Chapter starts here, body begins
            break
        elif front_scores[i] < 1.0 and i > 1:
            # Low front-matter score after some front matter was detected
            break

    # Find back matter boundary: scan backward from end
    back_start = total
    max_back_scan = max(0, total - max(5, int(total * 0.20)))  # Last 20% of pages

    for i in range(total - 1, max_back_scan - 1, -1):
        if back_scores[i] >= 3.0:
            back_start = i  # This page is back matter, exclude it
        elif back_scores[i] < 1.0 and back_start < total:
            # Found non-back-matter page, stop
            break

    # Sanity: body must be at least 30% of pages
    if (back_start - front_end) < total * 0.3:
        logger.warning(
            f"Body extraction too aggressive ({front_end}-{back_start} of {total}), "
            f"falling back to full content"
        )
        front_end = 0
        back_start = total

    body_pages = [p for p in pages[front_end:back_start] if p.strip()]

    logger.info(
        f"PDF extraction: {total} total pages, "
        f"front matter: 0-{front_end}, body: {front_end}-{back_start}, "
        f"back matter: {back_start}-{total}"
    )

    return "\n\n".join(body_pages)
