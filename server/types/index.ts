export type Role = 'Host' | 'Moderator' | 'Participant';

export type PlayState = 'playing' | 'paused' | 'buffering';

export interface ParticipantData {
  userId: string;
  username: string;
  role: Role;
  socketId: string | null;
  isOnline: boolean;
  joinedAt: Date;
}

export interface PlaybackState {
  videoId: string;
  playState: PlayState;
  currentTime: number;
  lastStateUpdate: number; // timestamp in ms
}

export interface ChatMessageData {
  id: string;
  userId: string;
  username: string;
  userRole: Role;
  message: string;
  timestamp: string;
}

export interface RoomState {
  roomId: string;
  code: string;
  hostUserId: string;
  playback: PlaybackState;
  participants: ParticipantData[];
}
