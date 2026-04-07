"use strict";

const util = require("util");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { promises: fs, constants } = require("fs");
const getPort = require("get-port");
const { Client } = require("ssh2");

const FileSystem = require("../impl/FileSystem");
const Server = require("../lib/Server");

const username = "userName";
const password = "passWord";
const keyFile = path.join(__dirname, "..", "server", "keys", "id_rsa");

let passed = 0;
let failed = 0;

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}: ${err.message}`);
        failed++;
    }
}

const cleanAttrs = (attrs) => {
    const cleaned = Object.assign({}, attrs);

    delete cleaned.extended;
    delete cleaned.permissions;

    return cleaned;
};

const stat = async (pathname) => {
    const attrs = await fs.stat(pathname);

    return {
        mode: attrs.mode,
        uid: attrs.uid,
        gid: attrs.gid,
        size: attrs.size,
        atime: Math.floor(attrs.atimeMs / 1000),
        mtime: Math.floor(attrs.mtimeMs / 1000)
    };
};

const list = async (pathname) => {
    const files = await fs.readdir(pathname);
    const entries = [];

    for (const filename of files) {
        const fullpath = path.join(pathname, filename);
        const attrs = await stat(fullpath);

        entries.push({ filename, longname: "", attrs });
    }

    return entries;
};

async function run() {
    const port = await getPort();
    const rootpath = await fs.mkdtemp(path.join(os.tmpdir(), "sftp-fs-"));
    const server = new Server(new FileSystem(username, password));
    const connection = new Client();
    let sftp;

    try {
        await server.start(keyFile, port, "localhost");

        console.log("Connection");

        await test("should connect successfully", async () => {
            await new Promise((resolve, reject) => {
                connection.once("ready", () => {
                    connection.removeAllListeners("error");
                    resolve();
                });
                connection.once("error", (error) => {
                    connection.removeAllListeners("ready");
                    reject(error);
                });
                connection.connect({ host: "localhost", port, username, password });
            });
        });

        await test("should start sftp subsystem successfully", async () => {
            const fn = util.promisify(connection.sftp).bind(connection);
            const obj = await fn();

            sftp = {
                readdir: util.promisify(obj.readdir).bind(obj),
                mkdir: util.promisify(obj.mkdir).bind(obj),
                rename: util.promisify(obj.rename).bind(obj),
                rmdir: util.promisify(obj.rmdir).bind(obj),
                stat: util.promisify(obj.stat).bind(obj),
                lstat: util.promisify(obj.lstat).bind(obj),
                realpath: util.promisify(obj.realpath).bind(obj),
                setstat: util.promisify(obj.setstat).bind(obj),
                symlink: util.promisify(obj.symlink).bind(obj),
                readlink: util.promisify(obj.readlink).bind(obj),
                open: util.promisify(obj.open).bind(obj),
                write: util.promisify(obj.write).bind(obj),
                read: util.promisify(obj.read).bind(obj),
                fstat: util.promisify(obj.fstat).bind(obj),
                fsetstat: util.promisify(obj.fsetstat).bind(obj),
                unlink: util.promisify(obj.unlink).bind(obj),
                close: util.promisify(obj.close).bind(obj)
            };
        });

        console.log("Directory");

        await test("should list an empty directory successfully", async () => {
            const slist = await sftp.readdir(rootpath);
            const llist = await list(rootpath);

            assert.equal(llist.length, 0);
            assert.deepEqual(slist, llist);
        });

        await test("should create a directory successfully", async () => {
            await sftp.mkdir(path.join(rootpath, "folder"));
            const llist = await list(rootpath);

            assert.equal(llist.length, 1);
            assert.equal(llist[0].filename, "folder");
        });

        await test("should stat a directory successfully", async () => {
            const attrs = cleanAttrs(await sftp.stat(path.join(rootpath, "folder")));
            const llist = await list(rootpath);

            assert.deepEqual(attrs, llist[0].attrs);
        });

        await test("should set stat successfully", async () => {
            const pathname = path.join(rootpath, "folder");
            const sattrs = {
                mode: 0o777,
                ...(isRoot ? { uid: 1000, gid: 1000 } : {}),
                atime: 1000,
                mtime: 2000
            };

            await sftp.setstat(pathname, sattrs);

            const lattrs = await stat(pathname);

            delete lattrs.size;
            if (!isRoot) {
                delete lattrs.uid;
                delete lattrs.gid;
            }
            lattrs.mode = lattrs.mode & ~constants.S_IFMT;

            assert.deepEqual(sattrs, lattrs);
        });

        await test("should rename a directory successfully", async () => {
            await sftp.rename(path.join(rootpath, "folder"), path.join(rootpath, "folder2"));
            const llist = await list(rootpath);

            assert.equal(llist.length, 1);
            assert.equal(llist[0].filename, "folder2");
        });

        await test("should remove a directory successfully", async () => {
            await sftp.rmdir(path.join(rootpath, "folder2"));
            const llist = await list(rootpath);

            assert.equal(llist.length, 0);
        });

        console.log("Symlink");

        await test("should create a symlink successfully", async () => {
            const pathname = path.join(rootpath, "folder");
            const linkname = path.join(rootpath, "folder_link");

            await sftp.mkdir(pathname);
            await sftp.symlink(pathname, linkname);

            const llist = await list(rootpath);

            assert.equal(llist.length, 2);
        });

        await test("should readlink successfully", async () => {
            const pathname = path.join(rootpath, "folder");
            const linkname = path.join(rootpath, "folder_link");
            const pn = await sftp.readlink(linkname);

            assert.equal(pn, pathname);
        });

        await test("should lstat a directory successfully", async () => {
            const attrs = cleanAttrs(await sftp.lstat(path.join(rootpath, "folder")));
            const llist = await list(rootpath);

            assert.deepEqual(attrs, llist[0].attrs);
        });

        console.log("File");

        await test("should write a file successfully", async () => {
            const filename = path.join(rootpath, "file.txt");
            const content = Buffer.from("Hello World");
            const handle = await sftp.open(filename, "w");

            await sftp.write(handle, content, 0, content.length, 0);
            await sftp.close(handle);
        });

        await test("should stat a file successfully", async () => {
            const filename = path.join(rootpath, "file.txt");
            const attrs = cleanAttrs(await sftp.stat(filename));
            const llist = await list(rootpath);

            assert.deepEqual(attrs, llist[0].attrs);
        });

        await test("should fstat a file successfully", async () => {
            const filename = path.join(rootpath, "file.txt");
            const handle = await sftp.open(filename, "r");
            const attrs = cleanAttrs(await sftp.fstat(handle));

            await sftp.close(handle);

            const llist = await list(rootpath);

            assert.deepEqual(attrs, llist[0].attrs);
        });

        await test("should set stat successfully", async () => {
            const filename = path.join(rootpath, "file.txt");
            const sattrs = {
                mode: 0o777,
                ...(isRoot ? { uid: 1000, gid: 1000 } : {}),
                atime: 1000,
                mtime: 2000
            };

            await sftp.setstat(filename, sattrs);

            const lattrs = await stat(filename);

            delete lattrs.size;
            if (!isRoot) {
                delete lattrs.uid;
                delete lattrs.gid;
            }
            lattrs.mode = lattrs.mode & 0o777;

            assert.deepEqual(sattrs, lattrs);
        });

        await test("should set fstat successfully", async () => {
            const filename = path.join(rootpath, "file.txt");
            const handle = await sftp.open(filename, "r");
            const sattrs = {
                mode: 0o777,
                ...(isRoot ? { uid: 1000, gid: 1000 } : {}),
                atime: 1000,
                mtime: 2000
            };

            await sftp.fsetstat(handle, sattrs);
            await sftp.close(handle);

            const lattrs = await stat(filename);

            delete lattrs.size;
            if (!isRoot) {
                delete lattrs.uid;
                delete lattrs.gid;
            }
            lattrs.mode = lattrs.mode & 0o777;

            assert.deepEqual(sattrs, lattrs);
        });

        await test("should read a file successfully", async () => {
            const filename = path.join(rootpath, "file.txt");
            const handle = await sftp.open(filename, "r");
            const content = Buffer.from("Hello World");
            const buffer = Buffer.alloc(content.length);

            await sftp.read(handle, buffer, 0, buffer.length, 0);
            await sftp.close(handle);

            assert(content.equals(buffer));
        });

        await test("should remove a file successfully", async () => {
            const filename = path.join(rootpath, "file.txt");

            await sftp.unlink(filename);

            const llist = await list(rootpath);

            assert.equal(llist.length, 2);
        });

        console.log("Other");

        await test("should call realpath successfully", async () => {
            const pathname = path.join(rootpath, "folder2");

            await sftp.mkdir(pathname);

            const filepath = await sftp.realpath(path.join(rootpath, "folder2", "..", "folder2", "..", "folder2"));

            await sftp.rmdir(pathname);

            assert.equal(filepath, pathname);
        });

        console.log("Normalization");

        await test("should normalize paths for stat", async () => {
            const pathname = path.join(rootpath, "normfolder");

            await sftp.mkdir(pathname);

            const attrs = cleanAttrs(await sftp.stat(path.join(rootpath, "normfolder", "..", "normfolder")));
            const llist = await list(rootpath);
            const entry = llist.find((e) => e.filename === "normfolder");

            await sftp.rmdir(pathname);

            assert.deepEqual(attrs, entry.attrs);
        });

        await test("should normalize paths for mkdir and rmdir", async () => {
            await sftp.mkdir(path.join(rootpath, "normfolder2", "..", "normfolder2"));

            const llist = await list(rootpath);

            assert.equal(llist.some((e) => e.filename === "normfolder2"), true);

            await sftp.rmdir(path.join(rootpath, "normfolder2", "..", "normfolder2"));

            const llist2 = await list(rootpath);

            assert.equal(llist2.some((e) => e.filename === "normfolder2"), false);
        });

        await test("should normalize paths for rename", async () => {
            const pathname = path.join(rootpath, "normfolder3");

            await sftp.mkdir(pathname);
            await sftp.rename(
                path.join(rootpath, "normfolder3", "..", "normfolder3"),
                path.join(rootpath, "normfolder3", "..", "normfolder3renamed")
            );

            const llist = await list(rootpath);

            assert.equal(llist.some((e) => e.filename === "normfolder3renamed"), true);

            await sftp.rmdir(path.join(rootpath, "normfolder3renamed"));
        });

        console.log("Existence checks");

        await test("should return error when opening non-existent file for reading", async () => {
            const filename = path.join(rootpath, "nonexistent.txt");

            await assert.rejects(
                () => sftp.open(filename, "r"),
                (err) => {
                    assert.ok(err.code === 2 || err.message.includes("No such"), `Unexpected error: ${err.message}`);

                    return true;
                }
            );
        });

        await test("should return error when listing non-existent directory", async () => {
            const pathname = path.join(rootpath, "nonexistentdir");

            await assert.rejects(
                () => sftp.readdir(pathname),
                (err) => {
                    assert.ok(err.code === 2 || err.message.includes("No such"), `Unexpected error: ${err.message}`);

                    return true;
                }
            );
        });

        await test("should return error when removing non-existent file", async () => {
            const filename = path.join(rootpath, "nonexistent.txt");

            await assert.rejects(
                () => sftp.unlink(filename),
                (err) => {
                    assert.ok(err.code === 2 || err.message.includes("No such"), `Unexpected error: ${err.message}`);

                    return true;
                }
            );
        });

        await test("should return error when removing non-existent directory", async () => {
            const pathname = path.join(rootpath, "nonexistentdir");

            await assert.rejects(
                () => sftp.rmdir(pathname),
                (err) => {
                    assert.ok(err.code === 2 || err.message.includes("No such"), `Unexpected error: ${err.message}`);

                    return true;
                }
            );
        });

        await test("should return error when renaming non-existent path", async () => {
            const pathname = path.join(rootpath, "nonexistent");

            await assert.rejects(
                () => sftp.rename(pathname, path.join(rootpath, "renamed")),
                (err) => {
                    assert.ok(err.code === 2 || err.message.includes("No such"), `Unexpected error: ${err.message}`);

                    return true;
                }
            );
        });

        await test("should return error when setstat on non-existent path", async () => {
            const pathname = path.join(rootpath, "nonexistent");

            await assert.rejects(
                () => sftp.setstat(pathname, { mode: 0o755 }),
                (err) => {
                    assert.ok(err.code === 2 || err.message.includes("No such"), `Unexpected error: ${err.message}`);

                    return true;
                }
            );
        });

        await test("should return error when readlink on non-existent path", async () => {
            const pathname = path.join(rootpath, "nonexistentlink");

            await assert.rejects(
                () => sftp.readlink(pathname),
                (err) => {
                    assert.ok(err.code === 2 || err.message.includes("No such"), `Unexpected error: ${err.message}`);

                    return true;
                }
            );
        });

        await test("should return error when realpath on non-existent path", async () => {
            const pathname = path.join(rootpath, "nonexistentpath");

            await assert.rejects(
                () => sftp.realpath(pathname),
                (err) => {
                    assert.ok(err.code === 2 || err.message.includes("No such"), `Unexpected error: ${err.message}`);

                    return true;
                }
            );
        });
    } finally {
        await server.stop();
        await fs.rm(rootpath, { recursive: true, force: true });
    }

    console.log(`\n${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

run().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});

