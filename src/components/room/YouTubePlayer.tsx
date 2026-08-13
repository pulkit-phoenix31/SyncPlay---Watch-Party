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

// ─── Sync constants ───────────────────────────────────────────────────────────
/** How often (ms) participants' playback position is checked and corrected. */
const PARTICIPANT_SYNC_INTERVAL_MS = 200;
/** How often (ms) the host's scrubbed-timeline is detected and broadcast. */
const HOST_SCRUB_POLL_INTERVAL_MS  = 500;
/** Drift (seconds) before a participant is force-seeked to the correct position. */
const PARTICIPANT_DRIFT_THRESHOLD  = 0.5;
/** Drift (seconds) before a host scrub is considered intentional and broadcast. */
const HOST_SCRUB_THRESHOLD         = 1.0;
/** How long (ms) to suppress echo-loop re-handling after a programmatic state change. */
const INTERNAL_CHANGE_SUPPRESS_MS  = 500;
// ─────────────────────────────────────────────────────────────────────────────

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
  const suppressUntilRef = useRef<number>(0);

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

  /**
   * Mark the next N ms as "internal change" so the onStateChange handler
   * ignores YT events that were triggered by our own seekTo/playVideo/pauseVideo.
   */
  const flagInternalStateChange = (durationMs = INTERNAL_CHANGE_SUPPRESS_MS) => {
    suppressUntilRef.current = Date.now() + durationMs;
    isInternalStateChangeRef.current = true;
    setTimeout(() => {
      if (Date.now() >= suppressUntilRef.current) {
        isInternalStateChangeRef.current = false;
      }
    }, durationMs + 50);
  };

  /**
   * Calculate the "ground truth" playback position right now, compensating
   * for network latency using the serverTime stamp embedded in playback state.
   *
   * Formula:
   *   latency ≈ Date.now() - serverTime   (one-way estimate, assumes symmetric)
   *   calculatedTime = storedTime + elapsed + latency
   *
   * For paused state, we only apply the latency offset (server processed the
   * pause at serverTime, so the correct position is exactly storedTime).
   */
  const getTargetTime = (pb: PlaybackState): number => {
    const now = Date.now();
    const latencyMs = pb.serverTime ? Math.max(0, now - pb.serverTime) : 0;

    if (pb.playState === 'playing') {
      const elapsedSinceUpdate = (now - pb.lastStateUpdate) / 1000;
      return Math.max(0, pb.currentTime + elapsedSinceUpdate);
    }
    // Paused: add latency so we land on the exact frame the host paused at
    return Math.max(0, pb.currentTime + latencyMs / 1000);
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
          // Suppress echo from the initial seek/play we're about to issue
          flagInternalStateChange(1500);
          // Seek to the latency-compensated position immediately on ready
          const target = getTargetTime(playbackRef.current);
          try {
            event.target.seekTo(target, true);
            if (playbackRef.current.playState === 'playing') {
              event.target.playVideo();
            }
          } catch (e) { /* ignore */ }
        },

        onStateChange: (event: any) => {
          // Suppress echo for programmatic changes
          if (isInternalStateChangeRef.current) {
            // Clear flag early if state matches what we intended
            if (
              (event.data === 1 && playbackRef.current.playState === 'playing') ||
              (event.data === 2 && playbackRef.current.playState === 'paused')
            ) {
              isInternalStateChangeRef.current = false;
            }
            return;
          }

          if (event.data === 1) setIsAutoplayBlocked(false);

          const player = event.target;
          if (!player || typeof player.getCurrentTime !== 'function') return;

          try {
            const playerTime = player.getCurrentTime() || 0;
            const targetTime = getTargetTime(playbackRef.current);

            if (!canControlRef.current) {
              // ── Participant ──────────────────────────────────────────────
              // After buffering ends (state 1 = playing), immediately correct position
              if (event.data === 1) {
                const drift = Math.abs(playerTime - targetTime);
                if (drift > PARTICIPANT_DRIFT_THRESHOLD) {
                  flagInternalStateChange();
                  player.seekTo(targetTime, true);
                }
              }
              // Participant tried to interact — revert
              syncPlayerWithState(player);
              return;
            }

            // ── Host / Moderator ─────────────────────────────────────────
            const drift = Math.abs(playerTime - targetTime);

            // Detect intentional scrub via native YT timeline
            if (drift > HOST_SCRUB_THRESHOLD) {
              flagInternalStateChange();
              onSeekRef.current(playerTime);
            }

            if (event.data === 1 && playbackRef.current.playState !== 'playing') {
              onPlayRef.current(playerTime > 0.1 ? playerTime : targetTime);
            } else if (event.data === 2 && playbackRef.current.playState !== 'paused') {
              // Guard: reject spurious pause at 0s when room is well into the video
              if (playerTime < 0.5 && targetTime > 1.0) {
                syncPlayerWithState(player);
              } else {
                const pauseTime = playerTime > 0.5 ? playerTime : targetTime;
                onPauseRef.current(pauseTime);
              }
            }
          } catch (e) { /* ignore */ }
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
        } catch (e) { /* ignore */ }
        playerRef.current = null;
      }
    };
  }, [isApiReady]);

  // Handle changing video ID dynamically on existing player
  useEffect(() => {
    if (!playerRef.current || !isApiReady) return;

    const cleanVideoId = extractYouTubeId(playback.videoId);
    if (loadedVideoIdRef.current === cleanVideoId) return;

    setPlayerError(null);
    setIsAutoplayBlocked(false);

    try {
      let success = false;
      if (playback.playState === 'playing' && typeof playerRef.current.loadVideoById === 'function') {
        flagInternalStateChange(2000);
        playerRef.current.loadVideoById({ videoId: cleanVideoId, startSeconds: 0 });
        success = true;
      } else if (typeof playerRef.current.cueVideoById === 'function') {
        flagInternalStateChange(2000);
        playerRef.current.cueVideoById({ videoId: cleanVideoId, startSeconds: 0 });
        success = true;
      }
      if (success) {
        loadedVideoIdRef.current = cleanVideoId;
      }
    } catch (e) {
      console.warn('Error changing video on player instance:', e);
    }
  }, [playback.videoId, isApiReady, playback.playState]);

  // ── Host scrub detection loop ─────────────────────────────────────────────
  // Polls every 500ms to detect when the Host scrubs the native YT timeline.
  // Fires a seek event when drift > HOST_SCRUB_THRESHOLD so participants sync.
  useEffect(() => {
    if (!canControl || !isApiReady) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function' || typeof player.getPlayerState !== 'function') return;
      if (isInternalStateChangeRef.current) return;

      const ytState = player.getPlayerState();
      // Skip during buffering (3) or paused (2) — only care about playing drift
      if (ytState === 3 || ytState === 2) return;

      try {
        const playerTime = player.getCurrentTime() || 0;
        const targetTime = getTargetTime(playbackRef.current);
        const drift = Math.abs(playerTime - targetTime);

        if (drift > HOST_SCRUB_THRESHOLD) {
          flagInternalStateChange();
          onSeekRef.current(playerTime);
        }
      } catch (e) { /* ignore */ }
    }, HOST_SCRUB_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [canControl, isApiReady]);

  // ── Participant tight-sync loop ───────────────────────────────────────────
  // Runs every 200ms for participants only.
  // Corrects drift > 0.5s, enforces play/pause state, handles post-buffer catch-up.
  useEffect(() => {
    if (canControl || !isApiReady) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getPlayerState !== 'function') return;
      if (isInternalStateChangeRef.current) return;

      try {
        const ytState = player.getPlayerState();
        const targetTime = getTargetTime(playbackRef.current);

        // ── Play/pause enforcement ──
        if (playbackRef.current.playState === 'playing') {
          if (ytState === 2 /* paused */ || ytState === -1 /* unstarted */) {
            flagInternalStateChange();
            player.playVideo();
          }
        } else if (playbackRef.current.playState === 'paused') {
          if (ytState === 1 /* playing */) {
            flagInternalStateChange();
            player.pauseVideo();
            // Also correct position when we pause
            const playerTime = player.getCurrentTime() || 0;
            if (Math.abs(playerTime - targetTime) > PARTICIPANT_DRIFT_THRESHOLD) {
              player.seekTo(targetTime, true);
            }
          }
        }

        // ── Position correction (not during active buffering) ──
        if (ytState !== 3 && playbackRef.current.playState === 'playing') {
          const playerTime = typeof player.getCurrentTime === 'function' ? (player.getCurrentTime() || 0) : 0;
          const drift = Math.abs(playerTime - targetTime);

          if (drift > PARTICIPANT_DRIFT_THRESHOLD) {
            flagInternalStateChange();
            player.seekTo(targetTime, true);
          }
        }
      } catch (e) { /* ignore */ }
    }, PARTICIPANT_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [canControl, isApiReady]);

  // ── Sync player whenever server playback state changes ───────────────────
  // Fires immediately on every sync_state push from the server.
  useEffect(() => {
    if (!playerRef.current || typeof playerRef.current.getPlayerState !== 'function') return;
    syncPlayerWithState(playerRef.current);
  }, [playback.playState, playback.currentTime, playback.lastStateUpdate, playback.videoId]);

  const syncPlayerWithState = (player: any) => {
    if (!player || typeof player.getPlayerState !== 'function') return;

    try {
      const ytState = player.getPlayerState();
      // Skip sync during active buffering — let the post-buffer onStateChange handle catch-up
      if (ytState === 3) return;

      const targetTime = getTargetTime(playbackRef.current);
      const playerTime = typeof player.getCurrentTime === 'function' ? (player.getCurrentTime() || 0) : 0;
      const drift = Math.abs(playerTime - targetTime);

      // Only seek if actually drifted — avoids constant micro-stutters from spurious seeks
      if (drift > PARTICIPANT_DRIFT_THRESHOLD && !canControlRef.current) {
        flagInternalStateChange();
        player.seekTo(targetTime, true);
      }

      // Sync play/pause state
      if (playbackRef.current.playState === 'playing') {
        if (ytState !== 1 && typeof player.playVideo === 'function') {
          flagInternalStateChange();
          player.playVideo();
          // Detect autoplay block
          setTimeout(() => {
            if (playerRef.current && typeof playerRef.current.getPlayerState === 'function') {
              const st = playerRef.current.getPlayerState();
              if (st !== 1 && st !== 3 && playbackRef.current.playState === 'playing') {
                setIsAutoplayBlocked(true);
              }
            }
          }, 600);
        }
      } else if (playbackRef.current.playState === 'paused') {
        if (ytState !== 2 && typeof player.pauseVideo === 'function') {
          flagInternalStateChange();
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
                // Seek to the correct sync position before unblocking
                const target = getTargetTime(playbackRef.current);
                playerRef.current.seekTo(target, true);
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
