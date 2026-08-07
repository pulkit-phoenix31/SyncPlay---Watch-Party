# SyncTheater — Real-Time Synchronized YouTube Watch Party

SyncTheater is a high-performance, production-grade YouTube Watch Party platform built with **React**, **TypeScript**, **Node.js / Express**, **Socket.IO**, and **SQLite via Prisma**. It enables synchronized video viewing, role-based access control, live chat, and emoji reactions.

---

## 🎨 Visual Identity & Design System

> **Design Choice Justification:**
> SyncTheater commits to a **"Midnight Theater"** visual identity (deep charcoal `#0B0E14` backdrop, elevated surfaces `#121721`, warm amber accents `#F59E0B`, and crimson/emerald role badges). This dark cinematic palette mimics a real dark-room theater atmosphere, minimizing eye strain during video playback while maintaining high-contrast visual hierarchy for live chat and host controls.

---

## 🚀 Core Features & Event Contract Compliance

- **Room Management**: Instant room creation with 1-click shareable codes (`SYNC-XXXX`) and direct URLs (`/?room=CODE`).
- **Role-Based Access Control (RBAC)**:
  - 👑 **Host**: Full control — play/pause, seek, change video, assign roles (Moderator/Participant), remove participants, transfer host privileges.
  - 🛡️ **Moderator**: Playback control — play/pause, seek, change video.
  - 👤 **Participant**: Watch-only mode with synchronized playback.
- **Drift Correction & Synchronization**:
  - Immediate landing at correct time on join.
  - Periodic drift correction (tolerance: 1.2 seconds) to keep all clients perfectly synchronized without audio stutter.
  - Echo-loop prevention: user actions are validated and broadcast without cyclic re-triggering.
- **Host Disconnect Auto-Promotion**:
  - If a Host disconnects, a 5-second grace period begins. If the Host does not reconnect, the longest-tenured Moderator (or next Participant) is automatically promoted to Host.
- **Persistence**:
  - Room state, participant sessions, and chat history persist in SQLite via Prisma. State survives server restarts.
- **Live Chat & Emoji Reactions**:
  - Real-time room chat with user role tags.
  - Rate limiting (max 5 messages per 5s) to prevent spam.
  - Floating emoji reaction overlay over video canvas.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, YouTube IFrame Player API.
- **Backend**: Node.js, Express, Socket.IO v4, Zod schema validation, Prisma ORM, SQLite (`dev.db`).
- **Architecture Pattern**: Object-Oriented Design (OOP) with encapsulated `Room`, `Participant`, `RoomManager`, and `PermissionService` classes.

### Data Flow Architecture

```
[ Client A (Host) ]
       │
       │  (1) Socket Event e.g. "play"
       ▼
[ Socket.IO Server ]
       │
       │  (2) Zod Schema Validation
       ▼
[ PermissionService ] ──► Validates role (Host/Moderator)
       │
       │  (3) Applies action & updates state
       ▼
[ Room Class (OOP) ] ──► Calculates current real-time timestamp
       │
       ├──────────────────────────┐
       │ (4) Sync to SQLite DB    │ (5) Socket Broadcast "sync_state"
       ▼                          ▼
 [ Prisma / SQLite ]     [ All Connected Clients ]
```

---

## 🔐 Role Enforcement & Permissions

Permissions are enforced strictly **server-side** in `/server/services/PermissionService.ts`:

- Every incoming Socket event (`play`, `pause`, `seek`, `change_video`, `assign_role`, `remove_participant`, `transfer_host`) passes through Zod validation first.
- The server identifies the user's role in the active `Room` object.
- If an unauthorized action is attempted (e.g. a `Participant` emits `seek`), the server logs the violation and emits an `error` event back to the client:
  ```json
  { "message": "Unauthorized: Only Host or Moderator can seek", "code": "FORBIDDEN" }
  ```
- The client UI disables/hides controls per role and displays a styled toast notification if a rejected action occurs.

---

## ⚡ How I'd Scale This (Scaling Architecture)

