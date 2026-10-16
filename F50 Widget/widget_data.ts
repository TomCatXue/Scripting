
/** 从 network_information 字符串 dump 中提取键值（避免显式请求导致 F50 固件清零 dump 字段） */
export function extractFromNetworkInformation(netInfo: any, target: any): void {
    if (!netInfo || typeof netInfo !== "string") return;
    const pairs = netInfo.split(/[,;\r\n]+/);
    for (const pair of pairs) {
        const sep = pair.indexOf("=") >= 0 ? pair.indexOf("=") : pair.indexOf(":");
        if (sep < 0) continue;
        const key = pair.slice(0, sep).trim();
        const val = pair.slice(sep + 1).trim();
        if (key && val && (target[key] === undefined || target[key] === null || target[key] === "")) {
            target[key] = val;
        }
    }
}
// @ts-nocheck
// F50 Widget 数据层：将 API 原始数据组装为小组件状态，并提供缓存读写与格式化工具
// 注意：Storage 是全局 API，不能从 "scripting" 导入（导入会是 undefined）
import { fetchDeviceInfo, fetchGoformAll, fetchSystemInfo, fetchQoS } from "./api";

export type ColorName = "systemBlue" | "systemRed" | "systemGreen" | "systemOrange" | "systemYellow" | "systemTeal" | "systemIndigo" | "systemPurple" | "systemPink" | "systemCyan" | "systemGray" | "label" | "secondaryLabel";

export interface WidgetState {
    model_name: string;
    ufi_ver: string;
    cputemp: string;
    cpuusage: string;
    battery: string;
    battery_icon: string;
    battery_icon_color: ColorName;
    net_summary: string;
    signalbar: string;
    rsrp_text: string;
    rsrq_text: string;
    snr_text: string;
    ssid_text: string;
    sms_unread_text: string;
    sms_icon_color: ColorName;
    daily_data_value: string;
    daily_data_unit: string;
    monthly_data_value: string;
    monthly_data_unit: string;
    wifi_device_count: string;
    band_text: string;
    wifi_band_text: string;
    mem_text: string;
    update_time: string;
    zreq_used: boolean;
    error: string | null;
    // ---- 新增字段（借鉴 f50-monitor） ----
    dl_speed: string;           // 实时下行速率
    ul_speed: string;           // 实时上行速率
    dl_speed_color: ColorName;  // 速率颜色
    ul_speed_color: ColorName;
    traffic_limit_value: string;  // 套餐总量
    traffic_limit_unit: string;
    traffic_used_value: string;   // 已用
    traffic_used_unit: string;
    traffic_ratio: number;       // 使用比例 0~1
    traffic_color: ColorName;     // 进度条颜色
    reset_days: string;          // 重置倒计时
    qci: string;                 // QCI
    qos_dl: string;              // 下行 AMBR
    qos_ul: string;              // 上行 AMBR
    signal_quality: string;      // 信号质量评级
    signal_quality_color: ColorName;
    verify_code: string | null;   // 最新验证码
    // ---- SIM 卡（新增） ----
    iccid_text: string;
    msisdn_text: string;
    imsi_text: string;
    imei_text: string;
    sim_pin_text: string;
    // ---- Wi-Fi 客户端（新增） ----
    wifi_clients: WifiClient[];
    wifi_ssid: string;
    // ---- 上下行历史（新增，用于实时流量曲线） ----
    dl_history: number[];
    ul_history: number[];
    dl_bps: number;
    ul_bps: number;
}

export interface WifiClient {
    name: string;
    ip: string;
    mac: string;
}

const CACHE_KEY = "F50Widget.widget.cache.v5";

// ===================== 状态组装 =====================

export function emptyState(): WidgetState {
    return {
        model_name: "--", ufi_ver: "--", cputemp: "--", cpuusage: "--",
        battery: "--", battery_icon: "battery.0percent", battery_icon_color: "systemOrange",
        net_summary: "-- --", signalbar: "--", rsrp_text: "--", rsrq_text: "--", snr_text: "--",
        ssid_text: "--", sms_unread_text: "0", sms_icon_color: "systemBlue",
        daily_data_value: "--", daily_data_unit: "", monthly_data_value: "--", monthly_data_unit: "",
        wifi_device_count: "0", band_text: "—", wifi_band_text: "--", mem_text: "--",
        update_time: "--", zreq_used: false, error: null,
        // 新增字段默认值
        dl_speed: "--", ul_speed: "--", dl_speed_color: "systemBlue", ul_speed_color: "systemBlue",
        traffic_limit_value: "--", traffic_limit_unit: "", traffic_used_value: "--", traffic_used_unit: "",
        traffic_ratio: 0, traffic_color: "systemCyan", reset_days: "",
        qci: "", qos_dl: "", qos_ul: "",
        signal_quality: "--", signal_quality_color: "secondaryLabel",
        verify_code: null,
        iccid_text: "--", msisdn_text: "--", imsi_text: "--", imei_text: "--", sim_pin_text: "--",
        wifi_clients: [], wifi_ssid: "--",
        dl_history: [], ul_history: [], dl_bps: 0, ul_bps: 0,
    };
}

