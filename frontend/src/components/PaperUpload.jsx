import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, X, ArrowRight, Type } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const PaperUpload = ({ onPaperCreated, onClose }) => {
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmitText = async () => {
    if (!title.trim()) {
      toast.error('Enter a title');
      return;
    }
    if (!textContent.trim()) {
      toast.error('Paste some content');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('content', textContent.trim());
      const res = await axios.post(`${API}/papers`, formData);
      onPaperCreated(res.data);
    } catch {
      toast.error('Failed to create paper');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitPDF = async () => {
    if (!title.trim()) {
      toast.error('Enter a title');
      return;
    }
    if (!file) {
      toast.error('Select a PDF');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('file', file);
      const res = await axios.post(`${API}/papers`, formData);
      onPaperCreated(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') {
      setFile(f);
    } else {
      toast.error('PDF only');
    }
  };

  return (
    <div
      className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-7 sm:p-8"
      data-testid="paper-upload"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-['Manrope'] text-lg font-semibold text-[#1D1D1F] tracking-tight">
          New Paper
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/[0.04] transition-colors"
            data-testid="close-upload-btn"
          >
            <X className="w-4 h-4 text-[#86868B]" strokeWidth={1.5} />
          </button>
        )}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full bg-transparent border-b border-black/[0.08] pb-3 text-[#1D1D1F] text-lg font-['Newsreader'] placeholder-[#C7C7CC] focus:outline-none focus:border-black/20 transition-colors mb-6"
        data-testid="paper-title-input"
      />

      <Tabs defaultValue="paste" className="w-full">
        <TabsList className="bg-[#F5F5F7] rounded-xl p-1 w-full h-10 border-0">
          <TabsTrigger
            value="paste"
            className="flex-1 rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#1D1D1F] data-[state=active]:shadow-sm text-[#86868B] transition-all gap-1.5"
            data-testid="paste-tab"
          >
            <Type className="w-3.5 h-3.5" strokeWidth={1.5} />
            Text
          </TabsTrigger>
          <TabsTrigger
            value="upload"
            className="flex-1 rounded-lg text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-[#1D1D1F] data-[state=active]:shadow-sm text-[#86868B] transition-all gap-1.5"
            data-testid="upload-tab"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
            PDF
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="mt-5">
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Paste paper text..."
            rows={6}
            className="w-full bg-[#F5F5F7] rounded-2xl px-5 py-4 text-[#1D1D1F] text-[15px] font-['Newsreader'] placeholder-[#C7C7CC] focus:outline-none resize-none leading-relaxed"
            data-testid="paper-text-input"
          />
          <button
            onClick={handleSubmitText}
            disabled={isUploading}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-[#1D1D1F] text-white rounded-full py-3 text-sm font-medium hover:bg-[#333] disabled:opacity-30 transition-all"
            data-testid="submit-text-btn"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>Read<ArrowRight className="w-4 h-4" strokeWidth={1.5} /></>
            )}
          </button>
        </TabsContent>

        <TabsContent value="upload" className="mt-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-2xl p-8 text-center cursor-pointer transition-all border border-dashed ${
              dragOver
                ? 'border-[#1D1D1F]/20 bg-[#F5F5F7]'
                : file
                ? 'border-[#1D1D1F]/10 bg-[#F5F5F7]'
                : 'border-black/[0.08] hover:border-black/15 hover:bg-[#FAFAFA]'
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
                <FileText className="w-5 h-5 text-[#1D1D1F]" strokeWidth={1.5} />
                <span className="text-[#1D1D1F] text-sm truncate max-w-[200px]">{file.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="p-1 rounded-full hover:bg-black/[0.04]"
                  data-testid="remove-file-btn"
                >
                  <X className="w-3.5 h-3.5 text-[#86868B]" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 text-[#C7C7CC] mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-[#86868B] text-xs">Drop PDF or browse</p>
              </>
            )}
          </div>
          <button
            onClick={handleSubmitPDF}
            disabled={isUploading}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-[#1D1D1F] text-white rounded-full py-3 text-sm font-medium hover:bg-[#333] disabled:opacity-30 transition-all"
            data-testid="submit-pdf-btn"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>Read<ArrowRight className="w-4 h-4" strokeWidth={1.5} /></>
            )}
          </button>
        </TabsContent>
      </Tabs>
    </div>
  );
};
