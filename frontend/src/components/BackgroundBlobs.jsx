import { motion } from 'framer-motion';

export const BackgroundBlobs = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Cyan blob */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.07] blur-[120px] blob"
        style={{ background: '#22d3ee', top: '10%', left: '15%' }}
        animate={{
          x: [0, 60, -30, 40, 0],
          y: [0, -40, 30, -20, 0],
          scale: [1, 1.1, 0.95, 1.05, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Fuchsia blob */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.06] blur-[120px] blob-delay-1"
        style={{ background: '#d946ef', top: '50%', right: '10%' }}
        animate={{
          x: [0, -50, 30, -40, 0],
          y: [0, 30, -50, 20, 0],
          scale: [1, 0.9, 1.1, 0.95, 1],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Acid green blob */}
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full opacity-[0.05] blur-[100px] blob-delay-2"
        style={{ background: '#a3e635', bottom: '10%', left: '40%' }}
        animate={{
          x: [0, 40, -20, 30, 0],
          y: [0, -30, 40, -10, 0],
          scale: [1, 1.05, 0.9, 1.1, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
};
