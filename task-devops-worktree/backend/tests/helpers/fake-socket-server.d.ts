type Handler = (...args: any[]) => void;
export declare class TestClientSocket {
    readonly id: string;
    connected: boolean;
    readonly rooms: Set<string>;
    private serverHandlers;
    private clientHandlers;
    constructor(id?: string);
    on(event: string, handler: Handler): this;
    once(event: string, handler: Handler): this;
    off(event: string, handler: Handler): this;
    emit(event: string, ...args: any[]): boolean;
    clientOn(event: string, handler: Handler): this;
    clientOnce(event: string, handler: Handler): this;
    clientOff(event: string, handler: Handler): this;
    clientEmit(event: string, ...args: any[]): Promise<void>;
    join(room: string): void;
    leave(room: string): void;
    disconnect(reason?: string): void;
    reconnect(): void;
    private invokeHandlers;
}
export declare class TestSocketIOServer {
    private readonly connectionHandlers;
    private sockets;
    readonly emittedEvents: Array<{
        event: string;
        args: any[];
    }>;
    on(event: string, handler: Handler): this;
    emit(event: string, ...args: any[]): boolean;
    to(room: string): {
        emit: (event: string, ...args: any[]) => void;
    };
    connect(existingSocket?: TestClientSocket): TestClientSocket;
    disconnect(socket: TestClientSocket, reason?: string): void;
    get connectedSockets(): TestClientSocket[];
}
export {};
//# sourceMappingURL=fake-socket-server.d.ts.map