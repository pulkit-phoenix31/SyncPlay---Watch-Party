import React, { useState, useRef, useEffect } from 'react';
import { ChatMessageData, Role } from '../../types/index.js';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, Crown, ShieldCheck, User, AlertCircle } from 'lucide-react';

interface ChatPanelProps {
  messages: ChatMessageData[];
  currentUserId?: string;
  onSendMessage: (msg: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentUserId,
  onSendMessage,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-[#0E0E10] overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-white/5 flex items-center px-4 justify-between shrink-0">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-[#FF5400]" />
          Live Chat
        </span>
        <div className="flex gap-1 items-center">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5400] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF5400]"></span>
          </span>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <MessageSquare className="w-8 h-8 text-gray-600 mb-2 opacity-50" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">No messages yet</p>
            <p className="text-[11px] text-gray-500 mt-1">Start chatting with party members!</p>
          </div>
        ) : (
          messages.map((m) => {
            const isSelf = m.userId === currentUserId;
            const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold ${
                      m.userRole === 'Host'
                        ? 'text-[#FF5400]'
                        : m.userRole === 'Moderator'
                        ? 'text-purple-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {m.username}
                  </span>

                  {m.userRole === 'Host' && (
                    <span className="text-[9px] font-bold text-[#FF5400] uppercase tracking-tighter px-1 py-0.2 bg-[#FF5400]/10 rounded border border-[#FF5400]/20">
                      Host
                    </span>
                  )}
                  {m.userRole === 'Moderator' && (
                    <span className="text-[9px] font-bold text-purple-400 uppercase tracking-tighter px-1 py-0.2 bg-purple-500/10 rounded border border-purple-500/20">
                      Mod
                    </span>
                  )}

                  <span className="text-[10px] text-gray-600 font-mono ml-auto">{timeStr}</span>
                </div>

                <div
                  className={`p-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed border break-words ${
                    isSelf
                      ? 'bg-[#FF5400]/10 border-[#FF5400]/30 text-gray-100 rounded-tr-none'
                      : 'bg-white/5 border-white/5 text-gray-300 rounded-tl-none'
                  }`}
                >
                  {m.message}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Box */}
      <div className="p-4 bg-[#111113] border-t border-white/5 shrink-0">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-4 pr-10 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FF5400] transition-colors"
          />
          <motion.button
            whileHover={{ scale: 1.15, rotate: -10 }}
            whileTap={{ scale: 0.9 }}
            type="submit"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-[#FF5400] transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </form>
      </div>
    </div>
  );
};

