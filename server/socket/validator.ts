import { z } from 'zod';

export const JoinRoomSchema = z.object({
  roomId: z.string().min(1, 'Room ID or code is required'),
  username: z.string().min(1, 'Username is required').max(30, 'Username too long'),
  userId: z.string().optional(), // Optional client-persisted user ID for reconnection
  videoId: z.string().optional(), // Optional video ID when creating room on join
});

export const LeaveRoomSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
});

export const PlaySchema = z.object({});

export const PauseSchema = z.object({});

export const SeekSchema = z.object({
  time: z.number().min(0, 'Time must be positive'),
});

export const ChangeVideoSchema = z.object({
  videoId: z.string().min(1, 'Video ID or URL is required'),
});

export const AssignRoleSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(['Host', 'Moderator', 'Participant']),
});

export const RemoveParticipantSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export const TransferHostSchema = z.object({
  userId: z.string().min(1, 'Target User ID is required'),
});

export const SendMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(500, 'Message too long'),
});

export const SendReactionSchema = z.object({
  emoji: z.string().min(1, 'Emoji is required').max(10, 'Invalid emoji'),
});
