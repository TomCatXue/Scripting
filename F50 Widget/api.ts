// @ts-nocheck
// F50 Widget API 层：UFI-TOOLS / ZTE 的设备信息拉取、签名、登录与 shell 执行
import { fetch, Request, Script, Widget, Storage, Keychain, FileManager } from "scripting";

// ===================== 常量 / 配置读取 =====================

const DEVICE_PATH = "/api/baseDeviceInfo";
const SHELL_PATH = "/api/user_shell";
const ROOT_SHELL_PATH = "/api/root_shell";
const GOFORM_GET_PATH = "/api/goform/goform_get_cmd_process";
const GOFORM_SET_PATH = "/api/goform/goform_set_cmd_process";
const ZREQ_BIN = "/data/data/com.minikano.f50_sms/files/zreq";

/** UFI-TOOLS 客户端通用签名常量（非个人凭据，公开的算法常数） */
const SECRET_KEY = "minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd";

// ===================== 配置文件持久化（同步落盘，最可靠兜底） =====================

const CONFIG_FILE_NAME = "F50Widget.config.json";

/** App Group 共享目录（设置页与小组件均可访问）下的配置文件路径 */
function configFilePath(): string | null {
    try {
        return FileManager.appGroupDocumentsDirectory + "/" + CONFIG_FILE_NAME;
    } catch (_) { return null; }
}

/** 同步读取配置文件（不存在或损坏时返回 null） */
function readConfigFile(): Record<string, string> | null {
    const p = configFilePath();
    if (!p) return null;
    try {
        if (FileManager.existsSync(p)) {
            const raw = FileManager.readAsStringSync(p);
            if (raw && raw.trim()) {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === "object") return obj;
            }
        }
    } catch (e) {
        console.log("读取配置文件失败:", String(e));
    }
    return null;
}

/** 同步写入配置到文件（read-modify-write；空值视为删除），返回是否成功 */
function writeConfigFile(patch: Record<string, string>): boolean {
    const p = configFilePath();
    if (!p) return false;
    try {
        const cur = readConfigFile() || {};
        const next: Record<string, string> = {};
        for (const k in cur) if (Object.prototype.hasOwnProperty.call(cur, k)) next[k] = cur[k];
        for (const k in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
            if (String(patch[k]).trim() === "") delete next[k];
            else next[k] = String(patch[k]).trim();
        }
        FileManager.writeAsStringSync(p, JSON.stringify(next));
        return true;
    } catch (e) {
        console.log("写入配置文件失败:", String(e));
        return false;
    }
}

// 会话级临时配置覆盖（仅供「测试连接」使用当前表单值，不落盘）
let overrideSettings: { url?: string; password?: string; ztePassword?: string } | null = null;

/** 设置 / 清除会话级配置覆盖（测试连接用） */
export function setSessionSettings(cfg: { url?: string; password?: string; ztePassword?: string } | null): void {
    overrideSettings = cfg || null;
}

/** 密码类 key 判定：写入 / 读取优先走 Keychain（安全、同步持久化），其余走 Storage */
function isSecretKey(key: string): boolean {
    return key === "password" || key === "zte_password";
}

/** 读取当前会话覆盖的配置值（未覆盖时返回 undefined） */
function sessionValue(key: string): string | undefined {
    if (!overrideSettings) return undefined;
    if (key === "URL") return overrideSettings.url;
    if (key === "password") return overrideSettings.password;
    if (key === "zte_password") return overrideSettings.ztePassword;
    return undefined;
}

/** 读取配置：参数 / 小组件参数（历史优先）→ Keychain（密码类）→ Storage */
export function readSetting(key: string, fallback?: string): string {
    try {
        let params = Script.queryParameters || {};
        const widgetParams = Widget.parameter;
        if (widgetParams) {
            if (typeof widgetParams === "object") params = Object.assign({}, params, widgetParams);
            else {
                try { params = Object.assign({}, params, JSON.parse(widgetParams)); } catch (_) { }
            }
        }
        const v = params[key];
        if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    } catch (_) { }
    if (isSecretKey(key)) {
        try {
            const kc = Keychain.get("F50Widget." + key);
            if (kc !== undefined && kc !== null && String(kc).trim() !== "") return String(kc).trim();
        } catch (_) { }
    }
    try {
        const cfg = readConfigFile();
        if (cfg) {
            const v = cfg[key];
            if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
        }
    } catch (_) { }
    try {
        const saved = Storage.get("F50Widget." + key);
        if (saved !== undefined && saved !== null && String(saved).trim() !== "") return String(saved).trim();
    } catch (_) { }
    return fallback || "";
}

