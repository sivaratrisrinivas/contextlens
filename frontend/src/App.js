import { useState, useEffect } from 'react';
import '@/App.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Plus, ArrowLeft } from 'lucide-react';
import { Toaster } from 'sonner';
import axios from 'axios';
import { Logo } from '@/components/Logo';
import { PaperUpload } from '@/components/PaperUpload';
import { PaperList } from '@/components/PaperList';
import { PaperReader } from '@/components/PaperReader';
import { BookmarksList } from '@/components/BookmarksList';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ease = [0.16, 1, 0.3, 1];

function App() {
  const [view, setView] = useState('home');
  const [papers, setPapers] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    fetchPapers();
  }, []);

  const fetchPapers = async () => {
    try {
      const res = await axios.get(`${API}/papers`);
      setPapers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePaperCreated = (paper) => {
    setPapers(prev => [paper, ...prev]);
    setSelectedPaper(paper);
    setShowUpload(false);
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
    <div className="min-h-screen bg-[#F5F5F7]" data-testid="app-root">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,0,0,0.06)',
            color: '#1D1D1F',
            borderRadius: '1rem',
            fontSize: '14px',
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
            transition={{ duration: 0.3, ease }}
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
            transition={{ duration: 0.3, ease }}
          >
            <BookmarksList onBack={() => setView('home')} />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-14 z-50 backdrop-blur-2xl bg-white/70 border-b border-black/[0.04] flex items-center justify-between px-6 sm:px-10">
              <Logo size="small" />
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setView('bookmarks')}
                  className="p-2.5 rounded-full hover:bg-black/[0.04] transition-colors"
                  data-testid="nav-bookmarks"
                  title="Saved"
                >
                  <Bookmark className="w-[18px] h-[18px] text-[#1D1D1F]" strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => setShowUpload(true)}
                  className="p-2.5 rounded-full hover:bg-black/[0.04] transition-colors"
                  data-testid="nav-add-paper"
                  title="Add paper"
                >
                  <Plus className="w-[18px] h-[18px] text-[#1D1D1F]" strokeWidth={1.5} />
                </button>
              </div>
            </header>

            <div className="pt-14">
              {/* Upload overlay */}
              <AnimatePresence>
                {showUpload && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-40 bg-black/10 backdrop-blur-sm flex items-center justify-center p-6"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}
                  >
                    <motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.98 }}
                      transition={{ duration: 0.35, ease }}
                      className="w-full max-w-lg"
                    >
                      <PaperUpload
                        onPaperCreated={handlePaperCreated}
                        onClose={() => setShowUpload(false)}
                      />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Papers */}
              <div className="max-w-2xl mx-auto px-6 sm:px-10 pt-12 pb-20">
                {loading ? (
                  <div className="space-y-4 pt-8">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="py-5 border-b border-black/[0.04]">
                        <div className="h-5 w-48 bg-black/[0.04] rounded-lg pulse-soft" />
                        <div className="h-3 w-80 bg-black/[0.04] rounded mt-3 pulse-soft" />
                      </div>
                    ))}
                  </div>
                ) : papers.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease }}
                    className="flex flex-col items-center justify-center min-h-[60vh] text-center"
                    data-testid="empty-papers"
                  >
                    <div className="w-20 h-20 rounded-full bg-black/[0.03] flex items-center justify-center mb-6">
                      <Aperture className="w-8 h-8 text-[#86868B]" strokeWidth={1} />
                    </div>
                    <p className="text-[#86868B] text-sm">
                      Add your first paper
                    </p>
                    <button
                      onClick={() => setShowUpload(true)}
                      className="mt-6 px-6 py-2.5 rounded-full bg-[#1D1D1F] text-white text-sm font-medium hover:bg-[#333] transition-colors"
                      data-testid="empty-add-btn"
                    >
                      Add Paper
                    </button>
                  </motion.div>
                ) : (
                  <PaperList
                    papers={papers}
                    onSelect={handleSelectPaper}
                    onDelete={handleDeletePaper}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Need this for empty state
import { Aperture } from 'lucide-react';

export default App;
