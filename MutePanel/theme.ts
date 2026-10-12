// @ts-nocheck
// ============================================================
// 哑巴面板设计主题与色彩系统
// 严格遵循 Apple HIG 规范与动态浅色/深色模式高对比度要求
// ============================================================

export const THEME = {
  // 文字体系：浅色深灰黑 #1C1C1E，深色纯白高对比度 #FFFFFF
  text: { light: "#1C1C1E", dark: "#FFFFFF" } as any,
  // 二级文字：浅色中灰 #48484A，深色淡灰 #EBEBF5
  muted: { light: "#48484A", dark: "#EBEBF5" } as any,
  // 辅助说明与标签：浅色 #8E8E93，深色 #A1A1A6
  dim: { light: "#8E8E93", dark: "#A1A1A6" } as any,
  
  // 核心色彩
  accent: { light: "#007AFF", dark: "#0A84FF" } as any,
  blue: { light: "#007AFF", dark: "#0A84FF" } as any,
  green: { light: "#34C759", dark: "#30D158" } as any,
  orange: { light: "#FF9500", dark: "#FF9F0A" } as any,
  yellow: { light: "#FFCC00", dark: "#FFD60A" } as any,
  red: { light: "#FF3B30", dark: "#FF453A" } as any,
  purple: { light: "#AF52DE", dark: "#BF5AF2" } as any,

  // 专属黄金主题色：浅色 #D4AF37，深色 #FFD700
  gold: { light: "#D4AF37", dark: "#FFD700" } as any,

  // 轨道槽底色与边框
  track: { light: "#E5E5EA", dark: "#2C2C2E" } as any,
  border: { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.12)" } as any,
  /**
   * 不透明边框色：需要「所有边看起来完全同色」时使用。
   *
   * `border` 是半透明黑/白，叠在不同底色上会呈现不同灰度 —— 卡片背景为浅灰、
   * 系统背景为白时，同一条边会一边显白一边显灰。这里用不透明灰避免该问题。
   */
  borderSolid: { light: "#D9D9DE", dark: "#3A3A3C" } as any,
  /** 轻微填充底色（用于刷新按钮底、标签底等需要「淡一档」的表面） */
  fill: { light: "rgba(120,120,128,0.12)", dark: "rgba(120,120,128,0.24)" } as any,

  // 卡片背景与整体面板背景
  cardBg: { light: "#F2F2F7", dark: "#1C1C1E" } as any,
  bg: {
    light: {
      gradient: [
        { color: "#FFFFFF", location: 0 },
        { color: "#F8F9FA", location: 1 },
      ],
      startPoint: { x: 0.5, y: 0 },
      endPoint: { x: 0.5, y: 1 },
    },
    dark: {
      gradient: [
        { color: "#161719", location: 0 },
        { color: "#111214", location: 1 },
      ],
      startPoint: { x: 0.5, y: 0 },
      endPoint: { x: 0.5, y: 1 },
    },
  } as any,
}

// 线性插值颜色（随数值平滑变色）
export function lerpHex(a: string, b: string, t: number): string {
  const px = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = px(a)
  const [r2, g2, b2] = px(b)
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0")
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`
}

const REMAIN_STOPS: [number, string][] = [
  [0, "#EF4444"],
  [25, "#F97316"],
  [45, "#F59E0B"],
  [70, "#10B981"],
  [100, "#10B981"],
]

export function remainColor(pct: number): any {
  const v = Math.max(0, Math.min(100, pct))
  for (let i = 0; i < REMAIN_STOPS.length - 1; i++) {
    const [p0, c0] = REMAIN_STOPS[i]
    const [p1, c1] = REMAIN_STOPS[i + 1]
    if (v >= p0 && v <= p1) {
      const t = p1 > p0 ? (v - p0) / (p1 - p0) : 0
      return lerpHex(c0, c1, t) as any
    }
  }
  return REMAIN_STOPS[REMAIN_STOPS.length - 1][1] as any
}

/**
 * 把强调色转成同色系的低饱和底：用于胶囊标签、徽章等需要「淡一档」的表面。
 *
 * 直接给标签填满品牌色会盖过高亮文字，而固定写死 rgba 又无法跟随主题。
 * 这里按当前外观把色相拉到低透明度，浅色背景上仍是柔和的淡色底。
 */
export function softTint(color: any, alphaLight = 0.12, alphaDark = 0.2): any {
  const hexOf = (v: any): string | null => {
    if (typeof v === "string") return v
    if (v && typeof v === "object" && typeof v.light === "string") return v.light
    return null
  }
  const toRgba = (hex: string, alpha: number) => {
    const m = /^#?([\da-f]{6})$/i.exec(String(hex).trim())
    if (!m) return hex
    const n = parseInt(m[1], 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
  }
  const lightSrc = hexOf(color)
  const darkSrc =
    (color && typeof color === "object" && typeof color.dark === "string"
      ? color.dark
      : lightSrc) || lightSrc
  if (!lightSrc || !darkSrc) return color
  return {
    light: toRgba(lightSrc, alphaLight),
    dark: toRgba(darkSrc, alphaDark),
  }
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function formatTime(isoOrTimestamp: string | number): string {
  const d =
    typeof isoOrTimestamp === "number"
      ? new Date(isoOrTimestamp)
      : new Date(isoOrTimestamp)
  if (Number.isNaN(d.getTime())) return "--:--"
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatNumber(v: number): string {
  return Number(v || 0).toLocaleString("en-US")
}

/**
 * 额度百分比格式化：统一保留 1 位小数（如 96 → "96.0"、83.456 → "83.5"）。
 * 避免整数值四舍五入后丢失小数位（例如 95.6% 被显示成 96%）。
 */
export function formatPct(v: number): string {
  const n = Number.isFinite(v) ? v : 0
  return (Math.round(n * 10) / 10).toFixed(1)
}

/**
 * Apple HIG 规范标准字排印与尺寸 Token
 * 严格遵循 iOS Dynamic Type 比例尺与统一边距，全面清除 < 10pt 亚像素微字
 */
export const HIG_FONT = {
  heroNumber: 28,      // 仪表盘核心大数值 (原 34pt 缩小避免在小屏溢出并留白)
  statLarge: 20,       // 中号卡片关键看板数字
  title: 15,           // 卡片主标题 / 关键分类名
  headline: 13,        // 次级标题 / 栏目标题 / 榜单标题
  body: 13,            // 常规说明文本 / 数据副标签
  subhead: 12,         // 紧凑标签与说明
  caption: 11,         // 次要信息 / 辅助指标数值 (Apple HIG 标准底线字号)
  captionSmall: 10,    // 极紧凑状态标识 / 时间戳 (严禁低于 10pt)
}