/** 组装小组件展示状态（绑定设备信息 + goform 字段 + 系统信息） */
export function buildState(deviceInfo: any, goformData: any, wifiFreq: number, memInfo: { total: number; available: number }): WidgetState {
    const state = emptyState();
    const d = deviceInfo || {};
    const g = goformData || {};

    buildDevicePart(state, d, g);
    buildBatteryPart(state, d, g);
    if (g && g.network_information) {
        extractFromNetworkInformation(g.network_information, g);
    }
    buildSignalPart(state, d, g);
    buildTrafficWifiPart(state, d, g, wifiFreq);
    buildMemoryPart(state, memInfo, g);
    buildSpeedPart(state, d, g);
    buildTrafficLimitPart(state, d, g);
    buildSignalQualityPart(state, g);
    buildSimPart(state, g);
    buildWifiClientsPart(state, g);

    state.update_time = makeUpdateTime();
    return state;
}

/** SIM 卡信息：未插入 / 未识别时保持 "--"，由 UI 显示「暂不支持」，不编造号码 */
function buildSimPart(state: WidgetState, g: any): void {
    state.iccid_text = maskIccid(pickRaw(g.iccid));
    state.msisdn_text = maskPhone(pickRaw(g.sim_msisdn, g.msisdn));
    state.imsi_text = maskTail(pickRaw(g.imsi), 4);
    state.imei_text = maskTail(pickRaw(g.imei), 4);
    const pinRaw = pickRaw(g.sim_pin_status, g.pin_status);
    if (pinRaw === null) state.sim_pin_text = "--";
    else {
        const s = String(pinRaw).toLowerCase();
        state.sim_pin_text = s === "0" || s === "1" ? "已启用" : s === "2" ? "未启用" : String(pinRaw);
    }
    state.wifi_ssid = pick(g.SSID1, "--");
}

/** Wi-Fi 客户端列表：设备固件多为 JSON 字符串，做容错解析 */
function buildWifiClientsPart(state: WidgetState, g: any): void {
    let list = g.station_list;
    if (typeof list === "string" && list.trim() !== "") {
        try { list = JSON.parse(list); } catch (_) { list = null; }
    }
    if (!Array.isArray(list)) return;
    state.wifi_clients = list.slice(0, 32).map((item: any) => {
        if (!item || typeof item !== "object") return { name: "未知设备", ip: "--", mac: "--" };
        return {
            name: String(item.hostname || item.name || item.host_name || "未知设备"),
            ip: String(item.ip || item.ip_addr || item.ipAddress || "--"),
            mac: maskMac(item.mac || item.mac_addr || item.macAddress),
        };
    });
}

/** ICCID 只保留首 6 位与末 4 位（完整卡号属敏感信息） */
function maskIccid(v: any): string {
    const s = String(v === undefined || v === null ? "" : v).replace(/\s/g, "");
    if (!/^\d{6,}$/.test(s)) return s === "" ? "--" : s;
    if (s.length <= 12) return s;
    return s.slice(0, 6) + "****" + s.slice(-4);
}

/** 手机号脱敏：138****8000 */
export function maskPhone(v: any): string {
    const s = String(v === undefined || v === null ? "" : v).replace(/\s/g, "");
    if (s === "" || s === "--") return "--";
    // 仅对 11 位手机号脱敏；服务号（10086 等）本身不是隐私，遮蔽反而制造歧义
    if (/^1\d{10}$/.test(s)) return s.slice(0, 3) + "****" + s.slice(-4);
    return s;
}

/** 尾部保留 n 位，前部用 * 遮蔽 */
function maskTail(v: any, keep: number): string {
    const s = String(v === undefined || v === null ? "" : v).replace(/\s/g, "");
    if (s === "") return "--";
    if (s.length <= keep) return s;
    return "*".repeat(Math.max(4, s.length - keep)) + s.slice(-keep);
}

