// @ts-nocheck
// F50 Widget API 层：UFI-TOOLS / ZTE 的设备信息拉取、签名、登录与 shell 执行
// 注意：Storage / Keychain / FileManager 是全局 API，不能从 "scripting" 导入（导入会是 undefined）
import { fetch, Request, Script, Widget } from "scripting";

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

/** 读取配置：参数 / 小组件参数（历史优先）→ Storage（主存储）→ Keychain（冗余）→ 配置文件（冗余） */
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
    // 主存储：Storage（设置页 / 小组件 / 预览共享同一脚本域）
    try {
        const saved = Storage.get("F50Widget." + key);
        if (saved !== undefined && saved !== null && String(saved).trim() !== "") return String(saved).trim();
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
    return fallback || "";
}

/**
 * 直接从 App Group 配置文件读取（绕过 Keychain / Storage 缓存，用于持久化校验与诊断）。
 */
export function readSettingFromFile(key: string, fallback?: string): string {
    try {
        const cfg = readConfigFile();
        if (cfg) {
            const v = cfg[key];
            if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
        }
    } catch (_) { }
    return fallback || "";
}

/**
 * 保存配置：主存储为 Storage（Scripting 官方持久化存储，设置页 / 小组件 / 预览共享同一脚本域，
 * 异步落盘由 app 后台保证），App Group 配置文件与 Keychain 作为冗余（尽力而为）。
 * 返回 true 仅当主存储写入成功，或任一冗余层写入并通过验证。
 */
