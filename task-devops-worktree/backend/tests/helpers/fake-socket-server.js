import { randomUUID } from 'crypto';
export class TestClientSocket {
    id;
    connected = true;
    rooms = new Set();
    serverHandlers = new Map();
    clientHandlers = new Map();
    constructor(id) {
        this.id = id ?? `socket-${randomUUID()}`;
    }
    on(event, handler) {
        if (!this.serverHandlers.has(event)) {
            this.serverHandlers.set(event, new Set());
        }
        this.serverHandlers.get(event).add(handler);
        return this;
    }
    once(event, handler) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            handler(...args);
        };
        return this.on(event, wrapper);
    }
    off(event, handler) {
        this.serverHandlers.get(event)?.delete(handler);
        return this;
    }
    emit(event, ...args) {
        const handlers = this.clientHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(...args);
            }
        }
        return true;
    }
    clientOn(event, handler) {
        if (!this.clientHandlers.has(event)) {
            this.clientHandlers.set(event, new Set());
        }
        this.clientHandlers.get(event).add(handler);
        return this;
    }
    clientOnce(event, handler) {
        const wrapper = (...args) => {
            this.clientOff(event, wrapper);
            handler(...args);
        };
        return this.clientOn(event, wrapper);
    }
    clientOff(event, handler) {
        this.clientHandlers.get(event)?.delete(handler);
        return this;
    }
    async clientEmit(event, ...args) {
        const handlers = this.serverHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                await handler(...args);
            }
        }
    }
    join(room) {
        this.rooms.add(room);
    }
    leave(room) {
        this.rooms.delete(room);
    }
    disconnect(reason = 'client disconnect') {
        if (!this.connected) {
            return;
        }
        this.connected = false;
        this.invokeHandlers(this.serverHandlers.get('disconnect'), reason);
        this.invokeHandlers(this.clientHandlers.get('disconnect'), reason);
    }
    reconnect() {
        if (this.connected) {
            return;
        }
        this.connected = true;
        this.invokeHandlers(this.clientHandlers.get('connect'));
    }
    invokeHandlers(handlers, ...args) {
        if (!handlers) {
            return;
        }
        for (const handler of handlers) {
            handler(...args);
        }
    }
}
export class TestSocketIOServer {
    connectionHandlers = new Set();
    sockets = [];
    emittedEvents = [];
    on(event, handler) {
        if (event === 'connection') {
            this.connectionHandlers.add(handler);
        }
        return this;
    }
    emit(event, ...args) {
        if (event === 'connection') {
            for (const handler of this.connectionHandlers) {
                handler(args[0]);
            }
        }
        else {
            this.emittedEvents.push({ event, args });
            for (const socket of this.sockets) {
                socket.emit(event, ...args);
            }
        }
        return true;
    }
    to(room) {
        return {
            emit: (event, ...args) => {
                for (const socket of this.sockets) {
                    if (socket.rooms.has(room)) {
                        socket.emit(event, ...args);
                    }
                }
            },
        };
    }
    connect(existingSocket) {
        const socket = existingSocket ?? new TestClientSocket();
        this.sockets.push(socket);
        for (const handler of this.connectionHandlers) {
            handler(socket);
        }
        socket.reconnect();
        return socket;
    }
    disconnect(socket, reason) {
        this.sockets = this.sockets.filter((candidate) => candidate !== socket);
        socket.disconnect(reason);
    }
    get connectedSockets() {
        return [...this.sockets];
    }
}
//# sourceMappingURL=fake-socket-server.js.map