/**
 * 保存配置：写入配置文件（同步落盘，最可靠） + Keychain(密码) / Storage(尽力而为) 多层冗余。
 * 只要有一层成功即返回 true，供调用方回读校验。
 */
export function saveSetting(key: string, value: string): boolean {
    const val = String(value).trim();
    let anyOk = false;

    // 1) 配置文件：同步写入（read-modify-write），保证进程退出后仍在
    try {
        const patch: Record<string, string> = {};
        patch[key] = val;
        if (writeConfigFile(patch)) anyOk = true;
    } catch (e) {
        console.log("配置文件写入失败:", key, String(e));
    }

    // 2) Keychain(密码类) / Storage：尽力而为的冗余
    try {
        const fullKey = "F50Widget." + key;
        if (isSecretKey(key)) {
            let kcOk = false;
            try {
                if (val === "") kcOk = Keychain.remove(fullKey) === true;
                else kcOk = Keychain.set(fullKey, val) === true;
            } catch (ke) {
                console.log("Keychain 写入失败，回退 Storage:", key, String(ke));
            }
            if (kcOk) { anyOk = true; return anyOk; }
        }
        try {
            if (val === "") { Storage.remove(fullKey); anyOk = true; }
            else if (Storage.set(fullKey, val) === true) anyOk = true;
        } catch (se) {
            console.log("Storage 写入失败:", key, String(se));
        }
    } catch (e) {
        console.log("保存配置失败:", key, String(e));
    }
    return anyOk;
}

function trimSlash(s: string): string {
    return String(s || "").replace(/\/+$/, "");
}

/** 获取 UFI-TOOLS 地址：会话覆盖 > 持久化配置 > 默认值 */
function getKanoUrl(): string {
    const s = sessionValue("URL");
    if (s !== undefined && s.trim() !== "") return trimSlash(s);
    return trimSlash(readSetting("URL", "http://192.168.0.1:2333"));
}

/** 获取 UFI-TOOLS 密码：会话覆盖 > 持久化配置 */
function getPassword(): string {
    const s = sessionValue("password");
    if (s !== undefined) return s;
    return readSetting("password", "");
}

/** 获取 ZTE 后台密码：会话覆盖 > 持久化配置 */
function getZtePassword(): string {
    const s = sessionValue("ztePassword");
    if (s !== undefined) return s;
    return readSetting("zte_password", "");
}

// ===================== goform 字段组 =====================

function getBasicFields(): string[] {
    return [
        "model_name", "network_provider", "network_type", "network_signalbar",
        "battery_value", "battery_vol_percent", "battery_charging", "ppp_status",
        "network_information", "Lte_ca_status", "loginfo", "Z5g_rsrp", "nr_rsrp", "nr_rssi", "nr_rsrq", "Nr_rsrq", "nr_snr", "Nr_snr", "nr5g_rsrq", "nr5g_snr", "lte_rsrq", "lte_snr", "sms_unread_num", "SSID1", "RadioOff", "station_list",
        "LD", "RD", "modem_main_state", "pin_status", "sim_pin_status"
    ];
}

// ===================== 请求基础 =====================

function applyHeaders(req: any, values: Record<string, string>): void {
    for (const key in values) {
        if (Object.prototype.hasOwnProperty.call(values, key)) req.headers.set(key, String(values[key]));
    }
}

async function readJSONResponse(resp: any, label: string): Promise<any> {
    const status = resp && resp.status;
    const raw = await resp.text();
    if (!raw || !raw.trim()) throw new Error(label + " HTTP " + String(status) + " empty response");
    try { return JSON.parse(raw); } catch (_) { throw new Error(label + " HTTP " + String(status) + " invalid JSON: " + raw.slice(0, 120)); }
}

async function requestJSON(method: string, path: string, body?: object | string): Promise<any> {
    const req = new Request(getKanoUrl() + path);
    req.allowInsecureRequest = true;
    req.method = method;
    applyHeaders(req, buildKanoHeaders(method, path));
    if (body !== undefined) {
        req.headers.set("Content-Type", "application/json");
        req.body = JSON.stringify(body);
    }
    req.timeout = 15;
    return await readJSONResponse(await fetch(req), "request");
}

// ===================== 设备信息 =====================

