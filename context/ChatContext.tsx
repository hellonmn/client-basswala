/**
 * context/ChatContext.tsx — User app chat state + WebSocket connection
 *
 * Manages:
 *   - WebSocket connection lifecycle (connect on auth, reconnect on drop)
 *   - Conversation list with unread counts
 *   - Real-time incoming message handling
 *   - Total unread badge count for the tab bar
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuth } from "./AuthContext";
import { chatApi, tokenStorage } from "../services/userApi";

interface ChatContextType {
  conversations: any[];
  totalUnread: number;
  loading: boolean;
  refreshConversations: () => Promise<void>;
  onNewMessage: (handler: (msg: any) => void) => () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

// Derive the WebSocket origin from the same base URL the REST API uses so
// chat always talks to the same backend (hosted by default, override via
// EXPO_PUBLIC_API_BASE_URL). Strip the trailing /api and swap http→ws.
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL || "https://server.basswala.com/api")
  .replace(/\/api\/?$/, "");
const WS_URL = API_BASE.replace("https://", "wss://").replace("http://", "ws://");

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const messageHandlersRef = useRef<Set<(msg: any) => void>>(new Set());

  const refreshConversations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await chatApi.getConversations();
      if (res?.success) {
        const list = res.data || [];
        setConversations(list);
        setTotalUnread(list.reduce((sum: number, c: any) => sum + (c.unreadUser || 0), 0));
      }
    } catch (err) {
      console.warn("Chat refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const connectWebSocket = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const token = await tokenStorage.get();
      if (!token) return;

      const ws = new WebSocket(`${WS_URL}/chat?token=${token}`);

      ws.onopen = () => {
        console.log("💬 Chat WS connected");
        retryCountRef.current = 0;
        refreshConversations();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_message") {
            // Update conversations list
            setConversations((prev) => {
              const updated = prev.map((c) =>
                c.id === data.conversationId
                  ? {
                      ...c,
                      lastMessage: data.message.text,
                      lastMessageAt: data.message.createdAt,
                      unreadUser: (c.unreadUser || 0) + 1,
                    }
                  : c
              );
              // Recalculate total unread
              setTotalUnread(updated.reduce((sum, c) => sum + (c.unreadUser || 0), 0));
              return updated.sort((a, b) =>
                new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
              );
            });

            // Notify message handlers (for active chat screen)
            messageHandlersRef.current.forEach((h) => {
              try { h(data); } catch (_) {}
            });
          } else if (data.type === "read_receipt") {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === data.conversationId ? { ...c, unreadUser: 0 } : c
              )
            );
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        console.log("💬 Chat WS closed");
        wsRef.current = null;
        // Reconnect with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
        retryCountRef.current++;
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      console.warn("Chat WS error:", err);
    }
  }, [refreshConversations]);

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connectWebSocket();
      refreshConversations();
    } else {
      wsRef.current?.close();
      wsRef.current = null;
      setConversations([]);
      setTotalUnread(0);
    }
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [isAuthenticated]);

  // Reconnect when app comes to foreground
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === "active" && isAuthenticated) {
        connectWebSocket();
        refreshConversations();
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [isAuthenticated]);

  const onNewMessage = useCallback((handler: (msg: any) => void) => {
    messageHandlersRef.current.add(handler);
    return () => { messageHandlersRef.current.delete(handler); };
  }, []);

  return (
    <ChatContext.Provider value={{ conversations, totalUnread, loading, refreshConversations, onNewMessage }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
