import { Server } from 'socket.io';
import { Room } from './Room.js';
import { Participant } from './Participant.js';
import { prisma } from '../db.js';
import { PlayState, Role } from '../types/index.js';
import { extractYouTubeId } from '../utils/youtube.js';

export class RoomManager {
  private static instance: RoomManager | null = null;
  private io: Server | null = null;
  private rooms: Map<string, Room> = new Map(); // roomId -> Room
  private codeToRoomId: Map<string, string> = new Map(); // code -> roomId
  private socketToRoomParticipant: Map<string, { roomId: string; userId: string }> = new Map();

  private constructor() {}

  public static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  public setSocketServer(io: Server) {
    this.io = io;
  }

  /**
   * Helper to generate a clean, readable shareable room code like "PARTY-8392"
   */
  public generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'SYNC-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new room
   */
  public async createRoom(
    hostUserId: string,
    hostUsername: string,
    initialVideoId?: string,
    requestedCodeOrId?: string
  ): Promise<Room> {
    const ioServer = this.io || ({
      to: () => ({ emit: () => {} }),
      emit: () => {},
    } as any);

    let code = requestedCodeOrId ? requestedCodeOrId.trim().toUpperCase() : this.generateRoomCode();
    if (!requestedCodeOrId) {
      while (this.codeToRoomId.has(code)) {
        code = this.generateRoomCode();
      }
    }

    const videoId = extractYouTubeId(initialVideoId || 'uq169Z4RLKM');
    let roomId = requestedCodeOrId ? requestedCodeOrId.trim() : `room-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      const dbRoom = await prisma.room.create({
        data: {
          id: roomId,
          code,
          hostUserId,
          videoId,
          playState: 'paused',
          currentTime: 0,
        },
      });
      roomId = dbRoom.id;
    } catch (err) {
      console.error('Prisma write error during room creation, using memory fallback:', err);
    }

    const room = new Room(
      ioServer,
      roomId,
      code,
      hostUserId,
      videoId,
      'paused',
      0,
      Date.now()
    );

    this.rooms.set(roomId, room);
    this.codeToRoomId.set(code.toUpperCase(), roomId);

    return room;
  }

  /**
   * Find room by ID or code
   */
  public getRoom(roomIdOrCode: string): Room | undefined {
    if (!roomIdOrCode) return undefined;
    const cleanInput = roomIdOrCode.trim().toUpperCase();

    // Check direct ID match
    if (this.rooms.has(roomIdOrCode)) {
      return this.rooms.get(roomIdOrCode);
    }

    // Check code mapping
    const mappedId = this.codeToRoomId.get(cleanInput);
    if (mappedId && this.rooms.has(mappedId)) {
      return this.rooms.get(mappedId);
    }

    // Case-insensitive ID fallback
    for (const [id, r] of this.rooms.entries()) {
      if (id.toLowerCase() === roomIdOrCode.trim().toLowerCase() || r.code.toUpperCase() === cleanInput) {
        return r;
      }
    }

    return undefined;
  }

  /**
   * Find room by ID or code asynchronously with DB fallback
   */
  public async getRoomAsync(roomIdOrCode: string): Promise<Room | undefined> {
    if (!roomIdOrCode) return undefined;
    const memoryRoom = this.getRoom(roomIdOrCode);
    if (memoryRoom) return memoryRoom;

    const ioServer = this.io || ({
      to: () => ({ emit: () => {} }),
      emit: () => {},
    } as any);

    try {
      const cleanInput = roomIdOrCode.trim();
      const dbRoom = await prisma.room.findFirst({
        where: {
          OR: [
            { id: cleanInput },
            { code: cleanInput.toUpperCase() },
          ],
          isClosed: false,
        },
        include: {
          participants: true,
          messages: {
            orderBy: { timestamp: 'asc' },
            take: 100,
          },
        },
      });

      if (!dbRoom) return undefined;

      if (this.rooms.has(dbRoom.id)) {
        return this.rooms.get(dbRoom.id);
      }

      const room = new Room(
        this.io,
        dbRoom.id,
        dbRoom.code,
        dbRoom.hostUserId,
        dbRoom.videoId,
        dbRoom.playState as PlayState,
        dbRoom.currentTime,
        dbRoom.lastStateUpdate.getTime()
      );

      // Restore participants
      for (const p of dbRoom.participants) {
        const userId = p.id.startsWith(`${dbRoom.id}_`)
          ? p.id.substring(dbRoom.id.length + 1)
          : p.id;
        const participant = new Participant(
          userId,
          p.username,
          p.role as Role,
          null,
          false,
          p.joinedAt
        );
        room.participants.set(userId, participant);
      }

      // Restore chat messages
      room.chatMessages = dbRoom.messages.map((m) => ({
        id: m.id,
        userId: m.userId,
        username: m.username,
        userRole: m.userRole as Role,
        message: m.message,
        timestamp: m.timestamp.toISOString(),
      }));

      this.rooms.set(dbRoom.id, room);
      this.codeToRoomId.set(dbRoom.code.toUpperCase(), dbRoom.id);

      return room;
    } catch (err) {
      console.error('[RoomManager] Failed to fetch room from DB:', err);
      return undefined;
    }
  }

  /**
   * Map socket ID to room and participant
   */
  public registerSocket(socketId: string, roomId: string, userId: string) {
    this.socketToRoomParticipant.set(socketId, { roomId, userId });
  }

  /**
   * Remove socket mapping
   */
  public unregisterSocket(socketId: string) {
    this.socketToRoomParticipant.delete(socketId);
  }

  /**
   * Authoritatively checks whether `userId` still has any active socket connections
   * registered for `roomId` in the global socket-to-room-participant registry.
   *
   * This is the single source of truth used by both `handlers.ts` (leave_room) and
   * `Room.ts` (startHostGracePeriod) to avoid relying solely on the per-participant
   * in-memory socketIds Set, which can get out of sync under race conditions.
   */
  public hasActiveSocket(roomId: string, userId: string): boolean {
    for (const m of this.socketToRoomParticipant.values()) {
      if (m.roomId === roomId && m.userId === userId) return true;
    }
    return false;
  }

  /**
   * Find room and user by socket ID
   */
  public getBySocketId(socketId: string): { room: Room; userId: string } | null {
    const mapping = this.socketToRoomParticipant.get(socketId);
    if (!mapping) return null;

    const room = this.rooms.get(mapping.roomId);
    if (!room) return null;

    return { room, userId: mapping.userId };
  }

  /**
   * Handle socket disconnect.
   *
   * Removes the specific socket from the participant's active socket set.
   * Only marks the participant "fully offline" (and potentially starts the host
   * grace period) when they have NO remaining sockets in either:
   *   - the participant's own socketIds Set, AND
   *   - the global socketToRoomParticipant registry (authoritative source)
   *
   * The global registry is checked AFTER unregisterSocket so the current
   * socket is already removed — any hit means another tab is still active.
   */
  public handleDisconnect(socketId: string): { room: Room; participant: Participant; wasFullyOffline: boolean } | null {
    const mapping = this.getBySocketId(socketId);
    // Remove this socket from the registry FIRST — so the external check
    // below only finds genuinely different, still-active sockets.
    this.unregisterSocket(socketId);

    if (!mapping) return null;

    const { room, userId } = mapping;

    const participant = room.participants.get(userId);
    if (!participant) return null;

    // Cross-check: does this userId still have any other sockets registered
    // for this room in the authoritative global socket map?
    // This acts as a failsafe in case the participant's in-memory socketIds
    // Set gets out of sync (e.g., race conditions, server-side restores).
    const externalSocketCheck = (): boolean =>
      Array.from(this.socketToRoomParticipant.values()).some(
        (m) => m.roomId === room.id && m.userId === userId
      );

    const { wasFullyOffline } = room.handleParticipantDisconnect(userId, socketId, externalSocketCheck);

    return { room, participant, wasFullyOffline };
  }


  /**
   * Restore active rooms from SQLite DB on server startup
   */
  public async restoreFromDB() {
    if (!this.io) return;

    try {
      const activeDbRooms = await prisma.room.findMany({
        where: { isClosed: false },
        include: {
          participants: true,
          messages: {
            orderBy: { timestamp: 'asc' },
            take: 100,
          },
        },
      });

      for (const dbRoom of activeDbRooms) {
        const room = new Room(
          this.io,
          dbRoom.id,
          dbRoom.code,
          dbRoom.hostUserId,
          dbRoom.videoId,
          dbRoom.playState as PlayState,
          dbRoom.currentTime,
          dbRoom.lastStateUpdate.getTime()
        );

        // Restore participants
        for (const p of dbRoom.participants) {
          const userId = p.id.startsWith(`${dbRoom.id}_`)
            ? p.id.substring(dbRoom.id.length + 1)
            : p.id;
          const participant = new Participant(
            userId,
            p.username,
            p.role as Role,
            null, // socket offline initially
            false,
            p.joinedAt
          );
          room.participants.set(userId, participant);
        }

        // Restore chat messages
        room.chatMessages = dbRoom.messages.map((m) => ({
          id: m.id,
          userId: m.userId,
          username: m.username,
          userRole: m.userRole as Role,
          message: m.message,
          timestamp: m.timestamp.toISOString(),
        }));

        this.rooms.set(dbRoom.id, room);
        this.codeToRoomId.set(dbRoom.code.toUpperCase(), dbRoom.id);
      }

      console.log(`[RoomManager] Restored ${activeDbRooms.length} active rooms from SQLite database.`);
    } catch (err) {
      console.error('[RoomManager] Failed to restore rooms from DB:', err);
    }
  }
}