/** GET /api/baseDeviceInfo：型号、固件、流量、CPU、电池等 */
export async function fetchDeviceInfo(): Promise<any> {
    return await requestJSON("GET", DEVICE_PATH);
}

// ===================== goform 批量获取 =====================

/** GET goform 批量字段 */
async function getGoform(cmdList: string[]): Promise<any> {
    const cmd = cmdList.join(",");
    const url = getKanoUrl() + GOFORM_GET_PATH + "?multi_data=1&isTest=false&cmd=" + cmd + "&_=" + Date.now();
    const req = new Request(url);
    req.allowInsecureRequest = true;
    req.method = "GET";
    applyHeaders(req, buildKanoHeaders("GET", GOFORM_GET_PATH));
    return await readJSONResponse(await fetch(req), "request");
}

/** 通过 zreq（设备本机二进制）自动完成 ZTE 登录后批量读取 goform 字段 */
async function zreqGoform(cmdList: string[]): Promise<{ data: any; used: boolean }> {
    const ztePassword = getZtePassword();
    const params = "cmd=" + cmdList.join(",") + "&multi_data=1&isTest=false";
    const cmd = ZREQ_BIN + " -pwd " + shellQuote(ztePassword)
        + " -method GET"
        + " -params " + shellQuote(params)
        + " -json";
    const shell = await postShell(cmd);
    if (shell && shell.done && shell.content) {
        return { data: JSON.parse(shell.content), used: true };
    }
    return { data: null, used: false };
}

