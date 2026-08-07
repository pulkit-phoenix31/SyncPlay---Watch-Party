import React, { useState } from 'react';
import { Navbar } from '../common/Navbar.js';
import { ToastContainer } from '../common/ToastContainer.js';
import { YouTubePlayer } from './YouTubePlayer.js';
import { PlaybackControls } from './PlaybackControls.js';
import { ParticipantList } from './ParticipantList.js';
import { ChatPanel } from './ChatPanel.js';
import { TransferHostModal } from './TransferHostModal.js';
import { useWatchParty } from '../../hooks/useWatchParty.js';
import { motion, AnimatePresence } from 'motion/react';
import { Users, MessageSquare } from 'lucide-react';

interface RoomViewProps {
  roomCode: string;
  initialUsername?: string;
  onLeave: () => void;
}

export const RoomView: React.FC<RoomViewProps> = ({ roomCode, initialUsername, onLeave }) => {
  const watchParty = useWatchParty(roomCode, initialUsername);
  const [activeTab, setActiveTab] = useState<'chat' | 'members'>('chat');
  const [transferTargetUserId, setTransferTargetUserId] = useState<string | null>(null);

  const currentUserRole = watchParty.currentUser?.role || 'Participant';

  const transferTargetParticipant =
    watchParty.participants.find((p) => p.userId === transferTargetUserId) || null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="h-screen bg-[#0A0A0B] text-gray-100 flex flex-col overflow-hidden"
    >
      {/* Top Navigation / Status Bar */}
      <Navbar
        roomCode={watchParty.roomCode || roomCode}
        role={currentUserRole}
        connectionStatus={watchParty.connectionStatus}
        onlineCount={watchParty.participants.filter((p) => p.isOnline).length}
        onLeaveRoom={() => {
          watchParty.leaveRoom();
          onLeave();
        }}
        onCopySuccess={() => {
          watchParty.addToast('Copied to Clipboard!', 'Share it with your friends', 'success');
        }}
      />

      {/* Main Immersive Theater Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Participants (Visible on LG screens) */}
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

        {/* Center: Main Stage & Video Player Area */}
        <section className="flex-1 flex flex-col bg-[#050505] overflow-y-auto p-3 sm:p-5 relative min-w-0">
          {/* Mobile Screen Tab Toggle */}
          <div className="flex lg:hidden bg-[#111113] p-1 rounded-xl mb-3 border border-white/10 shrink-0 relative">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 relative z-10 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'chat' ? 'text-black font-extrabold' : 'text-gray-400 hover:text-white'
              }`}
            >
              {activeTab === 'chat' && (
                <motion.div
                  layoutId="mobileActiveTab"
                  className="absolute inset-0 bg-[#FF5400] rounded-lg shadow-md -z-10"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 relative z-10 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'members' ? 'text-black font-extrabold' : 'text-gray-400 hover:text-white'
              }`}
            >
              {activeTab === 'members' && (
                <motion.div
                  layoutId="mobileActiveTab"
                  className="absolute inset-0 bg-[#FF5400] rounded-lg shadow-md -z-10"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Users className="w-3.5 h-3.5" />
              <span>Members ({watchParty.participants.length})</span>
            </button>
          </div>

          {/* Mobile Conditional Tabs */}
          <AnimatePresence mode="wait">
            {activeTab === 'members' && (
              <motion.div
                key="members-tab"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="block lg:hidden h-[450px] mb-4 bg-[#0E0E10] rounded-2xl border border-white/10 overflow-hidden"
              >
                <ParticipantList
                  participants={watchParty.participants}
                  currentUserId={watchParty.currentUser?.userId}
                  currentUserRole={currentUserRole}
                  onAssignRole={watchParty.assignRole}
                  onRemoveParticipant={watchParty.removeParticipant}
                  onOpenTransferHostModal={(userId) => setTransferTargetUserId(userId)}
                />
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div
                key="chat-tab"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="block lg:hidden h-[400px] mb-4 bg-[#0E0E10] rounded-2xl border border-white/10 overflow-hidden"
              >
                <ChatPanel
                  messages={watchParty.messages}
                  currentUserId={watchParty.currentUser?.userId}
                  onSendMessage={watchParty.sendMessage}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* YouTube Video Player */}
          <div className="w-full max-w-[1450px] mx-auto flex-1 flex flex-col justify-center">
            <YouTubePlayer
              playback={watchParty.playback}
              userRole={currentUserRole}
              reactions={watchParty.reactions}
              onPlay={watchParty.play}
              onPause={watchParty.pause}
              onSeek={watchParty.seek}
            />

            {/* Sync Playback Controls */}
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

        {/* Right Sidebar: Live Chat (Visible on LG screens) */}
        <aside className="hidden lg:flex w-80 border-l border-white/5 bg-[#0E0E10] flex-col shrink-0">
          <ChatPanel
            messages={watchParty.messages}
            currentUserId={watchParty.currentUser?.userId}
            onSendMessage={watchParty.sendMessage}
          />
        </aside>
      </main>

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

