"use strict";

const HandleId = require("./HandleId");

class Handle {
    constructor(what, pathname, registry) {
        this.what = what;
        this.pathname = pathname;
        this.id = new HandleId(registry);
        this.params = {};
        this.disposables = [];
    }

    async release() {
        this.id.release();

        for (const disposable of this.disposables) {
            try {
                await Promise.resolve(disposable());
            } catch (_err) {
                // ensure all disposables are called even if one fails
            }
        }
    }

    setParam(name, value) {
        return this.params[name] = value;
    }

    getParam(name) {
        return this.params[name];
    }

    addDisposable(fn) {
        this.disposables.push(fn);
    }
}

module.exports = Handle;
