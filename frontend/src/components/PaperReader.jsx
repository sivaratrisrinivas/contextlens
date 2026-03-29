import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, BookmarkCheck, X, Copy, ArrowLeft, Zap } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import axios from 'axios';

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

/** Extract the sentence containing the token at globalIndex */
function extractSentence(idx, tokens) {
  // Walk backward to find sentence start (after . ! ? or start of text)
  let start = idx;
  while (start > 0) {
    const prev = tokens[start - 1].text;
    if (/[.!?]["']?\s*$/.test(prev)) break;
    start--;
  }
  // Walk forward to find sentence end
  let end = idx;
  while (end < tokens.length - 1) {
    const curr = tokens[end].text;
    if (/[.!?]["']?\s*$/.test(curr)) { end++; break; }
    end++;
  }
  const sentenceTokens = [];
  for (let j = start; j < end; j++) sentenceTokens.push(tokens[j].text);
  return sentenceTokens.join(' ');
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
        fingerprint: null, context: null, sentence: null,
      };
      tokens.push(t);
      allTokens.push(t);
      globalIdx++;
    }
    if (tokens.length > 0) {
      paragraphMeta.push({ paragraphIndex: pIdx, tokens });
    }
  }

  // Pre-compute fingerprints and contexts
  for (let i = 0; i < allTokens.length; i++) {
    if (allTokens[i].clean) {
      allTokens[i].context = extractContext(i, allTokens);
      allTokens[i].fingerprint = makeFingerprint(allTokens[i].clean, allTokens[i].context);
      allTokens[i].sentence = extractSentence(i, allTokens);
    }
  }

  return { paragraphs: paragraphMeta, totalWords: allTokens.length, allTokens };
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

const TABS = [
  { id: 'define', label: 'Define' },
  { id: 'intent', label: 'Intent' },
  { id: 'challenge', label: 'Challenge' },
];

const LoadingSkeleton = () => (
  <div className="space-y-5" data-testid="loading-indicator">
    <div className="h-8 w-28 bg-black/[0.04] rounded-lg pulse-soft" />
    <div className="space-y-2.5">
      <div className="h-3 w-full bg-black/[0.04] rounded pulse-soft" />
      <div className="h-3 w-5/6 bg-black/[0.04] rounded pulse-soft" style={{ animationDelay: '0.15s' }} />
      <div className="h-3 w-3/5 bg-black/[0.04] rounded pulse-soft" style={{ animationDelay: '0.3s' }} />
    </div>
  </div>
);

const Panel = ({
  activeTab, setActiveTab, word, defineLookup, intentLookup, challengeLookup,
  loadingDefine, loadingIntent, loadingChallenge,
  onClose, onBookmark, isBookmarked
}) => {
  const hasContent = word || loadingDefine || loadingIntent || loadingChallenge;

  return (
    <AnimatePresence>
      {hasContent && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.5, ease }}
          className="fixed top-0 right-0 h-full w-full sm:w-[400px] z-50"
          data-testid="explanation-panel"
        >
          <div className="h-full backdrop-blur-3xl bg-white/80 border-l border-black/[0.04] shadow-2xl flex flex-col">
            {/* Header with tabs */}
            <div className="px-7 pt-5 pb-0 border-b border-black/[0.04]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-['Manrope'] text-xl sm:text-2xl font-medium text-[#1D1D1F] tracking-tight" data-testid="lookup-word">
                  {word || '...'}
                </h2>
                <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-black/[0.04] transition-colors" data-testid="close-panel-btn">
                  <X className="w-4 h-4 text-[#86868B]" strokeWidth={1.5} />
                </button>
              </div>
              {/* Tabs */}
              <div className="flex gap-0" data-testid="panel-tabs">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative px-4 pb-3 text-[12px] font-medium tracking-wide transition-colors ${
                      activeTab === tab.id
                        ? 'text-[#1D1D1F]'
                        : 'text-[#C7C7CC] hover:text-[#86868B]'
                    }`}
                    data-testid={`tab-${tab.id}`}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#1D1D1F]"
                        transition={{ duration: 0.25, ease }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-7 py-6">
                <AnimatePresence mode="wait">
                  {/* DEFINE TAB */}
                  {activeTab === 'define' && (
                    <motion.div key="define" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      {loadingDefine ? <LoadingSkeleton /> : defineLookup ? (
                        <div>
                          {defineLookup.cached && (
                            <div className="flex items-center gap-1 mb-4 text-[#86868B]">
                              <Zap className="w-3 h-3" strokeWidth={1.5} />
                              <span className="text-[10px] uppercase tracking-wider">Instant</span>
                            </div>
                          )}
                          <p className="text-[#1D1D1F] leading-[1.7] text-[15px] font-['Newsreader']" data-testid="define-content">
                            {defineLookup.explanation}
                          </p>
                        </div>
                      ) : null}
                    </motion.div>
                  )}

                  {/* INTENT TAB */}
                  {activeTab === 'intent' && (
                    <motion.div key="intent" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      {loadingIntent ? <LoadingSkeleton /> : intentLookup ? (
                        <div>
                          {intentLookup.cached && (
                            <div className="flex items-center gap-1 mb-4 text-[#86868B]">
                              <Zap className="w-3 h-3" strokeWidth={1.5} />
                              <span className="text-[10px] uppercase tracking-wider">Instant</span>
                            </div>
                          )}
                          <p className="text-[#1D1D1F] leading-[1.7] text-[15px] font-['Newsreader']" data-testid="intent-content">
                            {intentLookup.analysis}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[#C7C7CC] text-sm font-['Newsreader'] italic">
                          Analyzing rhetorical intent...
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* CHALLENGE TAB */}
                  {activeTab === 'challenge' && (
                    <motion.div key="challenge" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      {loadingChallenge ? <LoadingSkeleton /> : challengeLookup ? (
                        <div>
                          {challengeLookup.cached && (
                            <div className="flex items-center gap-1 mb-4 text-[#86868B]">
                              <Zap className="w-3 h-3" strokeWidth={1.5} />
                              <span className="text-[10px] uppercase tracking-wider">Instant</span>
                            </div>
                          )}
                          <p className="text-[#1D1D1F] leading-[1.7] text-[15px] font-['Newsreader'] whitespace-pre-line" data-testid="challenge-content">
                            {challengeLookup.analysis}
                          </p>
                          <div className="bg-[#F5F5F7] rounded-xl p-4 mt-5">
                            <p className="text-[11px] uppercase tracking-[0.1em] text-[#86868B] font-['Manrope'] font-medium mb-2">Sentence under analysis</p>
                            <p className="text-[#86868B] text-[13px] font-['Newsreader'] italic leading-relaxed">
                              {challengeLookup.sentence}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[#C7C7CC] text-sm font-['Newsreader'] italic">
                          Stress-testing assumptions...
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* Bottom actions */}
            <div className="px-7 py-4 border-t border-black/[0.04] flex gap-2">
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
                  const text = activeTab === 'define' ? defineLookup?.explanation
                    : activeTab === 'intent' ? intentLookup?.analysis
                    : challengeLookup?.analysis;
                  if (!text) return;
                  try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const PaperReader = ({ paper, onBack }) => {
  const [activeWord, setActiveWord] = useState(null); // the clicked token
  const [activeTab, setActiveTab] = useState('define');
  const [bookmarkedWords, setBookmarkedWords] = useState(new Set());

  // Define tab state
  const [defineLookup, setDefineLookup] = useState(null);
  const [loadingDefine, setLoadingDefine] = useState(false);

  // Intent tab state
  const [intentLookup, setIntentLookup] = useState(null);
  const [loadingIntent, setLoadingIntent] = useState(false);

  // Challenge tab state
  const [challengeLookup, setChallengeLookup] = useState(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);

  // Caches: Map<fingerprint, data>
  const defineCache = useRef(new Map());
  const intentCache = useRef(new Map());
  const challengeCache = useRef(new Map());

  const { paragraphs, totalWords, allTokens } = useMemo(
    () => tokenizeParagraphs(paper.content), [paper.content]
  );

  // Batch prefetch all 3 caches on paper load
  useEffect(() => {
    const prefetch = async () => {
      try {
        const [defRes, intRes, assRes] = await Promise.all([
          axios.get(`${API}/lookup/paper-cache/${paper.id}`).catch(() => ({ data: [] })),
          axios.get(`${API}/rhetorical/paper-cache/${paper.id}`).catch(() => ({ data: [] })),
          axios.get(`${API}/assumptions/paper-cache/${paper.id}`).catch(() => ({ data: [] })),
        ]);
        for (const e of defRes.data) defineCache.current.set(e.fingerprint, e);
        for (const e of intRes.data) intentCache.current.set(e.fingerprint, e);
        for (const e of assRes.data) challengeCache.current.set(e.fingerprint, e);
      } catch {}
    };
    prefetch();
  }, [paper.id]);

  // Fetch definition
  const fetchDefine = useCallback(async (token) => {
    const fp = token.fingerprint;
    const cached = defineCache.current.get(fp);
    if (cached) { setDefineLookup({ ...cached, cached: true }); return; }

    setLoadingDefine(true);
    setDefineLookup(null);
    try {
      const res = await axios.post(`${API}/lookup`, {
        word: token.text.replace(/[^a-zA-Z0-9'-]/g, ''),
        context: token.context, paper_id: paper.id
      });
      defineCache.current.set(fp, res.data);
      setDefineLookup(res.data);
    } catch { toast.error('Definition failed'); }
    finally { setLoadingDefine(false); }
  }, [paper.id]);

  // Fetch rhetorical intent
  const fetchIntent = useCallback(async (token) => {
    const fp = makeFingerprint(`rhetorical:${token.clean}`, token.sentence);
    const cached = intentCache.current.get(fp);
    if (cached) { setIntentLookup({ ...cached, cached: true }); return; }

    setLoadingIntent(true);
    setIntentLookup(null);
    try {
      const res = await axios.post(`${API}/rhetorical`, {
        word: token.text.replace(/[^a-zA-Z0-9'-]/g, ''),
        sentence: token.sentence, context: token.context, paper_id: paper.id
      });
      intentCache.current.set(res.data.fingerprint, res.data);
      setIntentLookup(res.data);
    } catch { toast.error('Intent analysis failed'); }
    finally { setLoadingIntent(false); }
  }, [paper.id]);

  // Fetch assumption stress-test
  const fetchChallenge = useCallback(async (token) => {
    const fp = makeFingerprint('assumptions', token.sentence);
    const cached = challengeCache.current.get(fp);
    if (cached) { setChallengeLookup({ ...cached, cached: true }); return; }

    setLoadingChallenge(true);
    setChallengeLookup(null);
    try {
      const res = await axios.post(`${API}/assumptions`, {
        sentence: token.sentence, context: token.context, paper_id: paper.id
      });
      challengeCache.current.set(res.data.fingerprint, res.data);
      setChallengeLookup(res.data);
    } catch { toast.error('Challenge analysis failed'); }
    finally { setLoadingChallenge(false); }
  }, [paper.id]);

  // On word click: fetch Define immediately, reset other tabs
  const handleWordClick = useCallback(async (token) => {
    if (!token.clean || !token.fingerprint) return;
    setActiveWord(token);
    setActiveTab('define');
    setIntentLookup(null);
    setChallengeLookup(null);
    setLoadingIntent(false);
    setLoadingChallenge(false);
    fetchDefine(token);
  }, [fetchDefine]);

  // On tab switch: lazy-fetch if needed
  useEffect(() => {
    if (!activeWord) return;
    if (activeTab === 'intent' && !intentLookup && !loadingIntent) {
      fetchIntent(activeWord);
    }
    if (activeTab === 'challenge' && !challengeLookup && !loadingChallenge) {
      fetchChallenge(activeWord);
    }
  }, [activeTab, activeWord, intentLookup, challengeLookup, loadingIntent, loadingChallenge, fetchIntent, fetchChallenge]);

  const handleBookmark = useCallback(async () => {
    if (!defineLookup) return;
    try {
      await axios.post(`${API}/bookmarks`, {
        word: defineLookup.word, context: defineLookup.context,
        explanation: defineLookup.explanation,
        paper_id: paper.id, paper_title: paper.title
      });
      setBookmarkedWords(prev => new Set([...prev, defineLookup.word.toLowerCase()]));
      toast.success('Saved');
    } catch { toast.error('Failed to save'); }
  }, [defineLookup, paper]);

  const handleClose = useCallback(() => {
    setActiveWord(null);
    setDefineLookup(null);
    setIntentLookup(null);
    setChallengeLookup(null);
    setLoadingDefine(false);
    setLoadingIntent(false);
    setLoadingChallenge(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F7]" data-testid="paper-reader">
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

      <div className="max-w-3xl mx-auto px-6 sm:px-0 pt-14">
        <div className="bg-white sm:rounded-3xl sm:my-8 sm:shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-screen sm:min-h-0">
          <div className="px-8 sm:px-16 py-16 sm:py-20" data-testid="paper-content">
            {paragraphs.map((para) => (
              <p key={para.paragraphIndex} className="font-['Newsreader'] text-[#1D1D1F] text-lg sm:text-xl leading-[1.8] tracking-[0.01em] mb-5">
                {para.tokens.map((token) => (
                  <WordToken
                    key={token.globalIndex}
                    token={token}
                    isActive={activeWord?.globalIndex === token.globalIndex}
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
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        word={activeWord?.text?.replace(/[^a-zA-Z0-9'-]/g, '')}
        defineLookup={defineLookup}
        intentLookup={intentLookup}
        challengeLookup={challengeLookup}
        loadingDefine={loadingDefine}
        loadingIntent={loadingIntent}
        loadingChallenge={loadingChallenge}
        onClose={handleClose}
        onBookmark={handleBookmark}
        isBookmarked={activeWord ? bookmarkedWords.has(activeWord.clean) : false}
      />
    </div>
  );
};
