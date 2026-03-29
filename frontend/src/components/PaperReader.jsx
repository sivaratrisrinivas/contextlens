import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, BookmarkCheck, X, Sparkles, Copy, ChevronLeft, Zap } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * DJB2 hash — O(n) where n = string length. Deterministic, fast.
 */
function makeFingerprint(word, context) {
  const raw = `${word.toLowerCase().trim()}|${context.trim()}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Split content into paragraphs, then tokenize each paragraph into words.
 * Preserves paragraph structure from PDF extraction.
 * Returns: [ { paragraphIndex, tokens: [{text, space, globalIndex, clean, fingerprint, context}] } ]
 */
function tokenizeParagraphs(text) {
  // Normalize line endings (CRLF → LF) then split by double newlines
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawParagraphs = normalized.split(/\n\s*\n/);
  const paragraphs = [];
  let globalIdx = 0;

  // First pass: create all tokens with global indices
  const allTokens = [];
  const paragraphMeta = [];

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const paraText = rawParagraphs[pIdx].trim();
    if (!paraText) continue;

    const tokens = [];
    const regex = /(\S+)(\s*)/g;
    let match;
    while ((match = regex.exec(paraText)) !== null) {
      const token = {
        text: match[1],
        space: match[2],
        globalIndex: globalIdx,
        clean: match[1].replace(/[^a-zA-Z0-9'-]/g, '').toLowerCase(),
        fingerprint: null,
        context: null,
      };
      tokens.push(token);
      allTokens.push(token);
      globalIdx++;
    }

    if (tokens.length > 0) {
      paragraphMeta.push({ paragraphIndex: pIdx, startGlobal: tokens[0].globalIndex, tokens });
    }
  }

  // Second pass: compute fingerprints using surrounding context window
  // O(N) total — each token visits a fixed-size window
  for (let i = 0; i < allTokens.length; i++) {
    const t = allTokens[i];
    if (t.clean) {
      const start = Math.max(0, i - 20);
      const end = Math.min(allTokens.length, i + 20);
      const contextWords = [];
      for (let j = start; j < end; j++) {
        contextWords.push(allTokens[j].text);
      }
      t.context = contextWords.join(' ');
      t.fingerprint = makeFingerprint(t.clean, t.context);
    }
  }

  return { paragraphs: paragraphMeta, totalWords: allTokens.length };
}

const WordToken = ({ token, isActive, isBookmarked, onClick }) => {
  const classes = [
    'word-token',
    isActive ? 'active' : '',
    isBookmarked ? 'bookmarked' : ''
  ].filter(Boolean).join(' ');

  return (
    <>
      <span
        className={classes}
        onClick={() => onClick(token)}
        data-testid={`word-${token.globalIndex}`}
      >
        {token.text}
      </span>
      {token.space && <span>{token.space}</span>}
    </>
  );
};

const ExplanationPanel = ({ lookup, onClose, onBookmark, isBookmarked, isLoading }) => {
  return (
    <AnimatePresence>
      {(lookup || isLoading) && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed right-0 top-0 h-full w-full sm:w-[420px] z-50"
          data-testid="explanation-panel"
        >
          <div className="h-full glass-panel rounded-none sm:rounded-l-3xl border-l border-white/10 flex flex-col"
            style={{ background: 'rgba(10, 10, 10, 0.85)', backdropFilter: 'blur(60px)' }}
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <span className="font-outfit text-sm uppercase tracking-[0.15em] text-gray-400">
                  Context Lens
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                data-testid="close-panel-btn"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <ScrollArea className="flex-1 p-6">
              {isLoading ? (
                <div className="space-y-6" data-testid="loading-indicator">
                  <div className="space-y-3">
                    <div className="h-10 w-32 bg-white/5 rounded-xl pulse-glow" />
                    <div className="h-4 w-48 bg-white/5 rounded-lg pulse-glow" style={{ animationDelay: '0.2s' }} />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-white/5 rounded pulse-glow" style={{ animationDelay: '0.3s' }} />
                    <div className="h-3 w-5/6 bg-white/5 rounded pulse-glow" style={{ animationDelay: '0.4s' }} />
                    <div className="h-3 w-4/6 bg-white/5 rounded pulse-glow" style={{ animationDelay: '0.5s' }} />
                  </div>
                </div>
              ) : lookup ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-outfit text-3xl font-bold text-white tracking-tight" data-testid="lookup-word">
                      {lookup.word}
                    </h2>
                    <div className="flex items-center gap-2 mt-2">
                      {lookup.cached && (
                        <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-xs">
                          <Zap className="w-3 h-3 mr-1" />
                          Instant
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium">
                      Explanation
                    </p>
                    <p className="text-gray-200 leading-relaxed text-[15px]" data-testid="lookup-explanation">
                      {lookup.explanation}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium">
                      Context
                    </p>
                    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/5">
                      <p className="text-gray-400 text-sm leading-relaxed italic">
                        "...{lookup.context}..."
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={onBookmark}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm transition-all ${
                        isBookmarked
                          ? 'bg-acid-500/20 text-lime-400 border border-lime-500/30'
                          : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10'
                      }`}
                      data-testid="bookmark-btn"
                    >
                      {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                      {isBookmarked ? 'Saved' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        try {
                          const textarea = document.createElement('textarea');
                          textarea.value = lookup.explanation;
                          textarea.style.position = 'fixed';
                          textarea.style.opacity = '0';
                          document.body.appendChild(textarea);
                          textarea.select();
                          document.execCommand('copy');
                          document.body.removeChild(textarea);
                          toast.success('Copied to clipboard');
                        } catch (err) {
                          toast.error('Copy not supported');
                        }
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 transition-all"
                      data-testid="copy-btn"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                </div>
              ) : null}
            </ScrollArea>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const PaperReader = ({ paper, onBack }) => {
  const [activeLookup, setActiveLookup] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bookmarkedWords, setBookmarkedWords] = useState(new Set());
  const [cachedCount, setCachedCount] = useState(0);

  // Map<fingerprint, lookup_data> — O(1) get/set
  const cacheRef = useRef(new Map());

  // Tokenize into paragraphs with pre-computed fingerprints: O(N) one-time
  const { paragraphs, totalWords } = useMemo(
    () => tokenizeParagraphs(paper.content),
    [paper.content]
  );

  // Batch prefetch all cached lookups on paper load: O(k) one-time
  useEffect(() => {
    const prefetch = async () => {
      try {
        const res = await axios.get(`${API}/lookup/paper-cache/${paper.id}`);
        const cache = cacheRef.current;
        for (const entry of res.data) {
          cache.set(entry.fingerprint, entry);
        }
        setCachedCount(cache.size);
      } catch {
        // No cached data yet
      }
    };
    prefetch();
  }, [paper.id]);

  // Word click: O(1) cache lookup, then API if miss
  const handleWordClick = useCallback(async (token) => {
    if (!token.clean || !token.fingerprint) return;

    const cache = cacheRef.current;
    const cached = cache.get(token.fingerprint);
    if (cached) {
      setActiveLookup({ ...cached, cached: true });
      return;
    }

    setIsLoading(true);
    setActiveLookup(null);

    try {
      const res = await axios.post(`${API}/lookup`, {
        word: token.text.replace(/[^a-zA-Z0-9'-]/g, ''),
        context: token.context,
        paper_id: paper.id
      });
      cache.set(token.fingerprint, res.data);
      setCachedCount(cache.size);
      setActiveLookup(res.data);
    } catch {
      toast.error('Failed to get explanation');
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  }, [paper]);

  const handleClosePanel = useCallback(() => {
    setActiveLookup(null);
    setIsLoading(false);
  }, []);

  const handleBookmark = useCallback(async () => {
    if (!activeLookup) return;
    try {
      await axios.post(`${API}/bookmarks`, {
        word: activeLookup.word,
        context: activeLookup.context,
        explanation: activeLookup.explanation,
        paper_id: paper.id,
        paper_title: paper.title
      });
      setBookmarkedWords(prev => new Set([...prev, activeLookup.word.toLowerCase()]));
      toast.success('Explanation saved');
    } catch {
      toast.error('Failed to save bookmark');
    }
  }, [activeLookup, paper]);

  const isCurrentBookmarked = activeLookup
    ? bookmarkedWords.has(activeLookup.word.toLowerCase())
    : false;

  return (
    <div className="min-h-screen relative" data-testid="paper-reader">
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b border-white/5" style={{ background: 'rgba(5,5,5,0.8)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            data-testid="back-btn"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-outfit text-lg font-semibold text-white truncate" data-testid="paper-title">
              {paper.title}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Click any word for AI-powered context
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {cachedCount > 0 && (
              <Badge className="bg-lime-500/10 text-lime-400 border-lime-500/20 text-xs" data-testid="cache-badge">
                <Zap className="w-3 h-3 mr-1" />
                {cachedCount} cached
              </Badge>
            )}
            <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-xs">
              {totalWords} words
            </Badge>
          </div>
        </div>
      </div>

      {/* Reading area — paragraph-based rendering preserves PDF structure */}
      <div className="max-w-4xl mx-auto px-8 sm:px-16 py-12 sm:py-16 relative z-10" data-testid="paper-content">
        {paragraphs.map((para) => (
          <p
            key={para.paragraphIndex}
            className="text-gray-200 leading-[1.9] text-[17px] tracking-wide mb-5"
          >
            {para.tokens.map((token) => (
              <WordToken
                key={token.globalIndex}
                token={token}
                isActive={activeLookup?.word?.toLowerCase() === token.clean}
                isBookmarked={bookmarkedWords.has(token.clean)}
                onClick={handleWordClick}
              />
            ))}
          </p>
        ))}
      </div>

      {/* Side panel */}
      <ExplanationPanel
        lookup={activeLookup}
        onClose={handleClosePanel}
        onBookmark={handleBookmark}
        isBookmarked={isCurrentBookmarked}
        isLoading={isLoading}
      />
    </div>
  );
};
