/**
 * Type-check test: verifies that the library typings are correct and usable from TypeScript.
 * This file is not a runnable test – it is only compiled with `tsc --noEmit`.
 */
import {
    Server,
    FileSystemInterface,
    ImplFileSystem,
    Handle,
    Connection,
    FileAttributes,
    FileEntry,
    AuthenticationContext,
    ServerOptions,
    SessionOpenEvent,
    GenericError,
    NoSuchFileError,
    PermissionDeniedError,
    BadMessageError,
    OpUnsupportedError,
} from "..";

// ---------- Error classes ----------

const _ge = new GenericError("generic", 4);
_ge.status satisfies number;

const _nse = new NoSuchFileError("no such file");
_nse.status satisfies number;

const _pde = new PermissionDeniedError("denied");
_pde.status satisfies number;

const _bme = new BadMessageError("bad msg");
_bme.status satisfies number;

const _oue = new OpUnsupportedError("unsupported");
_oue.status satisfies number;

// All error subclasses must be instanceof Error
function acceptsError(_e: Error) {}
acceptsError(_ge);
acceptsError(_nse);
acceptsError(_pde);
acceptsError(_bme);
acceptsError(_oue);

// ---------- Handle ----------

function acceptsHandle(_h: Handle) {}

// ---------- FileAttributes / FileEntry ----------

const attrs: FileAttributes = {
    mode: 0o644,
    uid: 1000,
    gid: 1000,
    size: 1024,
    atime: 1000,
    mtime: 2000,
};
attrs satisfies FileAttributes;

const entry: FileEntry = {
    filename: "test.txt",
    longname: "-rwxrwxrwx 1 0 0 1024 Jan 01 test.txt",
    attrs,
};
entry satisfies FileEntry;

// ---------- AuthenticationContext ----------

const authCtx: AuthenticationContext = {
    method: "password",
    username: "user",
    password: "pass",
    accept() {},
    reject() {},
};
authCtx satisfies AuthenticationContext;

// ---------- FileSystemInterface ----------

class MyFS extends FileSystemInterface {
    override async authenticate(
        _session: Record<string, unknown>,
        ctx: AuthenticationContext,
    ): Promise<void> {
        if (ctx.method !== "password" || ctx.password !== "secret") {
            ctx.reject();

            return;
        }
        ctx.accept();
    }

    override async stat(
        _session: Record<string, unknown>,
        _pathname: string,
    ): Promise<FileAttributes> {
        return { mode: 0o644, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 };
    }

    override async listdir(
        _session: Record<string, unknown>,
        _handle: Handle,
    ): Promise<FileEntry[] | undefined> {
        return [
            {
                filename: "file.txt",
                longname: "-rw-r--r-- 1 0 0 0 Jan 01 file.txt",
                attrs: {},
            },
        ];
    }
}

// ---------- ImplFileSystem ----------

const implFs = new ImplFileSystem("user", "pass");
implFs satisfies FileSystemInterface;

// ---------- ServerOptions ----------

const opts: ServerOptions = {
    banner: "Welcome",
    greetingTimeout: 5000,
};
opts satisfies ServerOptions;

// ---------- Server ----------

const server = new Server(new MyFS(), opts);

server.on("error", (err: Error) => {
    console.error(err);
});

server.on("client-connected", (conn: Connection) => {
    acceptsHandle(conn.createFileHandle("/tmp/file"));
});

server.on("client-disconnected", (_conn: Connection) => {});

server.on("session-open", (evt: SessionOpenEvent) => {
    const _conn: Connection = evt.connection;
    void _conn;
});

// Ensure start/stop return Promises
const _startResult: Promise<void> = server.start("/path/to/key", 22);
const _stopResult: Promise<void> = server.stop();
