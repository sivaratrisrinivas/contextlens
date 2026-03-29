import { useState, useEffect } from 'react';
import '@/App.css';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Bookmark, Sparkles } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import axios from 'axios';
import { BackgroundBlobs } from '@/components/BackgroundBlobs';
import { PaperUpload } from '@/components/PaperUpload';
import { PaperList } from '@/components/PaperList';
import { PaperReader } from '@/components/PaperReader';
import { BookmarksList } from '@/components/BookmarksList';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function App() {
  const [view, setView] = useState('home'); // home | reader | bookmarks
  const [papers, setPapers] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPapers();
  }, []);

  const fetchPapers = async () => {
    try {
      const res = await axios.get(`${API}/papers`);
      setPapers(res.data);
    } catch (err) {
      console.error('Failed to fetch papers', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePaperCreated = (paper) => {
    setPapers(prev => [paper, ...prev]);
    setSelectedPaper(paper);
    setView('reader');
  };

  const handleSelectPaper = (paper) => {
    setSelectedPaper(paper);
    setView('reader');
  };

  const handleDeletePaper = (paperId) => {
    setPapers(prev => prev.filter(p => p.id !== paperId));
    if (selectedPaper?.id === paperId) {
      setSelectedPaper(null);
      setView('home');
    }
  };

  return (
    <div className="min-h-screen relative" data-testid="app-root">
      <BackgroundBlobs />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'rgba(10, 10, 10, 0.9)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff',
            borderRadius: '1rem',
          }
        }}
      />

      <AnimatePresence mode="wait">
        {view === 'reader' && selectedPaper ? (
          <motion.div
            key="reader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <PaperReader
              paper={selectedPaper}
              onBack={() => setView('home')}
            />
          </motion.div>
        ) : view === 'bookmarks' ? (
          <motion.div
            key="bookmarks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <BookmarksList onBack={() => setView('home')} />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-10"
          >
            {/* Hero */}
            <div className="max-w-3xl mx-auto px-6 pt-20 pb-12">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
                className="text-center mb-16"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs uppercase tracking-[0.2em] text-gray-400">
                    AI-Powered Reading
                  </span>
                </div>
                <h1
                  className="font-outfit text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-white leading-[0.95]"
                  data-testid="hero-title"
                >
                  Context
                  <span className="text-cyan-400"> Lens</span>
                </h1>
                <p className="mt-6 text-gray-400 text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
                  Click any word in your paper. Get instant, AI-powered explanations with full contextual understanding.
                </p>
              </motion.div>

              {/* Nav */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="flex justify-center gap-3 mb-12"
              >
                <button
                  onClick={() => setView('home')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm bg-white/10 text-white border border-white/20 transition-all"
                  data-testid="nav-papers"
                >
                  <BookOpen className="w-4 h-4" />
                  Papers
                </button>
                <button
                  onClick={() => setView('bookmarks')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
                  data-testid="nav-bookmarks"
                >
                  <Bookmark className="w-4 h-4" />
                  Saved
                </button>
              </motion.div>

              {/* Upload */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <PaperUpload onPaperCreated={handlePaperCreated} />
              </motion.div>

              {/* Paper list */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mt-10"
              >
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <div key={i} className="glass-panel p-5">
                        <div className="h-5 w-48 bg-white/5 rounded-lg pulse-glow mb-3" />
                        <div className="h-3 w-full bg-white/5 rounded pulse-glow" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <PaperList
                    papers={papers}
                    onSelect={handleSelectPaper}
                    onDelete={handleDeletePaper}
                  />
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