function shellQuote(s: string): string {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/** 组装 goform 数据（优先 zreq，失败回退 GET-only + POST 登录），并单独补充 RSRQ/SNR */
export async function fetchGoformAll(): Promise<{ data: any; zreqUsed: boolean }> {
    let zreqUsed = false;
    let basic: any = null;

    try {
        const zr = await zreqGoform(getBasicFields());
        zreqUsed = zr.used;
        basic = zr.data;
        // 单独查询 network_information 补充 RSRQ/SNR（批量请求不返回质量字段）
        if (zreqUsed) {
            try {
                const netInfo = await getGoform(["network_information"]);
                if (netInfo && typeof netInfo === "object") {
                    for (const k in netInfo) {
                        const nv = netInfo[k];
                        const cur = basic[k];
                        if (nv !== undefined && nv !== null && nv !== "" && (cur === undefined || cur === null || cur === "")) basic[k] = nv;
                    }
                }
            } catch (nie) { console.log("netinfo query fail:", String(nie)); }
        }
    } catch (e) {
        console.log("zreq fail:", String(e));
    }

    // 回退：直接 GET goform
    if (!zreqUsed) {
        try {
            basic = await getGoform(getBasicFields());
        } catch (e2) {
            console.log("GET goform fail:", String(e2));
        }
        // 兼容：loginfo=no 且 GET-only 时尝试 POST 登录
        if (basic && String(basic.loginfo) === "no") {
            try {
                await loginZTE();
                basic = await getGoform(getBasicFields());
            } catch (le) {
                console.log("POST login fail:", String(le));
            }
        }
    }

    return { data: basic || {}, zreqUsed };
}

// ===================== ZTE 登录（回退方案） =====================

async function loginZTE(): Promise<void> {
    const ztePassword = getZtePassword();
    const ldUrl = getKanoUrl() + GOFORM_GET_PATH + "?multi_data=1&isTest=false&cmd=LD&_=" + Date.now();
    const ldReq = new Request(ldUrl);
    ldReq.allowInsecureRequest = true;
    ldReq.method = "GET";
    applyHeaders(ldReq, buildKanoHeaders("GET", GOFORM_GET_PATH));
    const ldResp = await (await fetch(ldReq)).json();
    const ld = ldResp && ldResp.LD;
    if (!ld) throw new Error("no LD");

    const pwdHash = sha256HexFromString(ztePassword).toUpperCase();
    const loginHash = sha256HexFromString(pwdHash + ld).toUpperCase();

    const loginReq = new Request(getKanoUrl() + GOFORM_SET_PATH);
    loginReq.allowInsecureRequest = true;
    loginReq.method = "POST";
    loginReq.headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
    applyHeaders(loginReq, buildKanoHeaders("POST", GOFORM_SET_PATH));
    loginReq.body = "goformId=LOGIN&isTest=false&user=admin&password=" + loginHash;

    const loginRaw = await (await fetch(loginReq)).text();
    if (loginRaw && loginRaw.indexOf('"result":0') >= 0) return;

    const verifyUrl = getKanoUrl() + GOFORM_GET_PATH + "?multi_data=1&isTest=false&cmd=loginfo&_=" + Date.now();
    const verifyReq = new Request(verifyUrl);
    verifyReq.allowInsecureRequest = true;
    verifyReq.method = "GET";
    applyHeaders(verifyReq, buildKanoHeaders("GET", GOFORM_GET_PATH));
    const verifyResp = await (await fetch(verifyReq)).json();
    if (String(verifyResp && verifyResp.loginfo) === "ok") return;
    throw new Error("login failed: loginfo=" + String(verifyResp && verifyResp.loginfo));
}

// ===================== Shell 执行 =====================

/** POST /api/user_shell（或 root_shell）：在设备上执行命令 */
export async function postShell(command: string, rootPath?: string): Promise<any> {
    const path = rootPath || SHELL_PATH;
    const req = new Request(getKanoUrl() + path);
    req.allowInsecureRequest = true;
    req.method = "POST";
    applyHeaders(req, buildKanoHeaders("POST", path));
    req.headers.set("Content-Type", "application/json");
    req.body = JSON.stringify({ command: command });
    req.timeout = 15;
    const resp = await fetch(req);
    const parsed = await readJSONResponse(resp, "POST " + path);
    return parsed && parsed.result;
}

/** root_shell 获取 Wi-Fi 频段与内存信息 */
export async function fetchSystemInfo(): Promise<{ wifiFreq: number; memInfo: { total: number; available: number } }> {
    const out = { wifiFreq: 0, memInfo: { total: 0, available: 0 } };
    try {
        const sysCmd = "dumpsys wifi 2>/dev/null | grep -o 'frequency= [0-9]*' | head -1; grep -E 'MemTotal|MemAvailable' /proc/meminfo";
        const sysResult = await postShell(sysCmd, ROOT_SHELL_PATH);
        if (sysResult) {
            const sysStr = String(sysResult);
            const freqMatch = sysStr.match(/frequency=\s*(\d+)/);
            if (freqMatch) out.wifiFreq = parseInt(freqMatch[1], 10);
            const memTotalM = sysStr.match(/MemTotal:\s*(\d+)/);
            const memAvailM = sysStr.match(/MemAvailable:\s*(\d+)/);
            if (memTotalM) out.memInfo.total = parseInt(memTotalM[1], 10);
            if (memAvailM) out.memInfo.available = parseInt(memAvailM[1], 10);
        }
    } catch (e) {
        console.log("system info fail:", String(e));
    }
    return out;
}

// ===================== UFI-TOOLS 签名（HMAC-MD5 + 双 SHA256） =====================

function buildKanoHeaders(method: string, path: string): Record<string, string> {
    const t = String(Date.now());
    const auth = sha256HexFromString(getPassword()).toLowerCase();
    const sign = buildKanoSign(method, path, t);
    return { "Authorization": auth, "kano-t": t, "kano-sign": sign };
}

function buildKanoSign(method: string, path: string, timestamp: string): string {
    const rawData = "minikano" + String(method || "GET").toUpperCase() + String(path || "") + String(timestamp);
    const hmacHex = hmacMd5(rawData, SECRET_KEY);
    const hmacBytes = hexToBytes(hmacHex);
    const mid = Math.floor(hmacBytes.length / 2);
    const sha1Bytes = sha256Bytes(hmacBytes.slice(0, mid));
    const sha2Bytes = sha256Bytes(hmacBytes.slice(mid));
    const finalBytes = sha256Bytes(sha1Bytes.concat(sha2Bytes));
    return bytesToHex(finalBytes).toLowerCase();
}

// ===================== SHA256 / MD5 / HMAC-MD5 实现 =====================

function utf8Bytes(str: string): number[] {
    const s = String(str);
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
        let c = s.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) { out.push(0xc0 | (c >> 6)); out.push(0x80 | (c & 0x3f)); }
        else if (c >= 0xd800 && c <= 0xdbff) {
            i++;
            const c2 = s.charCodeAt(i);
            const code = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
            out.push(0xf0 | (code >> 18)); out.push(0x80 | ((code >> 12) & 0x3f)); out.push(0x80 | ((code >> 6) & 0x3f)); out.push(0x80 | (code & 0x3f));
        } else { out.push(0xe0 | (c >> 12)); out.push(0x80 | ((c >> 6) & 0x3f)); out.push(0x80 | (c & 0x3f)); }
    }
    return out;
}
function byteHex(n: number): string { n = n & 255; const s = n.toString(16); return s.length === 1 ? "0" + s : s; }
function bytesToHex(bytes: number[]): string { let o = ""; for (let i = 0; i < bytes.length; i++) o += byteHex(bytes[i]); return o; }
function hexToBytes(hex: string): number[] { const s = String(hex); const out: number[] = []; for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.substr(i, 2), 16)); return out; }
function sha256HexFromString(str: string): string { return bytesToHex(sha256Bytes(utf8Bytes(str))); }
function rotr(x: number, n: number): number { return (x >>> n) | (x << (32 - n)); }
function add32(a: number, b: number): number { return (a + b) >>> 0; }

