import { Handle } from "./Handle";

/** SFTP file/directory attributes as returned/accepted by stat, setstat, etc. */
export interface FileAttributes {
    mode?: number;
    uid?: number;
    gid?: number;
    size?: number;
    atime?: number | Date;
    mtime?: number | Date;
    /** Whether entry is a directory (available on stat results). */
    isDirectory?(): boolean;
    /** Whether entry is a symbolic link (available on stat results). */
    isSymbolicLink?(): boolean;
    [key: string]: unknown;
}

/** A directory listing entry as returned by listdir. */
export interface FileEntry {
    filename: string;
    longname: string;
    attrs: FileAttributes;
}

/**
 * Authentication context passed to the `authenticate` method.
 * Mirrors the ssh2 authentication context object.
 */
export interface AuthenticationContext {
    /** Authentication method: 'password', 'publickey', 'keyboard-interactive', etc. */
    method: string;
    username: string;
    password?: string;
    /** Accept the authentication attempt. */
    accept(): void;
    /** Reject the authentication attempt. Optionally pass an array of still-allowed methods. */
    reject(methodsOrPartialSuccess?: string[] | boolean, isPartialSuccess?: boolean): void;
    [key: string]: unknown;
}

/**
 * Abstract base class that library consumers must extend to implement an SFTP filesystem.
 *
 * Override only the methods your implementation needs. Unimplemented methods will throw
 * an `OpUnsupportedError` by default.
 */
export declare abstract class FileSystemInterface {
    /**
     * Called when a client attempts to authenticate.
     *
     * - Return `void` (or `undefined`) to accept.
     * - Return an array of supported auth method names to reject with alternatives.
     * - Throw any error to reject.
     */
    authenticate(session: Record<string, unknown>, request: AuthenticationContext): Promise<void | string[]>;

    /** Called when a client opens a file. */
    open(session: Record<string, unknown>, handle: Handle, flags: number, attrs: FileAttributes): Promise<void>;

    /** Called when a client writes to an open file. */
    write(session: Record<string, unknown>, handle: Handle, offset: number, data: Buffer): Promise<void>;

    /**
     * Called when a client reads from an open file.
     * Return the data buffer, or `undefined` / falsy to signal EOF.
     */
    read(session: Record<string, unknown>, handle: Handle, offset: number, length: number): Promise<Buffer | undefined | null>;

    /** Called when a client requests stat on a pathname. */
    stat(session: Record<string, unknown>, pathname: string): Promise<FileAttributes>;

    /** Called when a client requests lstat on a pathname (no symlink follow). */
    lstat(session: Record<string, unknown>, pathname: string): Promise<FileAttributes>;

    /** Called when a client sets attributes on a pathname. */
    setstat(session: Record<string, unknown>, pathname: string, attrs: FileAttributes): Promise<void>;

    /** Called when a client opens a directory for listing. */
    opendir(session: Record<string, unknown>, handle: Handle, pathname: string): Promise<void>;

    /**
     * Called when a client reads the next batch of directory entries.
     * Return an array of `FileEntry` objects, or `undefined` / falsy to signal EOF.
     */
    listdir(session: Record<string, unknown>, handle: Handle): Promise<FileEntry[] | undefined | null>;

    /** Called when a client creates a directory. */
    mkdir(session: Record<string, unknown>, pathname: string, attrs: FileAttributes): Promise<void>;

    /** Called when a client removes a file. */
    remove(session: Record<string, unknown>, pathname: string): Promise<void>;

    /** Called when a client removes a directory. */
    rmdir(session: Record<string, unknown>, pathname: string): Promise<void>;

    /** Called when a client resolves a real (canonical) path. */
    realpath(session: Record<string, unknown>, pathname: string): Promise<string>;

    /** Called when a client reads a symbolic link target. */
    readlink(session: Record<string, unknown>, pathname: string): Promise<string>;

    /** Called when a client renames/moves a file or directory. */
    rename(session: Record<string, unknown>, oldPathname: string, newPathname: string): Promise<void>;

    /** Called when a client creates a symbolic link. */
    symlink(session: Record<string, unknown>, targetPathname: string, linkPathname: string): Promise<void>;
}
