"use strict";

const path = require("path");
const { promises: fs, constants } = require("fs");
const { utils: { sftp: { OPEN_MODE: SFTP_OPEN_MODE } } } = require("ssh2");
const FileSystemInterface = require("../lib/FileSystemInterface");
const { PermissionDeniedError } = require("../lib/errors");

const isset = (value) => typeof value !== "undefined";

const longname = (name, attrs, num) => {
    let str = "-";

    if (attrs.isDirectory()) {
        str = "d";
    } else if (attrs.isSymbolicLink()) {
        str = "l";
    }

    str += (attrs.mode & constants.S_IRUSR) ? "r" : "-";
    str += (attrs.mode & constants.S_IWUSR) ? "w" : "-";
    str += (attrs.mode & constants.S_IXUSR) ? "x" : "-";
    str += (attrs.mode & constants.S_IRGRP) ? "r" : "-";
    str += (attrs.mode & constants.S_IWGRP) ? "w" : "-";
    str += (attrs.mode & constants.S_IXGRP) ? "x" : "-";
    str += (attrs.mode & constants.S_IROTH) ? "r" : "-";
    str += (attrs.mode & constants.S_IWOTH) ? "w" : "-";
    str += (attrs.mode & constants.S_IXOTH) ? "x" : "-";
    str += " ";
    str += num;
    str += " ";
    str += attrs.uid;
    str += " ";
    str += attrs.gid;
    str += " ";
    str += attrs.size;
    str += " ";
    str += attrs.mtime.toDateString().slice(4);
    str += " ";
    str += name;

    return str;
};

const convFlags = (flags) => {
    let mode = 0;

    if ((flags & SFTP_OPEN_MODE.READ) && (flags & SFTP_OPEN_MODE.WRITE)) {
        mode = constants.O_RDWR;
    } else if (flags & SFTP_OPEN_MODE.READ) {
        mode = constants.O_RDONLY;
    } else if (flags & SFTP_OPEN_MODE.WRITE) {
        mode = constants.O_WRONLY;
    }

    if (flags & SFTP_OPEN_MODE.CREAT) {
        mode |= constants.O_CREAT;
    }

    if (flags & SFTP_OPEN_MODE.APPEND) {
        mode |= constants.O_APPEND;
    }

    if (flags & SFTP_OPEN_MODE.EXCL) {
        mode |= constants.O_EXCL;
    }

    if (flags & SFTP_OPEN_MODE.TRUNC) {
        mode |= constants.O_TRUNC;
    }

    return mode;
};

class FileSystem extends FileSystemInterface {
    constructor(username, password) {
        super();

        this.username = username;
        this.password = password;
    }

    async authenticate(session, request) {
        if (request.method !== "password") {
            return [ "password" ];
        }

        if (request.username !== this.username ||
            request.password !== this.password) {
            throw new PermissionDeniedError();
        }
    }

    async opendir(session, handle) {
        handle.setParam("eof", false);
    }

    async open(session, handle, flags, attrs) {
        const fileHandle = await fs.open(handle.pathname, convFlags(flags), attrs.mode);

        handle.setParam("fileHandle", fileHandle);
        handle.addDisposable(() => fileHandle.close());
    }

    async stat(session, pathname) {
        return await fs.stat(pathname);
    }

    async lstat(session, pathname) {
        return await fs.lstat(pathname);
    }

    async write(session, handle, offset, data) {
        const fileHandle = handle.getParam("fileHandle");

        await fileHandle.write(data, 0, data.length, offset);
    }

    async read(session, handle, offset, length) {
        const fileHandle = handle.getParam("fileHandle");
        const attrs = await fileHandle.stat();

        if (offset >= attrs.size) {
            return;
        }

        const buffer = Buffer.alloc(length);
        const { bytesRead } = await fileHandle.read(buffer, 0, length, offset);

        return buffer.slice(0, bytesRead);
    }

    async listdir(session, handle) {
        if (handle.getParam("eof")) {
            return;
        }

        const list = [];
        const files = await fs.readdir(handle.pathname);

        for (const filename of files) {
            const attrs = await this.lstat(session, path.join(handle.pathname, filename));
            const num = 1; // TODO: Number of links and directories inside this directory

            list.push({
                filename,
                longname: longname(filename, attrs, num),
                attrs
            });
        }

        handle.setParam("eof", true);

        return list;
    }

    async mkdir(session, pathname, attrs) {
        await fs.mkdir(pathname, { mode: attrs.mode & ~constants.S_IFMT });
        await this.setstat(session, pathname, {
            uid: attrs.uid,
            gid: attrs.gid,
            atime: attrs.atime,
            mtime: attrs.mtime
        });
    }

    async setstat(session, pathname, attrs) {
        if (isset(attrs.mode)) {
            await fs.chmod(pathname, attrs.mode);
        }

        if (isset(attrs.uid) || isset(attrs.gid)) {
            await fs.chown(pathname, attrs.uid, attrs.gid);
        }

        if (isset(attrs.atime) || isset(attrs.mtime)) {
            await fs.utimes(pathname, attrs.atime, attrs.mtime);
        }
    }

    async rename(session, oldPathname, newPathname) {
        await fs.rename(oldPathname, newPathname);
    }

    async rmdir(session, pathname) {
        await fs.rmdir(pathname);
    }

    async remove(session, pathname) {
        await fs.unlink(pathname);
    }

    async realpath(session, pathname) {
        return await fs.realpath(pathname);
    }

    async readlink(session, pathname) {
        return await fs.readlink(pathname);
    }

    async symlink(session, targetPathname, linkPathname) {
        return await fs.symlink(targetPathname, linkPathname);
    }
}

module.exports = FileSystem;
