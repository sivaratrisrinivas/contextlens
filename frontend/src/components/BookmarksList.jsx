import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import axios from 'axios';
import { Logo } from '@/components/Logo';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ease = [0.16, 1, 0.3, 1];

export const BookmarksList = ({ onBack }) => {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/bookmarks`);
        setBookmarks(res.data);
      } catch { toast.error('Failed to load'); }
      finally { setLoading(false); }
    })();
  }, []);

  const deleteBookmark = async (id) => {
    try {
      await axios.delete(`${API}/bookmarks/${id}`);
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch { toast.error('Failed'); }
  };

  const filtered = bookmarks.filter(b =>
    b.word.toLowerCase().includes(search.toLowerCase()) ||
    b.explanation.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7]" data-testid="bookmarks-page">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 h-14 z-40 backdrop-blur-2xl bg-white/70 border-b border-black/[0.04] flex items-center justify-between px-6 sm:px-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-black/[0.04] transition-colors" data-testid="bookmarks-back-btn">
            <ArrowLeft className="w-[18px] h-[18px] text-[#1D1D1F]" strokeWidth={1.5} />
          </button>
          <span className="font-['Manrope'] text-sm font-semibold text-[#1D1D1F]">Saved</span>
        </div>
        <span className="text-[10px] text-[#C7C7CC] tabular-nums">{bookmarks.length}</span>
      </div>

      <div className="max-w-2xl mx-auto px-6 sm:px-10 pt-20 pb-20">
        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C7C7CC]" strokeWidth={1.5} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-white rounded-xl pl-10 pr-4 py-2.5 text-[#1D1D1F] text-sm placeholder-[#C7C7CC] focus:outline-none shadow-sm border border-black/[0.04]"
            data-testid="bookmark-search"
          />
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="py-5 border-b border-black/[0.04]">
                <div className="h-5 w-24 bg-black/[0.04] rounded-lg pulse-soft" />
                <div className="h-3 w-full bg-black/[0.04] rounded mt-3 pulse-soft" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20" data-testid="empty-bookmarks">
            <p className="text-[#C7C7CC] text-sm">
              {search ? 'No matches' : 'No saved words yet'}
            </p>
          </div>
        ) : (
          <div data-testid="bookmarks-list">
            <AnimatePresence>
              {filtered.map((bm, i) => (
                <motion.div
                  key={bm.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.03, duration: 0.3, ease }}
                  className="group py-5 border-b border-black/[0.04] last:border-0"
                  data-testid={`bookmark-item-${bm.id}`}
                >
                  <div
                    className="flex items-start justify-between gap-4 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === bm.id ? null : bm.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3">
                        <h3 className="font-['Manrope'] text-lg font-medium text-[#1D1D1F] tracking-tight">
                          {bm.word}
                        </h3>
                        <span className="text-[10px] text-[#C7C7CC] truncate max-w-[150px]">{bm.paper_title}</span>
                      </div>
                      <p className={`text-[#86868B] text-sm font-['Newsreader'] leading-relaxed mt-1 ${
                        expandedId === bm.id ? '' : 'line-clamp-2'
                      }`}>
                        {bm.explanation}
                      </p>
                      {expandedId === bm.id && bm.context && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 bg-[#F5F5F7] rounded-xl p-3"
                        >
                          <p className="text-[#86868B] text-xs font-['Newsreader'] italic">
                            ...{bm.context.substring(0, 150)}...
                          </p>
                        </motion.div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 pt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteBookmark(bm.id); }}
                        className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/[0.04] transition-all"
                        data-testid={`delete-bookmark-${bm.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#C7C7CC]" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};
