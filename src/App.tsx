import React, { useState, useEffect } from 'react';
import { LandingPage } from './components/landing/LandingPage.js';
import { RoomView } from './components/room/RoomView.js';

export default function App() {
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [activeUsername, setActiveUsername] = useState<string>('');

  // Check URL query string on load (e.g. ?room=SYNC-8392)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setActiveRoomCode(roomFromUrl.trim().toUpperCase());
    }
  }, []);

  const handleJoinRoom = (code: string, username: string) => {
    // Update URL query string without reloading page
    const newUrl = `${window.location.pathname}?room=${code}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
    setActiveRoomCode(code);
    setActiveUsername(username);
  };

  const handleLeaveRoom = () => {
    // Clear URL query string
    window.history.pushState({}, '', window.location.pathname);
    setActiveRoomCode(null);
    setActiveUsername('');
  };

  if (activeRoomCode) {
    return <RoomView roomCode={activeRoomCode} initialUsername={activeUsername} onLeave={handleLeaveRoom} />;
  }

  return <LandingPage onJoinRoom={handleJoinRoom} />;
}
