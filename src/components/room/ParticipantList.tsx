import React, { useState } from 'react';
import { ParticipantData, Role } from '../../types/index.js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown,
  ShieldCheck,
  User,
  MoreVertical,
  UserX,
  ShieldPlus,
  ShieldMinus,
  ArrowRightLeft,
  Users,
} from 'lucide-react';

interface ParticipantListProps {
  participants: ParticipantData[];
  currentUserId?: string;
  currentUserRole: Role;
  onAssignRole: (userId: string, role: Role) => void;
  onRemoveParticipant: (userId: string) => void;
  onOpenTransferHostModal: (userId: string) => void;
}

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  currentUserId,
  currentUserRole,
  onAssignRole,
  onRemoveParticipant,
  onOpenTransferHostModal,
}) => {
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);

  const isHost = currentUserRole === 'Host';

  return (
    <div className="flex flex-col h-full bg-[#0E0E10] p-5 overflow-hidden">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-[#FF5400]" />
          Participants ({participants.length})
        </h2>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
        </span>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        <AnimatePresence initial={false}>
          {participants.map((p) => {
            const isSelf = p.userId === currentUserId;
            const initials = p.username.substring(0, 2).toUpperCase();

            return (
              <motion.div
                key={p.userId}
                initial={{ opacity: 0, x: -10, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`group relative flex items-center justify-between p-2.5 rounded-xl transition-all ${
                  isSelf
                    ? 'bg-white/10 border border-white/10 shadow-sm'
                    : 'bg-white/5 border border-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* User Avatar Badge */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${
                      p.role === 'Host'
                        ? 'bg-[#FF5400]/20 text-[#FF5400]'
                        : p.role === 'Moderator'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {initials}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-200 truncate">
                        {p.username}
                      </span>
                      {isSelf && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-white/10 text-gray-300 rounded font-medium">
                          You
                        </span>
                      )}
                    </div>

                    {/* Role Label */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-tighter ${
                          p.role === 'Host'
                            ? 'text-[#FF5400]'
                            : p.role === 'Moderator'
                            ? 'text-purple-400'
                            : 'text-gray-500'
                        }`}
                      >
                        {p.role}
                      </span>
                      {!p.isOnline && (
                        <span className="text-[9px] text-gray-500 font-normal tracking-normal">
                          (Offline)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status or Host Context Menu */}
                <div className="flex items-center gap-1">
                  <div
                    title={p.isOnline ? 'Online' : 'Offline'}
                    className={`w-2 h-2 rounded-full ${
                      p.isOnline ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-gray-600'
                    }`}
                  />

                  {isHost && !isSelf && (
                    <div className="relative flex items-center gap-1">
                      <motion.button
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onOpenTransferHostModal(p.userId)}
                        title={`Transfer Host to ${p.username}`}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#FF5400]/20 text-gray-400 hover:text-[#FF5400] rounded transition-all cursor-pointer"
                      >
                        <Crown className="w-3.5 h-3.5" />
                      </motion.button>

                      <button
                        onClick={() =>
                          setActiveMenuUserId(activeMenuUserId === p.userId ? null : p.userId)
                        }
                        className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Context Menu with Motion */}
                      <AnimatePresence>
                        {activeMenuUserId === p.userId && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: -5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -5 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 top-7 z-50 w-48 bg-[#161618] border border-white/15 rounded-2xl shadow-2xl p-1.5 space-y-1 backdrop-blur-xl"
                            onMouseLeave={() => setActiveMenuUserId(null)}
                          >
                            {p.role !== 'Moderator' ? (
                              <button
                                onClick={() => {
                                  onAssignRole(p.userId, 'Moderator');
                                  setActiveMenuUserId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/10 rounded-xl transition-colors cursor-pointer"
                              >
                                <ShieldPlus className="w-3.5 h-3.5" /> Make Moderator
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  onAssignRole(p.userId, 'Participant');
                                  setActiveMenuUserId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                              >
                                <ShieldMinus className="w-3.5 h-3.5" /> Demote Participant
                              </button>
                            )}

                            <button
                              onClick={() => {
                                onOpenTransferHostModal(p.userId);
                                setActiveMenuUserId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#FF5400] hover:bg-[#FF5400]/10 rounded-xl transition-colors cursor-pointer"
                            >
                              <Crown className="w-3.5 h-3.5 text-[#FF5400]" /> Make Host (Transfer)
                            </button>

                            <div className="border-t border-white/10 my-1" />

                            <button
                              onClick={() => {
                                onRemoveParticipant(p.userId);
                                setActiveMenuUserId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5" /> Remove / Kick
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

