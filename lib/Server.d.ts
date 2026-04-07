import { EventEmitter } from "events";
import { FileSystemInterface } from "./FileSystemInterface";
import { Connection } from "./Connection";

export interface SessionOpenEvent {
    connection: Connection;
    /** The raw ssh2 Session object. */
    session: unknown;
}

/**
 * Additional ssh2 `Server` constructor options (excluding `hostKeys`).
 * See the ssh2 documentation for the full list of supported options.
 */
export type ServerOptions = Record<string, unknown>;

export declare interface Server {
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "client-connected", listener: (connection: Connection) => void): this;
    on(event: "client-disconnected", listener: (connection: Connection) => void): this;
    on(event: "session-open", listener: (event: SessionOpenEvent) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;

    emit(event: "error", error: Error): boolean;
    emit(event: "client-connected", connection: Connection): boolean;
    emit(event: "client-disconnected", connection: Connection): boolean;
    emit(event: "session-open", data: SessionOpenEvent): boolean;
    emit(event: string, ...args: unknown[]): boolean;
}

export declare class Server extends EventEmitter {
    constructor(filesystem: FileSystemInterface, opts?: ServerOptions);

    /**
     * Start the SFTP server and listen on `port`.
     *
     * `key` can be either:
     * - a `string` path to a host-key file (e.g. an RSA private key), or
     * - a `Buffer` containing the raw host-key data.
     *
     * The optional `hostname` controls which network interface the server
     * binds to (e.g. `"127.0.0.1"`). When omitted the server listens on
     * all interfaces.
     *
     * Resolves once the server is listening.
     */
    start(key: string | Buffer, port: number, hostname?: string): Promise<void>;

    /**
     * Stop the server: close all active connections and stop accepting new ones.
     */
    stop(): Promise<void>;
}
