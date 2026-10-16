// @ts-nocheck
// F50 Widget 设计系统：间距 / 圆角 / 字号 / 语义色 token + 外观偏好读写
//
// 颜色统一使用「浅色 + 深色」双值（Scripting 的 DynamicShapeStyle），
// 由系统自动切换，避免手写 prefers-color-scheme 判断。

// ===================== 尺寸 token =====================

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const RADIUS = { chip: 8, card: 14, group: 18, pill: 999 } as const;

/** 字号（遵循 iOS Dynamic Type 常规档位，最小 10pt 以保证可读性） */
export const FONT = {
    caption: 11,
    footnote: 12,
    body: 14,
    callout: 15,
    headline: 16,
    title: 17,
    title2: 20,
    title3: 22,
    largeTitle: 30,
    metric: 26,
} as const;

// ===================== 语义色 =====================

type SchemeColor = { light: string; dark: string };

export const THEME = {
    color: {
        accent: { light: "#007AFF", dark: "#0A84FF" } as SchemeColor,
        success: { light: "#34C759", dark: "#30D158" } as SchemeColor,
        warning: { light: "#FF9500", dark: "#FF9F0A" } as SchemeColor,
        danger: { light: "#FF3B30", dark: "#FF453A" } as SchemeColor,
        info: { light: "#00C7BE", dark: "#63E6E2" } as SchemeColor,
    },
    /** 卡片背景：浅色略灰于系统背景，深色略亮于纯黑 */
    card: { light: "#F2F2F7", dark: "#1C1C1E" } as SchemeColor,
    /** 页面背景渐变 */
    background: {
        light: {
            gradient: [
                { color: "#F7F8FA", location: 0 },
                { color: "#EDEFF3", location: 1 },
            ],
            startPoint: { x: 0.5, y: 0 },
            endPoint: { x: 0.5, y: 1 },
        },
        dark: {
            gradient: [
                { color: "#141517", location: 0 },
                { color: "#0E0F11", location: 1 },
            ],
            startPoint: { x: 0.5, y: 0 },
            endPoint: { x: 0.5, y: 1 },
        },
    },
    /** 细描边 */
    border: { light: "rgba(60,60,67,0.10)", dark: "rgba(255,255,255,0.12)" } as SchemeColor,
} as const;

/** 预设强调色（用户可在设置中一键切换） */
export const ACCENT_PRESETS: Array<{ id: string; name: string; light: string; dark: string }> = [
    { id: "blue", name: "科技蓝", light: "#007AFF", dark: "#0A84FF" },
    { id: "cyan", name: "青蓝", light: "#00A3A3", dark: "#3DD6D0" },
    { id: "green", name: "松绿", light: "#248A3D", dark: "#30D158" },
    { id: "orange", name: "琥珀", light: "#C93400", dark: "#FF9F0A" },
    { id: "graphite", name: "石墨", light: "#48484A", dark: "#8E8E93" },
];

// ===================== 存储（Storage 不可用时退回内存，保证测试与 Widget 上下文可运行） =====================

const memoryStore: Record<string, string> = {};

function hasScriptingStorage(): boolean {
    const s = (globalThis as any).Storage;
    return !!s && typeof s.get === "function" && typeof s.set === "function";
}

function readStored(key: string): string | null {
    try {
        if (hasScriptingStorage()) {
            const raw = (globalThis as any).Storage.get(key);
            return raw === undefined || raw === null ? null : String(raw);
        }
    } catch (_) {
        // 存储异常时退回内存，避免整个 UI 崩溃
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
}

function writeStored(key: string, value: string): void {
    memoryStore[key] = value;
    try {
        if (hasScriptingStorage()) (globalThis as any).Storage.set(key, value);
    } catch (_) {
        // 忽略：内存副本仍保留本次会话内的设置
    }
}

const KEY_ACCENT = "F50.accent";
const KEY_APPEARANCE = "F50.appearance";
const KEY_MOTION = "F50.motion";

export type Appearance = "system" | "light" | "dark";
export type MotionLevel = "full" | "reduced";

export function loadAccent(): string {
    const raw = readStored(KEY_ACCENT);
    if (raw === null) return "";
    const value = String(raw).trim();
    return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "";
}

export function saveAccent(hex: string): void {
    const value = String(hex === undefined || hex === null ? "" : hex).trim();
    if (value !== "" && !/^#[0-9A-Fa-f]{6}$/.test(value)) return;
    writeStored(KEY_ACCENT, value);
}

export function loadAppearance(): Appearance {
    const raw = readStored(KEY_APPEARANCE);
    return raw === "light" || raw === "dark" ? raw : "system";
}

export function saveAppearance(mode: Appearance): void {
    if (mode !== "light" && mode !== "dark" && mode !== "system") {
        writeStored(KEY_APPEARANCE, "system");
        return;
    }
    writeStored(KEY_APPEARANCE, mode);
}

export function loadMotion(): MotionLevel {
    return readStored(KEY_MOTION) === "reduced" ? "reduced" : "full";
}

export function saveMotion(level: MotionLevel): void {
    writeStored(KEY_MOTION, level === "reduced" ? "reduced" : "full");
}

// ===================== 颜色工具 =====================

/** 用户未设置强调色时的默认值 */
export function resolveAccent(hex: string): string {
    const value = String(hex === undefined || hex === null ? "" : hex).trim();
    return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : THEME.color.accent.light;
}

/** 按当前配色方案取强调色（预设色在深浅色下各有一档，避免深色刺眼） */
export function accentForScheme(hex: string, scheme: "light" | "dark"): string {
    const value = resolveAccent(hex);
    for (const preset of ACCENT_PRESETS) {
        if (value.toLowerCase() === preset.light.toLowerCase() || value.toLowerCase() === preset.dark.toLowerCase()) {
            return scheme === "dark" ? preset.dark : preset.light;
        }
    }
    return value;
}

/** hex → rgba；非 hex 输入原样返回 */
export function softTint(hex: string, alpha = 0.15): string {
    const value = String(hex === undefined || hex === null ? "" : hex).trim();
    const match = /^#([0-9A-Fa-f]{6})$/.exec(value);
    if (!match) return value;
    const n = parseInt(match[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
}
