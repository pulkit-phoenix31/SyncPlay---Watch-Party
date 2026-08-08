import { Role, ParticipantData } from '../types/index.js';

export class Participant {
  public id: string; // Unique user ID (persistent across socket reconnections)
  public username: string;
  public role: Role;
  /**
   * Tracks ALL active socket connections for this user (one per browser tab).
   * A user is considered "online" as long as at least one socket is connected.
   */
  public socketIds: Set<string>;
  public joinedAt: Date;
  public lastSeenAt: Date;

  constructor(
    id: string,
    username: string,
    role: Role = 'Participant',
    socketId: string | null = null,
    isOnline: boolean = true,
    joinedAt: Date = new Date()
  ) {
    this.id = id;
    this.username = username;
    this.role = role;
    this.socketIds = new Set();
    if (socketId && isOnline) {
      this.socketIds.add(socketId);
    }
    this.joinedAt = joinedAt;
    this.lastSeenAt = new Date();
  }

  /**
   * The "primary" socketId for backwards-compat (used in DB sync and kick logic).
   * Returns the first active socket, or null if offline.
   */
  public get socketId(): string | null {
    const first = this.socketIds.values().next();
    return first.done ? null : first.value;
  }

  /**
   * True when at least one socket tab is connected.
   */
  public get isOnline(): boolean {
    return this.socketIds.size > 0;
  }

  /**
   * Register a new socket connection for this user (new tab or reconnect).
   */
  public addSocket(socketId: string) {
    this.socketIds.add(socketId);
    this.lastSeenAt = new Date();
  }

  /**
   * Remove a specific socket (one tab closed / disconnected).
   * Returns true if the user is now fully offline (no remaining sockets).
   */
  public removeSocket(socketId: string): boolean {
    this.socketIds.delete(socketId);
    if (!this.isOnline) {
      this.lastSeenAt = new Date();
    }
    return !this.isOnline;
  }

  /**
   * @deprecated Use addSocket / removeSocket instead.
   * Kept for any legacy call-sites during the transition.
   */
  public updateSocket(socketId: string | null, online: boolean) {
    if (online && socketId) {
      this.addSocket(socketId);
    } else if (!online && socketId) {
      this.removeSocket(socketId);
    } else if (!online && !socketId) {
      // Full offline — clear all sockets
      this.socketIds.clear();
      this.lastSeenAt = new Date();
    }
  }

  public setRole(role: Role) {
    this.role = role;
  }

  public toJSON(): ParticipantData {
    return {
      userId: this.id,
      username: this.username,
      role: this.role,
      socketId: this.socketId,
      isOnline: this.isOnline,
      joinedAt: this.joinedAt,
    };
  }
}
