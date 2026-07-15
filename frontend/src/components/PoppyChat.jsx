import React, { useState, useEffect, useRef } from 'react';
import {
  getPoppyBoards,
  getPoppyChats,
  askPoppy,
} from '../services/api';
import {
  MessageSquare,
  Send,
  Loader2,
  Database,
  ExternalLink,
  ChevronDown,
  Sparkles,
  AlertCircle,
  Check,
} from 'lucide-react';

// Pre-configured: Client Information Database board
const CID_BOARD_ID = 'small-wood-qk34F';
const CID_BOARD_NAME = 'Client Information Database';
const KB_URL = 'http://knowledgebase.fijiitsolutions.com/user/fis';

export default function PoppyChat() {
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(CID_BOARD_ID);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const messagesEndRef = useRef(null);

  // Load boards on mount
  useEffect(() => {
    loadBoards();
  }, []);

  // Load chats when board changes
  useEffect(() => {
    if (selectedBoard) {
      loadChats(selectedBoard);
    }
  }, [selectedBoard]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadBoards = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPoppyBoards();
      const boardList = data?.boards || data?.data || data || [];
      setBoards(Array.isArray(boardList) ? boardList : []);
    } catch (err) {
      setError(`Failed to load boards: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadChats = async (boardId) => {
    try {
      setChats([]);
      setSelectedChat(null);
      const data = await getPoppyChats(boardId);
      const chatList = data?.chats || data?.data || data || [];
      const flat = [];
      (Array.isArray(chatList) ? chatList : []).forEach((c) => {
        if (c.conversations) {
          c.conversations.forEach((conv) =>
            flat.push({ ...conv, chatId: c.id, chatName: c.name })
          );
        } else {
          flat.push(c);
        }
      });
      setChats(flat);
      if (flat.length > 0) setSelectedChat(flat[0]);
    } catch (err) {
      // Some boards may have no chats endpoint — not fatal
      setChats([]);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedChat) return;
    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: trimmed, ts: Date.now() },
    ]);
    setAsking(true);
    setError(null);
    try {
      const chatId = selectedChat.chatId || selectedChat.id;
      const resp = await askPoppy(selectedBoard, chatId, trimmed);
      const replyText =
        resp?.text || resp?.data?.text || resp?.reply || JSON.stringify(resp);
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: replyText, ts: Date.now() },
      ]);
      setSuccess('Reply received');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Error: ${err.message}`,
          ts: Date.now(),
          isError: true,
        },
      ]);
      setError(err.message);
    } finally {
      setAsking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectBoard = (id) => {
    setSelectedBoard(id);
    setMessages([]);
    setBoardsOpen(false);
  };

  const selectChat = (chat) => {
    setSelectedChat(chat);
    setMessages([]);
    setChatsOpen(false);
  };

  const currentBoardName =
    boards.find((b) => b.id === selectedBoard)?.name || CID_BOARD_NAME;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0' }}>
        <Loader2 size={16} className="spin" />
        <span style={{ color: '#888', fontSize: 14 }}>Loading Poppy boards…</span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── Header row: KB link + CID quick-select ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="#a78bfa" />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Poppy AI Chat</span>
        </div>
        <a
          href={KB_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            color: '#60a5fa',
            textDecoration: 'none',
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #1e3a5f',
            background: '#0c1a2e',
          }}
        >
          <ExternalLink size={12} />
          Open Knowledge Base
        </a>
      </div>

      {/* ── Status messages ── */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 6,
            background: '#1f1414',
            borderLeft: '3px solid #ef4444',
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          <AlertCircle size={14} color="#ef4444" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 6,
            background: '#052e16',
            borderLeft: '3px solid #16a34a',
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          <Check size={14} color="#16a34a" />
          <span>{success}</span>
        </div>
      )}

      {/* ── Board selector ── */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
          Board
        </label>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setBoardsOpen(!boardsOpen)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #333',
              background: '#1a1a1a',
              color: '#eee',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Database size={13} color="#a78bfa" />
              {selectedBoard === CID_BOARD_ID ? CID_BOARD_NAME : currentBoardName}
            </span>
            <ChevronDown
              size={14}
              style={{
                transform: boardsOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            />
          </button>
          {boardsOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                maxHeight: 220,
                overflowY: 'auto',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 8,
                marginTop: 2,
              }}
            >
              {/* CID quick-select at top */}
              <button
                onClick={() => selectBoard(CID_BOARD_ID)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  background:
                    selectedBoard === CID_BOARD_ID ? '#1e2a3a' : 'transparent',
                  border: 'none',
                  color: '#60a5fa',
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                }}
              >
                <Database size={12} />
                {CID_BOARD_NAME}
                <span
                  style={{
                    fontSize: 10,
                    background: '#1e3a5f',
                    color: '#60a5fa',
                    padding: '1px 5px',
                    borderRadius: 3,
                    marginLeft: 'auto',
                  }}
                >
                  CID
                </span>
              </button>
              <div style={{ borderTop: '1px solid #222' }} />
              {boards
                .filter((b) => b.id !== CID_BOARD_ID)
                .map((b) => (
                  <button
                    key={b.id}
                    onClick={() => selectBoard(b.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 12px',
                      background:
                        selectedBoard === b.id ? '#1e2a3a' : 'transparent',
                      border: 'none',
                      color: '#ccc',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {b.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Chat selector ── */}
      {chats.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
            Chat Assistant
          </label>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setChatsOpen(!chatsOpen)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #333',
                background: '#1a1a1a',
                color: '#eee',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={13} color="#34d399" />
                {selectedChat?.name || selectedChat?.id || 'Select chat…'}
              </span>
              <ChevronDown
                size={14}
                style={{
                  transform: chatsOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s',
                }}
              />
            </button>
            {chatsOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  maxHeight: 180,
                  overflowY: 'auto',
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: 8,
                  marginTop: 2,
                }}
              >
                {chats.map((c, i) => (
                  <button
                    key={c.id || i}
                    onClick={() => selectChat(c)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 12px',
                      background:
                        selectedChat?.id === c.id ? '#1e2a3a' : 'transparent',
                      border: 'none',
                      color: '#ccc',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {c.name || c.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div
        style={{
          background: '#0d0d0d',
          border: '1px solid #222',
          borderRadius: 8,
          minHeight: 160,
          maxHeight: 320,
          overflowY: 'auto',
          padding: 12,
          marginBottom: 10,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 140,
              color: '#555',
              fontSize: 13,
              gap: 6,
            }}
          >
            <MessageSquare size={20} />
            <span>
              {selectedChat
                ? 'Ask a question about your clients…'
                : 'Select a chat assistant to begin'}
            </span>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.5,
                background:
                  m.role === 'user'
                    ? '#1e3a5f'
                    : m.isError
                    ? '#2a1010'
                    : '#1a2e1a',
                color: m.isError ? '#f87171' : '#e0e0e0',
                borderBottomRightRadius: m.role === 'user' ? 2 : 10,
                borderBottomLeftRadius: m.role === 'user' ? 10 : 2,
              }}
            >
              {m.role === 'ai' && (
                <span
                  style={{
                    fontSize: 10,
                    color: '#34d399',
                    fontWeight: 600,
                    display: 'block',
                    marginBottom: 3,
                  }}
                >
                  ✨ Poppy AI
                </span>
              )}
              {m.text}
            </div>
          </div>
        ))}
        {asking && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: '#1a2e1a',
                color: '#888',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Loader2 size={12} className="spin" />
              Thinking…
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedChat
              ? 'Ask about clients, projects, tickets…'
              : 'Select a chat assistant first…'
          }
          disabled={!selectedChat || asking}
          rows={2}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#eee',
            fontSize: 13,
            resize: 'none',
            opacity: !selectedChat ? 0.5 : 1,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!selectedChat || !input.trim() || asking}
          className="btn btn-primary"
          style={{
            alignSelf: 'flex-end',
            padding: '8px 14px',
            opacity: !selectedChat || !input.trim() ? 0.4 : 1,
          }}
        >
          {asking ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
        </button>
      </div>

      <p style={{ fontSize: 11, color: '#555', marginTop: 6 }}>
        Powered by Poppy AI •{' '}
        <a
          href={KB_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'none' }}
        >
          Open full knowledge base →
        </a>
      </p>
    </div>
  );
}
