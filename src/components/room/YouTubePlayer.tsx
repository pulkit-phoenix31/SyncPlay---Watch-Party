import React, { useEffect, useRef, useState } from 'react';
import { PlaybackState, Role, EmojiReactionData } from '../../types/index.js';
import { extractYouTubeId } from '../../utils/youtube.js';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, AlertCircle, Sparkles, ShieldAlert } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  playback: PlaybackState;
  userRole: Role;
  reactions: EmojiReactionData[];
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  playback,
  userRole,
  reactions,
  onPlay,
  onPause,
  onSeek,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const isInternalStateChangeRef = useRef(false);

  const canControl = userRole === 'Host' || userRole === 'Moderator';

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
      return;
    }

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === 'function') {
        try { prevCallback(); } catch (e) { /* ignore */ }
      }
      setIsApiReady(true);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }, []);

  // Initialize YT.Player instance
  useEffect(() => {
    if (!isApiReady || !containerRef.current) return;

    // Clean up previous player and target
    if (playerRef.current) {
      try {
        if (typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
        }
      } catch (e) {
        // ignore
      }
      playerRef.current = null;
    }

    containerRef.current.innerHTML = '';
    const playerTarget = document.createElement('div');
    const targetId = `yt-player-${Date.now()}`;
    playerTarget.id = targetId;
    containerRef.current.appendChild(playerTarget);

    setPlayerError(null);

    const cleanVideoId = extractYouTubeId(playback.videoId);

    playerRef.current = new window.YT.Player(targetId, {
      width: '100%',
      height: '100%',
      videoId: cleanVideoId,
      playerVars: {
        autoplay: playback.playState === 'playing' ? 1 : 0,
        controls: 1, // Enable controls for all (volume, fullscreen), socket will sync state
        playsinline: 1,
        rel: 0,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (event: any) => {
          isInternalStateChangeRef.current = true;
          syncPlayerWithState(event.target);
          setTimeout(() => {
            isInternalStateChangeRef.current = false;
          }, 1000);
        },
        onStateChange: (event: any) => {
          // Prevent echo loop when update was triggered programmatically from server
          if (isInternalStateChangeRef.current) {
            return;
          }

          if (!canControl) {
            // Participant tried to play, pause or scrub via YouTube iframe controls
            // Instantly force resync back to official server playback state
            const player = event.target;
            if (player) {
              syncPlayerWithState(player);
            }
            return;
          }

          const player = event.target;
          if (!player || typeof player.getCurrentTime !== 'function') return;

          try {
            const playerTime = player.getCurrentTime() || 0;
            let expectedTime = playback.currentTime;
            if (playback.playState === 'playing') {
              const elapsed = (Date.now() - playback.lastStateUpdate) / 1000;
              expectedTime += elapsed;
            }

            const drift = Math.abs(playerTime - expectedTime);

            // Detect if Host/Moderator skipped/scrubbed on YouTube native timeline
            if (drift > 1.5) {
              isInternalStateChangeRef.current = true;
              onSeek(playerTime);
              setTimeout(() => {
                isInternalStateChangeRef.current = false;
              }, 800);
            }

            // YT.PlayerState.PLAYING = 1, PAUSED = 2
            if (event.data === 1 && playback.playState !== 'playing') {
              onPlay();
            } else if (event.data === 2 && playback.playState !== 'paused') {
              onPause();
            }
          } catch (e) {
            // ignore
          }
        },
        onError: (event: any) => {
          console.error('YouTube Player Error code:', event.data);
          setPlayerError('This YouTube video cannot be embedded or played. Please try another YouTube video URL.');
        },
      },
    });

    return () => {
      if (playerRef.current) {
        try {
          if (typeof playerRef.current.destroy === 'function') {
            playerRef.current.destroy();
          }
        } catch (e) {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [isApiReady, playback.videoId, canControl]);

  // Continuous timeline scrubber detection for Host & Moderator
  useEffect(() => {
    if (!canControl || !isApiReady) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function' || typeof player.getPlayerState !== 'function') return;

      if (isInternalStateChangeRef.current) return;

      try {
        const playerTime = player.getCurrentTime() || 0;

        let expectedTime = playback.currentTime;
        if (playback.playState === 'playing') {
          const elapsed = (Date.now() - playback.lastStateUpdate) / 1000;
          expectedTime += elapsed;
        }

        const drift = Math.abs(playerTime - expectedTime);

        // If drift is significant (> 1.8s) and not triggered internally, Host manually scrubbed YT timeline
        if (drift > 1.8) {
          isInternalStateChangeRef.current = true;
          onSeek(playerTime);
          setTimeout(() => {
            isInternalStateChangeRef.current = false;
          }, 800);
        }
      } catch (e) {
        // ignore
      }
    }, 400);

    return () => clearInterval(interval);
  }, [canControl, isApiReady, playback.currentTime, playback.playState, playback.lastStateUpdate, onSeek]);

  // Continuous lock enforcement for Participants (disallows local pause/seek/play deviations)
  useEffect(() => {
    if (canControl || !isApiReady) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getPlayerState !== 'function') return;

      if (!isInternalStateChangeRef.current) {
        syncPlayerWithState(player);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [canControl, isApiReady, playback.playState, playback.currentTime, playback.lastStateUpdate]);

  // Sync player whenever server playback state changes
  useEffect(() => {
    if (!playerRef.current || typeof playerRef.current.getPlayerState !== 'function') return;

    syncPlayerWithState(playerRef.current);
  }, [playback.playState, playback.currentTime, playback.lastStateUpdate, playback.videoId]);

  const syncPlayerWithState = (player: any) => {
    if (!player || typeof player.getPlayerState !== 'function') return;

    try {
      isInternalStateChangeRef.current = true;

      // 1. Calculate current target time
      let targetTime = playback.currentTime;
      if (playback.playState === 'playing') {
        const elapsed = (Date.now() - playback.lastStateUpdate) / 1000;
        targetTime += elapsed;
      }

      const playerTime = player.getCurrentTime() || 0;
      const drift = Math.abs(playerTime - targetTime);

      // 2. Adjust playback time if drift > 1.2s
      if (drift > 1.2) {
        player.seekTo(targetTime, true);
      }

      // 3. Sync play/pause state
      const ytState = player.getPlayerState();
      if (playback.playState === 'playing' && ytState !== 1) {
        player.playVideo();
      } else if (playback.playState === 'paused' && ytState !== 2) {
        player.pauseVideo();
      }

      setTimeout(() => {
        isInternalStateChangeRef.current = false;
      }, 500);
    } catch (e) {
      console.warn('Error syncing player with server state:', e);
      isInternalStateChangeRef.current = false;
    }
  };

  return (
    <div className="relative w-full aspect-video bg-[#0A0A0B] rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
      {/* Container for YouTube iframe */}
      <div className="w-full h-full relative">
        <div ref={containerRef} id="yt-player-element" className="w-full h-full [&_iframe]:w-full [&_iframe]:h-full [&_iframe]:absolute [&_iframe]:inset-0" />
      </div>

      {/* Error Banner */}
      {playerError && (
        <div className="absolute inset-0 bg-[#0A0A0B]/95 flex flex-col items-center justify-center p-6 text-center z-30">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3 animate-bounce" />
          <h3 className="text-lg font-bold text-gray-100 mb-1">Playback Unavailable</h3>
          <p className="text-sm text-gray-400 max-w-md">{playerError}</p>
        </div>
      )}

      {/* Participant Watch-Only Watermark Overlay */}
      {!canControl && (
        <div className="absolute top-3 left-3 z-20 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-xs text-gray-300">
          <ShieldAlert className="w-4 h-4 text-[#FF5400]" />
          <span>Watch Only Mode (Host & Mods control playback)</span>
        </div>
      )}

      {/* Floating Emoji Reactions Canvas */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        <AnimatePresence>
          {reactions.map((r, idx) => {
            const leftPercent = 15 + ((r.id.charCodeAt(r.id.length - 1) * 7 + idx * 13) % 70);
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 20, scale: 0.5 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  y: -200,
                  scale: [0.5, 1.2, 1, 0.8],
                  x: [0, (idx % 2 === 0 ? 15 : -15), 0],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 3.2, ease: 'easeOut' }}
                style={{ left: `${leftPercent}%` }}
                className="absolute bottom-6 flex flex-col items-center"
              >
                <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
                <span className="text-[10px] font-medium bg-black/80 text-gray-200 px-2 py-0.5 rounded-full backdrop-blur-md mt-0.5 border border-white/10 shadow-lg">
                  {r.username}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Playback Status Overlay (when paused or buffering) */}
      <AnimatePresence>
        {playback.playState === 'paused' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 pointer-events-none bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-10"
          >
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/80 border border-white/15 text-xs font-bold text-gray-200 uppercase tracking-widest shadow-2xl backdrop-blur-md">
              <Pause className="w-4 h-4 text-[#FF5400] fill-[#FF5400]" />
              <span>PAUSED BY HOST</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
