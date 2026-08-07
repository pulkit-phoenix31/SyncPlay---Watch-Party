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
  onPlay: (time?: number) => void;
  onPause: (time?: number) => void;
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

  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

  const canControl = userRole === 'Host' || userRole === 'Moderator';

  // Live refs to prevent stale closures and unnecessary player destruction
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const canControlRef = useRef(canControl);
  canControlRef.current = canControl;

  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;

  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const loadedVideoIdRef = useRef<string | null>(null);
  const syncTimeoutRef = useRef<any>(null);

  const flagInternalStateChange = (durationMs = 600) => {
    isInternalStateChangeRef.current = true;
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      isInternalStateChangeRef.current = false;
    }, durationMs);
  };

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

  // Initialize YT.Player instance (ONCE when API is ready)
  useEffect(() => {
    if (!isApiReady || !containerRef.current || playerRef.current) return;

    containerRef.current.innerHTML = '';
    const playerTarget = document.createElement('div');
    const targetId = `yt-player-${Date.now()}`;
    playerTarget.id = targetId;
    containerRef.current.appendChild(playerTarget);

    setPlayerError(null);
    const cleanVideoId = extractYouTubeId(playbackRef.current.videoId);
    loadedVideoIdRef.current = cleanVideoId;

    playerRef.current = new window.YT.Player(targetId, {
      width: '100%',
      height: '100%',
      videoId: cleanVideoId,
      playerVars: {
        autoplay: playbackRef.current.playState === 'playing' ? 1 : 0,
        controls: 1,
        playsinline: 1,
        rel: 0,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (event: any) => {
          flagInternalStateChange(1000);
          syncPlayerWithState(event.target);
        },
        onStateChange: (event: any) => {
          // Prevent echo loop when update was triggered programmatically from server
          if (isInternalStateChangeRef.current) {
            if (
              (event.data === 1 && playbackRef.current.playState === 'playing') ||
              (event.data === 2 && playbackRef.current.playState === 'paused')
            ) {
              isInternalStateChangeRef.current = false;
            }
            return;
          }

          if (event.data === 1) {
            setIsAutoplayBlocked(false);
          }

          if (!canControlRef.current) {
            // Participant tried to play, pause or scrub via YouTube iframe controls
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
            let expectedTime = playbackRef.current.currentTime;
            if (playbackRef.current.playState === 'playing') {
              const elapsed = (Date.now() - playbackRef.current.lastStateUpdate) / 1000;
              expectedTime += elapsed;
            }

            const drift = Math.abs(playerTime - expectedTime);

            // Detect if Host/Moderator skipped/scrubbed on YouTube native timeline
            if (drift > 1.2) {
              flagInternalStateChange(600);
              onSeekRef.current(playerTime);
            }

            // YT.PlayerState.PLAYING = 1, PAUSED = 2
            if (event.data === 1 && playbackRef.current.playState !== 'playing') {
              onPlayRef.current(playerTime);
            } else if (event.data === 2 && playbackRef.current.playState !== 'paused') {
              onPauseRef.current(playerTime);
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
  }, [isApiReady]);

  // Handle changing video ID dynamically on existing player
  useEffect(() => {
    if (!playerRef.current || !isApiReady) return;

    const cleanVideoId = extractYouTubeId(playback.videoId);
    if (loadedVideoIdRef.current === cleanVideoId) return;

    loadedVideoIdRef.current = cleanVideoId;
    setPlayerError(null);
    setIsAutoplayBlocked(false);
    flagInternalStateChange(2000);

    try {
      if (playback.playState === 'playing' && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.loadVideoById({
          videoId: cleanVideoId,
          startSeconds: 0,
        });
      } else if (typeof playerRef.current.cueVideoById === 'function') {
        playerRef.current.cueVideoById({
          videoId: cleanVideoId,
          startSeconds: 0,
        });
      }
    } catch (e) {
      console.warn('Error changing video on player instance:', e);
    }
  }, [playback.videoId, isApiReady, playback.playState]);

  // Continuous timeline scrubber detection for Host & Moderator
  useEffect(() => {
    if (!canControl || !isApiReady) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function' || typeof player.getPlayerState !== 'function') return;

      if (isInternalStateChangeRef.current) return;

      const ytState = player.getPlayerState();
      if (ytState === 3) return;

      try {
        const playerTime = player.getCurrentTime() || 0;

        let expectedTime = playback.currentTime;
        if (playback.playState === 'playing') {
          const elapsed = (Date.now() - playback.lastStateUpdate) / 1000;
          expectedTime += elapsed;
        }

        const drift = Math.abs(playerTime - expectedTime);

        if (drift > 1.5) {
          flagInternalStateChange(600);
          onSeek(playerTime);
        }
      } catch (e) {
        // ignore
      }
    }, 500);

    return () => clearInterval(interval);
  }, [canControl, isApiReady, playback.currentTime, playback.playState, playback.lastStateUpdate, onSeek]);

  // Continuous lock enforcement for Participants (disallows local pause/seek/play deviations)
  useEffect(() => {
    if (canControl || !isApiReady) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getPlayerState !== 'function') return;

      syncPlayerWithState(player);
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
      const ytState = player.getPlayerState();
      // Skip sync ONLY during active buffering (3)
      if (ytState === 3) {
        return;
      }

      // 1. Calculate current target time
      let targetTime = playbackRef.current.currentTime;
      if (playbackRef.current.playState === 'playing') {
        const elapsed = (Date.now() - playbackRef.current.lastStateUpdate) / 1000;
        targetTime += elapsed;
      }

      const playerTime = typeof player.getCurrentTime === 'function' ? (player.getCurrentTime() || 0) : 0;
      const drift = Math.abs(playerTime - targetTime);

      // 2. Adjust playback time if drift > 0.8s
      if (drift > 0.8 && typeof player.seekTo === 'function') {
        flagInternalStateChange(500);
        player.seekTo(targetTime, true);
      }

      // 3. Sync play/pause state
      if (playbackRef.current.playState === 'playing') {
        if (ytState !== 1 && typeof player.playVideo === 'function') {
          flagInternalStateChange(500);
          player.playVideo();
          // Check if autoplay was blocked by browser
          setTimeout(() => {
            if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
              const currentSt = playerRef.current.getPlayerState();
              if (currentSt !== 1 && currentSt !== 3 && playbackRef.current.playState === 'playing') {
                setIsAutoplayBlocked(true);
              }
            }
          }, 600);
        }
      } else if (playbackRef.current.playState === 'paused') {
        if (ytState !== 2 && typeof player.pauseVideo === 'function') {
          flagInternalStateChange(500);
          player.pauseVideo();
        }
      }
    } catch (e) {
      console.warn('Error syncing player with server state:', e);
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

      {/* Autoplay Blocked User Gesture Overlay */}
      {isAutoplayBlocked && !playerError && (
        <div
          onClick={() => {
            if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
              try {
                if (typeof playerRef.current.unMute === 'function') playerRef.current.unMute();
                playerRef.current.playVideo();
              } catch (e) {}
            }
            setIsAutoplayBlocked(false);
          }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center cursor-pointer group/sync transition-all"
        >
          <div className="w-16 h-16 rounded-full bg-[#FF5400] flex items-center justify-center shadow-[0_0_30px_rgba(255,84,0,0.5)] group-hover/sync:scale-110 transition-transform mb-3">
            <Play className="w-8 h-8 text-black fill-black ml-1" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Click to Sync & Start Video</h3>
          <p className="text-xs text-gray-300">Browser requires user interaction to enable synchronized playback</p>
        </div>
      )}

      {/* Participant Watch-Only Watermark Overlay */}
      {!canControl && (
        <div className="absolute top-3 left-3 z-20 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-xs text-gray-300">
          <ShieldAlert className="w-4 h-4 text-[#FF5400]" />
          <span>Watch Only Mode</span>
        </div>
      )}

      {/* Subtle Top-Right Paused Badge (non-blocking) */}
      <AnimatePresence>
        {playback.playState === 'paused' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-3 right-3 z-20 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md border border-amber-500/30 text-amber-400 font-semibold text-xs shadow-xl"
          >
            <Pause className="w-3.5 h-3.5 fill-current" />
            <span>Paused by Host</span>
          </motion.div>
        )}
      </AnimatePresence>

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
    </div>
  );
};
