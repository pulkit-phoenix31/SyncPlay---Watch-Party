import { Server } from 'socket.io';
import { Participant } from './Participant.js';
import { PlayState, Role, RoomState, ChatMessageData } from '../types/index.js';
import { prisma } from '../db.js';

export class Room {
  public id: string;
  public code: string;
  public hostUserId: string;
  public videoId: string;
  public playState: PlayState;
  public currentTime: number;
  public lastStateUpdate: number; // timestamp in ms
  public isClosed: boolean;
  public participants: Map<string, Participant>;
  public chatMessages: ChatMessageData[];

  private io: Server;
  private hostGraceTimer: NodeJS.Timeout | null = null;
  private emptyRoomTimer: NodeJS.Timeout | null = null;
  private rateLimitMap: Map<string, { count: number; resetTime: number }>;
  /**
   * Stored external online-check callback provided at the time the host grace
   * period was started. Used inside the 5 s timer to authoritatively verify
   * whether the host still has any live sockets before promoting a new host.
   */
  private hostExternalOnlineCheck: (() => boolean) | null = null;

  constructor(
    io: Server,
    id: string,
    code: string,
    hostUserId: string,
    videoId: string = 'uq169Z4RLKM',
    playState: PlayState = 'paused',
    currentTime: number = 0,
    lastStateUpdate: number = Date.now()
  ) {
    this.io = io;
    this.id = id;
    this.code = code;
    this.hostUserId = hostUserId;
    this.videoId = videoId;
    this.playState = playState;
    this.currentTime = currentTime;
    this.lastStateUpdate = lastStateUpdate;
    this.isClosed = false;
    this.participants = new Map();
    this.chatMessages = [];
    this.rateLimitMap = new Map();
  }

  /**
   * Get calculated real-time playback current time.
   * If playing, accounts for elapsed time since last state change.
   */
  public getCurrentCalculatedTime(): number {
    if (this.playState === 'playing') {
      const elapsedSeconds = (Date.now() - this.lastStateUpdate) / 1000;
      return Math.max(0, this.currentTime + elapsedSeconds);
    }
    return Math.max(0, this.currentTime);
  }

  /**
   * Add or reconnect a participant.
   * Handles duplicate usernames by adding a numeric suffix if it's a new user.
   */
  public addOrReconnectParticipant(
    userId: string,
    username: string,
    socketId: string,
    requestedRole?: Role
  ): Participant {
    // Cancel empty room cleanup if active
    this.clearEmptyRoomTimer();

    // Check if user already exists in room
    let existing = this.participants.get(userId);

    if (existing) {
      // New tab / reconnection for same user — register the additional socket
      existing.addSocket(socketId);
      // If host reconnected (any tab), cancel the grace timer
      if (existing.id === this.hostUserId && this.hostGraceTimer) {
        clearTimeout(this.hostGraceTimer);
        this.hostGraceTimer = null;
      }
      this.syncParticipantToDB(existing);
      return existing;
    }

    // Check for username collision among other users
    let finalUsername = username.trim();
    let collisionCount = 1;
    const existingUsernames = new Set(
      Array.from(this.participants.values()).map((p) => p.username.toLowerCase())
    );

    while (existingUsernames.has(finalUsername.toLowerCase())) {
      collisionCount++;
      finalUsername = `${username.trim()} (${collisionCount})`;
    }

    // Determine role:
    // - If the joining userId matches the room's stored hostUserId → Host (original host reconnecting)
    // - If the room has zero participant records at all (brand new room) → Host
    // - Otherwise → Participant (or requestedRole)
    //
    // NOTE: We deliberately do NOT grant Host when !hasHost but participants.size > 0.
    // That case (all offline after DB restore) should be resolved by the host grace
    // period timer, not by auto-promoting the first person who happens to connect.
    let assignedRole: Role = requestedRole || 'Participant';

    const isHostUser = Boolean(
      userId && this.hostUserId &&
      userId.trim().toLowerCase() === this.hostUserId.trim().toLowerCase()
    );

    if (isHostUser || this.participants.size === 0) {
      assignedRole = 'Host';
      this.hostUserId = userId;
    }

    const newParticipant = new Participant(userId, finalUsername, assignedRole, socketId, true);
    this.participants.set(userId, newParticipant);

    this.syncParticipantToDB(newParticipant);
    this.syncRoomToDB();

    return newParticipant;
  }

