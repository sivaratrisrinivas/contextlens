import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, BookmarkCheck, X, Copy, ArrowLeft, Zap } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import axios from 'axios';
import { Logo } from '@/components/Logo';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ease = [0.16, 1, 0.3, 1];

function makeFingerprint(word, context) {
  const raw = `${word.toLowerCase().trim()}|${context.trim()}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function extractContext(idx, tokens) {
  const s = Math.max(0, idx - 20);
  const e = Math.min(tokens.length, idx + 20);
  const parts = [];
  for (let j = s; j < e; j++) parts.push(tokens[j].text);
  return parts.join(' ');
}

function tokenizeParagraphs(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawParagraphs = normalized.split(/\n\s*\n/);
  const allTokens = [];
  const paragraphMeta = [];
  let globalIdx = 0;

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const para = rawParagraphs[pIdx].trim();
    if (!para) continue;
    const tokens = [];
    const regex = /(\S+)(\s*)/g;
    let match;
    while ((match = regex.exec(para)) !== null) {
      const t = {
        text: match[1], space: match[2], globalIndex: globalIdx,
        clean: match[1].replace(/[^a-zA-Z0-9'-]/g, '').toLowerCase(),
        fingerprint: null, context: null,
      };
      tokens.push(t);
      allTokens.push(t);
      globalIdx++;
    }
    if (tokens.length > 0) {
      paragraphMeta.push({ paragraphIndex: pIdx, tokens });
    }
  }

  for (let i = 0; i < allTokens.length; i++) {
    if (allTokens[i].clean) {
      allTokens[i].context = extractContext(i, allTokens);
      allTokens[i].fingerprint = makeFingerprint(allTokens[i].clean, allTokens[i].context);
    }
  }

  return { paragraphs: paragraphMeta, totalWords: allTokens.length };
}

const WordToken = ({ token, isActive, isBookmarked, onClick }) => {
  const cls = ['word-token', isActive ? 'active' : '', isBookmarked ? 'bookmarked' : ''].filter(Boolean).join(' ');
  return (
    <>
      <span className={cls} onClick={() => onClick(token)} data-testid={`word-${token.globalIndex}`}>
        {token.text}
      </span>
      {token.space && <span>{token.space}</span>}
    </>
  );
};

const Panel = ({ lookup, onClose, onBookmark, isBookmarked, isLoading }) => (
  <AnimatePresence>
    {(lookup || isLoading) && (
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ duration: 0.5, ease }}
        className="fixed top-0 right-0 h-full w-full sm:w-[380px] z-50"
        data-testid="explanation-panel"
      >
        <div className="h-full backdrop-blur-3xl bg-white/80 border-l border-black/[0.04] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-7 py-5 border-b border-black/[0.04]">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#86868B]">
              Definition
            </span>
            <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-black/[0.04] transition-colors" data-testid="close-panel-btn">
              <X className="w-4 h-4 text-[#86868B]" strokeWidth={1.5} />
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-7 py-6">
              {isLoading ? (
                <div className="space-y-5" data-testid="loading-indicator">
                  <div className="h-8 w-28 bg-black/[0.04] rounded-lg pulse-soft" />
                  <div className="space-y-2.5">
                    <div className="h-3 w-full bg-black/[0.04] rounded pulse-soft" />
                    <div className="h-3 w-5/6 bg-black/[0.04] rounded pulse-soft" style={{ animationDelay: '0.15s' }} />
                    <div className="h-3 w-3/5 bg-black/[0.04] rounded pulse-soft" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              ) : lookup ? (
                <div>
                  <div className="mb-6">
                    <h2 className="font-['Manrope'] text-2xl sm:text-3xl font-medium text-[#1D1D1F] tracking-tight" data-testid="lookup-word">
                      {lookup.word}
                    </h2>
                    {lookup.cached && (
                      <div className="flex items-center gap-1 mt-2 text-[#86868B]">
                        <Zap className="w-3 h-3" strokeWidth={1.5} />
                        <span className="text-[10px] uppercase tracking-wider">Instant</span>
                      </div>
                    )}
                  </div>

                  <p className="text-[#1D1D1F] leading-[1.7] text-[15px] font-['Newsreader'] mb-6" data-testid="lookup-explanation">
                    {lookup.explanation}
                  </p>

                  <div className="bg-[#F5F5F7] rounded-xl p-4 mb-6">
                    <p className="text-[#86868B] text-[13px] font-['Newsreader'] italic leading-relaxed">
                      ...{lookup.context?.substring(0, 120)}...
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={onBookmark}
                      className={`p-2.5 rounded-full transition-colors ${
                        isBookmarked ? 'bg-[#1D1D1F] text-white' : 'hover:bg-black/[0.04] text-[#1D1D1F]'
                      }`}
                      data-testid="bookmark-btn"
                    >
                      {isBookmarked ? <BookmarkCheck className="w-4 h-4" strokeWidth={1.5} /> : <Bookmark className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                    <button
                      onClick={() => {
                        try {
                          const ta = document.createElement('textarea');
                          ta.value = lookup.explanation;
                          ta.style.cssText = 'position:fixed;opacity:0';
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                          toast.success('Copied');
                        } catch { toast.error('Copy failed'); }
                      }}
                      className="p-2.5 rounded-full hover:bg-black/[0.04] text-[#1D1D1F] transition-colors"
                      data-testid="copy-btn"
                    >
                      <Copy className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

export const PaperReader = ({ paper, onBack }) => {
  const [activeLookup, setActiveLookup] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bookmarkedWords, setBookmarkedWords] = useState(new Set());
  const [cachedCount, setCachedCount] = useState(0);
  const cacheRef = useRef(new Map());

  const { paragraphs, totalWords } = useMemo(
    () => tokenizeParagraphs(paper.content), [paper.content]
  );

  useEffect(() => {
    const prefetch = async () => {
      try {
        const res = await axios.get(`${API}/lookup/paper-cache/${paper.id}`);
        for (const entry of res.data) cacheRef.current.set(entry.fingerprint, entry);
        setCachedCount(cacheRef.current.size);
      } catch {}
    };
    prefetch();
  }, [paper.id]);

  const handleWordClick = useCallback(async (token) => {
    if (!token.clean || !token.fingerprint) return;
    const cached = cacheRef.current.get(token.fingerprint);
    if (cached) { setActiveLookup({ ...cached, cached: true }); return; }

    setIsLoading(true);
    setActiveLookup(null);
    try {
      const res = await axios.post(`${API}/lookup`, {
        word: token.text.replace(/[^a-zA-Z0-9'-]/g, ''),
        context: token.context, paper_id: paper.id
      });
      cacheRef.current.set(token.fingerprint, res.data);
      setCachedCount(cacheRef.current.size);
      setActiveLookup(res.data);
    } catch { toast.error('Failed'); }
    finally { setIsLoading(false); }
  }, [paper]);

  const handleBookmark = useCallback(async () => {
    if (!activeLookup) return;
    try {
      await axios.post(`${API}/bookmarks`, {
        word: activeLookup.word, context: activeLookup.context,
        explanation: activeLookup.explanation,
        paper_id: paper.id, paper_title: paper.title
      });
      setBookmarkedWords(prev => new Set([...prev, activeLookup.word.toLowerCase()]));
      toast.success('Saved');
    } catch { toast.error('Failed to save'); }
  }, [activeLookup, paper]);

  const handleClose = useCallback(() => {
    setActiveLookup(null);
    setIsLoading(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F7]" data-testid="paper-reader">
      {/* Minimal header */}
      <div className="fixed top-0 left-0 right-0 h-14 z-40 backdrop-blur-2xl bg-white/70 border-b border-black/[0.04] flex items-center justify-between px-6 sm:px-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-black/[0.04] transition-colors" data-testid="back-btn">
            <ArrowLeft className="w-[18px] h-[18px] text-[#1D1D1F]" strokeWidth={1.5} />
          </button>
          <h1 className="font-['Manrope'] text-sm font-semibold text-[#1D1D1F] truncate max-w-[300px]" data-testid="paper-title">
            {paper.title}
          </h1>
        </div>
        <span className="text-[10px] text-[#C7C7CC] tabular-nums">{totalWords}</span>
      </div>

      {/* Paper surface */}
      <div className="max-w-3xl mx-auto px-6 sm:px-0 pt-14">
        <div className="bg-white sm:rounded-3xl sm:my-8 sm:shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-screen sm:min-h-0">
          <div className="px-8 sm:px-16 py-16 sm:py-20" data-testid="paper-content">
            {paragraphs.map((para) => (
              <p
                key={para.paragraphIndex}
                className="font-['Newsreader'] text-[#1D1D1F] text-lg sm:text-xl leading-[1.8] tracking-[0.01em] mb-5"
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
        </div>
      </div>

      <Panel
        lookup={activeLookup}
        onClose={handleClose}
        onBookmark={handleBookmark}
        isBookmarked={activeLookup ? bookmarkedWords.has(activeLookup.word.toLowerCase()) : false}
        isLoading={isLoading}
      />
    </div>
  );
};
