export declare class HandleId {
    constructor();

    get encoded(): Buffer;
    get unencoded(): number;

    static decodeId(encoded: Buffer): number;
    release(): void;
}