  /**
   * Mark a specific socket for a participant as disconnected.
   * The participant only goes "offline" when ALL their sockets (tabs) are closed.
   * Triggers host promotion grace period only when the host has zero remaining sockets.
   *
   * @param userId              - The participant's persistent user ID
   * @param socketId            - The specific socket (browser tab) that disconnected
   * @param externalSocketCheck - Optional callback from RoomManager that cross-checks
   *                              the authoritative socket registry.
   * @param getActiveSockets    - Returns all still-active socket IDs for this user in this room.
   */
  public handleParticipantDisconnect(
    userId: string,
    socketId: string,
    externalSocketCheck?: () => boolean,
    getActiveSockets?: () => string[]
  ): { participant: Participant | null; wasFullyOffline: boolean } {
    const participant = this.participants.get(userId);
    if (!participant) return { participant: null, wasFullyOffline: false };

    // Step 1: Remove the closing tab's socket from participant's local Set
    participant.removeSocket(socketId);

    // Step 2: Get authoritative list of remaining active sockets from global registry
    const activeSockets = getActiveSockets ? getActiveSockets() : [];
    const hasExternalSockets = activeSockets.length > 0 || (externalSocketCheck ? externalSocketCheck() : false);

    // Step 3: Authoritative socketIds rebuild.
    // Clear the local Set and repopulate ONLY from the global registry.
    // This prevents stale socket IDs from causing false isOnline=false readings.
    if (hasExternalSockets && activeSockets.length > 0) {
      participant.socketIds.clear();
      for (const sId of activeSockets) {
        participant.addSocket(sId);
      }
    }

    const wasFullyOffline = !participant.isOnline;

    if (wasFullyOffline) {
      this.syncParticipantToDB(participant);

      // ONLY start host grace period if the Host user has ZERO active sockets anywhere!
      if (userId === this.hostUserId) {
        this.startHostGracePeriod(externalSocketCheck);
      }

      // Check if all participants are offline → schedule empty room cleanup
      const onlineCount = this.getOnlineCount();
      if (onlineCount === 0) {
        this.startEmptyRoomTimeout();
      }
    }

    return { participant, wasFullyOffline };
  }

  /**
   * Explicitly remove a participant (kicked by Host)
   */
  public removeParticipant(userId: string): boolean {
    const participant = this.participants.get(userId);
    if (!participant) return false;

    this.participants.delete(userId);

    // Remove from DB async
    prisma.participant
      .deleteMany({
        where: { roomId: this.id, id: userId },
      })
      .catch((err) => console.error('Failed to delete participant from DB:', err));

    return true;
  }

  /**
   * Assign new role to user.
   */
  public assignRole(targetUserId: string, newRole: Role): Participant | null {
    const participant = this.participants.get(targetUserId);
    if (!participant) return null;

    participant.setRole(newRole);
    this.syncParticipantToDB(participant);

    return participant;
  }

  /**
   * Transfer host role to target user explicitly.
   */
  public transferHost(targetUserId: string): { previousHostId: string; newHostId: string } | null {
    const newHost = this.participants.get(targetUserId);
    if (!newHost) return null;

    const previousHostId = this.hostUserId;

    // Demote any existing host(s) to Moderator
    for (const [pId, p] of this.participants.entries()) {
      if (p.role === 'Host' || pId === previousHostId) {
        p.setRole('Moderator');
        this.syncParticipantToDB(p);
      }
    }

    newHost.setRole('Host');
    this.hostUserId = targetUserId;
    this.syncParticipantToDB(newHost);

    // Cancel host grace timer if active
    if (this.hostGraceTimer) {
      clearTimeout(this.hostGraceTimer);
      this.hostGraceTimer = null;
    }

    this.syncRoomToDB();

    return { previousHostId, newHostId: targetUserId };
  }