/** MAC 脱敏：保留 OUI 前 3 段 */
export function maskMac(v: any): string {
    const s = String(v === undefined || v === null ? "" : v).trim();
    if (s === "" || s === "--") return "--";
    const parts = s.split(":");
    if (parts.length >= 4) return parts.slice(0, 3).join(":") + ":··:··:··";
    return s;
}

function buildDevicePart(state: WidgetState, d: any, g: any): void {
    state.model_name = pick(g.model_name, d.model);
    state.ufi_ver = buildUfiVersion(d);
    let temp = normalizeTemp(d.cpu_temp);
    if (!isNum(temp)) temp = normalizeTemp(maxTemp(d.cpu_temp_list));
    if (!isNum(temp)) {
        const gTemp = pickRaw(g.temperature, g.cpu_temp, g.internal_temperature, g.ic_temp);
        if (gTemp !== null) {
            let n = toNum(gTemp);
            if (isNum(n)) {
                if (n > 1000) n = n / 1000;
                if (n > 0 && n < 130) temp = n;
            }
        }
    }
    state.cputemp = isNum(temp) ? roundText(temp, 1) : "--";

    let cpu = toNum(d.cpu_usage);
    if (!isNum(cpu)) cpu = toNum(pickRaw(g.cpu_utility, g.cpu_usage));
    state.cpuusage = isNum(cpu) && cpu >= 0 ? roundText(Math.min(100, cpu), 0) : "--";
}

function buildBatteryPart(state: WidgetState, d: any, g: any): void {
    state.battery = pick(d.battery, g.battery_value, g.battery_vol_percent);
    const batVal = toNum(state.battery);
    const isCharging = String(g.battery_charging) === "1";
    if (isCharging) {
        state.battery_icon = "battery.100percent.bolt";
        state.battery_icon_color = "systemGreen";
    } else if (!isNum(batVal) || batVal <= 0) {
        state.battery_icon = "battery.0percent";
        state.battery_icon_color = "systemOrange";
    } else if (batVal < 13) {
        state.battery_icon = "battery.25percent";
        state.battery_icon_color = "systemRed";
    } else if (batVal < 38) {
        state.battery_icon = "battery.50percent";
        state.battery_icon_color = "systemOrange";
    } else if (batVal < 63) {
        state.battery_icon = "battery.75percent";
        state.battery_icon_color = "systemYellow";
    } else if (batVal < 88) {
        state.battery_icon = "battery.100percent";
        state.battery_icon_color = "systemTeal";
    } else {
        state.battery_icon = "battery.100percent";
        state.battery_icon_color = "systemGreen";
    }
}

// 信号指标候选键（大小写不敏感，参考 f50-monitor 的 firstValidSignalValue）
const RSRP_KEYS = ["nr_rsrp", "Z5g_rsrp", "5g_rsrp", "lte_rsrp", "Nr_signal_strength"];
const RSRQ_KEYS = ["nr_rsrq", "Z5g_rsrq", "5g_rsrq", "lte_rsrq", "Nr_rsrq", "nr5g_rsrq"];
const SNR_KEYS = ["nr_sinr", "5g_sinr", "lte_sinr", "sinr", "Nr_snr", "nr_snr", "Z5g_snr", "5g_snr", "lte_snr", "nr5g_snr"];
const SIGNALBAR_KEYS = ["network_signalbar", "signalbar", "rssi", "network_rssi", "signal_bar", "signal_level", "signal_strength", "signal"];

/** 从候选键中取第一个可解析的非零数值；跳过 null/空串/"0"（设备会把不适用的字段置 0/null） */
function firstSignalValue(dict: any, keys: string[]): number | null {
    const lower: Record<string, any> = {};
    if (dict && typeof dict === "object") {
        for (const k in dict) {
            if (Object.prototype.hasOwnProperty.call(dict, k)) lower[k.toLowerCase()] = dict[k];
        }
    }
    for (const key of keys) {
        const raw = lower[key.toLowerCase()];
        if (raw === undefined || raw === null || raw === "" || raw === "--") continue;
        const n = toNum(raw);
        if (!isFinite(n) || n === 0) continue;
        return n;
    }
    return null;
}

