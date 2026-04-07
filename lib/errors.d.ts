export declare class GenericError extends Error {
    status: number;
    constructor(message?: string, status?: number);
}

export declare class NoSuchFileError extends GenericError {
    constructor(message?: string);
}

export declare class PermissionDeniedError extends GenericError {
    constructor(message?: string);
}

export declare class BadMessageError extends GenericError {
    constructor(message?: string);
}

export declare class OpUnsupportedError extends GenericError {
    constructor(message?: string);
}
