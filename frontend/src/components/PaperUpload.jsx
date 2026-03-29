import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, Clipboard, ArrowRight, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const PaperUpload = ({ onPaperCreated }) => {
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmitText = async () => {
    if (!title.trim()) {
      toast.error('Please enter a paper title first');
      document.querySelector('[data-testid="paper-title-input"]')?.focus();
      return;
    }
    if (!textContent.trim()) {
      toast.error('Please paste some paper content');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('content', textContent.trim());
      const res = await axios.post(`${API}/papers`, formData);
      toast.success('Paper added');
      onPaperCreated(res.data);
      setTitle('');
      setTextContent('');
    } catch (err) {
      toast.error('Failed to create paper');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitPDF = async () => {
    if (!title.trim()) {
      toast.error('Please enter a paper title first');
      document.querySelector('[data-testid="paper-title-input"]')?.focus();
      return;
    }
    if (!file) {
      toast.error('Please select a PDF file');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('file', file);
      const res = await axios.post(`${API}/papers`, formData);
      toast.success('Paper uploaded');
      onPaperCreated(res.data);
      setTitle('');
      setFile(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to upload PDF');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
    } else {
      toast.error('Only PDF files are accepted');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-panel p-8"
      data-testid="paper-upload"
    >
      {/* Title input */}
      <div className="mb-6">
        <label className="block text-sm uppercase tracking-[0.15em] text-gray-500 mb-3 font-medium">
          Paper Title <span className="text-cyan-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Attention Is All You Need"
          className={`w-full bg-white/[0.03] border rounded-2xl px-5 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all text-[15px] ${
            !title.trim() ? 'border-white/10' : 'border-cyan-500/30'
          }`}
          data-testid="paper-title-input"
        />
      </div>

      <Tabs defaultValue="paste" className="w-full">
        <TabsList className="bg-white/5 border border-white/10 rounded-xl p-1 w-full">
          <TabsTrigger
            value="paste"
            className="flex-1 rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 transition-all text-sm"
            data-testid="paste-tab"
          >
            <Clipboard className="w-4 h-4 mr-2" />
            Paste Text
          </TabsTrigger>
          <TabsTrigger
            value="upload"
            className="flex-1 rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 transition-all text-sm"
            data-testid="upload-tab"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload PDF
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="mt-6">
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Paste your paper text here..."
            rows={8}
            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none text-[15px] leading-relaxed"
            data-testid="paper-text-input"
          />
          <button
            onClick={handleSubmitText}
            disabled={isUploading}
            className="mt-4 w-full flex items-center justify-center gap-3 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 hover:shadow-[0_0_24px_rgba(34,211,238,0.2)] disabled:opacity-30 disabled:cursor-not-allowed rounded-full px-8 py-3.5 transition-all text-sm font-medium"
            data-testid="submit-text-btn"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            ) : (
              <>
                <span>Start Reading</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </TabsContent>

        <TabsContent value="upload" className="mt-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-cyan-500/50 bg-cyan-500/5'
                : file
                ? 'border-lime-500/30 bg-lime-500/5'
                : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
            }`}
            data-testid="pdf-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files[0])}
              className="hidden"
              data-testid="pdf-file-input"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-6 h-6 text-lime-400" />
                <span className="text-lime-300 text-sm">{file.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="p-1 rounded-full hover:bg-white/10"
                  data-testid="remove-file-btn"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">
                  Drop a PDF here or click to browse
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  PDF files only
                </p>
              </>
            )}
          </div>
          <button
            onClick={handleSubmitPDF}
            disabled={isUploading}
            className="mt-4 w-full flex items-center justify-center gap-3 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 hover:shadow-[0_0_24px_rgba(34,211,238,0.2)] disabled:opacity-30 disabled:cursor-not-allowed rounded-full px-8 py-3.5 transition-all text-sm font-medium"
            data-testid="submit-pdf-btn"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            ) : (
              <>
                <span>Upload & Read</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};