/** 从候选键中取原始值（用于信号格，可能是 0~5 也可能是负数 dBm） */
function pickSignalRaw(dict: any, keys: string[], ...fallbacks: any[]): any {
    const lower: Record<string, any> = {};
    if (dict && typeof dict === "object") {
        for (const k in dict) {
            if (Object.prototype.hasOwnProperty.call(dict, k)) lower[k.toLowerCase()] = dict[k];
        }
    }
    for (const key of keys) {
        const raw = lower[key.toLowerCase()];
        if (raw !== undefined && raw !== null && raw !== "" && raw !== "--") return raw;
    }
    return pickRaw.apply(null, fallbacks);
}

function buildSignalPart(state: WidgetState, d: any, g: any): void {
    const provider = pick(g.network_provider, "--");
    const netType = normNetType(g.network_type);
    state.net_summary = provider === "--" && netType === "--" ? "-- --" : provider + " " + netType;

    const barRaw = pickSignalRaw(g, SIGNALBAR_KEYS, d.signalbar, d.signal_bars);
    state.signalbar = barRaw === null || barRaw === undefined ? "--" : String(barRaw);
    const signalNumeric = toNum(state.signalbar);
    if (state.signalbar !== "--" && isNum(signalNumeric) && signalNumeric < 0) state.signalbar = signalBarsFromDbm(signalNumeric);
    if (state.signalbar === "--") {
        const signalDbm = firstSignalValue(g, RSRP_KEYS);
        if (signalDbm !== null) state.signalbar = signalBarsFromDbm(signalDbm);
    }

    state.rsrp_text = formatRsrp(firstSignalValue(g, RSRP_KEYS));
    state.rsrq_text = formatMetric(firstSignalValue(g, RSRQ_KEYS));
    state.snr_text = formatMetric(firstSignalValue(g, SNR_KEYS));

    state.ssid_text = pick(g.SSID1, "--");
    const unreadNum = parseInt(pickRaw(g.sms_unread_num), 10) || 0;
    state.sms_unread_text = unreadNum > 0 ? String(unreadNum) : "0";
    state.sms_icon_color = unreadNum > 0 ? "systemRed" : "systemBlue";
}

function buildTrafficWifiPart(state: WidgetState, d: any, g: any, wifiFreq: number): void {
    const dailyParts = splitByteText(formatBytes(d.daily_data));
    state.daily_data_value = dailyParts.value;
    state.daily_data_unit = dailyParts.unit;
    const monthlyParts = splitByteText(formatBytes(d.monthly_data));
    state.monthly_data_value = monthlyParts.value;
    state.monthly_data_unit = monthlyParts.unit;

    let staList = g.station_list;
    let wifiCount = 0;
    if (typeof staList === "string" && staList.trim() !== "") {
        try { staList = JSON.parse(staList); } catch (_) { }
    }
    if (Array.isArray(staList)) wifiCount = staList.length;
    else if (staList && typeof staList === "object") wifiCount = Object.keys(staList).length;
    if (wifiCount === 0) {
        const directNum = toNum(pickRaw(g.wifi_access_sta_num, g.station_num, g.client_count));
        if (isNum(directNum) && directNum >= 0) wifiCount = Math.floor(directNum);
    }
    state.wifi_device_count = String(wifiCount);

    state.band_text = buildBandText(g.Nr_bands, g.Lte_bands);
    const wifiBandRaw = pickRaw(g.wifi_band, g.wifi_band_text, d.wifi_band, d.wifi_band_text, g.wifi_bandwidth, d.wifi_freq, d.wifiFreq);
    if (wifiBandRaw !== null && wifiBandRaw !== "") {
        const freqNum = toNum(wifiBandRaw);
        if (isNum(freqNum) && freqNum >= 2000) {
            state.wifi_band_text = freqNum >= 4000 ? "5G" : "2.4G";
        } else {
            const bs = String(wifiBandRaw).toLowerCase();
            if (bs.indexOf("5g") >= 0 || bs.indexOf("5ghz") >= 0 || bs === "5") state.wifi_band_text = "5G";
            else if (bs.indexOf("2.4") >= 0 || bs.indexOf("2g") >= 0 || bs === "2") state.wifi_band_text = "2.4G";
            else state.wifi_band_text = String(wifiBandRaw);
        }
    } else {
        state.wifi_band_text = wifiFreq > 0 ? (wifiFreq >= 4000 ? "5G" : "2.4G") : "--";
    }
}

