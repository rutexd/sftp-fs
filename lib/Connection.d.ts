import { Handle } from "./Handle";

/** Minimal representation of the ssh2 client attached to a connection. */
export interface ClientInfo {
    session: Record<string, unknown>;
    end(): void;
}

export declare class Connection {
    client: ClientInfo;
    handles: Handle[];
    stream: unknown;

    constructor(client: ClientInfo);

    respond(fn: () => boolean): Promise<void>;
    canContinue(): void;
    addStream(stream: unknown): void;
    addAction(action: string, fn: (requestId: number, ...args: unknown[]) => Promise<unknown>): void;
    createFileHandle(pathname: string): Handle;
    createDirectoryHandle(pathname: string): Handle;
    getHandle(encodedId: Buffer): Handle;
    destroyHandle(encodedId: Buffer): Promise<void>;
    close(): Promise<void>;
}
