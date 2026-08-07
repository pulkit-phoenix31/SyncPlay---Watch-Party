import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Handle Socket Events & Connection lifecycle
  useEffect(() => {
    const socket = connectSocket();

    const attemptJoin = () => {
      const session = getOrCreateSession();
      if (session && session.roomCode) {
        setRoomCode(session.roomCode);
        emitJoinRoom(session.roomCode, session.username, session.userId);
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

    function onSyncState(newPlayback: PlaybackState) {
      setPlayback(newPlayback);
      setRoomId((prev) => prev || roomCode || initialRoomCode || 'active');
    }

    function onUserJoined(data: {
      username: string;
      userId: string;
      role: Role;
      participants: ParticipantData[];
    }) {
      setParticipants(data.participants);
      setRoomId((prev) => prev || roomCode || initialRoomCode || 'active');

      if (currentUser?.userId === data.userId || !currentUser?.userId) {
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
      setParticipants(data.participants);
      if (currentUser?.userId !== data.userId) {
        addToast(`${data.username} left the room`, undefined, 'warning');
      }
    }

    function onRoleAssigned(data: {
      userId: string;
      username: string;
      role: Role;
      participants: ParticipantData[];
    }) {
      setParticipants(data.participants);
      if (data.userId === currentUser?.userId) {
        addToast(`Role Updated`, `You are now a ${data.role}`, 'success');
      } else {
        addToast(`Role Updated`, `${data.username} is now a ${data.role}`, 'info');
      }
    }

    function onParticipantRemoved(data: {
      userId: string;
      participants: ParticipantData[];
    }) {
      setParticipants(data.participants);
      if (data.userId === currentUser?.userId) {
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
      setParticipants(data.participants);
      setHostUserId(data.newHostId);
      if (data.newHostId === currentUser?.userId) {
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
        // Silently re-attempt join if session sync is pending
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
  }, [currentUser?.userId, addToast, getOrCreateSession, initialRoomCode, roomCode, roomId]);

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

  // Wrapped socket action triggers with active room checks and optimistic local updates
  const safePlay = useCallback(() => {
    if (connectionStatus === 'connected' && roomId) {
      setPlayback((prev) => ({
        ...prev,
        playState: 'playing',
        lastStateUpdate: Date.now(),
      }));
      emitPlay();
    }
  }, [connectionStatus, roomId]);

  const safePause = useCallback(() => {
    if (connectionStatus === 'connected' && roomId) {
      setPlayback((prev) => ({
        ...prev,
        playState: 'paused',
        lastStateUpdate: Date.now(),
      }));
      emitPause();
    }
  }, [connectionStatus, roomId]);

  const safeSeek = useCallback((time: number) => {
    if (connectionStatus === 'connected' && roomId) {
      setPlayback((prev) => ({
        ...prev,
        currentTime: time,
        lastStateUpdate: Date.now(),
      }));
      emitSeek(time);
    }
  }, [connectionStatus, roomId]);

  const safeChangeVideo = useCallback((videoId: string) => {
    if (connectionStatus === 'connected' && roomId) {
      setPlayback((prev) => ({
        ...prev,
        videoId,
        currentTime: 0,
        playState: 'paused',
        lastStateUpdate: Date.now(),
      }));
      emitChangeVideo(videoId);
    }
  }, [connectionStatus, roomId]);

  const safeSendMessage = useCallback((msg: string) => {
    if (connectionStatus === 'connected' && roomId) {
      emitSendMessage(msg);
    }
  }, [connectionStatus, roomId]);

  const safeSendReaction = useCallback((emoji: string) => {
    if (connectionStatus === 'connected' && roomId) {
      emitSendReaction(emoji);
    }
  }, [connectionStatus, roomId]);

  return {
    connectionStatus,
    roomId,
    roomCode,
    currentUser,
    participants,
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
