import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Trash2, ChevronLeft, Search, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const BookmarksList = ({ onBack }) => {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchBookmarks();
  }, []);

  const fetchBookmarks = async () => {
    try {
      const res = await axios.get(`${API}/bookmarks`);
      setBookmarks(res.data);
    } catch (err) {
      toast.error('Failed to load bookmarks');
    } finally {
      setLoading(false);
    }
  };

  const deleteBookmark = async (id) => {
    try {
      await axios.delete(`${API}/bookmarks/${id}`);
      setBookmarks(prev => prev.filter(b => b.id !== id));
      toast.success('Bookmark removed');
    } catch (err) {
      toast.error('Failed to remove');
    }
  };

  const filtered = bookmarks.filter(b =>
    b.word.toLowerCase().includes(search.toLowerCase()) ||
    b.explanation.toLowerCase().includes(search.toLowerCase()) ||
    b.paper_title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen" data-testid="bookmarks-page">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-white/5" style={{ background: 'rgba(5,5,5,0.8)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            data-testid="bookmarks-back-btn"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <Bookmark className="w-5 h-5 text-lime-400" />
            <h1 className="font-outfit text-lg font-semibold text-white">
              Saved Explanations
            </h1>
          </div>
          <Badge className="bg-white/5 text-gray-400 border-white/10 text-xs">
            {bookmarks.length}
          </Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved words..."
            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-11 pr-5 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/30 transition-all text-sm"
            data-testid="bookmark-search"
          />
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-panel p-6 space-y-3">
                <div className="h-6 w-24 bg-white/5 rounded-lg pulse-glow" />
                <div className="h-3 w-full bg-white/5 rounded pulse-glow" />
                <div className="h-3 w-3/4 bg-white/5 rounded pulse-glow" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20" data-testid="empty-bookmarks">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Bookmark className="w-7 h-7 text-gray-600" />
            </div>
            <p className="text-gray-500 text-sm">
              {search ? 'No matches found' : 'No saved explanations yet'}
            </p>
            <p className="text-gray-600 text-xs mt-1">
              {search ? 'Try a different search' : 'Click the save button when reading a paper'}
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="bookmarks-list">
            <AnimatePresence>
              {filtered.map((bookmark, i) => (
                <motion.div
                  key={bookmark.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                  className="glass-panel overflow-hidden"
                  data-testid={`bookmark-item-${bookmark.id}`}
                >
                  <div
                    className="p-5 cursor-pointer hover:bg-white/[0.02] transition-all"
                    onClick={() => setExpandedId(expandedId === bookmark.id ? null : bookmark.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-outfit text-xl font-bold text-cyan-300">
                            {bookmark.word}
                          </h3>
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <FileText className="w-3 h-3" />
                            <span className="text-xs truncate max-w-[200px]">{bookmark.paper_title}</span>
                          </div>
                        </div>
                        <p className={`text-gray-300 text-sm leading-relaxed ${
                          expandedId === bookmark.id ? '' : 'line-clamp-2'
                        }`}>
                          {bookmark.explanation}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteBookmark(bookmark.id); }}
                        className="p-2 rounded-xl hover:bg-red-500/10 transition-all shrink-0"
                        data-testid={`delete-bookmark-${bookmark.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                    {expandedId === bookmark.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-4 bg-white/[0.02] rounded-xl p-4 border border-white/5"
                      >
                        <p className="text-xs uppercase tracking-[0.15em] text-gray-500 mb-2">Context</p>
                        <p className="text-gray-400 text-sm italic leading-relaxed">
                          "...{bookmark.context}..."
                        </p>
                      </motion.div>
                    )}
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