function sha256Bytes(bytes: number[]): number[] {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const msg = bytes.slice();
    const bitLen = msg.length * 8;
    msg.push(0x80);
    while ((msg.length % 64) !== 56) msg.push(0);
    const high = Math.floor(bitLen / 0x100000000), low = bitLen >>> 0;
    msg.push((high >>> 24) & 255, (high >>> 16) & 255, (high >>> 8) & 255, high & 255, (low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255);
    for (let i = 0; i < msg.length; i += 64) {
        const w = new Array(64);
        for (let j = 0; j < 16; j++) { const idx = i + j * 4; w[j] = ((msg[idx] << 24) | (msg[idx + 1] << 16) | (msg[idx + 2] << 8) | msg[idx + 3]) >>> 0; }
        for (let jj = 16; jj < 64; jj++) { const s0 = rotr(w[jj - 15], 7) ^ rotr(w[jj - 15], 18) ^ (w[jj - 15] >>> 3); const s1 = rotr(w[jj - 2], 17) ^ rotr(w[jj - 2], 19) ^ (w[jj - 2] >>> 10); w[jj] = add32(add32(add32(w[jj - 16], s0), w[jj - 7]), s1); }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let k = 0; k < 64; k++) { const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25); const ch = (e & f) ^ ((~e) & g); const t1 = add32(add32(add32(add32(h, S1), ch), K[k]), w[k]); const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22); const maj = (a & b) ^ (a & c) ^ (b & c); const t2 = add32(S0, maj); h = g; g = f; f = e; e = add32(d, t1); d = c; c = b; b = a; a = add32(t1, t2); }
        h0 = add32(h0, a); h1 = add32(h1, b); h2 = add32(h2, c); h3 = add32(h3, d); h4 = add32(h4, e); h5 = add32(h5, f); h6 = add32(h6, g); h7 = add32(h7, h);
    }
    const words = [h0, h1, h2, h3, h4, h5, h6, h7];
    const out: number[] = [];
    for (let wi = 0; wi < words.length; wi++) { const ww = words[wi]; out.push((ww >>> 24) & 255, (ww >>> 16) & 255, (ww >>> 8) & 255, ww & 255); }
    return out;
}

function md5cycle(x: number[], k: number[]): void {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
}
function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number { a = ((a + q) & 0xffffffff) + ((x + t) & 0xffffffff); return (((a << s) | (a >>> (32 - s))) + b) & 0xffffffff; }
function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
function md51(s: string): number[] {
    const n = s.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i: number;
    for (i = 64; i <= s.length; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    const tail = new Array(16);
    for (let q = 0; q < 16; q++) tail[q] = 0;
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
}
function md5blk(s: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < 64; i += 4) out[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    return out;
}
const hexChr = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
function rhex(n: number): string { let s = ""; for (let j = 0; j < 4; j++) s += hexChr[(n >> (j * 8 + 4)) & 15] + hexChr[(n >> (j * 8)) & 15]; return s; }
function hex(x: number[]): string { for (let i = 0; i < x.length; i++) x[i] = rhex(x[i]); return x.join(""); }
function md5(s: string): string { return hex(md51(s)); }
function hmacMd5(message: string, key: string): string {
    const blockSize = 64;
    if (key.length > blockSize) key = hexToRaw(md5(key));
    while (key.length < blockSize) key += "\x00";
    let o = "", i = "";
    for (let n = 0; n < blockSize; n++) { const c = key.charCodeAt(n); o += String.fromCharCode(c ^ 0x5c); i += String.fromCharCode(c ^ 0x36); }
    return md5(o + hexToRaw(md5(i + message)));
}
function hexToRaw(hexStr: string): string { let out = ""; for (let i = 0; i < hexStr.length; i += 2) out += String.fromCharCode(parseInt(hexStr.substr(i, 2), 16)); return out; }