function buildMemoryPart(state: WidgetState, memInfo: { total: number; available: number }, g?: any): void {
    const memUsedKb = (memInfo && memInfo.total > 0 && memInfo.available >= 0) ? memInfo.total - memInfo.available : 0;
    if (memInfo && memInfo.total > 0) {
        state.mem_text = Math.round(memUsedKb / memInfo.total * 100) + "%";
        return;
    }
    if (g) {
        const memU = toNum(pickRaw(g.mem_utility, g.mem_usage));
        if (isNum(memU) && memU > 0) {
            state.mem_text = Math.round(Math.min(100, memU)) + "%";
            return;
        }
    }
    state.mem_text = "--";
}

// ===================== 新增：实时速率 =====================

function buildSpeedPart(state: WidgetState, d: any, g: any): void {
    const dlBps = toNum(pickRaw(g.realtime_rx_thrpt, d.realtime_rx_thrpt));
    const ulBps = toNum(pickRaw(g.realtime_tx_thrpt, d.realtime_tx_thrpt));
    state.dl_bps = isNum(dlBps) && dlBps > 0 ? dlBps : 0;
    state.ul_bps = isNum(ulBps) && ulBps > 0 ? ulBps : 0;
    if (isNum(dlBps) && dlBps > 0) {
        const parts = formatSpeedParts(dlBps);
        state.dl_speed = parts.value;
        state.dl_speed_color = speedColor(dlBps);
    }
    if (isNum(ulBps) && ulBps > 0) {
        const parts = formatSpeedParts(ulBps);
        state.ul_speed = parts.value;
        state.ul_speed_color = speedColor(ulBps);
    }
}

/** 速率格式化：B/s → KB/s / MB/s */
function formatSpeedParts(bps: number): { value: string; unit: string } {
    if (bps >= 1048576) {
        const mb = bps / 1048576;
        return { value: mb.toFixed(mb >= 10 ? 1 : 2).replace(/\.?0+$/, ""), unit: "MB/s" };
    }
    if (bps >= 1024) {
        const kb = bps / 1024;
        return { value: kb.toFixed(kb >= 10 ? 0 : 1).replace(/\.?0+$/, ""), unit: "KB/s" };
    }
    return { value: String(Math.round(bps)), unit: "B/s" };
}

/** 速率动态着色：>10MB/s 绿 / >1MB/s 蓝 / >100KB/s 青 / 其他灰 */
function speedColor(bps: number): ColorName {
    if (bps >= 10 * 1048576) return "systemGreen";
    if (bps >= 1048576) return "systemBlue";
    if (bps >= 100 * 1024) return "systemCyan";
    return "secondaryLabel";
}

// ===================== 新增：套餐流量限额 + 重置日 =====================

function buildTrafficLimitPart(state: WidgetState, d: any, g: any): void {
    // 套餐总量：data_volume_limit_size + data_volume_limit_unit
    const limitSizeRaw = pickRaw(g.data_volume_limit_size);
    const limitUnit = pickRaw(g.data_volume_limit_unit, g.data_volume_limit_switch);
    if (limitSizeRaw !== null) {
        const limitBytes = parseTrafficLimit(String(limitSizeRaw), String(limitUnit || ""));
        if (limitBytes > 0) {
            const parts = splitByteText(formatBytes(limitBytes));
            state.traffic_limit_value = parts.value;
            state.traffic_limit_unit = parts.unit;
        }
    }

    // 套餐已用：优先 monthly_rx_bytes + monthly_tx_bytes（80 端口匿名可读）
    const monthlyRx = toNum(pickRaw(g.monthly_rx_bytes, d.monthly_data));
    const monthlyTx = toNum(pickRaw(g.monthly_tx_bytes));
    if (isNum(monthlyRx) && monthlyRx > 0) {
        const used = monthlyRx + (isNum(monthlyTx) ? monthlyTx : 0);
        const parts = splitByteText(formatBytes(used));
        state.traffic_used_value = parts.value;
        state.traffic_used_unit = parts.unit;
        // 更新本月流量展示（更精确的字节数值）
        state.monthly_data_value = parts.value;
        state.monthly_data_unit = parts.unit;
    }

    // 今日流量：优先 day_rx_bytes + day_tx_bytes（80 端口匿名可读）
    const dailyRx = toNum(pickRaw(g.day_rx_bytes));
    const dailyTx = toNum(pickRaw(g.day_tx_bytes));
    if (isNum(dailyRx) && dailyRx > 0) {
        const dailyUsed = dailyRx + (isNum(dailyTx) ? dailyTx : 0);
        const parts = splitByteText(formatBytes(dailyUsed));
        state.daily_data_value = parts.value;
        state.daily_data_unit = parts.unit;
    }

    // 使用比例 + 颜色
    if (state.traffic_limit_value !== "--") {
        const limitBytes = parseTrafficLimit(String(limitSizeRaw), String(limitUnit || ""));
        const usedBytes = (isNum(monthlyRx) ? monthlyRx : 0) + (isNum(monthlyTx) ? monthlyTx : 0);
        if (limitBytes > 0 && usedBytes > 0) {
            state.traffic_ratio = Math.min(1, usedBytes / limitBytes);
            state.traffic_color = trafficRatioColor(state.traffic_ratio);
        }
    }

    // 重置日倒计时
    const resetDay = parseResetDay(g);
    if (resetDay > 0) {
        const daysLeft = calcDaysUntilReset(resetDay);
        state.reset_days = daysLeft === 0 ? "今天重置" : daysLeft + "天后重置";
    }
}

