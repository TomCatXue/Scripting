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
    };
}

/** 组装小组件展示状态（绑定设备信息 + goform 字段 + 系统信息） */
export function buildState(deviceInfo: any, goformData: any, wifiFreq: number, memInfo: { total: number; available: number }): WidgetState {
    const state = emptyState();
    const d = deviceInfo || {};
    const g = goformData || {};

    buildDevicePart(state, d, g);
    buildBatteryPart(state, d, g);
    buildSignalPart(state, d, g);
    buildTrafficWifiPart(state, d, g, wifiFreq);
    buildMemoryPart(state, memInfo);
    buildSpeedPart(state, d, g);
    buildTrafficLimitPart(state, d, g);
    buildSignalQualityPart(state, g);

    state.update_time = makeUpdateTime();
    return state;
}

function buildDevicePart(state: WidgetState, d: any, g: any): void {
    state.model_name = pick(g.model_name, d.model);
    state.ufi_ver = buildUfiVersion(d);
    let temp = normalizeTemp(d.cpu_temp);
    if (!isNum(temp)) temp = normalizeTemp(maxTemp(d.cpu_temp_list));
    state.cputemp = isNum(temp) ? roundText(temp, 1) : "--";
    state.cpuusage = isNum(toNum(d.cpu_usage)) ? roundText(toNum(d.cpu_usage), 0) : "--";
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

function buildSignalPart(state: WidgetState, d: any, g: any): void {
    const provider = pick(g.network_provider, "--");
    const netType = normNetType(g.network_type);
    state.net_summary = provider === "--" && netType === "--" ? "-- --" : provider + " " + netType;

    state.signalbar = pick(g.network_signalbar, g.signalbar, g.network_signal_bar, d.signalbar, d.signal_bars, "--");
    const signalNumeric = toNum(state.signalbar);
    if (state.signalbar !== "--" && isNum(signalNumeric) && signalNumeric < 0) state.signalbar = signalBarsFromDbm(signalNumeric);
    if (state.signalbar === "--") {
        const signalDbm = toNum(pickRaw(g.nr_rsrp, g.Z5g_rsrp, g.nr_rssi));
        if (isNum(signalDbm)) state.signalbar = signalBarsFromDbm(signalDbm);
    }

    state.rsrp_text = formatRsrp(pickRaw(g.Z5g_rsrp, g.nr_rsrp, g.nr_rssi));
    state.rsrq_text = formatMetric(pickRaw(g.nr_rsrq, g.Nr_rsrq, g.nr5g_rsrq, g.lte_rsrq));
    state.snr_text = formatMetric(pickRaw(g.Nr_snr, g.nr_snr, g.nr5g_snr, g.lte_snr));

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
    state.wifi_device_count = wifiCount > 0 ? String(wifiCount) : "0";

    state.band_text = buildBandText(g.Nr_bands, g.Lte_bands);
    state.wifi_band_text = wifiFreq > 0 ? (wifiFreq >= 4000 ? "5G" : "2.4G") : "--";
}

function buildMemoryPart(state: WidgetState, memInfo: { total: number; available: number }): void {
    const memUsedKb = (memInfo.total > 0 && memInfo.available >= 0) ? memInfo.total - memInfo.available : 0;
    state.mem_text = memInfo.total > 0 ? Math.round(memUsedKb / memInfo.total * 100) + "%" : "--";
}

// ===================== 新增：实时速率 =====================

function buildSpeedPart(state: WidgetState, d: any, g: any): void {
    const dlBps = toNum(pickRaw(g.realtime_rx_thrpt, d.realtime_rx_thrpt));
    const ulBps = toNum(pickRaw(g.realtime_tx_thrpt, d.realtime_tx_thrpt));
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
    const limitSize = toNum(pickRaw(g.data_volume_limit_size));
    const limitUnit = pickRaw(g.data_volume_limit_unit, g.data_volume_limit_switch);
    if (isNum(limitSize) && limitSize > 0) {
        const limitBytes = parseTrafficLimit(limitSize, String(limitUnit || ""));
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
        const limitBytes = parseTrafficLimit(limitSize, String(limitUnit || ""));
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

/** 解析流量限额（支持不同单位） */
function parseTrafficLimit(size: number, unit: string): number {
    if (size <= 0) return 0;
    const u = String(unit).toLowerCase();
    if (u.indexOf("gb") >= 0 || u === "1") return size * 1073741824;
    if (u.indexOf("mb") >= 0 || u === "0") return size * 1048576;
    if (u.indexOf("tb") >= 0) return size * 1099511627776;
    // 默认按 GB
    return size * 1073741824;
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
    const rsrp = toNum(pickRaw(g.Z5g_rsrp, g.nr_rsrp, g["5g_rsrp"], g.lte_rsrp, g.nr_rssi));
    const snr = toNum(pickRaw(g.Z5g_snr, g.nr_snr, g["5g_snr"], g.Nr_snr, g.lte_snr));
    const rsrq = toNum(pickRaw(g.nr_rsrq, g.Nr_rsrq, g["5g_rsrq"], g.lte_rsrq));

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
    const gb = n / 1073741824;
    if (gb >= 1) return gb.toFixed(gb >= 10 ? 1 : 2).replace(/\.0$/, "") + "GB";
    const mb = n / 1048576;
    return mb.toFixed(mb >= 10 ? 0 : 1).replace(/\.0$/, "") + "MB";
}

function splitByteText(s: string): { value: string; unit: string } {
    s = String(s === undefined || s === null ? "--" : s);
    if (s === "--" || s === "") return { value: "--", unit: "" };
    const m = s.match(/^([0-9.]+)([A-Za-z]+)$/);
    if (m) return { value: m[1], unit: m[2] };
    return { value: s, unit: "" };
}