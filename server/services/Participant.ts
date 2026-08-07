import { Role, ParticipantData } from '../types/index.js';

export class Participant {
  public id: string; // Unique user ID (persistent across socket reconnections)
  public username: string;
  public role: Role;
  public socketId: string | null;
  public isOnline: boolean;
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
    this.socketId = socketId;
    this.isOnline = isOnline;
    this.joinedAt = joinedAt;
    this.lastSeenAt = new Date();
  }

  public updateSocket(socketId: string | null, isOnline: boolean) {
    this.socketId = socketId;
    this.isOnline = isOnline;
    this.lastSeenAt = new Date();
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
