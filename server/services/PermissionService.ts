import { Role } from '../types/index.js';

export class PermissionService {
  /**
   * Check if role can control video playback (play, pause, seek, change video).
   * Host and Moderator are allowed.
   */
  static canControlPlayback(role: Role): boolean {
    return role === 'Host' || role === 'Moderator';
  }

  /**
   * Check if caller can assign roles to target users.
   * Only Host can assign roles.
   * Host cannot demote themselves directly via assignRole (must use transferHost).
   */
  static canAssignRole(callerRole: Role, targetUserId: string, callerUserId: string): boolean {
    if (callerRole !== 'Host') return false;
    // Host cannot assign role to themselves via standard assign_role endpoint
    if (targetUserId === callerUserId) return false;
    return true;
  }

  /**
   * Check if caller can remove a participant.
   * Only Host can remove participants.
   * Host cannot remove themselves.
   */
  static canRemoveParticipant(callerRole: Role, targetUserId: string, callerUserId: string): boolean {
    if (callerRole !== 'Host') return false;
    if (targetUserId === callerUserId) return false;
    return true;
  }

  /**
   * Check if caller can transfer host privileges to another user.
   * Only current Host can transfer host.
   */
  static canTransferHost(callerRole: Role, targetUserId: string, callerUserId: string): boolean {
    if (callerRole !== 'Host') return false;
    if (targetUserId === callerUserId) return false;
    return true;
  }
}
