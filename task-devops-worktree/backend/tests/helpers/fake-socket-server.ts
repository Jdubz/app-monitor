import { randomUUID } from 'crypto';

type Handler = (...args: any[]) => void;

export class TestClientSocket {
  public readonly id: string;
  public connected = true;
  public readonly rooms = new Set<string>();

  private serverHandlers = new Map<string, Set<Handler>>();
  private clientHandlers = new Map<string, Set<Handler>>();

  constructor(id?: string) {
    this.id = id ?? `socket-${randomUUID()}`;
  }

  on(event: string, handler: Handler): this {
    if (!this.serverHandlers.has(event)) {
      this.serverHandlers.set(event, new Set());
    }
    this.serverHandlers.get(event)!.add(handler);
    return this;
  }

  once(event: string, handler: Handler): this {
    const wrapper: Handler = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, handler: Handler): this {
    this.serverHandlers.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const handlers = this.clientHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
    return true;
  }

  clientOn(event: string, handler: Handler): this {
    if (!this.clientHandlers.has(event)) {
      this.clientHandlers.set(event, new Set());
    }
    this.clientHandlers.get(event)!.add(handler);
    return this;
  }

  clientOnce(event: string, handler: Handler): this {
    const wrapper: Handler = (...args) => {
      this.clientOff(event, wrapper);
      handler(...args);
    };
    return this.clientOn(event, wrapper);
  }

  clientOff(event: string, handler: Handler): this {
    this.clientHandlers.get(event)?.delete(handler);
    return this;
  }

  async clientEmit(event: string, ...args: any[]): Promise<void> {
    const handlers = this.serverHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        await handler(...args);
      }
    }
  }

  join(room: string): void {
    this.rooms.add(room);
  }

  leave(room: string): void {
    this.rooms.delete(room);
  }

  disconnect(reason = 'client disconnect'): void {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    this.invokeHandlers(this.serverHandlers.get('disconnect'), reason);
    this.invokeHandlers(this.clientHandlers.get('disconnect'), reason);
  }

  reconnect(): void {
    if (this.connected) {
      return;
    }
    this.connected = true;
    this.invokeHandlers(this.clientHandlers.get('connect'));
  }

  private invokeHandlers(handlers: Set<Handler> | undefined, ...args: any[]): void {
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler(...args);
    }
  }
}

export class TestSocketIOServer {
  private readonly connectionHandlers = new Set<(socket: TestClientSocket) => void>();
  private sockets: TestClientSocket[] = [];
  public readonly emittedEvents: Array<{ event: string; args: any[] }> = [];

  on(event: string, handler: Handler): this {
    if (event === 'connection') {
      this.connectionHandlers.add(handler as (socket: TestClientSocket) => void);
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (event === 'connection') {
      for (const handler of this.connectionHandlers) {
        handler(args[0] as TestClientSocket);
      }
    } else {
      this.emittedEvents.push({ event, args });
      for (const socket of this.sockets) {
        socket.emit(event, ...args);
      }
    }
    return true;
  }

  to(room: string): { emit: (event: string, ...args: any[]) => void } {
    return {
      emit: (event: string, ...args: any[]) => {
        for (const socket of this.sockets) {
          if (socket.rooms.has(room)) {
            socket.emit(event, ...args);
          }
        }
      },
    };
  }

  connect(existingSocket?: TestClientSocket): TestClientSocket {
    const socket = existingSocket ?? new TestClientSocket();
    this.sockets.push(socket);
    for (const handler of this.connectionHandlers) {
      handler(socket as unknown as any);
    }
    socket.reconnect();
    return socket;
  }

  disconnect(socket: TestClientSocket, reason?: string): void {
    this.sockets = this.sockets.filter((candidate) => candidate !== socket);
    socket.disconnect(reason);
  }

  get connectedSockets(): TestClientSocket[] {
    return [...this.sockets];
  }
}
