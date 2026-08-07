import React, { useState, useEffect } from 'react';
import { Navbar } from '../common/Navbar.js';
import { ToastContainer } from '../common/ToastContainer.js';
import { YouTubePlayer } from './YouTubePlayer.js';
import { PlaybackControls } from './PlaybackControls.js';
import { ParticipantList } from './ParticipantList.js';
import { ChatPanel } from './ChatPanel.js';
import { TransferHostModal } from './TransferHostModal.js';
import { useWatchParty } from '../../hooks/useWatchParty.js';
import { motion, AnimatePresence } from 'motion/react';
import { Users, MessageSquare, X } from 'lucide-react';

interface RoomViewProps {
  roomCode: string;
  initialUsername?: string;
  onLeave: () => void;
}

export const RoomView: React.FC<RoomViewProps> = ({ roomCode, initialUsername, onLeave }) => {
  const watchParty = useWatchParty(roomCode, initialUsername);
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'members' | null>(null);
  const [transferTargetUserId, setTransferTargetUserId] = useState<string | null>(null);

  const currentUserRole = watchParty.currentUser?.role || 'Participant';
  const transferTargetParticipant =
    watchParty.participants.find((p) => p.userId === transferTargetUserId) || null;

  // Close drawer on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveDrawer(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const toggleDrawer = (drawer: 'chat' | 'members') => {
    setActiveDrawer((prev) => (prev === drawer ? null : drawer));
  };

  const onlineCount = watchParty.participants.filter((p) => p.isOnline).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="h-[100dvh] bg-[#0A0A0B] text-gray-100 flex flex-col overflow-hidden"
    >
      {/* Top Navigation / Status Bar */}
      <Navbar
        roomCode={watchParty.roomCode || roomCode}
        role={currentUserRole}
        connectionStatus={watchParty.connectionStatus}
        onlineCount={onlineCount}
        onLeaveRoom={() => {
          watchParty.leaveRoom();
          onLeave();
        }}
        onCopySuccess={() => {
          watchParty.addToast('Copied to Clipboard!', 'Share it with your friends', 'success');
        }}
      />

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Desktop Left Sidebar: Participants ── */}
        <aside className="hidden lg:flex w-72 border-r border-white/5 bg-[#0E0E10] flex-col shrink-0">
          <ParticipantList
            participants={watchParty.participants}
            currentUserId={watchParty.currentUser?.userId}
            currentUserRole={currentUserRole}
            onAssignRole={watchParty.assignRole}
            onRemoveParticipant={watchParty.removeParticipant}
            onOpenTransferHostModal={(userId) => setTransferTargetUserId(userId)}
          />
        </aside>

        {/* ── Center: Video + Playback Controls ──
            On mobile, bottom padding ensures content isn't hidden behind the nav bar */}
        <section className="flex-1 flex flex-col bg-[#050505] overflow-y-auto min-w-0 pb-[4.5rem] lg:pb-0">
          <div className="w-full max-w-[1450px] mx-auto flex flex-col flex-1 justify-center p-3 sm:p-5">
            <YouTubePlayer
              playback={watchParty.playback}
              userRole={currentUserRole}
              reactions={watchParty.reactions}
              onPlay={watchParty.play}
              onPause={watchParty.pause}
              onSeek={watchParty.seek}
            />
            <div className="mt-4">
              <PlaybackControls
                playback={watchParty.playback}
                userRole={currentUserRole}
                onPlay={watchParty.play}
                onPause={watchParty.pause}
                onSeek={watchParty.seek}
                onChangeVideo={watchParty.changeVideo}
                onSendReaction={watchParty.sendReaction}
              />
            </div>
          </div>
        </section>

        {/* ── Desktop Right Sidebar: Chat ── */}
        <aside className="hidden lg:flex w-80 border-l border-white/5 bg-[#0E0E10] flex-col shrink-0">
          <ChatPanel
            messages={watchParty.messages}
            currentUserId={watchParty.currentUser?.userId}
            onSendMessage={watchParty.sendMessage}
          />
        </aside>

      </main>

      {/* ══════════════════════════════════════
          MOBILE: Slide-in Side Drawers
      ══════════════════════════════════════ */}
      <AnimatePresence>
        {activeDrawer && (
          <>
            {/* Scrim / Backdrop */}
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setActiveDrawer(null)}
              className="lg:hidden fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
            />

            {/* Drawer Panel — slides in from right */}
            <motion.div
              key="drawer-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 34 }}
              className="lg:hidden fixed right-0 top-0 bottom-[4.5rem] w-[88vw] max-w-[380px] bg-[#0E0E10] border-l border-white/10 z-50 flex flex-col shadow-2xl"
            >
              {/* Drawer Header */}
              <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 shrink-0 bg-[#111113]">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-[0.15em] flex items-center gap-2">
                  {activeDrawer === 'chat' ? (
                    <>
                      <MessageSquare className="w-3.5 h-3.5 text-[#FF5400]" />
                      Live Chat
                    </>
                  ) : (
                    <>
                      <Users className="w-3.5 h-3.5 text-[#FF5400]" />
                      Members ({watchParty.participants.length})
                    </>
                  )}
                </span>
                <button
                  onClick={() => setActiveDrawer(null)}
                  aria-label="Close drawer"
                  className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-hidden">
                {activeDrawer === 'chat' ? (
                  <ChatPanel
                    messages={watchParty.messages}
                    currentUserId={watchParty.currentUser?.userId}
                    onSendMessage={watchParty.sendMessage}
                  />
                ) : (
                  <ParticipantList
                    participants={watchParty.participants}
                    currentUserId={watchParty.currentUser?.userId}
                    currentUserRole={currentUserRole}
                    onAssignRole={watchParty.assignRole}
                    onRemoveParticipant={watchParty.removeParticipant}
                    onOpenTransferHostModal={(userId) => {
                      setTransferTargetUserId(userId);
                      setActiveDrawer(null);
                    }}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════
          MOBILE: Fixed Bottom Navigation Bar
      ══════════════════════════════════════ */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-[4.5rem] bg-[#0F0F0F]/95 backdrop-blur-md border-t border-[#272727] flex items-center justify-around px-6">

        {/* Chat Button */}
        <button
          id="mobile-chat-btn"
          onClick={() => toggleDrawer('chat')}
          aria-label="Open Chat"
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all duration-200 ${
            activeDrawer === 'chat'
              ? 'text-[#FF5400]'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <MessageSquare className={`w-[22px] h-[22px] transition-all ${activeDrawer === 'chat' ? 'fill-[#FF5400]/20' : ''}`} />
            {watchParty.messages.length > 0 && activeDrawer !== 'chat' && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#FF5400] rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5">
                {watchParty.messages.length > 9 ? '9+' : watchParty.messages.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-wide">Chat</span>
          {activeDrawer === 'chat' && (
            <motion.div layoutId="bottom-nav-indicator" className="absolute bottom-2 w-10 h-0.5 bg-[#FF5400] rounded-full" />
          )}
        </button>

        {/* Vertical divider */}
        <div className="w-px h-8 bg-white/10 mx-2 shrink-0" />

        {/* Members Button */}
        <button
          id="mobile-members-btn"
          onClick={() => toggleDrawer('members')}
          aria-label="Open Members"
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all duration-200 ${
            activeDrawer === 'members'
              ? 'text-[#FF5400]'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="relative">
            <Users className={`w-[22px] h-[22px] transition-all ${activeDrawer === 'members' ? 'fill-[#FF5400]/20' : ''}`} />
            {onlineCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#272727] border border-white/20 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5">
                {onlineCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold tracking-wide">Members</span>
          {activeDrawer === 'members' && (
            <motion.div layoutId="bottom-nav-indicator" className="absolute bottom-2 w-10 h-0.5 bg-[#FF5400] rounded-full" />
          )}
        </button>

      </div>

      {/* Transfer Host Modal */}
      <TransferHostModal
        isOpen={!!transferTargetUserId}
        targetParticipant={transferTargetParticipant}
        onConfirm={() => {
          if (transferTargetUserId) {
            watchParty.transferHost(transferTargetUserId);
          }
          setTransferTargetUserId(null);
        }}
        onCancel={() => setTransferTargetUserId(null)}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={watchParty.toasts} onRemove={watchParty.removeToast} />
    </motion.div>
  );
};
