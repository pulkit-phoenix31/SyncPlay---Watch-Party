import { Router } from 'express';
import { RoomManager } from '../services/RoomManager.js';
import { extractYouTubeId } from '../utils/youtube.js';
import { z } from 'zod';

const router = Router();

const CreateRoomSchema = z.object({
  hostUsername: z.string().min(1, 'Host username is required').max(30),
  hostUserId: z.string().optional(),
  videoId: z.string().optional(),
});

// POST /api/rooms - Create a new room
router.post('/', async (req, res) => {
  try {
    const parseResult = CreateRoomSchema.safeParse(req.body);
    if (!parseResult.success) {
      const msg = parseResult.error.issues?.[0]?.message || (parseResult.error as any).errors?.[0]?.message || 'Invalid request body';
      return res.status(400).json({
        error: msg,
      });
    }

    const { hostUsername, hostUserId: rawUserId, videoId: rawVideoId } = parseResult.data;
    const roomManager = RoomManager.getInstance();

    const hostUserId = rawUserId || `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const videoId = extractYouTubeId(rawVideoId || '');

    const room = await roomManager.createRoom(hostUserId, hostUsername, videoId);

    return res.status(201).json({
      roomId: room.id,
      code: room.code,
      hostUserId,
      videoId: room.videoId,
    });
  } catch (err: any) {
    console.error('Error in POST /api/rooms:', err);
    return res.status(500).json({ error: 'Failed to create watch party room' });
  }
});

// GET /api/rooms/:code - Get room info by code or ID
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const roomManager = RoomManager.getInstance();
    const room = await roomManager.getRoomAsync(code);

    if (!room || room.isClosed) {
      return res.status(404).json({ error: 'Watch party room not found or closed' });
    }

    return res.json(room.getPublicState());
  } catch (err: any) {
    console.error('Error in GET /api/rooms/:code:', err);
    return res.status(500).json({ error: 'Failed to look up room' });
  }
});

// DELETE /api/rooms/:code/participants/:userId - Remove participant from room
router.delete('/:code/participants/:userId', async (req, res) => {
  try {
    const { code, userId } = req.params;
    const roomManager = RoomManager.getInstance();
    const room = await roomManager.getRoomAsync(code);
    if (room) {
      room.removeParticipant(userId);
    }
    return res.json({ status: 'ok' });
  } catch (err: any) {
    console.error('Error removing participant:', err);
    return res.status(500).json({ error: 'Failed to remove participant' });
  }
});

export default router;
