import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Play, Square, Plug, Send, Zap } from "lucide-react";

import { useInteractiveSession } from "@/hooks/useInteractiveSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InteractiveTerminal } from "./InteractiveTerminal";
import { HotkeysDrawer } from "./HotkeysDrawer";

const INTERACTIVE_FLAG_ENABLED =
  (import.meta.env.VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB ?? 'true').toString().toLowerCase() !== 'false';

export function InteractiveSessionTab() {
  const {
    sessionState,
    logs,
    connectionState,
    isFetching,
    isStarting,
    isEnding,
    error,
    lastHeartbeatAt,
    startSession,
    endSession,
    sendInput,
    interrupt,
    keepAlive,
    streamInput,
    notifyResize,
    clearLogs,
  } = useInteractiveSession({ enabled: INTERACTIVE_FLAG_ENABLED });

  const [command, setCommand] = useState("");
  const availableModels = sessionState?.availableModels ?? [];
  const activeSession = sessionState?.session ?? null;
  const [selectedModelKey, setSelectedModelKey] = useState(() => {
    const defaultModel = availableModels.find((model) => model.default) ?? availableModels[0];
    return defaultModel ? `${defaultModel.provider}:${defaultModel.model}` : "";
  });

  useEffect(() => {
    if (availableModels.length === 0) {
      return;
    }
    setSelectedModelKey((current) => {
      if (current) {
        const stillExists = availableModels.some((model) => `${model.provider}:${model.model}` === current);
        if (stillExists) {
          return current;
        }
      }
      const fallback = availableModels.find((model) => model.default) ?? availableModels[0];
      return fallback ? `${fallback.provider}:${fallback.model}` : current;
    });
  }, [availableModels]);

  const selectedModel = useMemo(() => {
    if (!selectedModelKey) return null;
    return availableModels.find((model) => `${model.provider}:${model.model}` === selectedModelKey) ?? null;
  }, [availableModels, selectedModelKey]);

  const sessionStatus = activeSession?.status ?? "idle";
  const connectionBadgeVariant =
    connectionState === "connected" ? "default" : connectionState === "connecting" ? "info" : "outline";
  const connectionBadgeLabel =
    connectionState === "connected"
      ? "Connected"
      : connectionState === "connecting"
        ? "Connecting"
        : "Disconnected";

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeSession?.id]);

  const sessionIdleDeadline = activeSession?.idleDeadline ? new Date(activeSession.idleDeadline).getTime() : null;
  const idleSecondsRemaining = useMemo(() => {
    if (!sessionIdleDeadline) {
      return null;
    }
    return Math.max(0, Math.round((sessionIdleDeadline - nowTick) / 1000));
  }, [sessionIdleDeadline, nowTick]);
  const idleCountdownLabel = idleSecondsRemaining !== null ? `${idleSecondsRemaining}s` : "—";
  const idleWarning = idleSecondsRemaining !== null && idleSecondsRemaining <= 60;
  const connectionAlertTone = activeSession
    ? connectionState === "disconnected"
      ? "warning"
      : connectionState === "connecting"
        ? "info"
        : null
    : null;
  const connectionAlertMessage =
    connectionAlertTone === "warning"
      ? "WebSocket connection dropped. Retrying automatically—refresh if the terminal stays blank."
      : connectionAlertTone === "info"
        ? "Connecting to the interactive stream. Commands will buffer once the socket is ready."
        : null;
  const connectionAlertClasses =
    connectionAlertTone === "warning"
      ? "border-amber-500/60 bg-amber-50/80 text-amber-900"
      : "border-sky-500/50 bg-sky-50/80 text-sky-900";

  const handleStartSession = async () => {
    if (!selectedModel) return;
    await startSession(selectedModel.provider, selectedModel.model);
  };

  const handleSendCommand = async (event: FormEvent) => {
    event.preventDefault();
    if (!command.trim()) return;
    await sendInput(command.trim());
    await keepAlive("user");
    setCommand("");
  };

  const lastHeartbeatAgo = lastHeartbeatAt ? Math.max(0, Math.round((nowTick - lastHeartbeatAt) / 1000)) : null;
  const lastHeartbeatLabel = lastHeartbeatAt
    ? `${new Date(lastHeartbeatAt).toLocaleTimeString()} (${lastHeartbeatAgo}s ago)`
    : "Not sent yet";

  const handleManualHeartbeat = useCallback(async () => {
    await keepAlive("user");
  }, [keepAlive]);

  const handleManualInterrupt = useCallback(async () => {
    await interrupt();
  }, [interrupt]);

  const handleTerminalData = useCallback(
    async (chunk: string) => {
      await streamInput(chunk);
    },
    [streamInput],
  );

  const handleClearTerminalLogs = useCallback(() => {
    clearLogs();
  }, [clearLogs]);

  const handleControlSequence = useCallback(
    async (sequence: string) => {
      if (!activeSession) {
        return;
      }
      await streamInput(sequence);
    },
    [activeSession, streamInput],
  );

  const handleClearLine = useCallback(async () => {
    await handleControlSequence("\u0015");
  }, [handleControlSequence]);

  const handleDeleteWord = useCallback(async () => {
    await handleControlSequence("\u0017");
  }, [handleControlSequence]);

  const disableStart = !selectedModel || isStarting || Boolean(activeSession);
  const disableEnd = !activeSession || isEnding;

  return (
    <div className="flex h-full flex-col gap-4">
      {!INTERACTIVE_FLAG_ENABLED && (
        <Card>
          <CardHeader>
            <CardTitle>Interactive Sessions Disabled</CardTitle>
            <CardDescription>
              Set VITE_FEATURE_DEV_BOTS_INTERACTIVE_TAB=false if you need to hide the interactive tab.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="border-border/70 bg-card/80">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4" /> Interactive Session Control
            </CardTitle>
            <CardDescription>
              Launch an on-demand admin shell session without interrupting the automation queue.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <Label className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Model</Label>
              <Select
                value={selectedModelKey}
                onValueChange={setSelectedModelKey}
                disabled={availableModels.length === 0 || Boolean(activeSession)}
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={`${model.provider}:${model.model}`} value={`${model.provider}:${model.model}`}>
                      {model.displayName || `${model.provider} / ${model.model}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant={connectionBadgeVariant} className="capitalize">
              {connectionBadgeLabel}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {sessionStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={handleStartSession} disabled={disableStart}>
            <Play className="mr-2 h-4 w-4" />
            {isStarting ? "Starting..." : "Start Session"}
          </Button>
          <Button variant="destructive" onClick={endSession} disabled={disableEnd}>
            <Square className="mr-2 h-4 w-4" />
            {isEnding ? "Stopping..." : "End Session"}
          </Button>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Last heartbeat: <span className="font-mono text-foreground">{lastHeartbeatLabel}</span>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={handleManualHeartbeat} disabled={!activeSession}>
              <Zap className="mr-2 h-4 w-4" /> Send Heartbeat
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}
      {idleWarning && activeSession && (
        <div className="flex items-center gap-2 rounded border border-amber-400/60 bg-amber-50/80 px-4 py-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4" />
          Session will time out in <span className="font-semibold">{idleCountdownLabel}</span>. Send a heartbeat or keep the
          terminal busy to stay connected.
        </div>
      )}
      {connectionAlertTone && connectionAlertMessage && (
        <div className={`flex items-center gap-2 rounded border px-4 py-2 text-sm ${connectionAlertClasses}`}>
          <AlertCircle className="h-4 w-4" />
          {connectionAlertMessage}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Send className="h-4 w-4" /> Terminal
            </CardTitle>
            <CardDescription>
              Live stream from the dedicated interactive worker. Commands run immediately outside the automation queue.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <InteractiveTerminal
              logs={logs}
              connectionState={connectionState}
              onData={handleTerminalData}
              onInterrupt={handleManualInterrupt}
              onResize={notifyResize}
            />
            <form className="flex flex-col gap-3" onSubmit={handleSendCommand}>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-muted-foreground">Send Command</label>
                <Input
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="e.g. npm run test"
                  disabled={!activeSession || isFetching}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={!activeSession || !command.trim()}>
                  <Send className="mr-2 h-4 w-4" /> Send
                </Button>
                <Button type="button" variant="outline" onClick={handleManualInterrupt} disabled={!activeSession}>
                  <AlertCircle className="mr-2 h-4 w-4" /> Interrupt
                </Button>
                <Button type="button" variant="outline" onClick={handleManualHeartbeat} disabled={!activeSession}>
                  <Zap className="mr-2 h-4 w-4" /> Keep Alive
                </Button>
                <Button type="button" variant="ghost" onClick={handleClearTerminalLogs}>
                  Clear Output
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Session Details</CardTitle>
              <CardDescription>Live metadata for the interactive worker.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Owner</span>
                {activeSession ? (
                  <Badge variant="outline" className="font-mono text-xs">
                    {activeSession.ownerEmail}
                  </Badge>
                ) : (
                  <span>—</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Session ID</span>
                <span className="font-mono text-xs text-foreground">{activeSession?.id ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model</span>
                <span>
                  {activeSession ? `${activeSession.modelProvider}/${activeSession.modelName}` : selectedModel?.displayName ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stream</span>
                <Badge variant={connectionBadgeVariant} className="capitalize">
                  {connectionBadgeLabel}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span>
                  {activeSession?.startedAt ? new Date(activeSession.startedAt).toLocaleString() : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Idle Timeout</span>
                <span>{sessionState?.idleTimeoutSeconds ?? 0}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Idle Countdown</span>
                <span className={idleWarning ? "font-semibold text-destructive" : undefined}>{idleCountdownLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Heartbeat</span>
                <span>{lastHeartbeatLabel}</span>
              </div>
            </CardContent>
          </Card>

          <HotkeysDrawer
            disabled={!activeSession}
            onInterrupt={handleManualInterrupt}
            onClearTerminal={handleClearTerminalLogs}
            onClearLine={handleClearLine}
            onDeleteWord={handleDeleteWord}
          />
        </div>
      </div>
    </div>
  );
}
