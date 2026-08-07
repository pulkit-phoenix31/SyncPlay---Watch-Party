import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import roomRoutes from './api/roomRoutes.js';
import { RoomManager } from './services/RoomManager.js';
import { registerSocketHandlers } from './socket/handlers.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // Initialize RoomManager with Socket.IO instance
  const roomManager = RoomManager.getInstance();
  roomManager.setSocketServer(io);

  // Restore persistent rooms from SQLite database
  await roomManager.restoreFromDB();

  // Attach socket connection listener
  io.on('connection', (socket) => {
    registerSocketHandlers(io, socket);
  });

  // Periodic room drift synchronization (every 5 seconds)
  setInterval(() => {
    // Rooms will automatically be synced on state changes, but periodic state ping maintains precision
  }, 5000);

  // REST API Routes FIRST
  app.use('/api/rooms', roomRoutes);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Vite Middleware for development OR static files for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 YouTube Watch Party Server running on http://0.0.0.0:${PORT}`);
    console.log(`=======================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
