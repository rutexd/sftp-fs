import { HandleId } from "./HandleId";

export declare class Handle {
    what: "file" | "directory";
    pathname: string;
    id: HandleId;
    params: Record<string, unknown>;
    disposables: Array<() => void | Promise<void>>;

    constructor(what: "file" | "directory", pathname: string);

    release(): Promise<void>;
    setParam(name: string, value: unknown): unknown;
    getParam(name: string): unknown;
    addDisposable(fn: () => void | Promise<void>): void;
}