  /**
   * Update video playback state (play, pause, seek, change video)
   */
  public updatePlaybackState(params: {
    playState?: PlayState;
    currentTime?: number;
    videoId?: string;
  }) {
    // First calculate current time before state change
    const nowCalculated = this.getCurrentCalculatedTime();

    if (params.videoId !== undefined) {
      this.videoId = params.videoId;
      this.currentTime = 0; // reset time on new video
      this.playState = 'paused';
    }

    if (params.currentTime !== undefined && params.currentTime > 0) {
      this.currentTime = Math.max(0, params.currentTime);
    } else if (params.currentTime === 0 && nowCalculated > 2.0 && params.videoId === undefined) {
      // Guard: Ignore accidental 0-time resets if room was already playing/paused past 2 seconds
      this.currentTime = nowCalculated;
    } else if (params.currentTime !== undefined) {
      this.currentTime = Math.max(0, params.currentTime);
    } else if (params.playState && params.playState !== this.playState) {
      // Keep calculated time when transitioning play/pause
      this.currentTime = nowCalculated;
    }

    if (params.playState !== undefined) {
      this.playState = params.playState;
    }

    this.lastStateUpdate = Date.now();
    this.syncRoomToDB();
  }

  /**
   * Host disconnect grace period auto-promotion logic.
   * Waits 5 seconds before promoting the next eligible participant.
   */
  private startHostGracePeriod(externalOnlineCheck?: (() => boolean) | null) {
    if (this.hostGraceTimer) clearTimeout(this.hostGraceTimer);

    if (externalOnlineCheck) {
      this.hostExternalOnlineCheck = externalOnlineCheck;
    }

    this.hostGraceTimer = setTimeout(() => {
      this.hostGraceTimer = null;

      // Guard 1: Primary check - is hostUserId still online in memory?
      const host = this.participants.get(this.hostUserId);
      if (host && host.isOnline) return;

      // Guard 2: Secondary check - external callback confirms host still has an active socket
      if (this.hostExternalOnlineCheck && this.hostExternalOnlineCheck()) {
        console.log(`[Room ${this.code}] Grace period: host '${this.hostUserId}' still has active socket in registry — cancelling promotion.`);
        this.hostExternalOnlineCheck = null;
        return;
      }
      this.hostExternalOnlineCheck = null;

      // Guard 3: Tertiary check - is ANY participant with role 'Host' online in the room?
      const anyOnlineHost = Array.from(this.participants.values()).find(
        (p) => p.role === 'Host' && p.isOnline
      );
      if (anyOnlineHost) {
        console.log(`[Room ${this.code}] Grace period: host participant is online — cancelling promotion.`);
        return;
      }

      // Find best candidate for host promotion:
      // 1. Longest-tenured online Moderator
      // 2. Longest-tenured online Participant
      // 3. Longest-tenured offline Moderator/Participant (graceful fallback)
      const candidates = Array.from(this.participants.values()).filter(
        (p) => p.id !== this.hostUserId
      );

      if (candidates.length === 0) return;

      candidates.sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        if (a.role === 'Moderator' && b.role !== 'Moderator') return -1;
        if (b.role === 'Moderator' && a.role !== 'Moderator') return 1;
        return a.joinedAt.getTime() - b.joinedAt.getTime();
      });

      const nextHost = candidates[0];
      if (nextHost) {
        this.transferHost(nextHost.id);

        // Broadcast host promotion event to room
        this.io.to(this.id).emit('role_assigned', {
          userId: nextHost.id,
          username: nextHost.username,
          role: 'Host',
          participants: this.getParticipantsList(),
        });

        this.io.to(this.id).emit('host_transferred', {
          previousHostId: host ? host.id : '',
          newHostId: nextHost.id,
          newHostUsername: nextHost.username,
          participants: this.getParticipantsList(),
        });
      }
    }, 5000); // 5s grace period
  }

  /**
   * Empty room cleanup timeout (5 minutes)
   */
  private startEmptyRoomTimeout() {
    this.clearEmptyRoomTimer();
    this.emptyRoomTimer = setTimeout(async () => {
      if (this.getOnlineCount() === 0) {
        this.isClosed = true;
        await prisma.room.update({
          where: { id: this.id },
          data: { isClosed: true },
        });
      }
    }, 5 * 60 * 1000);
  }

  private clearEmptyRoomTimer() {
    if (this.emptyRoomTimer) {
      clearTimeout(this.emptyRoomTimer);
      this.emptyRoomTimer = null;
    }
  }

  public getOnlineCount(): number {
    return Array.from(this.participants.values()).filter((p) => p.isOnline).length;
  }

  public getParticipantsList() {
    return Array.from(this.participants.values()).map((p) => p.toJSON());
  }

  public getPlaybackState() {
    const now = Date.now();
    return {
      videoId: this.videoId,
      playState: this.playState,
      currentTime: this.getCurrentCalculatedTime(),
      lastStateUpdate: now,
      serverTime: now,
      participants: this.getParticipantsList(),
    };
  }

  public getPublicState(): RoomState {
    return {
      roomId: this.id,
      code: this.code,
      hostUserId: this.hostUserId,
      playback: this.getPlaybackState(),
      participants: this.getParticipantsList(),
    };
  }

  /**
   * Rate limiting for chat messages (e.g., max 5 messages per 5s per user)
   */
  public checkChatRateLimit(userId: string): boolean {
    const now = Date.now();
    const userLimit = this.rateLimitMap.get(userId) || { count: 0, resetTime: now + 5000 };

    if (now > userLimit.resetTime) {
      userLimit.count = 1;
      userLimit.resetTime = now + 5000;
    } else {
      userLimit.count++;
    }

    this.rateLimitMap.set(userId, userLimit);

    return userLimit.count <= 5;
  }

  /**
   * Add chat message
   */
  public async addChatMessage(
    userId: string,
    username: string,
    userRole: Role,
    message: string
  ): Promise<ChatMessageData> {
    const msgData: ChatMessageData = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId,
      username,
      userRole,
      message: message.trim(),
      timestamp: new Date().toISOString(),
    };

    this.chatMessages.push(msgData);
    if (this.chatMessages.length > 100) {
      this.chatMessages.shift(); // Keep last 100 in memory
    }

    // Persist to DB
    prisma.chatMessage
      .create({
        data: {
          id: msgData.id,
          roomId: this.id,
          userId,
          username,
          userRole,
          message: msgData.message,
        },
      })
      .catch((err) => console.error('Failed to save chat message:', err));

    return msgData;
  }

  /**
   * Database persistence helpers
   */
  public async syncRoomToDBImmediate() {
    try {
      await prisma.room.upsert({
        where: { id: this.id },
        update: {
          hostUserId: this.hostUserId,
          videoId: this.videoId,
          playState: this.playState,
          currentTime: this.currentTime,
          lastStateUpdate: new Date(this.lastStateUpdate),
          isClosed: this.isClosed,
        },
        create: {
          id: this.id,
          code: this.code,
          hostUserId: this.hostUserId,
          videoId: this.videoId,
          playState: this.playState,
          currentTime: this.currentTime,
          lastStateUpdate: new Date(this.lastStateUpdate),
          isClosed: this.isClosed,
        },
      });
    } catch (e) {
      // Silent catch for DB sync errors
    }
  }

  private syncRoomToDB() {
    this.syncRoomToDBImmediate();
  }

  private syncParticipantToDB(p: Participant) {
    const dbId = `${this.id}_${p.id}`;
    prisma.participant
      .upsert({
        where: { roomId_username: { roomId: this.id, username: p.username } },
        update: {
          role: p.role,
          socketId: p.socketId,
          isOnline: p.isOnline,
          lastSeenAt: p.lastSeenAt,
        },
        create: {
          id: dbId,
          roomId: this.id,
          username: p.username,
          role: p.role,
          socketId: p.socketId,
          isOnline: p.isOnline,
        },
      })
      .catch(() => {
        // Silent catch for DB sync errors to prevent log noise when SQLite is busy
      });
  }
}
