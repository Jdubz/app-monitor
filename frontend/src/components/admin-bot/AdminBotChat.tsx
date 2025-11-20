/**
 * AdminBotChat Component
 *
 * Minimal AI chat interface for admin bot interactions.
 * Uses assistant-ui for clean chat UI and SSE for streaming responses.
 *
 * Features:
 * - Start/stop chat sessions
 * - Send messages to Codex CLI
 * - Stream responses in real-time via SSE
 * - Display conversation history
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Power, Send, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdminBotSSE } from '@/hooks/useAdminBotSSE';
import { getApiBasePath } from '@/utils/apiBaseUrl';
import axios from 'axios';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export function AdminBotChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [, setSessionId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const currentAssistantMessageRef = useRef<string>('');

  const apiKey = import.meta.env.VITE_API_KEY || '';
  const apiBasePath = getApiBasePath();

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const response = await axios.get(
          `${apiBasePath}/admin-bot/chat/status`,
          {
            headers: { 'X-API-Key': apiKey },
          }
        );

        const status = response.data.data;

        if (status.isRunning && status.session) {
          setSessionId(status.session.id);
          setIsSessionActive(true);
          setMessages([
            {
              id: `system-${Date.now()}`,
              role: 'system',
              content: `Reconnected to existing session (started ${new Date(status.session.startedAt).toLocaleTimeString()})`,
              timestamp: new Date(),
            },
          ]);
        }
      } catch (err) {
        console.error('[AdminBotChat] Failed to check session status:', err);
      }
    };

    checkExistingSession();
  }, [apiKey, apiBasePath]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Append streaming output to current assistant message
  const handleOutput = useCallback((content: string) => {
    setIsStreaming(true);

    // Accumulate output
    currentAssistantMessageRef.current += content;

    // Update or create assistant message
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];

      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.id === 'streaming') {
        // Update existing streaming message
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: currentAssistantMessageRef.current,
          },
        ];
      } else {
        // Create new assistant message
        return [
          ...prev,
          {
            id: 'streaming',
            role: 'assistant' as const,
            content: currentAssistantMessageRef.current,
            timestamp: new Date(),
          },
        ];
      }
    });
  }, []);

  // Handle error output
  const handleError = useCallback((content: string) => {
    console.error('[AdminBotChat] Error:', content);

    setMessages((prev) => [
      ...prev,
      {
        id: `error-${Date.now()}`,
        role: 'system' as const,
        content: `Error: ${content}`,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Handle session exit
  const handleExit = useCallback((code: number | null) => {
    console.log('[AdminBotChat] Session exited with code:', code);

    setIsStreaming(false);
    currentAssistantMessageRef.current = '';

    // Finalize streaming message
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.id === 'streaming') {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            id: `assistant-${Date.now()}`,
          },
        ];
      }
      return prev;
    });

    setMessages((prev) => [
      ...prev,
      {
        id: `system-exit-${Date.now()}`,
        role: 'system' as const,
        content: `Session ended (exit code: ${code ?? 'unknown'})`,
        timestamp: new Date(),
      },
    ]);

    setIsSessionActive(false);
    setSessionId(null);
  }, []);

  // Handle SSE connection
  const handleConnected = useCallback(() => {
    console.log('[AdminBotChat] SSE connected');
  }, []);

  // Setup SSE connection (only when session is active)
  const { close: closeSSE } = useAdminBotSSE({
    onOutput: isSessionActive ? handleOutput : undefined,
    onError: isSessionActive ? handleError : undefined,
    onExit: isSessionActive ? handleExit : undefined,
    onConnected: handleConnected,
  });

  // Start a new chat session
  const startSession = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        `${apiBasePath}/admin-bot/chat/start`,
        {},
        {
          headers: {
            'X-API-Key': apiKey,
          },
        }
      );

      setSessionId(response.data.data.sessionId);
      setIsSessionActive(true);

      setMessages([
        {
          id: `system-${Date.now()}`,
          role: 'system',
          content: 'Admin bot session started. You can now send messages.',
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error('[AdminBotChat] Failed to start session:', err);
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setIsLoading(false);
    }
  };

  // Stop the current session
  const stopSession = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await axios.post(
        `${apiBasePath}/admin-bot/chat/stop`,
        {},
        {
          headers: {
            'X-API-Key': apiKey,
          },
        }
      );

      closeSSE();
      setIsSessionActive(false);
      setSessionId(null);
      setIsStreaming(false);
      currentAssistantMessageRef.current = '';

      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          role: 'system',
          content: 'Admin bot session stopped.',
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error('[AdminBotChat] Failed to stop session:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop session');
    } finally {
      setIsLoading(false);
    }
  };

  // Send a message to the admin bot
  const sendMessage = async () => {
    if (!inputValue.trim() || !isSessionActive) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    // Reset streaming accumulator
    currentAssistantMessageRef.current = '';

    try {
      await axios.post(
        `${apiBasePath}/admin-bot/chat/message`,
        { message: inputValue },
        {
          headers: {
            'X-API-Key': apiKey,
          },
        }
      );
    } catch (err) {
      console.error('[AdminBotChat] Failed to send message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key (Shift+Enter for new line)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Admin Bot Chat
              </CardTitle>
              <CardDescription>
                Interactive chat with Codex CLI and MCP server access
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isSessionActive && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                  Active
                </Badge>
              )}
              {!isSessionActive && (
                <Button onClick={startSession} disabled={isLoading} size="sm">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Power className="h-4 w-4 mr-2" />
                      Start Session
                    </>
                  )}
                </Button>
              )}
              {isSessionActive && (
                <Button onClick={stopSession} disabled={isLoading} variant="destructive" size="sm">
                  <Power className="h-4 w-4 mr-2" />
                  Stop Session
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-600 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Messages Area */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 border rounded-md p-4">
            {messages.length === 0 && !isSessionActive && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Bot className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">No active session</p>
                <p className="text-sm mt-2">Start a session to begin chatting with the admin bot</p>
              </div>
            )}

            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : message.role === 'system'
                          ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-700'
                          : 'bg-muted'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words font-mono text-sm">
                      {message.content}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {isStreaming && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Streaming...</span>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="flex gap-2">
            <Textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isSessionActive
                  ? 'Type your message... (Enter to send, Shift+Enter for new line)'
                  : 'Start a session to send messages'
              }
              disabled={!isSessionActive || isLoading}
              className="min-h-[60px] resize-none"
            />
            <Button
              onClick={sendMessage}
              disabled={!isSessionActive || !inputValue.trim() || isLoading}
              size="icon"
              className="h-[60px] w-[60px] flex-shrink-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
