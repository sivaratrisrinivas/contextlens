"""
Smart PDF body matter extraction v2.
Detects and strips front matter (TOC, copyright, preface, dedication, etc.)
and back matter (index, bibliography, appendix, glossary, about author, etc.)
from book PDFs, returning only the main body content with formatting preserved.

Time complexity: O(P) where P = number of pages.
"""

import re
import logging

logger = logging.getLogger(__name__)

# --- Compiled patterns for performance ---

# Front matter strong indicators (any one = very likely front matter)
_FM_STRONG = re.compile(
    r'copyright|all\s+rights\s+reserved|isbn[\s\-:]|published\s+by|'
    r'library\s+of\s+congress|cataloging.in.publication|printing\s+history|'
    r'first\s+(edition|printing|published)|reprinted|permissions?|'
    r'typeset|cover\s+design|jacket\s+design|book\s+design',
    re.IGNORECASE
)

# Front matter medium indicators
_FM_MEDIUM = re.compile(
    r'^(table\s+of\s+)?contents$|^dedication$|^dedicated\s+to|'
    r'^acknowledgm?ents?$|^foreword$|^preface$|^introduction$|'
    r'^about\s+this\s+book$|^how\s+to\s+(read|use)\s+this|'
    r'^prologue$|^epigraph$|^list\s+of\s+(figures|tables|illustrations)|'
    r'^editor.s?\s+note|^publisher.s?\s+note|^note\s+to\s+the\s+reader|'
    r'^a\s+note\s+(on|about)|^author.s?\s+note|^translator.s?\s+note',
    re.IGNORECASE | re.MULTILINE
)

# TOC: lines with dotted leaders or wide spacing to page numbers
_TOC_LINE = re.compile(
    r'.{3,}\s*\.{3,}\s*\d+|'       # "Chapter 1 .... 15"
    r'.{8,}\s{4,}\d{1,4}\s*$|'     # "Chapter 1          15"
    r'^\s*(chapter|part|section)\s+\S+\s*\.{2,}\s*\d+',  # explicit chapter + dots + number
    re.MULTILINE | re.IGNORECASE
)

# Back matter strong indicators
_BM_STRONG = re.compile(
    r'^index$|^bibliography$|^references$|^works?\s+cited$|'
    r'^endnotes$|^glossary$|^source\s+notes?$',
    re.IGNORECASE | re.MULTILINE
)

# Back matter medium indicators
_BM_MEDIUM = re.compile(
    r'^appendix|^about\s+the\s+authors?$|^author\s*bio|'
    r'^further\s+reading$|^suggested\s+reading$|^recommended\s+reading$|'
    r'^also\s+by\b|^other\s+books?\s+by|^notes$|^photo\s+credits?$|'
    r'^image\s+credits?$|^colophon$|^about\s+the\s+publisher$|'
    r'^permissions?\s+credits?|^text\s+credits?|^acknowledgm?ents?$',
    re.IGNORECASE | re.MULTILINE
)

# Index page: many short alphabetical entries with page numbers
_INDEX_LINE = re.compile(r'^[A-Z].{1,60},?\s+\d[\d,\s\-–]*$', re.MULTILINE)

# Chapter/part/section headings indicating body content
_CHAPTER_START = re.compile(
    r'^\s*(chapter|part|section|book)\s+(\d+|[ivxlc]+|one|two|three|four|five|'
    r'six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|'
    r'sixteen|seventeen|eighteen|nineteen|twenty)',
    re.IGNORECASE | re.MULTILINE
)

# Numbered chapter like just "1" or "ONE" alone on a line
_NUMBERED_CHAPTER = re.compile(r'^\s*(\d{1,2}|[A-Z]{2,10})\s*$', re.MULTILINE)


def _compute_text_density(text: str) -> float:
    """Words per line — body content has higher density than TOC/index/title pages."""
    lines = [line for line in text.strip().split('\n') if line.strip()]
    if not lines:
        return 0.0
    total_words = sum(len(line.split()) for line in lines)
    return total_words / len(lines)


