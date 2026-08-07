import React from 'react';
import { ParticipantData } from '../../types/index.js';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, AlertTriangle, X } from 'lucide-react';

interface TransferHostModalProps {
  isOpen: boolean;
  targetParticipant: ParticipantData | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TransferHostModal: React.FC<TransferHostModalProps> = ({
  isOpen,
  targetParticipant,
  onConfirm,
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {isOpen && targetParticipant && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="relative w-full max-w-md bg-[#111113] border border-white/15 rounded-3xl p-6 shadow-2xl overflow-hidden"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-[#FF5400]/10 border border-[#FF5400]/30 flex items-center justify-center mb-4">
              <Crown className="w-6 h-6 text-[#FF5400]" />
            </div>

            <h3 className="text-lg font-bold text-gray-100 mb-2">Transfer Host Privileges?</h3>

            <p className="text-xs text-gray-400 leading-relaxed mb-6">
              Are you sure you want to pass Host ownership to{' '}
              <strong className="text-[#FF5400]">{targetParticipant.username}</strong>? You will become a
              Moderator and lose full administrative controls.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={onConfirm}
                className="px-5 py-2.5 rounded-xl bg-[#FF5400] hover:bg-[#FF6A1A] text-black font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(255,84,0,0.3)] cursor-pointer"
              >
                Confirm Transfer
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

