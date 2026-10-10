// MutePanel 测试用的 "scripting" 模块替身。
// 只覆盖被测模块真正用到的导出面：fetch / Device / Response / Script / Widget。
// Keychain / Storage / FileManager / Crypto / Data 是环境全局（见 global.d.ts），
// 不走这里，由 globals.ts 安装。

type FetchMock = (req: any, init?: any) => Promise<any>;

let fetchImpl: FetchMock = async () => ({ status: 599, text: async () => "" });

export function setMockFetch(impl: FetchMock): void {
    fetchImpl = impl;
}

/**
 * 与真实 fetch(url, init) 同形：把两个参数都透给桩，
 * 便于测试断言请求头（凭据多放在 header 而非 URL）。
 */
export async function fetch(req: any, init?: any): Promise<any> {
    const resp = await fetchImpl(req, init);
    if (resp && typeof resp.json !== "function") {
        resp.json = async () => JSON.parse(await resp.text());
    }
    return resp;
}

/** 从桩收到的调用中取出 Authorization 头，便于按账号区分响应 */
export function authOf(init?: any): string {
    const h = init?.headers;
    if (!h) return "";
    if (typeof h.get === "function") return String(h.get("Authorization") ?? "");
    return String(h.Authorization ?? h.authorization ?? "");
}

export class Request {
    url: string;
    method = "GET";
    headers = new Map<string, string>();
    body: string | null = null;
    timeout = 0;
    allowInsecureRequest = false;

    constructor(url: string) {
        this.url = String(url);
    }
}

/** oauth.ts 需要；测试不触达真实网络，保留构造能力即可 */
export class Response {
    body: any;
    status: number;
    statusText: string;
    headers: any;

    constructor(body: any, init: any = {}) {
        this.body = body;
        this.status = init.status ?? 200;
        this.statusText = init.statusText ?? "";
        this.headers = init.headers ?? new Map();
    }
}

/** types.ts 读取 Script.directory 拼图标路径；测试下给个空目录即可 */
export const Script = { directory: "" };

export const Widget = {};

/** data.ts 的 VPN 检测用到；测试不覆盖该路径，给最小桩 */
export const Device = {
    networkInterfaces: () => [],
};