/** 解析流量限额，兼容固件复合值（如 1000_1024）和已换算成字节的超大数值 */
function parseTrafficLimit(sizeInput: string, unitInput: string): number {
    const sizeStr = String(sizeInput === undefined || sizeInput === null ? "" : sizeInput).trim();
    const unit = String(unitInput === undefined || unitInput === null ? "" : unitInput).trim().toLowerCase();
    if (!sizeStr || sizeStr === "0" || sizeStr.toLowerCase() === "null" || sizeStr.toLowerCase() === "undefined") return 0;

    const parts = sizeStr.split("_").map((part) => Number(part.trim())).filter((part) => isFinite(part));
    if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) return parts[0] * parts[1] * 1048576;

    const numValue = Number(sizeStr.replace(/[^0-9.\-]/g, ""));
    if (!isFinite(numValue) || numValue <= 0) return 0;
    let multiplier = 1000000000;
    if (unit === "gb" || unit === "1" || unit === "g") multiplier = 1000000000;
    else if (unit === "mb" || unit === "0" || unit === "m") multiplier = 1000000;
    else if (unit === "tb" || unit === "2" || unit === "t") multiplier = 1000000000000;
    else if (unit === "kb" || unit === "k") multiplier = 1000;
    else if (unit === "data" || unit === "data_volume" || unit === "size") multiplier = numValue < 1000 ? 1000000000 : 1000000;
    else if (numValue > 1000000000) multiplier = 1;
    else if (numValue > 100000) multiplier = 1000;
    return numValue * multiplier;
}

/** 从多个字段中解析重置日 */
function parseResetDay(g: any): number {
    const fields = ["data_volume_clear_date", "monthly_clear_date", "traffic_clear_date", "data_volume_clear_day", "data_volume_reset_day", "reset_day", "clear_day", "billing_day"];
    for (const f of fields) {
        const v = pickRaw(g[f]);
        if (v !== null) {
            const n = parseInt(String(v), 10);
            if (isFinite(n) && n > 0 && n <= 31) return n;
        }
    }
    return 0;
}

/** 计算距离重置日的天数 */
function calcDaysUntilReset(resetDay: number): number {
    const now = new Date();
    const today = now.getDate();
    if (resetDay === today) return 0;
    // 本月剩余天数
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (resetDay > today) return resetDay - today;
    // 跨月：本月剩余 + 下月到重置日
    const remainingThisMonth = daysInMonth - today;
    return remainingThisMonth + resetDay;
}

/** 使用比例 → 颜色 */
function trafficRatioColor(ratio: number): ColorName {
    if (ratio >= 0.9) return "systemRed";
    if (ratio >= 0.75) return "systemOrange";
    return "systemCyan";
}

// ===================== 新增：信号质量评级 =====================

