import { motion } from 'framer-motion';
import { FileText, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const PaperList = ({ papers, onSelect, onDelete }) => {
  const handleDelete = async (e, paperId) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/papers/${paperId}`);
      onDelete(paperId);
      toast.success('Paper deleted');
    } catch (err) {
      toast.error('Failed to delete paper');
    }
  };

  if (papers.length === 0) {
    return (
      <div className="text-center py-16" data-testid="empty-papers">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
          <FileText className="w-7 h-7 text-gray-600" />
        </div>
        <p className="text-gray-500 text-sm">No papers yet</p>
        <p className="text-gray-600 text-xs mt-1">Add your first paper above to start reading</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="paper-list">
      <p className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-4">
        Your Papers
      </p>
      {papers.map((paper, i) => (
        <motion.div
          key={paper.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          onClick={() => onSelect(paper)}
          className="group glass-panel p-5 cursor-pointer hover:bg-white/[0.06] transition-all hover:border-cyan-500/20"
          data-testid={`paper-item-${paper.id}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-outfit font-semibold text-white text-[15px] truncate group-hover:text-cyan-300 transition-colors">
                {paper.title}
              </h3>
              <p className="text-gray-500 text-xs mt-1.5 line-clamp-2 leading-relaxed">
                {paper.content.substring(0, 120)}...
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <Clock className="w-3 h-3 text-gray-600" />
                <span className="text-gray-600 text-xs">{timeAgo(paper.created_at)}</span>
              </div>
            </div>
            <button
              onClick={(e) => handleDelete(e, paper.id)}
              className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-all"
              data-testid={`delete-paper-${paper.id}`}
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