To scale SyncTheater to **100,000+ concurrent users, 10,000+ rooms, and 50+ users per room**:

1. **Socket.IO Redis Adapter**:
   - Deploy multiple stateless Node.js / Express Socket.IO server instances behind an AWS ALB or Cloud Run / Render load balancer.
   - Attach the `@socket.io/redis-adapter` backed by Redis Pub/Sub. When Host A pauses in Server 1, the event publishes to Redis and broadcasts to all clients connected across Server 2, 3, N.
2. **Sticky Sessions (Session Affinity)**:
   - Configure the load balancer for sticky sessions via cookies to maintain WebSocket transport stability during handshake upgrades.
3. **Database Layer**:
   - Replace SQLite with PostgreSQL (e.g. AWS Aurora / Supabase) with connection pooling (Prisma Accelerate / PgBouncer).
4. **Edge CDN & Video Streaming**:
   - Leverage YouTube's CDN for video delivery while serving frontend static assets over Cloudflare CDN.

---

## 🧪 Manual Testing Checklist

Follow this checklist to verify full end-to-end functionality:

- [x] **Test 1: Create & Join Room**
  1. Open Tab 1, create a room with username `Alice`. Confirm `Alice` becomes **Host** and receives room code `SYNC-XXXX`.
  2. Open Tab 2, enter code `SYNC-XXXX` with username `Bob`. Confirm `Bob` joins as **Participant**.
  3. Open Tab 3, enter code `SYNC-XXXX` with username `Charlie`. Confirm `Charlie` joins as **Participant**.

- [x] **Test 2: Playback Synchronization & Drift Correction**
  1. In Tab 1 (`Alice` Host), click **Play Sync**. Confirm Tab 2 and Tab 3 start playing simultaneously.
  2. In Tab 1, seek to 02:30. Confirm Tab 2 and Tab 3 seek to 02:30.
  3. Change video URL in Tab 1. Confirm all tabs update to the new video instantly.

- [x] **Test 3: Role Permission Enforcement**
  1. In Tab 2 (`Bob` Participant), verify playback controls are hidden/locked.
  2. Verify `Bob` cannot seek or change video.

- [x] **Test 4: Role Assignment & Host Transfer**
  1. In Tab 1 (`Alice`), promote `Bob` to **Moderator**. Verify Tab 2 UI unlocks Play/Pause/Seek controls.
  2. In Tab 1, click **Transfer Host** to `Charlie`. Confirm `Charlie` becomes Host and `Alice` becomes Moderator.

- [x] **Test 5: Host Disconnect & Auto-Promotion**
  1. Close Tab 3 (`Charlie` Host).
  2. Wait 5 seconds. Confirm `Bob` (Moderator) is automatically promoted to Host, and a notification appears on all screens.

- [x] **Test 6: Chat & Rate Limiting**
  1. Send chat messages from Tab 1. Confirm instant delivery across all tabs with role badges.
  2. Send 6 messages rapidly in 3 seconds. Confirm rate-limiting error toast triggers.

---

## ⚙️ Local Setup & Deployment Instructions

### Prerequisites
- Node.js 18+ installed

### Environment Variables (`.env`)
Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=development
```

### Installation & Execution
```bash
# 1. Install dependencies
npm install

# 2. Push SQLite database schema via Prisma
npx prisma db push

# 3. Start development server (Express + Socket.IO + Vite)
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## 📦 Deployment Guide

### Deployment on Render / Railway
1. Push repository to GitHub.
2. Create a **Web Service** on Render / Railway.
3. Build Command: `npm run build`
4. Start Command: `npm run start`
5. Environment Variables: Set `NODE_ENV=production` and `PORT=3000`.

---

## 📝 Known Limitations & Trade-offs

1. **Browser Autoplay Restrictions**: Browsers block unmuted video autoplay if the user hasn't interacted with the page first. Users must click anywhere on the page upon entering the room to allow audio playback.
2. **Single SQLite DB**: For multi-region server clusters, PostgreSQL should replace SQLite.
