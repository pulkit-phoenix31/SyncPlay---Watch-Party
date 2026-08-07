import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getSocket,
  connectSocket,
  emitJoinRoom,
  emitLeaveRoom,
  emitPlay,
  emitPause,
  emitSeek,
  emitChangeVideo,
  emitAssignRole,
  emitRemoveParticipant,
  emitTransferHost,
  emitSendMessage,
  emitSendReaction,
} from '../services/socket.js';
import {
  Role,
  PlaybackState,
  ParticipantData,
  ChatMessageData,
  EmojiReactionData,
  ToastMessage,
  ConnectionStatus,
} from '../types/index.js';
import { extractYouTubeId } from '../utils/youtube.js';

const STORAGE_KEY = 'yt_watch_party_user_session';

interface UserSession {
  userId: string;
  username: string;
  roomId: string;
  roomCode: string;
}

export function useWatchParty(initialRoomCode?: string, initialUsername?: string) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(initialRoomCode || null);
  const [hostUserId, setHostUserId] = useState<string | null>(null);

  // Helper to ensure user session is initialized in localStorage
  const getOrCreateSession = useCallback(() => {
    const targetCode = (initialRoomCode || roomCode || '').toUpperCase();
    let existingSession: any = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        existingSession = JSON.parse(saved);
      }
    } catch (e) {
      // ignore
    }

    if (targetCode) {
      const isSameRoom = existingSession?.roomCode?.toUpperCase() === targetCode || existingSession?.roomId?.toUpperCase() === targetCode;
      const userId = existingSession?.userId || `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const username = initialUsername?.trim() || existingSession?.username || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
      const role: Role = isSameRoom ? (existingSession?.role || 'Participant') : (existingSession?.role || 'Participant');

      const session = {
        userId,
        username,
        roomId: targetCode,
        roomCode: targetCode,
        role,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return session;
    }

    return existingSession;
  }, [initialRoomCode, initialUsername, roomCode]);

  // Current user info
  const [currentUser, setCurrentUser] = useState<{
    userId: string;
    username: string;
    role: Role;
  } | null>(() => {
    const session = getOrCreateSession();
    if (session) {
      return {
        userId: session.userId,
        username: session.username,
        role: (session as any).role || 'Participant',
      };
    }
    return null;
  });

  const [participants, setParticipants] = useState<ParticipantData[]>([]);
  const [playback, setPlayback] = useState<PlaybackState>({
    videoId: 'L_LUpnjgPso',
    playState: 'paused',
    currentTime: 0,
    lastStateUpdate: Date.now(),
  });
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [reactions, setReactions] = useState<EmojiReactionData[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((title: string, description?: string, type: ToastMessage['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, description, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync currentUser changes (e.g. role) to localStorage
  useEffect(() => {
    if (currentUser) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.role = currentUser.role;
          parsed.userId = currentUser.userId;
          parsed.username = currentUser.username;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (e) {
        // ignore
      }
    }
  }, [currentUser]);

  // Update current user's role whenever participants list changes
  useEffect(() => {
    if (currentUser?.userId && participants.length > 0) {
      const me = participants.find((p) => p.userId === currentUser.userId);
      if (me && me.role !== currentUser.role) {
        setCurrentUser((prev) => (prev ? { ...prev, role: me.role } : null));
      }
    }
  }, [participants, currentUser?.userId]);

  // Keep a ref to currentUser.userId to avoid re-subscribing socket listeners on every user state change
  const currentUserIdRef = useRef<string | null>(currentUser?.userId || null);
  useEffect(() => {
    currentUserIdRef.current = currentUser?.userId || null;
  }, [currentUser?.userId]);

  // Handle Socket Events & Connection lifecycle
  useEffect(() => {
    const socket = connectSocket();

    const attemptJoin = () => {
      const session = getOrCreateSession();
      if (session && session.roomCode) {
        setRoomCode(session.roomCode);
        emitJoinRoom(session.roomCode, session.username, session.userId, playback.videoId);
      }
    };

    function onConnect() {
      setConnectionStatus('connected');
      attemptJoin();
    }

    function onDisconnect() {
      setConnectionStatus('disconnected');
      setRoomId(null);
    }

    function onConnectError() {
      setConnectionStatus('reconnecting');
    }

    function onSyncState(newPlayback: PlaybackState & { participants?: ParticipantData[] }) {
      setPlayback(newPlayback);
      if (Array.isArray(newPlayback.participants)) {
        setParticipants(newPlayback.participants);
      }
      setRoomId((prev) => prev || roomCode || initialRoomCode || 'active');
    }

    function onUserJoined(data: {
      username: string;
      userId: string;
      role: Role;
      participants: ParticipantData[];
    }) {
      if (Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }
      setRoomId((prev) => prev || roomCode || initialRoomCode || 'active');

      const myId = currentUserIdRef.current;
      if (!myId || myId === data.userId) {
        setCurrentUser({
          userId: data.userId,
          username: data.username,
          role: data.role,
        });
      } else {
        addToast(`${data.username} joined the party`, undefined, 'info');
      }
    }

    function onUserLeft(data: {
      username: string;
      userId: string;
      participants: ParticipantData[];
    }) {
      if (Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }
      if (currentUserIdRef.current !== data.userId) {
        addToast(`${data.username} left the room`, undefined, 'warning');
      }
    }

    function onRoleAssigned(data: {
      userId: string;
      username: string;
      role: Role;
      participants: ParticipantData[];
    }) {
      if (Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }
      if (data.userId === currentUserIdRef.current) {
        addToast(`Role Updated`, `You are now a ${data.role}`, 'success');
      } else {
        addToast(`Role Updated`, `${data.username} is now a ${data.role}`, 'info');
      }
    }

    function onParticipantRemoved(data: {
      userId: string;
      participants: ParticipantData[];
    }) {
      if (Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }
      if (data.userId === currentUserIdRef.current) {
        addToast('Removed from Room', 'You were removed by the Host.', 'error');
        setRoomId(null);
        setRoomCode(null);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        addToast('Participant Removed', 'A user was removed by the Host.', 'warning');
      }
    }

    function onHostTransferred(data: {
      previousHostId: string;
      newHostId: string;
      newHostUsername: string;
      participants: ParticipantData[];
    }) {
      if (Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }
      setHostUserId(data.newHostId);
      if (data.newHostId === currentUserIdRef.current) {
        addToast('Host Privileges Received', 'You are now the Host of this watch party!', 'success');
      } else {
        addToast('Host Transferred', `${data.newHostUsername} is now the Host`, 'info');
      }
    }

    function onChatMessage(data: ChatMessageData) {
      setMessages((prev) => [...prev, data]);
    }

    function onChatHistory(data: { messages: ChatMessageData[] }) {
      setMessages(data.messages || []);
    }

    function onReaction(data: EmojiReactionData) {
      setReactions((prev) => [...prev, data]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== data.id));
      }, 3500);
    }

    function onError(data: { message: string; code?: string }) {
      if (data.code === 'UNAUTHORIZED' && !roomId) {
        attemptJoin();
        return;
      }
      addToast('Action Rejected', data.message, 'error');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('sync_state', onSyncState);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('role_assigned', onRoleAssigned);
    socket.on('participant_removed', onParticipantRemoved);
    socket.on('host_transferred', onHostTransferred);
    socket.on('chat_message', onChatMessage);
    socket.on('chat_history', onChatHistory);
    socket.on('reaction', onReaction);
    socket.on('error', onError);

    if (socket.connected) {
      setConnectionStatus('connected');
      attemptJoin();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('sync_state', onSyncState);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('role_assigned', onRoleAssigned);
      socket.off('participant_removed', onParticipantRemoved);
      socket.off('host_transferred', onHostTransferred);
      socket.off('chat_message', onChatMessage);
      socket.off('chat_history', onChatHistory);
      socket.off('reaction', onReaction);
      socket.off('error', onError);
    };
  }, [addToast, getOrCreateSession, initialRoomCode, roomCode, roomId]);

  // Method to join room manually from Landing Page
  const joinRoom = useCallback((targetCode: string, username: string) => {
    const cleanCode = targetCode.trim().toUpperCase();
    const cleanUsername = username.trim();

    const storedUserId = currentUser?.userId || `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const session: UserSession = {
      userId: storedUserId,
      username: cleanUsername,
      roomId: cleanCode,
      roomCode: cleanCode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

    setCurrentUser({
      userId: storedUserId,
      username: cleanUsername,
      role: 'Participant',
    });
    setRoomCode(cleanCode);

    emitJoinRoom(cleanCode, cleanUsername, storedUserId);
  }, [currentUser?.userId]);

  // Method to leave room
  const leaveRoom = useCallback(() => {
    if (roomCode) {
      emitLeaveRoom(roomCode);
    }
    setRoomId(null);
    setRoomCode(null);
    setCurrentUser(null);
    setParticipants([]);
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, [roomCode]);

  // Effective participants fallback: ensures current user (Host/Participant) is ALWAYS displayed in sidebar
  const effectiveParticipants = useMemo(() => {
    if (participants.length > 0) return participants;
    if (currentUser) {
      return [
        {
          userId: currentUser.userId,
          username: currentUser.username,
          role: currentUser.role,
          isOnline: true,
          socketId: null,
          joinedAt: new Date(),
        },
      ];
    }
    return [];
  }, [participants, currentUser]);

  // REST API polling fallback for Vercel/serverless environments where WebSocket might be degraded
  const activeRoomIdentifier = roomId || roomCode || initialRoomCode;
  useEffect(() => {
    if (!activeRoomIdentifier) return;

    const pollRoomState = async () => {
      try {
        const res = await fetch(`/api/rooms/${activeRoomIdentifier}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.participants && Array.isArray(data.participants) && data.participants.length > 0) {
          setParticipants(data.participants);
        }
        if (data && data.playback && data.playback.videoId) {
          setPlayback((prev) => {
            if (prev.videoId !== data.playback.videoId) {
              return {
                ...prev,
                videoId: data.playback.videoId,
                playState: data.playback.playState || prev.playState,
                currentTime: data.playback.currentTime ?? prev.currentTime,
                lastStateUpdate: Date.now(),
              };
            }
            return prev;
          });
        }
      } catch (e) {
        // ignore REST polling failures
      }
    };

    pollRoomState();
    const interval = setInterval(pollRoomState, 3500);
    return () => clearInterval(interval);
  }, [activeRoomIdentifier]);

  // Wrapped action triggers with optimistic local updates (works even on Vercel/serverless disconnected mode)
  const safePlay = useCallback(() => {
    setPlayback((prev) => ({
      ...prev,
      playState: 'playing',
      lastStateUpdate: Date.now(),
    }));
    if (activeRoomIdentifier) {
      emitPlay();
    }
  }, [activeRoomIdentifier]);

  const safePause = useCallback(() => {
    setPlayback((prev) => ({
      ...prev,
      playState: 'paused',
      lastStateUpdate: Date.now(),
    }));
    if (activeRoomIdentifier) {
      emitPause();
    }
  }, [activeRoomIdentifier]);

  const safeSeek = useCallback((time: number) => {
    setPlayback((prev) => ({
      ...prev,
      currentTime: time,
      lastStateUpdate: Date.now(),
    }));
    if (activeRoomIdentifier) {
      emitSeek(time);
    }
  }, [activeRoomIdentifier]);

  const safeChangeVideo = useCallback((videoId: string) => {
    const cleanId = extractYouTubeId(videoId);
    setPlayback((prev) => ({
      ...prev,
      videoId: cleanId,
      currentTime: 0,
      playState: 'playing',
      lastStateUpdate: Date.now(),
    }));
    if (activeRoomIdentifier) {
      emitChangeVideo(cleanId);
    }
  }, [activeRoomIdentifier]);

  const safeSendMessage = useCallback((msg: string) => {
    if (activeRoomIdentifier) {
      emitSendMessage(msg);
    }
  }, [activeRoomIdentifier]);

  const safeSendReaction = useCallback((emoji: string) => {
    if (activeRoomIdentifier) {
      emitSendReaction(emoji);
    }
  }, [activeRoomIdentifier]);

  return {
    connectionStatus,
    roomId,
    roomCode,
    currentUser,
    participants: effectiveParticipants,
    playback,
    messages,
    reactions,
    toasts,
    addToast,
    removeToast,
    joinRoom,
    leaveRoom,
    // Socket controls
    play: safePlay,
    pause: safePause,
    seek: safeSeek,
    changeVideo: safeChangeVideo,
    assignRole: emitAssignRole,
    removeParticipant: emitRemoveParticipant,
    transferHost: emitTransferHost,
    sendMessage: safeSendMessage,
    sendReaction: safeSendReaction,
  };
}