def _score_front_matter(text: str, page_idx: int, total: int) -> float:
    """Score how likely page is front matter. Higher = more likely."""
    score = 0.0
    stripped = text.strip()
    char_count = len(stripped)

    # Very short pages at start (title page, half-title, blank-ish)
    if char_count < 150 and page_idx < total * 0.15:
        score += 4.0
    elif char_count < 50:
        score += 5.0  # Nearly blank page

    # Strong copyright/legal indicators
    if _FM_STRONG.search(stripped):
        score += 8.0

    # Medium structural indicators (heading-level match)
    if _FM_MEDIUM.search(stripped):
        score += 5.0

    # TOC page: many dotted-leader lines
    toc_hits = len(_TOC_LINE.findall(stripped))
    if toc_hits >= 3:
        score += 7.0
    elif toc_hits >= 1:
        score += 3.0

    # Low text density in early pages = front matter (sparse layout)
    density = _compute_text_density(stripped)
    if density < 4.0 and page_idx < total * 0.15 and char_count > 20:
        score += 2.0

    # Position: very early pages get a small boost
    if page_idx < 3:
        score += 1.5
    elif page_idx < total * 0.08:
        score += 0.5

    return score


def _score_back_matter(text: str, page_idx: int, total: int) -> float:
    """Score how likely page is back matter. Higher = more likely."""
    score = 0.0
    stripped = text.strip()
    char_count = len(stripped)

    # Strong back matter headings
    if _BM_STRONG.search(stripped):
        score += 8.0

    # Medium indicators
    if _BM_MEDIUM.search(stripped):
        score += 5.0

    # Index-style page: many "Term, 12, 45-47" lines
    index_hits = len(_INDEX_LINE.findall(stripped))
    if index_hits >= 8:
        score += 9.0
    elif index_hits >= 4:
        score += 6.0
    elif index_hits >= 2:
        score += 3.0

    # Very short pages near end
    if char_count < 100 and page_idx > total * 0.85:
        score += 3.0

    # Position: later pages get a small boost
    if page_idx > total * 0.90:
        score += 1.0
    elif page_idx > total * 0.80:
        score += 0.5

    return score


def _is_body_start(text: str) -> bool:
    """Does this page look like the start of body content?"""
    if _CHAPTER_START.search(text):
        return True
    # A page with high text density and no front-matter signals
    density = _compute_text_density(text)
    if density >= 8.0 and len(text.strip()) > 500:
        return True
    return False


def extract_body_matter(pages: list[str]) -> str:
    """
    Extract only body content from a book's pages.
    Returns formatted text with paragraph breaks preserved.
    """
    total = len(pages)
    if total == 0:
        return ""

    # Short documents: return everything
    if total < 8:
        return "\n\n".join(p for p in pages if p.strip())

    # --- Score all pages: O(P) ---
    front_scores = []
    back_scores = []
    for i, text in enumerate(pages):
        front_scores.append(_score_front_matter(text, i, total))
        back_scores.append(_score_back_matter(text, i, total))

    # --- Find front matter end ---
    # Scan up to 30% of pages from the start, minimum 10
    max_front = min(total, max(10, int(total * 0.30)))
    front_end = 0
    consecutive_low = 0  # Track consecutive non-front-matter pages

    for i in range(max_front):
        if front_scores[i] >= 3.0:
            # This page is front matter
            front_end = i + 1
            consecutive_low = 0
        elif _is_body_start(pages[i]):
            # Found clear body start
            front_end = i
            break
        else:
            consecutive_low += 1
            # If we see 2+ consecutive non-front-matter pages after some front matter, body has started
            if consecutive_low >= 2 and front_end > 0:
                front_end = i - 1 if i > 0 else i
                break

    # --- Find back matter start ---
    # Scan up to 30% from the end
    max_back_idx = max(front_end + 1, total - max(8, int(total * 0.30)))
    back_start = total

    for i in range(total - 1, max_back_idx - 1, -1):
        if back_scores[i] >= 3.0:
            back_start = i
        elif back_scores[i] < 1.0 and back_start < total:
            # Found a non-back-matter page, stop scanning
            break

    # --- Sanity checks ---
    body_pages_count = back_start - front_end
    if body_pages_count < max(3, total * 0.2):
        logger.warning(
            f"Body extraction too aggressive: pages {front_end}-{back_start} of {total} "
            f"({body_pages_count} pages = {body_pages_count*100//total}%). Using full content."
        )
        front_end = 0
        back_start = total

    body = [p for p in pages[front_end:back_start] if p.strip()]

    logger.info(
        f"PDF body extraction: {total} pages total | "
        f"front matter: pages 0–{front_end} | "
        f"body: pages {front_end}–{back_start} ({len(body)} non-empty) | "
        f"back matter: pages {back_start}–{total}"
    )

    return "\n\n".join(body)