function buildSignalQualityPart(state: WidgetState, g: any): void {
    const rsrp = firstSignalValue(g, RSRP_KEYS);
    const snr = firstSignalValue(g, SNR_KEYS);
    const rsrq = firstSignalValue(g, RSRQ_KEYS);

    // RSRP 评级：>=-85 极佳 / >=-95 良好 / >=-105 一般 / <-105 较差
    if (isNum(rsrp)) {
        if (rsrp >= -85) { state.signal_quality = "极佳"; state.signal_quality_color = "systemGreen"; }
        else if (rsrp >= -95) { state.signal_quality = "良好"; state.signal_quality_color = "systemBlue"; }
        else if (rsrp >= -105) { state.signal_quality = "一般"; state.signal_quality_color = "systemOrange"; }
        else { state.signal_quality = "较差"; state.signal_quality_color = "systemRed"; }
    } else if (isNum(snr)) {
        // 无 RSRP 时用 SNR 兜底评级：>=20 极佳 / >=13 良好 / >=3 一般 / <3 较差
        if (snr >= 20) { state.signal_quality = "极佳"; state.signal_quality_color = "systemGreen"; }
        else if (snr >= 13) { state.signal_quality = "良好"; state.signal_quality_color = "systemBlue"; }
        else if (snr >= 3) { state.signal_quality = "一般"; state.signal_quality_color = "systemOrange"; }
        else { state.signal_quality = "较差"; state.signal_quality_color = "systemRed"; }
    }
}

function buildBandText(nrBands: any, lteBands: any): string {
    const nr = pickRaw(nrBands);
    const lte = pickRaw(lteBands);
    return /^[0-9]+$/.test(nr) ? "N" + nr : (/^[0-9]+$/.test(lte) ? "B" + lte : "—");
}

// ===================== 抓取 + 缓存 =====================

/** 抓取完整小组件数据（带错误信息，供 UI 缓存容错展示） */
export async function fetchWidgetSnapshot(): Promise<{ state: WidgetState; error: string | null; zreqUsed: boolean }> {
    const errors: string[] = [];
    const [deviceResult, goformResult, systemResult, qosResult] = await Promise.allSettled([
        fetchDeviceInfo(),
        fetchGoformAll(),
        fetchSystemInfo(),
        fetchQoS(),
    ]);

    let deviceInfo: any = {};
    if (deviceResult.status === "fulfilled") {
        deviceInfo = deviceResult.value;
    } else {
        errors.push("设备信息: " + String((deviceResult.reason as Error)?.message || deviceResult.reason));
    }

    let goformData: any = {};
    let zreqUsed = false;
    if (goformResult.status === "fulfilled") {
        goformData = goformResult.value.data;
        zreqUsed = goformResult.value.zreqUsed;
    } else {
        errors.push("goform: " + String((goformResult.reason as Error)?.message || goformResult.reason));
    }

    let wifiFreq = 0;
    let memInfo = { total: 0, available: 0 };
    if (systemResult.status === "fulfilled") {
        wifiFreq = systemResult.value.wifiFreq;
        memInfo = systemResult.value.memInfo;
    } else {
        errors.push("系统信息: " + String((systemResult.reason as Error)?.message || systemResult.reason));
    }

    const state = buildState(deviceInfo, goformData, wifiFreq, memInfo);
    state.zreq_used = zreqUsed;
    state.error = errors.length > 0 ? errors.join("；") : null;

    // QoS 指标
    if (qosResult.status === "fulfilled" && qosResult.value) {
        state.qci = qosResult.value.qci || "";
        state.qos_dl = qosResult.value.qosDl || "";
        state.qos_ul = qosResult.value.qosUl || "";
    }

    return { state, error: state.error, zreqUsed };
}

/** 读取上次小组件缓存（抓取失败时用于容错展示） */
export function readWidgetCache(): WidgetState | null {
    try {
        const raw = Storage.get(CACHE_KEY);
        if (!raw) return null;
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!obj || typeof obj !== "object") return null;
        return Object.assign(emptyState(), obj);
    } catch (_) {
        return null;
    }
}

/** 保存小组件状态到缓存 */
export function saveWidgetCache(state: WidgetState): void {
    try {
        Storage.set(CACHE_KEY, JSON.stringify(state));
    } catch (e) {
        console.log("缓存保存失败:", String(e));
    }
}

// ===================== 实时流量曲线历史 =====================

const HISTORY_KEY = "F50.speedHistory.v1";
const HISTORY_MAX = 60; // 每分钟一个点，保留最近 60 分钟

export interface SpeedSample {
    t: number;   // 时间戳（毫秒）
    dl: number;  // 下行 B/s
    ul: number;  // 上行 B/s
}

export function readSpeedHistory(): SpeedSample[] {
    try {
        const raw = Storage.get(HISTORY_KEY);
        if (!raw) return [];
        const list = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(list) ? list : [];
    } catch (_) {
        return [];
    }
}

/**
 * 追加一次速率采样。
 *
 * 设备只提供瞬时速率，因此曲线是「采样序列」而非设备端历史：
 * 同一分钟内的多次采样会覆盖该分钟的点，避免密集刷新把曲线挤成锯齿。
 */