async function runCustomNormalize() {
    const port = await getPort();
    const rootpath = await fs.mkdtemp(path.join(os.tmpdir(), "sftp-fs-cn-"));

    let normalizeCalled = false;

    class CustomFileSystem extends FileSystem {
        normalize(pathname) {
            normalizeCalled = true;

            return path.posix.normalize(pathname);
        }
    }

    const server = new Server(new CustomFileSystem(username, password));
    const connection = new Client();
    let sftp;

    try {
        await server.start(keyFile, port, "localhost");

        console.log("Custom normalize");

        await test("should connect with custom filesystem", async () => {
            await new Promise((resolve, reject) => {
                connection.once("ready", () => {
                    connection.removeAllListeners("error");
                    resolve();
                });
                connection.once("error", (error) => {
                    connection.removeAllListeners("ready");
                    reject(error);
                });
                connection.connect({ host: "localhost", port, username, password });
            });

            const fn = util.promisify(connection.sftp).bind(connection);
            const obj = await fn();

            sftp = {
                mkdir: util.promisify(obj.mkdir).bind(obj),
                rmdir: util.promisify(obj.rmdir).bind(obj),
                stat: util.promisify(obj.stat).bind(obj)
            };
        });

        await test("should call custom normalize when performing operations", async () => {
            const pathname = path.join(rootpath, "cnfolder");

            normalizeCalled = false;
            await sftp.mkdir(pathname);
            assert.ok(normalizeCalled, "normalize was not called during mkdir");

            normalizeCalled = false;
            await sftp.stat(pathname);
            assert.ok(normalizeCalled, "normalize was not called during stat");

            normalizeCalled = false;
            await sftp.rmdir(pathname);
            assert.ok(normalizeCalled, "normalize was not called during rmdir");
        });
    } finally {
        connection.end();
        await server.stop();
        await fs.rm(rootpath, { recursive: true, force: true });
    }
}

runCustomNormalize().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
