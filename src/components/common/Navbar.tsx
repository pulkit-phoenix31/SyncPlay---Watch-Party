import React, { useState } from 'react';
import { ConnectionStatus, Role } from '../../types/index.js';
import { motion } from 'motion/react';
import {
  Play,
  Copy,
  Check,
  LogOut,
  Share2,
} from 'lucide-react';

interface NavbarProps {
  roomCode: string | null;
  role?: Role;
  connectionStatus: ConnectionStatus;
  onlineCount: number;
  onLeaveRoom: () => void;
  onCopySuccess?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomCode,
  role = 'Participant',
  connectionStatus,
  onlineCount,
  onLeaveRoom,
  onCopySuccess,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
~
  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    if (onCopySuccess) onCopySuccess();
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyShareLink = () => {
    if (!roomCode) return;
    const shareUrl = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    if (onCopySuccess) onCopySuccess();
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
  <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="sticky top-0 z-40 w-full h-14 bg-[#0F0F0F] border-b border-[#272727] px-4 lg:px-6 flex items-center justify-between"
    >
      <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-4">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[#FF0000] flex items-center justify-center shrink-0">
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-base sm:text-lg tracking-tight text-white">
              SyncPlay
            </h1>
            <span className="text-[10px] font-semibold bg-[#212121] text-[#AAAAAA] border border-[#3F3F3F] px-2 py-0.5 rounded hidden sm:inline-block">
              Watch Party App
            </span>
          </div>
        </div>

        {/* Room Controls (When inside room) */}
        {roomCode && (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Room Code Badge */}
            <div className="flex items-center gap-1.5 bg-[#212121] border border-[#3F3F3F] rounded-full px-3 py-1">
              <span className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-wider hidden sm:inline">Room:</span>
              <code className="bg-transparent text-white font-mono text-xs sm:text-sm font-bold tracking-wider">{roomCode}</code>
              <button
                onClick={handleCopyCode}
                title="Copy Room Code"
                className="p-1 hover:bg-[#3F3F3F] rounded-full transition-colors text-[#AAAAAA] hover:text-white ml-0.5 cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Share Link Button */}
            <button
              onClick={handleCopyShareLink}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF0000] hover:bg-[#CC0000] text-white text-xs font-medium transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </>
              )}
            </button>

            {/* Connection / Latency Indicator */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-[#212121] border border-[#3F3F3F] text-xs text-[#AAAAAA]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="font-mono text-[11px] text-white">{connectionStatus === 'connected' ? 'Synced' : connectionStatus}</span>
              <span className="text-[#3F3F3F]">&bull;</span>
              <span className="text-white font-medium">{onlineCount} connected</span>
            </div>

            {/* User Role Pill */}
            <div className="flex items-center gap-1.5 bg-[#212121] px-3 py-1 rounded-full border border-[#3F3F3F] text-xs">
              <div className="w-4 h-4 rounded-full bg-[#FF0000] flex items-center justify-center text-[10px] font-bold text-white">
                {role.charAt(0)}
              </div>
              <span className="text-xs font-medium text-white hidden sm:inline">{role}</span>
            </div>

            {/* Leave Room Button */}
            <button
              onClick={onLeaveRoom}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#3F3F3F] hover:bg-[#3F3F3F]/50 text-white text-xs font-medium transition-colors cursor-pointer"
              title="Leave Room"
            >
              <LogOut className="w-3.5 h-3.5 text-[#AAAAAA]" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        )}
      </div>
    </motion.header>
  );
};