export function appendSpeedSample(sample: SpeedSample): SpeedSample[] {
    const list = readSpeedHistory();
    const minute = Math.floor(sample.t / 60000);
    const last = list[list.length - 1];
    if (last && Math.floor(last.t / 60000) === minute) {
        list[list.length - 1] = sample;
    } else {
        list.push(sample);
    }
    const trimmed = list.slice(-HISTORY_MAX);
    try {
        Storage.set(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (_) {
        // 存储失败时仍返回本轮数据，曲线退化为单点
    }
    return trimmed;
}

/** 把采样序列转换为曲线值（统一到 MB/s，便于 Y 轴量纲稳定） */
export function toChartSeries(samples: SpeedSample[], key: "dl" | "ul"): Array<{ id: string; value: number }> {
    return samples.map((sample, index) => ({
        id: String(index),
        value: Number((sample[key] / 1048576).toFixed(2)),
    }));
}

// ===================== 格式化工具 =====================

export function textValue(value: any): string {
    return value === undefined || value === null || value === "" ? "--" : String(value);
}

export function pickRaw(...args: any[]): any {
    for (const v of args) {
        if (v !== undefined && v !== null && v !== "" && v !== "--") return v;
    }
    return null;
}

export function pick(...args: any[]): string {
    const v = pickRaw.apply(null, args);
    return v === null ? "--" : String(v);
}

export function toNum(v: any): number {
    if (v === undefined || v === null || v === "") return NaN;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : NaN;
}

export function isNum(n: any): boolean { return isFinite(Number(n)); }

export function roundText(n: any, d: number): string { return Number(n).toFixed(d).replace(/\.0+$/, ""); }

function formatMetric(v: any): string {
    const n = toNum(v);
    return isNum(n) ? String(n) : "--";
}

function signalBarsFromDbm(dbm: number): string {
    if (dbm >= -85) return "4";
    if (dbm >= -95) return "3";
    if (dbm >= -105) return "2";
    if (dbm >= -115) return "1";
    return "0";
}

function buildUfiVersion(d: any): string {
    const app = pickRaw(d.app_ver);
    const code = pickRaw(d.app_ver_code);
    if (app && code) return String(app) + "." + String(code);
    if (app) return String(app);
    if (code) return String(code);
    return "--";
}

function formatRsrp(v: any): string {
    const n = toNum(v);
    if (!isNum(n)) return "--";
    return roundText(n, 0) + "dBm";
}

function makeUpdateTime(): string {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
function pad2(n: any): string { n = Number(n); return n < 10 ? "0" + n : String(n); }

function normalizeTemp(v: any): number {
    const n = toNum(v);
    if (!isNum(n)) return NaN;
    return n > 1000 ? n / 1000 : n;
}

function maxTemp(list: any): any {
    if (!Array.isArray(list)) return null;
    let m: any = null;
    for (const item of list) {
        const n = toNum(item && item.temp);
        if (isNum(n) && n > 0 && (m === null || n > m)) m = n;
    }
    return m;
}

function normNetType(v: any): string {
    const s = String(v === undefined || v === null ? "--" : v);
    if (s === "20" || s === "5G" || s === "LTE-NSA") return "5G";
    if (s === "13" || s === "LTE") return "4G";
    if (s === "2" || s === "WCDMA" || s === "3G") return "3G";
    if (s === "1" || s === "GSM" || s === "2G") return "2G";
    return s;
}

function formatBytes(b: any): string {
    const n = toNum(b);
    if (!isNum(n) || n <= 0) return "--";
    const tb = n / 1000000000000;
    if (tb >= 1) return tb.toFixed(tb >= 10 ? 1 : 2).replace(/\.0$/, "") + "TB";
    const gb = n / 1000000000;
    if (gb >= 1) return gb.toFixed(gb >= 10 ? 1 : 2).replace(/\.0$/, "") + "GB";
    const mb = n / 1000000;
    return mb.toFixed(mb >= 10 ? 0 : 1).replace(/\.0$/, "") + "MB";
}

function splitByteText(s: string): { value: string; unit: string } {
    s = String(s === undefined || s === null ? "--" : s);
    if (s === "--" || s === "") return { value: "--", unit: "" };
    const m = s.match(/^([0-9.]+)([A-Za-z]+)$/);
    if (m) return { value: m[1], unit: m[2] };
    return { value: s, unit: "" };
}
