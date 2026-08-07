import { io, Socket } from 'socket.io-client';
import { Role } from '../types/index.js';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
  }
}

// Client event emitters
export function emitJoinRoom(roomId: string, username: string, userId?: string) {
  const s = connectSocket();
  s.emit('join_room', { roomId, username, userId });
}

export function emitLeaveRoom(roomId: string) {
  if (socket) {
    socket.emit('leave_room', { roomId });
  }
}

export function emitPlay() {
  if (socket) {
    socket.emit('play', {});
  }
}

export function emitPause() {
  if (socket) {
    socket.emit('pause', {});
  }
}

export function emitSeek(time: number) {
  if (socket) {
    socket.emit('seek', { time });
  }
}

export function emitChangeVideo(videoId: string) {
  if (socket) {
    socket.emit('change_video', { videoId });
  }
}

export function emitAssignRole(userId: string, role: Role) {
  if (socket) {
    socket.emit('assign_role', { userId, role });
  }
}

export function emitRemoveParticipant(userId: string) {
  if (socket) {
    socket.emit('remove_participant', { userId });
  }
}

export function emitTransferHost(userId: string) {
  if (socket) {
    socket.emit('transfer_host', { userId });
  }
}

export function emitSendMessage(message: string) {
  if (socket) {
    socket.emit('send_message', { message });
  }
}

export function emitSendReaction(emoji: string) {
  if (socket) {
    socket.emit('send_reaction', { emoji });
  }
}
