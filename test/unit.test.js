"use strict";

const assert = require("assert");
const HandleId = require("../lib/HandleId");
const Handle = require("../lib/Handle");
const Connection = require("../lib/Connection");

let passed = 0;
let failed = 0;

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

const makeConnection = () => {
    const fakeClient = { end() {} };
    const conn = new Connection(fakeClient);

    conn.stream = { on() {} };

    return conn;
};

async function run() {
    // ---------------------------------------------------------------------------
    // HandleId — per-connection registry (no global state)
    // ---------------------------------------------------------------------------

    console.log("HandleId — per-connection registry");

    await test("should assign IDs from independent registries without interference", async () => {
        const registryA = [];
        const registryB = [];

        const a1 = new HandleId(registryA);
        const a2 = new HandleId(registryA);
        const b1 = new HandleId(registryB);

        assert.equal(a1.unencoded, 1);
        assert.equal(a2.unencoded, 2);
        assert.equal(b1.unencoded, 1, "registry B should start at 1 regardless of registry A");

        assert.deepEqual(registryA, [ 1, 2 ]);
        assert.deepEqual(registryB, [ 1 ]);
    });

    await test("should reuse an ID after it is released within the same registry", async () => {
        const registry = [];

        const id1 = new HandleId(registry);
        const id2 = new HandleId(registry);

        assert.equal(id1.unencoded, 1);
        assert.equal(id2.unencoded, 2);

        id1.release();

        assert.deepEqual(registry, [ 2 ]);

        const id3 = new HandleId(registry);

        assert.equal(id3.unencoded, 1, "released slot should be reused");
    });

    await test("should not pollute other registries on release", async () => {
        const registryA = [];
        const registryB = [];

        const a1 = new HandleId(registryA);
        const b1 = new HandleId(registryB);

        a1.release();

        assert.deepEqual(registryA, [], "registryA should be empty after release");
        assert.deepEqual(registryB, [ 1 ], "registryB should be unaffected");

        b1.release();
    });

    await test("should encode/decode the id correctly", async () => {
        const registry = [];
        const id = new HandleId(registry);

        assert.equal(HandleId.decodeId(id.encoded), id.unencoded);

        id.release();
    });

    // ---------------------------------------------------------------------------
    // Handle — release() calls all disposables even when one throws
    // ---------------------------------------------------------------------------

    console.log("Handle — release() error resilience");

    await test("should call all disposables even if an earlier one throws", async () => {
        const registry = [];
        const handle = new Handle("file", "/tmp/test", registry);
        const calls = [];

        handle.addDisposable(() => {
            calls.push("first");
            throw new Error("disposable failure");
        });
        handle.addDisposable(() => {
            calls.push("second");
        });

        await handle.release();

        assert.deepEqual(calls, [ "first", "second" ], "second disposable must still be called after the first throws");
    });

    await test("should remove the id from registry when released even if disposable throws", async () => {
        const registry = [];
        const handle = new Handle("file", "/tmp/test", registry);

        handle.addDisposable(() => {
            throw new Error("disposable failure");
        });

        assert.equal(registry.length, 1);

        await handle.release();

        assert.equal(registry.length, 0, "id should be removed from registry despite disposable error");
    });

    // ---------------------------------------------------------------------------
    // Connection — destroyHandle() is safe on unknown / already-closed handle
    // ---------------------------------------------------------------------------

    console.log("Connection — destroyHandle() TOCTOU safety");

    await test("should not throw when destroying a handle that does not exist", async () => {
        const conn = makeConnection();
        const validHandle = conn.createFileHandle("/tmp/dummy");
        const encodedId = validHandle.id.encoded;

        await conn.destroyHandle(encodedId);

        // Second destroy of the same handle — must be a no-op, not an assertion error
        await conn.destroyHandle(encodedId);
    });

    await test("should remove handle from list on destroy", async () => {
        const conn = makeConnection();
        const handle = conn.createFileHandle("/tmp/dummy");

        assert.equal(conn.handles.length, 1);

        await conn.destroyHandle(handle.id.encoded);

        assert.equal(conn.handles.length, 0);
    });

    await test("findHandle should return undefined for an unknown id", async () => {
        const conn = makeConnection();
        const fakeBuffer = Buffer.alloc(4);

        fakeBuffer.writeUInt32BE(9999, 0);

        const result = conn.findHandle(fakeBuffer);

        assert.equal(result, undefined);
    });

    // ---------------------------------------------------------------------------
    // Connection — close() releases all handles even if one throws
    // ---------------------------------------------------------------------------

    console.log("Connection — close() error resilience");

    await test("should release all handles even if an earlier handle's disposable throws", async () => {
        const conn = makeConnection();
        const handle1 = conn.createFileHandle("/tmp/a");
        const handle2 = conn.createFileHandle("/tmp/b");
        const released = [];

        handle1.addDisposable(() => {
            released.push("a");
            throw new Error("handle1 disposable failure");
        });
        handle2.addDisposable(() => {
            released.push("b");
        });

        await conn.close();

        assert.deepEqual(released, [ "a", "b" ], "handle2 must be released even if handle1 throws");
        assert.equal(conn.handles.length, 0, "handles list must be cleared");
    });

    // ---------------------------------------------------------------------------
    // Connection — respond() serialises concurrent callers
    // ---------------------------------------------------------------------------

    console.log("Connection — respond() serialisation");

    await test("should serialise concurrent respond calls", async () => {
        const conn = makeConnection();
        const order = [];

        const p1 = conn.respond(() => { order.push(1); });
        const p2 = conn.respond(() => { order.push(2); });
        const p3 = conn.respond(() => { order.push(3); });

        await Promise.all([ p1, p2, p3 ]);

        assert.deepEqual(order, [ 1, 2, 3 ], "responses must be emitted in call order");
    });

    await test("should block subsequent callers when fn() returns false (backpressure)", async () => {
        const conn = makeConnection();
        const order = [];

        // First call returns false — simulating write-buffer full
        const p1 = conn.respond(() => { order.push(1); return false; });

        // Second call must wait until canContinue() is called
        let p2Resolved = false;
        const p2 = conn.respond(() => { order.push(2); }).then(() => { p2Resolved = true; });

        // Flush the microtask queue so p1 settles but p2 is still blocked
        await new Promise((r) => setImmediate(r));

        assert.equal(p2Resolved, false, "second respond must not have resolved yet (backpressure)");
        assert.deepEqual(order, [ 1 ], "only first fn should have run so far");

        conn.canContinue();

        await Promise.all([ p1, p2 ]);

        assert.equal(p2Resolved, true, "second respond must complete after canContinue()");
        assert.deepEqual(order, [ 1, 2 ]);
    });

    // ---------------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------------

    console.log(`\n${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

run().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
