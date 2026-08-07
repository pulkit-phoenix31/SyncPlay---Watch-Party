export type Role = 'Host' | 'Moderator' | 'Participant';

export type PlayState = 'playing' | 'paused' | 'buffering';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface ParticipantData {
  userId: string;
  username: string;
  role: Role;
  socketId: string | null;
  isOnline: boolean;
  joinedAt: string | Date;
}

export interface PlaybackState {
  videoId: string;
  playState: PlayState;
  currentTime: number;
  lastStateUpdate: number;
}

export interface ChatMessageData {
  id: string;
  userId: string;
  username: string;
  userRole: Role;
  message: string;
  timestamp: string;
}

export interface EmojiReactionData {
  id: string;
  emoji: string;
  username: string;
  userId: string;
  timestamp: number;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface RoomState {
  roomId: string;
  code: string;
  hostUserId: string;
  playback: PlaybackState;
  participants: ParticipantData[];
}
