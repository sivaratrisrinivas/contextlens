import { motion } from 'framer-motion';
import { Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export const PaperList = ({ papers, onSelect, onDelete }) => {
  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/papers/${id}`);
      onDelete(id);
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div data-testid="paper-list">
      {papers.map((paper, i) => (
        <motion.div
          key={paper.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => onSelect(paper)}
          className="group py-5 border-b border-black/[0.04] cursor-pointer last:border-0"
          data-testid={`paper-item-${paper.id}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-['Manrope'] font-semibold text-[#1D1D1F] text-[15px] truncate group-hover:text-[#86868B] transition-colors">
                {paper.title}
              </h3>
              <p className="text-[#86868B] text-xs mt-1.5 line-clamp-1 font-['Newsreader'] italic">
                {paper.content.substring(0, 100)}...
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              <span className="text-[10px] text-[#C7C7CC] tabular-nums">{timeAgo(paper.created_at)}</span>
              <button
                onClick={(e) => handleDelete(e, paper.id)}
                className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/[0.04] transition-all"
                data-testid={`delete-paper-${paper.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 text-[#C7C7CC]" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
