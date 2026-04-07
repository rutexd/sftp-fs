"use strict";

const assert = require("assert");
const Handle = require("./Handle");
const HandleId = require("./HandleId");
const Deferred = require("./Deferred");
const { utils: { sftp: { STATUS_CODE: SFTP_STATUS_CODE } } } = require("ssh2");

class Connection {
    constructor(client) {
        this.client = client;
        this.handles = [];
        this._handleRegistry = [];
        this.stream = null;
        this.continueDeferred = new Deferred(true);
        this._respondQueue = Promise.resolve();
    }

    respond(fn) {
        this._respondQueue = this._respondQueue.then(async () => {
            await this.continueDeferred.promise;
            fn() === false && (this.continueDeferred = new Deferred());
        });

        return this._respondQueue;
    }

    canContinue() {
        this.continueDeferred.resolve();
    }

    addStream(stream) {
        this.stream = stream;
    }

    addAction(action, fn) {
        assert(this.stream, "addStream must be called before addAction");

        this.stream.on(action.toUpperCase(), async (requestId, ...args) => {
            // console.error("action", action, ...args);
            try {
                const status = await fn(requestId, ...args);

                if (typeof status === "undefined") {
                    await this.respond(() => this.stream.status(requestId, SFTP_STATUS_CODE.OK));
                } else if (typeof status === "function") {
                    await this.respond(status);
                } else {
                    await this.respond(() => this.stream.status(requestId, status));
                }
            } catch (error) {
                // console.error(`Error on action ${action}`, error);
                await this.respond(() => this.stream.status(requestId, error.status || SFTP_STATUS_CODE.FAILURE, error.message));
            }
        });
    }

    createFileHandle(pathname) {
        const handle = new Handle("file", pathname, this._handleRegistry);

        this.handles.push(handle);

        return handle;
    }

    createDirectoryHandle(pathname) {
        const handle = new Handle("directory", pathname, this._handleRegistry);

        this.handles.push(handle);

        return handle;
    }

    findHandle(encodedId) {
        const id = HandleId.decodeId(encodedId);

        return this.handles.find((handle) => handle.id.unencoded === id);
    }

    getHandle(encodedId) {
        const handle = this.findHandle(encodedId);

        assert(handle, "No handle found");

        return handle;
    }

    async destroyHandle(encodedId) {
        const handle = this.findHandle(encodedId);

        if (handle) {
            this.handles.splice(this.handles.indexOf(handle), 1);

            await handle.release();
        }
    }

    async close() {
        for (const handle of this.handles) {
            try {
                await handle.release();
            } catch (_err) {
                // ensure all handles are released even if one fails
            }
        }

        this.handles.length = 0;

        this.client.end();
    }
}

module.exports = Connection;
