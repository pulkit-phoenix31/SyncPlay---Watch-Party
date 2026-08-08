import { Server, Socket } from 'socket.io';
import { RoomManager } from '../services/RoomManager.js';
import { PermissionService } from '../services/PermissionService.js';
import { extractYouTubeId } from '../utils/youtube.js';
import {
  JoinRoomSchema,
  LeaveRoomSchema,
  PlaySchema,
  PauseSchema,
  SeekSchema,
  ChangeVideoSchema,
  AssignRoleSchema,
  RemoveParticipantSchema,
  TransferHostSchema,
  SendMessageSchema,
  SendReactionSchema,
} from './validator.js';

function getZodErrorMessage(error: any, fallback: string): string {
  return error?.issues?.[0]?.message || error?.errors?.[0]?.message || fallback;
}

export function registerSocketHandlers(io: Server, socket: Socket) {
  const roomManager = RoomManager.getInstance();

  /**
   * Helper to send formatted error back to socket client
   */
  const sendError = (message: string, code: string = 'BAD_REQUEST') => {
    console.warn(`[Socket ${socket.id}] Error (${code}): ${message}`);
    socket.emit('error', { message, code });
  };

  /**
   * Helper to retrieve room and current participant for authenticated events
   */
  const getContext = () => {
    const ctx = roomManager.getBySocketId(socket.id);
    if (!ctx) {
      sendError('You are not in an active room session. Please join a room first.', 'UNAUTHORIZED');
      return null;
    }
    const participant = ctx.room.participants.get(ctx.userId);
    if (!participant) {
      sendError('Participant session not found in room.', 'UNAUTHORIZED');
      return null;
    }
    return { room: ctx.room, participant };
  };

  // ==========================================
  // 1. JOIN_ROOM
  // ==========================================
  socket.on('join_room', async (rawPayload) => {
    try {
      const parsed = JoinRoomSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return sendError(getZodErrorMessage(parsed.error, 'Invalid join room payload'), 'VALIDATION_ERROR');
      }

      const { roomId, username, userId: rawUserId, videoId } = parsed.data;
      let room = await roomManager.getRoomAsync(roomId);

      const userId = rawUserId && rawUserId.trim() ? rawUserId.trim() : `user-${socket.id}`;

      if (!room || room.isClosed) {
        room = await roomManager.createRoom(userId, username, videoId || 'uq169Z4RLKM', roomId);
      }

      // Add/reconnect participant to room OOP instance
      const participant = room.addOrReconnectParticipant(userId, username, socket.id);

      // Map socket in RoomManager
      roomManager.registerSocket(socket.id, room.id, participant.id);

      // Join socket room channel (await socket.join for Socket.IO v4 async adapter registration)
      await socket.join(room.id);

      console.log(`[Socket ${socket.id}] User '${participant.username}' (${participant.role}) joined room '${room.code}'`);

      const participantsList = room.getParticipantsList();
      const currentPlayback = room.getPlaybackState();

      // 1. Send sync_state to joining client immediately
      socket.emit('sync_state', currentPlayback);

      // 2. Send chat_history to joining client
      socket.emit('chat_history', { messages: room.chatMessages });

      // 3. Broadcast user_joined to all clients in room
      const userJoinedPayload = {
        username: participant.username,
        userId: participant.id,
        role: participant.role,
        participants: participantsList,
      };
      io.to(room.id).emit('user_joined', userJoinedPayload);
    } catch (err: any) {
      console.error('Error handling join_room:', err);
      sendError('Failed to join room due to a server error.', 'SERVER_ERROR');
    }
  });

  // ==========================================
  // 2. LEAVE_ROOM
  // ==========================================
  socket.on('leave_room', (rawPayload) => {
    try {
      const parsed = LeaveRoomSchema.safeParse(rawPayload);
      if (!parsed.success) return sendError('Invalid leave room payload');

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;

      // Step 1 — Remove this socket from the participant's local Set
      const setNowEmpty = participant.removeSocket(socket.id);
      // Step 2 — Remove from the authoritative global registry
      roomManager.unregisterSocket(socket.id);
      socket.leave(room.id);

      // Step 3 — Two-layer "fully offline" check (mirrors handleDisconnect logic):
      // Only treat the participant as gone when BOTH:
      //   a) their local socketIds Set is empty, AND
      //   b) the global socket registry has no remaining socket for this user in this room.
      // This guards against the case where the local Set gets desynced (e.g., Tab B's
      // socket was never added to the Set for some reason), so we never wrongly evict
      // a host who still has another tab open.
      const hasRemainingSocket = roomManager.hasActiveSocket(room.id, participant.id);
      const isFullyOffline = setNowEmpty && !hasRemainingSocket;

      if (isFullyOffline) {
        // All tabs closed voluntarily: fully remove participant from room
        room.removeParticipant(participant.id);
        io.to(room.id).emit('user_left', {
          username: participant.username,
          userId: participant.id,
          participants: room.getParticipantsList(),
        });
      }
      // else: user still has other tabs open — do nothing, they remain in the room
    } catch (err: any) {
      console.error('Error handling leave_room:', err);
    }
  });


  // ==========================================
  // 3. PLAY
  // ==========================================
  socket.on('play', (rawPayload) => {
    try {
      const parsed = PlaySchema.safeParse(rawPayload || {});
      if (!parsed.success) return sendError('Invalid play payload');

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;

      if (!PermissionService.canControlPlayback(participant.role)) {
        return sendError('Unauthorized: Only the Host or a Moderator can play the video.', 'FORBIDDEN');
      }

      room.updatePlaybackState({ playState: 'playing', currentTime: parsed.data.time });

      io.to(room.id).emit('sync_state', room.getPlaybackState());
    } catch (err: any) {
      console.error('Error handling play:', err);
    }
  });

  // ==========================================
  // 4. PAUSE
  // ==========================================
  socket.on('pause', (rawPayload) => {
    try {
      const parsed = PauseSchema.safeParse(rawPayload || {});
      if (!parsed.success) return sendError('Invalid pause payload');

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;

      if (!PermissionService.canControlPlayback(participant.role)) {
        return sendError('Unauthorized: Only the Host or a Moderator can pause the video.', 'FORBIDDEN');
      }

      room.updatePlaybackState({ playState: 'paused', currentTime: parsed.data.time });

      io.to(room.id).emit('sync_state', room.getPlaybackState());
    } catch (err: any) {
      console.error('Error handling pause:', err);
    }
  });

  // ==========================================
  // 5. SEEK
  // ==========================================
  socket.on('seek', (rawPayload) => {
    try {
      const parsed = SeekSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return sendError(getZodErrorMessage(parsed.error, 'Invalid seek payload'));
      }

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;

      if (!PermissionService.canControlPlayback(participant.role)) {
        return sendError('Unauthorized: Only the Host or a Moderator can seek video time.', 'FORBIDDEN');
      }

      room.updatePlaybackState({ currentTime: parsed.data.time });

      io.to(room.id).emit('sync_state', room.getPlaybackState());
    } catch (err: any) {
      console.error('Error handling seek:', err);
    }
  });

  // ==========================================
  // 6. CHANGE_VIDEO
  // ==========================================
  socket.on('change_video', (rawPayload) => {
    try {
      const parsed = ChangeVideoSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return sendError(getZodErrorMessage(parsed.error, 'Invalid video change payload'));
      }

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;

      if (!PermissionService.canControlPlayback(participant.role)) {
        return sendError('Unauthorized: Only the Host or a Moderator can change the video.', 'FORBIDDEN');
      }

      const videoId = extractYouTubeId(parsed.data.videoId);

      room.updatePlaybackState({ videoId, currentTime: 0, playState: 'playing' });

      io.to(room.id).emit('sync_state', room.getPlaybackState());
    } catch (err: any) {
      console.error('Error handling change_video:', err);
    }
  });

  // ==========================================
  // 7. ASSIGN_ROLE
  // ==========================================
  socket.on('assign_role', (rawPayload) => {
    try {
      const parsed = AssignRoleSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return sendError(getZodErrorMessage(parsed.error, 'Invalid role assignment payload'));
      }

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;
      const { userId: targetUserId, role: newRole } = parsed.data;

      if (newRole === 'Host') {
        if (!PermissionService.canTransferHost(participant.role, targetUserId, participant.id)) {
          return sendError('Unauthorized: Only the current Host can transfer host privileges.', 'FORBIDDEN');
        }

        const transferResult = room.transferHost(targetUserId);
        if (!transferResult) {
          return sendError('Target user was not found in room.', 'NOT_FOUND');
        }

        const newHost = room.participants.get(targetUserId);

        io.to(room.id).emit('host_transferred', {
          previousHostId: transferResult.previousHostId,
          newHostId: targetUserId,
          newHostUsername: newHost?.username || '',
          participants: room.getParticipantsList(),
        });
        return;
      }

      if (!PermissionService.canAssignRole(participant.role, targetUserId, participant.id)) {
        return sendError('Unauthorized: Only the Host can assign participant roles.', 'FORBIDDEN');
      }

      const updatedParticipant = room.assignRole(targetUserId, newRole);
      if (!updatedParticipant) {
        return sendError('Target user was not found in room.', 'NOT_FOUND');
      }

      io.to(room.id).emit('role_assigned', {
        userId: updatedParticipant.id,
        username: updatedParticipant.username,
        role: newRole,
        participants: room.getParticipantsList(),
      });
    } catch (err: any) {
      console.error('Error handling assign_role:', err);
    }
  });

  // ==========================================
  // 8. REMOVE_PARTICIPANT
  // ==========================================
  socket.on('remove_participant', (rawPayload) => {
    try {
      const parsed = RemoveParticipantSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return sendError(getZodErrorMessage(parsed.error, 'Invalid remove participant payload'));
      }

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;
      const { userId: targetUserId } = parsed.data;

      if (!PermissionService.canRemoveParticipant(participant.role, targetUserId, participant.id)) {
        return sendError('Unauthorized: Only the Host can remove participants from the room.', 'FORBIDDEN');
      }

      const targetParticipant = room.participants.get(targetUserId);
      if (targetParticipant && targetParticipant.socketIds.size > 0) {
        // Kick ALL open tabs of the target user
        for (const sid of targetParticipant.socketIds) {
          const targetSocket = io.sockets.sockets.get(sid);
          if (targetSocket) {
            targetSocket.emit('error', {
              message: 'You have been removed from the watch party by the Host.',
              code: 'KICKED',
            });
            targetSocket.leave(room.id);
          }
        }
      }

      room.removeParticipant(targetUserId);

      io.to(room.id).emit('participant_removed', {
        userId: targetUserId,
        participants: room.getParticipantsList(),
      });
    } catch (err: any) {
      console.error('Error handling remove_participant:', err);
    }
  });

  // ==========================================
  // 9. TRANSFER_HOST
  // ==========================================
  socket.on('transfer_host', (rawPayload) => {
    try {
      const parsed = TransferHostSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return sendError(getZodErrorMessage(parsed.error, 'Invalid transfer host payload'));
      }

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;
      const { userId: targetUserId } = parsed.data;

      if (!PermissionService.canTransferHost(participant.role, targetUserId, participant.id)) {
        return sendError('Unauthorized: Only the current Host can transfer host privileges.', 'FORBIDDEN');
      }

      const transferResult = room.transferHost(targetUserId);
      if (!transferResult) {
        return sendError('Target participant not found in room.', 'NOT_FOUND');
      }

      const newHost = room.participants.get(targetUserId);

      io.to(room.id).emit('host_transferred', {
        previousHostId: transferResult.previousHostId,
        newHostId: targetUserId,
        newHostUsername: newHost?.username || '',
        participants: room.getParticipantsList(),
      });
    } catch (err: any) {
      console.error('Error handling transfer_host:', err);
    }
  });

  // ==========================================
  // 10. SEND_MESSAGE (Chat)
  // ==========================================
  socket.on('send_message', async (rawPayload) => {
    try {
      const parsed = SendMessageSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return sendError(getZodErrorMessage(parsed.error, 'Message cannot be empty'));
      }

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;

      if (!room.checkChatRateLimit(participant.id)) {
        return sendError('Rate limit exceeded: Please wait a moment before sending more messages.', 'RATE_LIMITED');
      }

      const chatData = await room.addChatMessage(
        participant.id,
        participant.username,
        participant.role,
        parsed.data.message
      );

      io.to(room.id).emit('chat_message', chatData);
    } catch (err: any) {
      console.error('Error handling send_message:', err);
    }
  });

  // ==========================================
  // 11. SEND_REACTION (Emoji Floating Bonus)
  // ==========================================
  socket.on('send_reaction', (rawPayload) => {
    try {
      const parsed = SendReactionSchema.safeParse(rawPayload);
      if (!parsed.success) return;

      const ctx = getContext();
      if (!ctx) return;

      const { room, participant } = ctx;

      io.to(room.id).emit('reaction', {
        id: `rx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        emoji: parsed.data.emoji,
        username: participant.username,
        userId: participant.id,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.error('Error handling send_reaction:', err);
    }
  });

  // ==========================================
  // 12. DISCONNECT
  // ==========================================
  socket.on('disconnect', () => {
    try {
      const result = roomManager.handleDisconnect(socket.id);
      if (!result) return;

      const { room, participant, wasFullyOffline } = result;

      console.log(
        `[Socket ${socket.id}] Tab closed for '${participant.username}' in room '${room.code}'` +
        (wasFullyOffline ? ' — all tabs gone, user left' : ' — other tabs still open')
      );

      if (wasFullyOffline) {
        // All of this user's tabs are closed → broadcast departure to the room
        io.to(room.id).emit('user_left', {
          username: participant.username,
          userId: participant.id,
          participants: room.getParticipantsList(),
        });
      }
      // If wasFullyOffline is false: the user still has another tab open.
      // Do NOT emit user_left — from everyone else's perspective the user
      // is still present and online. The host role stays intact.
    } catch (err: any) {
      console.error('Error during disconnect cleanup:', err);
    }
  });

}
