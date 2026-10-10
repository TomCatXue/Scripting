// 安装 Scripting 运行时里「环境全局」的内存替身。
//
// 必须在 import data.ts / accounts.ts **之前** 调用 installGlobals()：
// data.ts 在模块顶层就求值 FileManager.appGroupDocumentsDirectory，
// 而 Keychain / Storage / FileManager 不可从 "scripting" 导入（见 global.d.ts）。

type Dict = Record<string, any>;

let keychainStore: Dict = {};
let storageShared: Dict = {};
let storageLocal: Dict = {};

export function resetGlobals(): void {
    keychainStore = {};
    storageShared = {};
    storageLocal = {};
}

/** 直接操作 Keychain 桩，供测试预置遗留键 / 断言写入 */
export function keychainRaw(): Dict {
    return keychainStore;
}

/** 直接操作 Storage 桩（shared 通道），供测试预置注册表 */
export function storageRaw(): Dict {
    return storageShared;
}

export function installGlobals(): void {
    const g = globalThis as any;

    g.Keychain = {
        contains: (key: string) => Object.prototype.hasOwnProperty.call(keychainStore, key),
        get: (key: string) => (Object.prototype.hasOwnProperty.call(keychainStore, key) ? keychainStore[key] : null),
        set: (key: string, value: string) => {
            keychainStore[key] = value;
            return true;
        },
        remove: (key: string) => {
            const had = Object.prototype.hasOwnProperty.call(keychainStore, key);
            delete keychainStore[key];
            return had;
        },
        keys: () => Object.keys(keychainStore),
        clear: () => {
            keychainStore = {};
            return true;
        },
    };

    const storage = {
        get: (key: string, options?: { shared?: boolean }) => {
            const bag = options?.shared ? storageShared : storageLocal;
            return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null;
        },
        set: (key: string, value: any, options?: { shared?: boolean }) => {
            const bag = options?.shared ? storageShared : storageLocal;
            bag[key] = value;
        },
        remove: (key: string, options?: { shared?: boolean }) => {
            const bag = options?.shared ? storageShared : storageLocal;
            delete bag[key];
        },
    };
    g.Storage = storage;

    const files = new Map<string, string>();
    g.FileManager = {
        documentsDirectory: "/tmp/mutepanel-test/Documents",
        appGroupDocumentsDirectory: "/tmp/mutepanel-test/AppGroup",
        existsSync: (path: string) => files.has(path),
        readAsStringSync: (path: string) => files.get(path) ?? "",
        writeAsStringSync: (path: string, content: string) => {
            files.set(path, content);
        },
        removeSync: (path: string) => {
            files.delete(path);
        },
    };

    // oauth.ts 的 PKCE 用到；测试不覆盖真实加密，只要可调用
    g.Crypto = {
        generateSymmetricKey: (_bits: number) => "test-key-material",
        sha256: (data: any) => data,
    };
    g.Data = {
        fromRawString: (s: string) => s,
        toBase64String: () => "dGVzdA==",
    };
    if (typeof g.atob !== "function") {
        g.atob = (s: string) => Buffer.from(s, "base64").toString("binary");
    }
}
