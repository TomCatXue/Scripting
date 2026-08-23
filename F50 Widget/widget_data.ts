// @ts-nocheck
// F50 Widget 数据层：将 API 原始数据组装为小组件状态，并提供缓存读写与格式化工具
import { Storage } from "scripting";
import { fetchDeviceInfo, fetchGoformAll, fetchSystemInfo } from "./api";

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
}

const CACHE_KEY = "F50Widget.widget.cache.v4";

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
    };
}

/** 组装小组件展示状态（绑定设备信息 + goform 字段 + 系统信息） */
export function buildState(deviceInfo: any, goformData: any, wifiFreq: number, memInfo: { total: number; available: number }): WidgetState {
    const state = emptyState();
    const d = deviceInfo || {};
    const g = goformData || {};

    state.model_name = pick(g.model_name, d.model);
    state.ufi_ver = buildUfiVersion(d);

    let temp = normalizeTemp(d.cpu_temp);
    if (!isNum(temp)) temp = normalizeTemp(maxTemp(d.cpu_temp_list));
    state.cputemp = isNum(temp) ? roundText(temp, 1) : "--";
    state.cpuusage = isNum(toNum(d.cpu_usage)) ? roundText(toNum(d.cpu_usage), 0) : "--";

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

    const memUsedKb = (memInfo.total > 0 && memInfo.available >= 0) ? memInfo.total - memInfo.available : 0;
    state.mem_text = memInfo.total > 0 ? Math.round(memUsedKb / memInfo.total * 100) + "%" : "--";

    state.update_time = makeUpdateTime();
    return state;
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
    const [deviceResult, goformResult, systemResult] = await Promise.allSettled([
        fetchDeviceInfo(),
        fetchGoformAll(),
        fetchSystemInfo(),
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