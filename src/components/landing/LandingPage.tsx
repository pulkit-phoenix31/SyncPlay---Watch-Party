import React, { useState, useEffect } from 'react';
import { extractYouTubeId } from '../../utils/youtube.js';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Plus,
  LogIn,
  Sparkles,
  ArrowRight,
  History,
  Shield,
  Zap,
  MessageCircle,
  Check,
} from 'lucide-react';

interface LandingPageProps {
  onJoinRoom: (code: string, username: string) => void;
  initialCode?: string;
}

const FEATURED_VIDEOS = [
  {
    id: 'L_LUpnjgPso',
    title: 'Lofi Hip Hop Radio',
    category: 'Music / Chill',
    thumbnail: 'https://img.youtube.com/vi/L_LUpnjgPso/hqdefault.jpg',
  },
  {
    id: '4xDzrJKXOOY',
    title: 'Synthwave Radio 24/7',
    category: 'Retro Beats',
    thumbnail: 'https://img.youtube.com/vi/4xDzrJKXOOY/hqdefault.jpg',
  },
  {
    id: 'LXb3EKWsInQ',
    title: '4K Costa Rica Wildlife',
    category: 'Nature Cinema',
    thumbnail: 'https://img.youtube.com/vi/LXb3EKWsInQ/hqdefault.jpg',
  },
];

const STORAGE_KEY = 'yt_watch_party_user_session';

