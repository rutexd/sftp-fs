"use strict";

const { utils: { sftp: { STATUS_CODE, OPEN_MODE: SFTP_OPEN_MODE } } } = require("ssh2");
const { NoSuchFileError } = require("./errors");

const checkExists = async (fs, session, pathname) => {
    try {
        await fs.lstat(session, pathname);
    } catch (error) {
        if (!error.status || error.status === STATUS_CODE.NO_SUCH_FILE) {
            throw new NoSuchFileError(`No such file or directory: ${pathname}`);
        }

        throw error;
    }
};

const sftp = (fs, connection, stream) => {
    connection.addStream(stream);

    connection.addAction("open", async (requestId, pathname, flags, attrs) => {
        pathname = fs.normalize(pathname);

        if (!(flags & SFTP_OPEN_MODE.CREAT)) {
            await checkExists(fs, connection.client.session, pathname);
        }

        const handle = connection.createFileHandle(pathname);
        await fs.open(connection.client.session, handle, flags, attrs);

        return () => stream.handle(requestId, handle.id.encoded);
    });

    connection.addAction("write", async (requestId, handleId, offset, data) => {
        const handle = connection.getHandle(handleId);
        await fs.write(connection.client.session, handle, offset, data);
    });

    connection.addAction("read", async (requestId, handleId, offset, length) => {
        const handle = connection.getHandle(handleId);
        const data = await fs.read(connection.client.session, handle, offset, length);

        if (data && data.length > 0) {
            return () => stream.data(requestId, data);
        }

        return STATUS_CODE.EOF;
    });

    connection.addAction("fstat", async (requestId, handleId) => {
        const handle = connection.getHandle(handleId);
        const attrs = await fs.stat(connection.client.session, handle.pathname);

        stream.attrs(requestId, attrs);

        return () => true; // TODO: continue on return false?
    });

    connection.addAction("fsetstat", async (requestId, handleId, attrs) => {
        const handle = connection.getHandle(handleId);
        await fs.setstat(connection.client.session, handle.pathname, attrs);
    });

    connection.addAction("close", async (requestId, handleId) => {
        await connection.destroyHandle(handleId);
    });

    connection.addAction("opendir", async (requestId, pathname) => {
        pathname = fs.normalize(pathname);
        await checkExists(fs, connection.client.session, pathname);

        const handle = connection.createDirectoryHandle(pathname);
        await fs.opendir(connection.client.session, handle, pathname);

        return () => stream.handle(requestId, handle.id.encoded);
    });

    connection.addAction("readdir", async (requestId, handleId) => {
        const handle = connection.getHandle(handleId);
        const names = await fs.listdir(connection.client.session, handle);

        if (names && names.length > 0) {
            return () => stream.name(requestId, names);
        }

        return STATUS_CODE.EOF;
    });

    connection.addAction("lstat", async (requestId, pathname) => {
        pathname = fs.normalize(pathname);
        const attrs = await fs.lstat(connection.client.session, pathname);

        stream.attrs(requestId, attrs);

        return () => true; // TODO: continue on return false?
    });

    connection.addAction("stat", async (requestId, pathname) => {
        pathname = fs.normalize(pathname);
        const attrs = await fs.stat(connection.client.session, pathname);

        stream.attrs(requestId, attrs);

        return () => true; // TODO: continue on return false?
    });

    connection.addAction("remove", async (requestId, pathname) => {
        pathname = fs.normalize(pathname);
        await checkExists(fs, connection.client.session, pathname);
        await fs.remove(connection.client.session, pathname);
    });

    connection.addAction("rmdir", async (requestId, pathname) => {
        pathname = fs.normalize(pathname);
        await checkExists(fs, connection.client.session, pathname);
        await fs.rmdir(connection.client.session, pathname);
    });

    connection.addAction("realpath", async (requestId, pathname) => {
        pathname = fs.normalize(pathname);
        await checkExists(fs, connection.client.session, pathname);
        const filename = await fs.realpath(connection.client.session, pathname);

        return () => stream.name(requestId, [ { filename } ]);
    });

    connection.addAction("readlink", async (requestId, pathname) => {
        pathname = fs.normalize(pathname);
        await checkExists(fs, connection.client.session, pathname);
        const filename = await fs.readlink(connection.client.session, pathname);

        return () => stream.name(requestId, [ { filename } ]);
    });

    connection.addAction("setstat", async (requestId, pathname, attrs) => {
        pathname = fs.normalize(pathname);
        await checkExists(fs, connection.client.session, pathname);
        await fs.setstat(connection.client.session, pathname, attrs);
    });

    connection.addAction("mkdir", async (requestId, pathname, attrs) => {
        pathname = fs.normalize(pathname);
        await fs.mkdir(connection.client.session, pathname, attrs);
    });

    connection.addAction("rename", async (requestId, oldPathname, newPathname) => {
        oldPathname = fs.normalize(oldPathname);
        newPathname = fs.normalize(newPathname);
        await checkExists(fs, connection.client.session, oldPathname);
        await fs.rename(connection.client.session, oldPathname, newPathname);
    });

    connection.addAction("symlink", async (requestId, linkPathname, targetPathname) => {
        linkPathname = fs.normalize(linkPathname);
        targetPathname = fs.normalize(targetPathname);
        await fs.symlink(connection.client.session, targetPathname, linkPathname);
    });
};

module.exports = sftp;