export function saveSetting(key: string, value: string): boolean {
    const val = String(value).trim();
    let stOk = false;
    let fileOk = false;
    let kcOk = false;

    const fullKey = "F50Widget." + key;

    // 1) 主存储：Storage（per-script 私有域，设置页与小组件共享）
    try {
        if (val === "") {
            Storage.remove(fullKey);
            stOk = true;
        } else {
            stOk = Storage.set(fullKey, val) === true;
        }
    } catch (se) {
        console.log("Storage 写入失败:", key, String(se));
    }

    // 2) 冗余：App Group 配置文件（同步落盘；部分环境不可用时自动忽略）
    try {
        const patch: Record<string, string> = {};
        patch[key] = val;
        if (writeConfigFile(patch)) fileOk = true;
    } catch (e) {
        console.log("配置文件写入失败（冗余层）:", key, String(e));
    }

    // 3) 冗余：Keychain（密码类）——写后读回验证；写入失败时清除旧值，避免读到过期密码
    if (isSecretKey(key)) {
        try {
            if (val === "") {
                Keychain.remove(fullKey);
                const rb = Keychain.get(fullKey);
                kcOk = rb === null || rb === undefined || rb === "";
            } else {
                const setOk = Keychain.set(fullKey, val) === true;
                const rb = Keychain.get(fullKey);
                kcOk = setOk && String(rb === null || rb === undefined ? "" : rb).trim() === val;
                if (!kcOk) {
                    // 写入失败则清掉残留旧值，避免读取时命中过期密码
                    try { Keychain.remove(fullKey); } catch (_) { }
                }
            }
        } catch (ke) {
            console.log("Keychain 写入失败（冗余层）:", key, String(ke));
        }
    }

    return stOk || fileOk || kcOk;
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

// ===================== 双端口端点解析 =====================

/**
 * 从 UFI 地址（:2333）推导 ZTE 路由器后台地址（:80）。
 * 借鉴 f50-monitor 的 resolveEndpoints：同一 host 去掉端口即为路由器地址。
 */
export function resolveEndpoints(ufiBaseURL: string): { routerBaseURL: string; ufiBaseURL: string } {
    const base = trimSlash(ufiBaseURL);
    try {
        const url = new URL(base);
        const host = url.hostname;
        const scheme = url.protocol.replace(":", "");
        return {
            routerBaseURL: scheme + "://" + host,
            ufiBaseURL: base,
        };
    } catch (_) {
        // 无法解析时，假设默认地址
        return {
            routerBaseURL: "http://192.168.0.1",
            ufiBaseURL: "http://192.168.0.1:2333",
        };
    }
}

/** 获取 ZTE 路由器后台地址（端口 80） */
function getRouterBaseURL(): string {
    return resolveEndpoints(getKanoUrl()).routerBaseURL;
}

// ===================== goform 字段组 =====================

/** 基础状态字段（信号、电池、网络、硬件等） */
function getBasicFields(): string[] {
    return [
        // 设备与网络
        "model_name", "network_provider", "network_type", "network_signalbar",
        "network_information", "Lte_ca_status", "ppp_status", "loginfo",
        // 电池
        "battery_value", "battery_vol_percent", "battery_charging",
        // 5G 信号指标
        "Z5g_rsrp", "Z5g_snr", "5g_rsrp", "5g_rsrq", "5g_snr",
        // LTE 信号指标
        "lte_rsrp", "lte_rsrq", "lte_snr",
        // NR 信号指标（兼容字段名）
        "nr_rsrp", "nr_rssi", "nr_rsrq", "Nr_rsrq", "nr_snr", "Nr_snr", "nr5g_rsrq", "nr5g_snr",
        // 频段
        "Nr_bands", "Lte_bands", "wan_active_band", "lte_band", "lte_ca_pcell_band",
        "nr5g_action_band", "nr5g_action_nsa_band", "ZCELLINFO_band", "Z5g_CELLINFO_band", "nr_ca_pcell_band",
        // 硬件指标
        "temperature", "cpu_temp", "internal_temperature", "ic_temp", "cpu_utility", "mem_utility",
        // SMS
        "sms_unread_num", "sms_sim_unread_num", "sms_received_flag",
        // Wi-Fi
        "SSID1", "RadioOff", "station_list", "wifi_access_sta_num",
        // 鉴权
        "LD", "RD", "modem_main_state", "pin_status", "sim_pin_status",
        // 实时速率
        "realtime_rx_thrpt", "realtime_tx_thrpt",
    ];
}

/** 流量统计字段（套餐用量、限额、重置日等） */
function getTrafficFields(): string[] {
    return [
        "realtime_rx_bytes", "realtime_tx_bytes",
        "monthly_rx_bytes", "monthly_tx_bytes",
        "total_rx_bytes", "total_tx_bytes",
        "day_rx_bytes", "day_tx_bytes",
        "data_volume_limit_size", "data_volume_limit_unit",
        "data_volume_clear_date", "monthly_clear_date", "traffic_clear_date",
        "data_volume_clear_day", "data_volume_reset_day",
        "billing_day", "reset_day", "clear_date", "clear_day",
        "data_volume_limit_switch", "flux_data_volume_limit_size", "flux_data_volume_limit_switch", "flux_clear_date",
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
    if (status === 401) {
        throw new Error(label + " HTTP 401：UFI-TOOLS 口令错误或设备锁定，请在设置中核对「UFI-TOOLS 密码」");
    }
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

/** GET /api/baseDeviceInfo：型号、固件、流量、CPU、电池等（多 token 轮询） */
export async function fetchDeviceInfo(): Promise<any> {
    const tokens = candidateTokens();
    for (const token of tokens) {
        try {
            const req = new Request(getKanoUrl() + DEVICE_PATH);
            req.allowInsecureRequest = true;
            req.method = "GET";
            applyHeaders(req, buildKanoHeadersWithToken("GET", DEVICE_PATH, token));
            req.timeout = 15;
            const resp = await fetch(req);
            if (resp.status === 401 || resp.status === 403) continue;
            return await readJSONResponse(resp, "baseDeviceInfo");
        } catch (e) {
            if (String(e).indexOf("401") >= 0) continue;
            throw e;
        }
    }
    throw new Error("baseDeviceInfo: 所有候选 token 均返回 401/403");
}

// ===================== 候选 Token 生成（借鉴 f50-monitor） =====================

/**
 * 生成 UFI 认证候选 token 列表。
 * 口令的 SHA256（大/小写/原值）+ 密码的 SHA256（大/小写/原值）+ admin 的 SHA256 + admin 明文
 * 遇到 401 时依次尝试，提高连接成功率。
 */
export function candidateTokens(): string[] {
    const tokens: string[] = [];
    const ufiToken = getPassword(); // UFI 密码作为 token 来源
    const ztePwd = getZtePassword();

    const addVariants = (raw: string) => {
        const t = raw.trim();
        if (!t) return;
        tokens.push(sha256HexFromString(t).toLowerCase());
        tokens.push(sha256HexFromString(t.toLowerCase()).toLowerCase());
        tokens.push(sha256HexFromString(t.toUpperCase()).toLowerCase());
        tokens.push(t);
    };

    addVariants(ufiToken);
    addVariants(ztePwd);
    // admin 兜底
    tokens.push(sha256HexFromString("admin").toLowerCase());
    tokens.push("admin");

    // 去重
    const unique: string[] = [];
    for (const t of tokens) {
        if (unique.indexOf(t) === -1) unique.push(t);
    }
    return unique;
}

// ===================== goform 批量获取 =====================

/** GET goform 批量字段（通过 UFI 2333 端口，带签名，多 token 轮询） */
async function getGoform(cmdList: string[]): Promise<any> {
    const cmd = cmdList.join(",");
    const url = getKanoUrl() + GOFORM_GET_PATH + "?multi_data=1&isTest=false&cmd=" + cmd + "&_=" + Date.now();
    const tokens = candidateTokens();

    // 依次尝试候选 token
    for (const token of tokens) {
        try {
            const req = new Request(url);
            req.allowInsecureRequest = true;
            req.method = "GET";
            applyHeaders(req, buildKanoHeadersWithToken("GET", GOFORM_GET_PATH, token));
            const resp = await fetch(req);
            if (resp.status === 401 || resp.status === 403) continue;
            return await readJSONResponse(resp, "goform");
        } catch (e) {
            // 网络错误不重试同一 token
            if (String(e).indexOf("401") >= 0) continue;
            throw e;
        }
    }
    throw new Error("goform: 所有候选 token 均返回 401/403");
}

/** GET goform 批量字段（通过 ZTE 路由器 80 端口，匿名/带 Cookie，无需签名） */
async function getRouterGoform(cmdList: string[], sessionCookie?: string): Promise<any> {
    const routerBase = getRouterBaseURL();
    const cmd = cmdList.join(",");
    const url = routerBase + "/goform/goform_get_cmd_process?multi_data=1&isTest=false&cmd=" + cmd + "&_=" + Date.now();
    const req = new Request(url);
    req.allowInsecureRequest = true;
    req.method = "GET";
    req.headers.set("Referer", routerBase + "/index.html");
    if (sessionCookie) req.headers.set("Cookie", sessionCookie);
    req.timeout = 10;
    return await readJSONResponse(await fetch(req), "router-goform");
}

// ===================== 设备登录锁定检测（防触发锁机） =====================

let lastLockCheckAt = 0;    // 上次锁定检查时间戳
let cachedLockSec = 0;      // 缓存的剩余锁定秒数
const LOCK_CHECK_CACHE_MS = 10000; // 锁定状态缓存 10 秒

/**
 * 查询设备登录锁定状态（psw_fail_num_str / login_lock_time，ZTE 固件字段）。
 * @returns 剩余锁定秒数；0 表示未锁定
 */
async function queryLockState(): Promise<number> {
    const now = Date.now();
    if (now - lastLockCheckAt < LOCK_CHECK_CACHE_MS) return cachedLockSec;
    lastLockCheckAt = now;
    cachedLockSec = 0;
    try {
        const resp = await getGoform(["psw_fail_num_str", "login_lock_time"]);
        const failNum = String(resp && resp.psw_fail_num_str);
        const lockTime = parseInt(String(resp && resp.login_lock_time), 10);
        // 锁定状态：失败次数字段为空且锁定时间 > 0
        if (isFinite(lockTime) && lockTime > 0 && (failNum === "0" || failNum === "")) {
            cachedLockSec = lockTime;
        }
    } catch (e) {
        console.log("锁定状态查询失败（可能口令错误或服务不可达）:", String(e));
    }
    return cachedLockSec;
}

/** 通过 zreq（设备本机二进制）自动完成 ZTE 登录后批量读取 goform 字段 */
async function zreqGoform(cmdList: string[]): Promise<{ data: any; used: boolean }> {
    const ztePassword = getZtePassword();
    if (ztePassword === "") {
        throw new Error("未配置 ZTE 后台密码，跳过 zreq 登录（避免触发设备锁定）");
    }
    const lockSec = await queryLockState();
    if (lockSec > 0) {
        throw new Error("设备已因密码错误次数过多锁定，请等待约 " + lockSec + " 秒后再试");
    }
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

/**
 * 组装 goform 数据（双端口轮询 + 多策略合并），并单独补充 RSRQ/SNR。
 * 
 * 数据源优先级：
 * 1. UFI 2333 端口（zreq 登录或 GET-only + POST 登录）— 提供完整鉴权字段
 * 2. ZTE 80 端口（匿名 Referer 读取）— 提供流量统计、硬件指标等匿名可读字段
 * 3. 两者合并：80 端口的字段补充 2333 端口缺失的字段
 */
export async function fetchGoformAll(): Promise<{ data: any; zreqUsed: boolean }> {
    let zreqUsed = false;
    let ufiData: any = null;
    let routerData: any = null;

    // ---- 1. 尝试从 ZTE 80 端口匿名读取（无需密码，Referer 即可） ----
    try {
        const allFields = getBasicFields().concat(getTrafficFields());
        routerData = await getRouterGoform(allFields);
        // 兼容：80 端口 loginfo=no 时尝试 POST 登录（仅当已配置密码）
        if (routerData && String(routerData.loginfo) === "no" && getZtePassword() !== "") {
            try {
                const cookie = await performRouterLogin();
                if (cookie) {
                    routerData = await getRouterGoform(allFields, cookie);
                }
            } catch (le) {
                console.log("router login fail:", String(le));
            }
        }
    } catch (e) {
        console.log("router 80 goform fail:", String(e));
    }

    // ---- 2. 尝试从 UFI 2333 端口读取（需要签名 + 登录） ----
    const zteConfigured = getZtePassword() !== "";
    if (zteConfigured) {
        try {
            const zr = await zreqGoform(getBasicFields());
            zreqUsed = zr.used;
            ufiData = zr.data;
            // 单独查询 network_information 补充 RSRQ/SNR（批量请求不返回质量字段）
            if (zreqUsed) {
                try {
                    const netInfo = await getGoform(["network_information"]);
                    if (netInfo && typeof netInfo === "object") {
                        for (const k in netInfo) {
                            const nv = netInfo[k];
                            const cur = ufiData[k];
                            if (nv !== undefined && nv !== null && nv !== "" && (cur === undefined || cur === null || cur === "")) ufiData[k] = nv;
                        }
                    }
                } catch (nie) { console.log("netinfo query fail:", String(nie)); }
            }
        } catch (e) {
            console.log("zreq fail:", String(e));
        }
    } else {
        console.log("未配置 ZTE 后台密码，跳过 zreq 登录");
    }

    // ---- 3. UFI 2333 回退：GET-only + POST 登录 ----
    if (!zreqUsed) {
        try {
            ufiData = await getGoform(getBasicFields());
        } catch (e2) {
            console.log("UFI GET goform fail:", String(e2));
        }
        // 兼容：loginfo=no 且 GET-only 时尝试 POST 登录（仅当已配置密码）
        if (ufiData && String(ufiData.loginfo) === "no" && getZtePassword() !== "") {
            try {
                await loginZTE();
                ufiData = await getGoform(getBasicFields());
            } catch (le) {
                console.log("POST login fail:", String(le));
            }
        }
    }

    // ---- 4. 合并：80 端口数据补充 2333 端口缺失的字段 ----
    const merged: any = {};
    if (routerData && typeof routerData === "object") {
        for (const k in routerData) {
            const v = routerData[k];
            if (v !== undefined && v !== null && v !== "") merged[k] = v;
        }
    }
    if (ufiData && typeof ufiData === "object") {
        for (const k in ufiData) {
            const v = ufiData[k];
            // UFI 数据优先（鉴权字段更完整）
            if (v !== undefined && v !== null && v !== "") merged[k] = v;
        }
    }

    return { data: merged, zreqUsed };
}

// ===================== ZTE 登录（回退方案） =====================

async function loginZTE(): Promise<void> {
    const ztePassword = getZtePassword();
    if (ztePassword === "") {
        throw new Error("未配置 ZTE 后台密码，跳过 POST 登录（避免触发设备锁定）");
    }
    const lockSec = await queryLockState();
    if (lockSec > 0) {
        throw new Error("设备已因密码错误次数过多锁定，请等待约 " + lockSec + " 秒后再试");
    }
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

// ===================== ZTE 路由器登录（80 端口，返回 Session Cookie） =====================

/** 通过 80 端口 POST 登录，返回 Set-Cookie 中的 JSESSIONID（用于后续带 Cookie 请求） */
async function performRouterLogin(): Promise<string | null> {
    const routerBase = getRouterBaseURL();
    const ztePassword = getZtePassword();
    if (ztePassword === "") return null;

    // 1. 获取 LD 随机数
    const ldUrl = routerBase + "/goform/goform_get_cmd_process?multi_data=1&isTest=false&cmd=LD&_=" + Date.now();
    const ldReq = new Request(ldUrl);
    ldReq.allowInsecureRequest = true;
    ldReq.method = "GET";
    ldReq.headers.set("Referer", routerBase + "/index.html");
    ldReq.timeout = 10;
    const ldResp = await (await fetch(ldReq)).json();
    const ld = ldResp && ldResp.LD;
    if (!ld) return null;

    // 2. 计算 password hash: SHA256(SHA256(password) + LD).toUpperCase()
    const pwdHash1 = sha256HexFromString(ztePassword).toLowerCase();
    const loginHash = sha256HexFromString(pwdHash1 + ld).toUpperCase();

    // 3. POST 登录
    const loginUrl = routerBase + "/goform/goform_set_cmd_process";
    const loginReq = new Request(loginUrl);
    loginReq.allowInsecureRequest = true;
    loginReq.method = "POST";
    loginReq.headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
    loginReq.headers.set("Referer", routerBase + "/index.html");
    loginReq.body = "goformId=LOGIN&isTest=false&user=admin&password=" + loginHash;
    loginReq.timeout = 10;

    const loginResp = await fetch(loginReq);
    // 从响应头提取 Set-Cookie
    const setCookie = loginResp.headers && loginResp.headers.get ? loginResp.headers.get("Set-Cookie") : null;
    if (setCookie) {
        const match = setCookie.match(/JSESSIONID=([^;]+)/);
        if (match) return "JSESSIONID=" + match[1];
        return setCookie;
    }
    // 登录成功但无 Cookie 时返回空字符串（部分固件用 session 而非 Cookie）
    return "";
}

// ===================== SMS 短信功能 =====================

export interface SMSMessage {
    id: string;
    number: string;
    content: string;
    dateText: string;
    isUnread: boolean;
    isOutgoing: boolean;
}

/** 读取短信列表（通过 UFI 2333 端口 goform 接口） */
export async function fetchSMSMessages(): Promise<SMSMessage[]> {
    const ts = Date.now();
    const url = getKanoUrl() + GOFORM_GET_PATH
        + "?multi_data=1&isTest=false&cmd=sms_data_total&page=0&data_per_page=100&mem_store=1&tags=100&order_by=order%20by%20id%20desc&_=" + ts;
    const tokens = candidateTokens();

    for (const token of tokens) {
        try {
            const req = new Request(url);
            req.allowInsecureRequest = true;
            req.method = "GET";
            applyHeaders(req, buildKanoHeadersWithToken("GET", GOFORM_GET_PATH, token));
            req.timeout = 15;
            const resp = await fetch(req);
            if (resp.status === 401 || resp.status === 403) continue;
            const json = await readJSONResponse(resp, "sms");
            return parseSMSMessages(json);
        } catch (e) {
            if (String(e).indexOf("401") >= 0) continue;
            throw e;
        }
    }
    return [];
}

/** 解析短信 JSON 响应为 SMSMessage 列表 */
function parseSMSMessages(json: any): SMSMessage[] {
    const messages: SMSMessage[] = [];
    const msgs = json && json.messages;
    if (!Array.isArray(msgs)) return messages;
    for (const row of msgs) {
        const id = String(row.id || "");
        if (!id) continue;
        messages.push({
            id: id,
            number: String(row.number || ""),
            content: String(row.content || ""),
            dateText: String(row.date || ""),
            isUnread: String(row.tag || "") === "1",
            isOutgoing: false,
        });
    }
    return messages;
}

/** 发送短信（通过 root_shell Telephony service call） */
export async function sendSMS(number: string, content: string): Promise<boolean> {
    const cleanNum = String(number).replace(/[^0-9+]/g, "");
    if (!cleanNum) throw new Error("手机号无效");
    // UTF-16BE hex 编码（GSM 编码）
    const b64Body = gsmEncode(content);
    // 通过 root_shell 执行 service call isms 6 发送短信
    const cmd = "service call isms 6 s16 " + cleanNum + " s16 \"\" s16 \"" + content + "\" s16 \"\" s16 \"\"";
    try {
        const result = await postShell(cmd, ROOT_SHELL_PATH);
        const resultStr = String(result || "");
        if (resultStr.indexOf("Result: Parcel") >= 0 && resultStr.indexOf("Exception") < 0) return true;
    } catch (e) {
        console.log("root_shell SMS send fail:", String(e));
    }
    // 回退策略：通过 goform_set 发送
    return await sendSMSViaGoform(cleanNum, content);
}

/** 通过 goform_set_cmd_process 发送短信 */
async function sendSMSViaGoform(number: string, content: string): Promise<boolean> {
    const ts = Date.now();
    // 1. 获取版本信息计算 AD 校验码
    const verUrl = getKanoUrl() + GOFORM_GET_PATH + "?multi_data=1&isTest=false&cmd=Language,cr_version,wa_inner_version&_=" + ts;
    const tokens = candidateTokens();
    for (const token of tokens) {
        try {
            const verReq = new Request(verUrl);
            verReq.allowInsecureRequest = true;
            verReq.method = "GET";
            applyHeaders(verReq, buildKanoHeadersWithToken("GET", GOFORM_GET_PATH, token));
            const verResp = await readJSONResponse(await fetch(verReq), "sms-ver");
            const wa = String(verResp.wa_inner_version || verResp.wa_version || "");
            const cr = String(verResp.cr_version || "");
            const ad = sha256HexFromString(sha256HexFromString(wa + cr)).toUpperCase();

            // 2. 获取 RD
            const rdUrl = getKanoUrl() + GOFORM_GET_PATH + "?cmd=RD&isTest=false&_=" + Date.now();
            const rdReq = new Request(rdUrl);
            rdReq.allowInsecureRequest = true;
            rdReq.method = "GET";
            applyHeaders(rdReq, buildKanoHeadersWithToken("GET", GOFORM_GET_PATH, token));
            const rdResp = await readJSONResponse(await fetch(rdReq), "sms-rd");
            const rd = String(rdResp.RD || "");

            // 3. 发送短信
            const b64Content = gsmEncode(content);
            const sendBody = "goformId=SEND_MESSAGE&isTest=false&Number=" + number
                + "&sms_content=" + b64Content
                + "&sms_encode_type=GSM7_default"
                + "&port=1&use_type=1&AD=" + ad + "&RD=" + rd;

            const sendReq = new Request(getKanoUrl() + GOFORM_SET_PATH);
            sendReq.allowInsecureRequest = true;
            sendReq.method = "POST";
            sendReq.headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            applyHeaders(sendReq, buildKanoHeadersWithToken("POST", GOFORM_SET_PATH, token));
            sendReq.body = sendBody;
            sendReq.timeout = 15;
            const sendResp = await fetch(sendReq);
            const sendText = await sendResp.text();
            if (sendText.indexOf('"result":0') >= 0 || sendText.indexOf('"result":"0"') >= 0 || sendText.indexOf("success") >= 0) return true;
        } catch (e) {
            if (String(e).indexOf("401") >= 0) continue;
            console.log("goform SMS send fail:", String(e));
        }
    }
    return false;
}

/** GSM UTF-16BE hex 编码（用于短信内容编码） */
function gsmEncode(text: string): string {
    const s = String(text);
    let hex = "";
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        hex += byteHex((code >> 8) & 0xff) + byteHex(code & 0xff);
    }
    return hex;
}

/**
 * 从短信文本中提取验证码（借鉴 f50-monitor extractVerifyCode）。
 * 匹配"验证码"/"校验码"/"动态码"/"code"附近的 4-8 位数字。
 */
export function extractVerifyCode(text: string): string | null {
    if (!text) return null;
    // 匹配"验证码"等关键词附近的 4-8 位数字
    const codeRegex = /(?:验证码|校验码|动态码|code|Code|CODE)[^\d]{0,8}(\d{4,8})/;
    const match = text.match(codeRegex);
    if (match && match[1]) return match[1];
    // 回退：独立的 4-6 位数字
    const digitMatch = text.match(/(?:\b|[^0-9])(\d{4,6})(?:\b|[^0-9])/);
    if (digitMatch && digitMatch[1]) return digitMatch[1];
    return null;
}

// ===================== QoS 指标（AT 命令） =====================

export interface QoSInfo {
    qci: string;
    qosDl: string;
    qosUl: string;
}

/** 通过 /api/AT 获取 QCI 和 AMBR（QoS 指标） */
export async function fetchQoS(): Promise<QoSInfo | null> {
    const path = "/api/AT";
    const url = getKanoUrl() + path + "?command=AT%2BCGEQOSRDP%3D1&slot=0";
    const tokens = candidateTokens();

    for (const token of tokens) {
        try {
            const req = new Request(url);
            req.allowInsecureRequest = true;
            req.method = "GET";
            applyHeaders(req, buildKanoHeadersWithToken("GET", path, token));
            req.timeout = 10;
            const resp = await fetch(req);
            if (resp.status === 401 || resp.status === 403) continue;
            const json = await readJSONResponse(resp, "AT-QoS");
            const resultStr = String(json && json.result || "");
            if (resultStr) {
                const parsed = parseQoSResponse(resultStr);
                if (parsed) return parsed;
            }
        } catch (e) {
            if (String(e).indexOf("401") >= 0) continue;
            console.log("QoS fetch fail:", String(e));
        }
    }
    return null;
}

/** 解析 AT+CGEQOSRDP 响应（提取 QCI 和 AMBR） */
function parseQoSResponse(result: string): QoSInfo | null {
    // 响应格式类似: +CGEQOSRDP: 1,9,"500000000","100000000"
    const qciMatch = result.match(/QOSRDP:\s*\d+,(\d+)/);
    const dlMatch = result.match(/"(\d+)"[^"]*$/);
    const ulMatch = result.match(/"(\d+)"\s*,\s*"(\d+)"/);

    const qci = qciMatch ? qciMatch[1] : "";
    let qosDl = "";
    let qosUl = "";

    if (ulMatch) {
        qosDl = formatAMBR(parseInt(ulMatch[1], 10));
        qosUl = formatAMBR(parseInt(ulMatch[2], 10));
    } else if (dlMatch) {
        qosDl = formatAMBR(parseInt(dlMatch[1], 10));
    }

    if (qci || qosDl || qosUl) {
        return { qci, qosDl, qosUl };
    }
    return null;
}

/** 格式化 AMBR 速率（bps → Mbps/Gbps） */
function formatAMBR(bps: number): string {
    if (bps <= 0) return "";
    const mbps = bps / 1000000;
    if (mbps >= 1000) return (mbps / 1000).toFixed(1).replace(/\.0$/, "") + "Gbps";
    return Math.round(mbps) + "Mbps";
}

// ===================== 蜂窝流量精确查询 =====================

/**
 * 通过 /api/cellularUsage 按日期范围精确查询流量用量。
 * 返回指定时间段内的总字节数。
 */
export async function fetchCellularUsage(startISO: string, endISO: string): Promise<number> {
    const path = "/api/cellularUsage";
    const url = getKanoUrl() + path + "?start=" + encodeURIComponent(startISO) + "&end=" + encodeURIComponent(endISO);
    const tokens = candidateTokens();

    for (const token of tokens) {
        try {
            const req = new Request(url);
            req.allowInsecureRequest = true;
            req.method = "GET";
            applyHeaders(req, buildKanoHeadersWithToken("GET", path, token));
            req.timeout = 10;
            const resp = await fetch(req);
            if (resp.status === 401 || resp.status === 403) continue;
            const json = await readJSONResponse(resp, "cellularUsage");
            // 格式: { "usage": [{ "usage": 123456789 }, ...] }
            const rows = json && json.usage;
            if (Array.isArray(rows)) {
                let total = 0;
                for (const row of rows) {
                    total += parseInt(String(row.usage || "0"), 10) || 0;
                }
                return total;
            }
        } catch (e) {
            if (String(e).indexOf("401") >= 0) continue;
            console.log("cellularUsage fetch fail:", String(e));
        }
    }
    return 0;
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

/** 构建 UFI-TOOLS 签名头（使用指定 token 作为 Authorization） */
function buildKanoHeadersWithToken(method: string, path: string, token: string): Record<string, string> {
    const t = String(Date.now());
    const sign = buildKanoSign(method, path, t);
    return { "Authorization": token, "kano-t": t, "kano-sign": sign };
}

/** 构建 UFI-TOOLS 签名头（兼容旧调用，使用密码 SHA256 作为 token） */
function buildKanoHeaders(method: string, path: string): Record<string, string> {
    return buildKanoHeadersWithToken(method, path, sha256HexFromString(getPassword()).toLowerCase());
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