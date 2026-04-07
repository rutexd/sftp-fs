"use strict";

class HandleId {
    constructor(registry) {
        this._registry = registry;
        this._id = this._generateId();
        this._encoded = Buffer.alloc(4);
        this._encoded.writeUInt32BE(this._id, 0, true);
    }

    get encoded() {
        return this._encoded;
    }

    get unencoded() {
        return this._id;
    }

    _generateId() {
        let id = 1;

        while (this._registry.includes(id)) {
            id++;
        }

        this._registry.push(id);

        return id;
    }

    static decodeId(encoded) {
        return encoded.readUInt32BE(0, true);
    }

    release() {
        const index = this._registry.indexOf(this._id);
        (index !== -1) && this._registry.splice(index, 1);
    }
}

module.exports = HandleId;
