import React, { useState } from 'react';
import { PlaybackState, Role } from '../../types/index.js';
import { extractYouTubeId } from '../../utils/youtube.js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  Link2,
  Send,
  Sparkles,
  Lock,
  Flame,
  Heart,
  Smile,
  PartyPopper,
  Zap,
} from 'lucide-react';

interface PlaybackControlsProps {
  playback: PlaybackState;
  userRole: Role;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onChangeVideo: (videoId: string) => void;
  onSendReaction: (emoji: string) => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  playback,
  userRole,
  onPlay,
  onPause,
  onSeek,
  onChangeVideo,
  onSendReaction,
}) => {
  const [videoInput, setVideoInput] = useState('');
  const [isChangingVideo, setIsChangingVideo] = useState(false);

  const canControl = userRole === 'Host' || userRole === 'Moderator';

  const handleVideoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoInput.trim()) return;
    onChangeVideo(extractYouTubeId(videoInput.trim()));
    setVideoInput('');
    setIsChangingVideo(false);
  };

  const emojis = ['🔥', '❤️', '👏', '😂', '🎉', '🍿', '🚀', '😱'];

  return (
    <div className="w-full bg-[#161618]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-4">
      {/* Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Play/Pause & Seek Rewind */}
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={canControl ? { scale: 1.04 } : {}}
            whileTap={canControl ? { scale: 0.95 } : {}}
            onClick={playback.playState === 'playing' ? onPause : onPlay}
            disabled={!canControl}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider transition-all duration-200 ${
              canControl
                ? 'bg-[#FF5400] hover:bg-[#FF6A1A] text-black shadow-[0_0_20px_rgba(255,84,0,0.3)] cursor-pointer'
                : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/5'
            }`}
          >
            {playback.playState === 'playing' ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Play Sync</span>
              </>
            )}
          </motion.button>

          {/* Quick Seek Rewind 10s */}
          <motion.button
            whileHover={canControl ? { scale: 1.08, rotate: -15 } : {}}
            whileTap={canControl ? { scale: 0.9 } : {}}
            onClick={() => onSeek(Math.max(0, playback.currentTime - 10))}
            disabled={!canControl}
            title="Rewind 10s"
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Change Video Toggle */}
        {canControl && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsChangingVideo(!isChangingVideo)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-200 transition-all"
          >
            <Link2 className="w-4 h-4 text-[#FF5400]" />
            <span>{isChangingVideo ? 'Cancel' : 'Change Video'}</span>
          </motion.button>
        )}
      </div>

      {/* Change Video Form Expansion */}
      <AnimatePresence>
        {isChangingVideo && canControl && (
          <motion.form
            initial={{ opacity: 0, height: 0, marginTop: -8 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: -8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleVideoSubmit}
            className="overflow-hidden flex gap-2 p-3 bg-black/40 rounded-xl border border-[#FF5400]/40"
          >
            <input
              type="text"
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
              placeholder="Paste YouTube Video URL or Video ID (e.g. https://www.youtube.com/watch?v=...)"
              className="flex-1 bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FF5400]"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="submit"
              className="px-4 py-2 bg-[#FF5400] hover:bg-[#FF6A1A] text-black font-bold text-xs rounded-lg transition-all"
            >
              Load
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Quick Emoji Reaction Bar */}
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest hidden sm:flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#FF5400]" /> Live Reactions:
        </span>
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
          {emojis.map((emoji) => (
            <motion.button
              key={emoji}
              whileHover={{ scale: 1.3, y: -2 }}
              whileTap={{ scale: 0.85 }}
              onClick={() => onSendReaction(emoji)}
              className="p-1.5 transition-transform text-lg rounded-xl hover:bg-white/10 flex items-center justify-center cursor-pointer"
              title={`React with ${emoji}`}
            >
              {emoji}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Locked Controls Notice for Participants */}
      {!canControl && (
        <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-[#FF5400]/5 border border-[#FF5400]/20 text-xs text-[#FF5400]">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>Playback controls reserved for Host & Moderators. Enjoy the stream!</span>
        </div>
      )}
    </div>
  );
};