export const LandingPage: React.FC<LandingPageProps> = ({ onJoinRoom, initialCode }) => {
  const [tab, setTab] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState(initialCode || '');
  const [selectedVideoId, setSelectedVideoId] = useState('L_LUpnjgPso');
  const [customVideoUrl, setCustomVideoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pastSessions, setPastSessions] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    try {
      const historyStr = localStorage.getItem('yt_watch_party_history');
      if (historyStr) {
        setPastSessions(JSON.parse(historyStr));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const saveToHistory = (code: string) => {
    try {
      const newHistory = [
        { code, name: `Watch Party ${code}` },
        ...pastSessions.filter((s) => s.code !== code),
      ].slice(0, 5);
      localStorage.setItem('yt_watch_party_history', JSON.stringify(newHistory));
    } catch (e) {
      // ignore
    }
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Please enter your name to start');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      let clientUserId = '';
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          clientUserId = parsed.userId;
        }
      } catch (e) {
        // ignore
      }

      if (!clientUserId) {
        clientUserId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      }

      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostUsername: username.trim(),
          hostUserId: clientUserId,
          videoId: extractYouTubeId(customVideoUrl.trim() || selectedVideoId),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create watch party room');
      }

      const session = {
        userId: data.hostUserId || clientUserId,
        username: username.trim(),
        roomId: data.code,
        roomCode: data.code,
        role: 'Host',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

      saveToHistory(data.code);
      onJoinRoom(data.code, username.trim());
    } catch (err: any) {
      console.error('Error creating party:', err);
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Please enter your name');
      return;
    }
    if (!joinCode.trim()) {
      setErrorMsg('Please enter a Room Code or Link');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      let cleanCode = joinCode.trim().toUpperCase();
      if (cleanCode.includes('ROOM=')) {
        cleanCode = cleanCode.split('ROOM=')[1].split('&')[0];
      }

      const res = await fetch(`/api/rooms/${cleanCode}`);
      if (!res.ok) {
        throw new Error('Watch party room does not exist or has closed.');
      }

      let clientUserId = '';
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          clientUserId = parsed.userId;
        }
      } catch (e) {
        // ignore
      }

      if (!clientUserId) {
        clientUserId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      }

      const session = {
        userId: clientUserId,
        username: username.trim(),
        roomId: cleanCode,
        roomCode: cleanCode,
        role: 'Participant',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

      saveToHistory(cleanCode);
      onJoinRoom(cleanCode, username.trim());
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to find room');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-[#F1F1F1] font-sans flex flex-col justify-between selection:bg-[#FF0000] selection:text-white">
      {/* Top Header Navigation Bar */}
      <header className="w-full bg-[#0F0F0F] border-b border-[#272727] px-4 sm:px-8 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="max-w-6xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#FF0000] flex items-center justify-center shrink-0">
              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">
                SyncPlay
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[#AAAAAA] hidden sm:inline-block">
              Zero-latency synced playback
            </span>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-8 py-10 my-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left Hero Section */}
        <div className="lg:col-span-6 space-y-6 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#212121] border border-[#3F3F3F] text-xs font-medium text-[#AAAAAA]">
            <Sparkles className="w-3.5 h-3.5 text-[#FF0000]" />
            <span>Synchronized YouTube Experience</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.12]">
            Watch YouTube Together, <br />
            <span className="text-[#FF0000]">In Perfect Sync.</span>
          </h1>

          <p className="text-sm sm:text-base text-[#AAAAAA] leading-relaxed max-w-lg">
            Stream YouTube videos with friends in real-time. Frame-perfect playback control, host permissions, live chat, and instant reactions.
          </p>

          {/* Stat Chips / Features */}
          <div className="grid grid-cols-3 gap-3 pt-2 max-w-md">
            <div className="p-3 rounded-lg bg-[#212121] border border-[#3F3F3F]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-0.5">
                <Shield className="w-3.5 h-3.5 text-[#FF0000]" />
                <span>Role Access</span>
              </div>
              <p className="text-[11px] text-[#AAAAAA]">Host & Mod Controls</p>
            </div>

            <div className="p-3 rounded-lg bg-[#212121] border border-[#3F3F3F]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-0.5">
                <Zap className="w-3.5 h-3.5 text-[#FF0000]" />
                <span>0-Drift Sync</span>
              </div>
              <p className="text-[11px] text-[#AAAAAA]">Auto Re-syncing</p>
            </div>

            <div className="p-3 rounded-lg bg-[#212121] border border-[#3F3F3F]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-0.5">
                <MessageCircle className="w-3.5 h-3.5 text-[#FF0000]" />
                <span>Live Chat</span>
              </div>
              <p className="text-[11px] text-[#AAAAAA]">Reactions & Emojis</p>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="lg:col-span-6 bg-[#212121] border border-[#3F3F3F] rounded-xl p-6 sm:p-7 text-left">
          {/* Flat Segmented Tab Switcher */}
          <div className="flex bg-[#0F0F0F] p-1 rounded-full border border-[#3F3F3F] mb-6">
            <button
              onClick={() => {
                setTab('create');
                setErrorMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                tab === 'create'
                  ? 'bg-[#FF0000] text-white'
                  : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Party</span>
            </button>

            <button
              onClick={() => {
                setTab('join');
                setErrorMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                tab === 'join'
                  ? 'bg-[#FF0000] text-white'
                  : 'text-[#AAAAAA] hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Join with Code</span>
            </button>
          </div>

          {/* Form Error Message */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300"
              >
                {errorMsg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form Content */}
          {tab === 'create' ? (
            <form onSubmit={handleCreateParty} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#AAAAAA] mb-1.5 uppercase tracking-wider">
                  Your Display Name (Host)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full bg-[#0F0F0F] border border-[#3F3F3F] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-[#717171] focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#AAAAAA] mb-1.5 uppercase tracking-wider">
                  Select Starting Video
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2.5">
                  {FEATURED_VIDEOS.map((vid) => {
                    const isSelected = selectedVideoId === vid.id && !customVideoUrl;
                    return (
                      <button
                        key={vid.id}
                        type="button"
                        onClick={() => {
                          setSelectedVideoId(vid.id);
                          setCustomVideoUrl('');
                        }}
                        className={`relative rounded overflow-hidden border p-1 text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#FF0000] bg-[#0F0F0F]'
                            : 'border-[#3F3F3F] bg-[#0F0F0F] hover:border-[#717171]'
                        }`}
                      >
                        <div className="relative aspect-video rounded-xs overflow-hidden mb-1 bg-[#181818]">
                          <img
                            src={vid.thumbnail}
                            alt={vid.title}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute top-1 right-1 bg-[#FF0000] text-white p-0.5 rounded-full">
                              <Check className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-[#AAAAAA] block truncate">
                          {vid.title}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] text-[#AAAAAA] mb-1">Or paste custom YouTube URL:</p>
                <input
                  type="text"
                  value={customVideoUrl}
                  onChange={(e) => setCustomVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-[#0F0F0F] border border-[#3F3F3F] rounded-lg px-3.5 py-2 text-xs text-white placeholder-[#717171] focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-full bg-[#FF0000] hover:bg-[#CC0000] text-white font-medium text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isSubmitting ? (
                  <span>Launching Party...</span>
                ) : (
                  <>
                    <span>Start Watch Party</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinParty} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#AAAAAA] mb-1.5 uppercase tracking-wider">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Jordan"
                  className="w-full bg-[#0F0F0F] border border-[#3F3F3F] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-[#717171] focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#AAAAAA] mb-1.5 uppercase tracking-wider">
                  Room Code or Share Link
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="e.g. SYNC-8392"
                  className="w-full bg-[#0F0F0F] border border-[#3F3F3F] rounded-lg px-3.5 py-2.5 text-sm font-mono text-white placeholder-[#717171] focus:outline-none focus:border-white uppercase tracking-wider"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-full bg-[#FF0000] hover:bg-[#CC0000] text-white font-medium text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {isSubmitting ? (
                  <span>Connecting...</span>
                ) : (
                  <>
                    <span>Join Room</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Past Sessions History */}
              {pastSessions.length > 0 && (
                <div className="pt-3 border-t border-[#3F3F3F]">
                  <span className="text-[11px] font-medium text-[#AAAAAA] flex items-center gap-1 mb-2">
                    <History className="w-3 h-3 text-[#FF0000]" /> Recent Watch Parties:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {pastSessions.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => setJoinCode(s.code)}
                        className="px-2.5 py-1 rounded-full bg-[#0F0F0F] hover:bg-[#3F3F3F] text-xs font-mono text-white border border-[#3F3F3F] transition-colors cursor-pointer"
                      >
                        {s.code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-[#272727] py-4 text-center text-xs text-[#AAAAAA]">
        YouTube Watch Party Extension &bull; Real-time playback synchronization
      </footer>
    </div>
  );
};

