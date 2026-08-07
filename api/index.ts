import express from 'express';
import roomRoutes from '../server/api/roomRoutes.js';

const app = express();
app.use(express.json());

app.use('/api/rooms', roomRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
