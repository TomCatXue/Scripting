// @ts-nocheck
/// <reference path="./global.d.ts" />
import { Widget } from "scripting"
import { CPAMP_LOGO_SVG, DEEPSEEK_WHALE_SVG } from "./types"
import { brandIcon } from "./icons"
import { ModeSwitch } from "./templates"
import {
  AntigravitySmallCard,
  BentoLargeGridCard,
  CodexSmallCard,
  CpampSmallCard,
  DeepSeekSmallCard,
  FuelPriceCard,
  GitHubMediumCard,
  GoldPriceCard,
  LoonMediumCard,
  MediaNexusCard,
  VpnNodeCard,
  WaveformDashboardMediumCard,
  WorkBuddySmallCard,
} from "./cards"
import {
  getAntigravityData,
  formatPct,
  getAuxMarketData,
  getCodexData,
  getCpampData,
  getDeepSeekData,
  getFuelData,
  getGitHubData,
  getGoldData,
  getLoonData,
  getMediaNexusData,
  getVpnData,
  getWbDirectData,
  hasAntigravityConfigured,
  hasCodexConfigured,
  hasCpampConfigured,
  hasDeepSeekConfigured,
  hasGitHubConfigured,
  hasLoonConfigured,
  hasMediaConfigured,
  hasWbDirectConfigured,
  refreshAntigravityData,
  refreshCodexData,
  refreshCpampData,
  refreshDeepSeekData,
  refreshFuelData,
  refreshGitHubData,
  refreshGoldData,
  refreshLoonData,
  refreshMediaData,
  refreshVpnData,
  refreshWbDirectData,
} from "./data"

/** BENTO 模块顺序的存储键（App 内配置 / Widget 读取共享） */
export const LARGE_MODULES_KEY = "mutepanel_large_modules_v1"

/** 可选的 BENTO 模块 id（顺序即默认展示顺序） */
export const LARGE_MODULE_IDS = ["gold", "deepseek", "fx", "oil", "stock"] as const

/** BENTO 默认模块顺序 */
export const DEFAULT_LARGE_MODULES = ["gold", "deepseek", "fx", "oil"]

/**
 * 由真实走势数据计算「峰值」标签。
 *
 * 数据来源：`trend7d` 字段 —— 各服务近 7 日逐日真实数据的最大值。
 *   · DeepSeek  → /api/v0/usage/by_api_key/cost 的逐日 buckets[].cost
 *   · WorkBuddy → /api/overview 每日快照累积的「已用积分」
 *   · Codex     → rate_limit 每日快照累积的「可用额度百分比」
 *   · Antigravity → quotaInfo 每日快照累积的「可用额度百分比」
 *   · CPAMP     → dashboard/summary 每日快照累积的「当日调用量」
 *
 * @param trend   近 7 日序列；为空或全 0 时返回空串（模板会自动隐藏该标签）
 * @param suffix  单位后缀，如 "%"
 * @param prefix  前缀，如 "¥"
 */
export function peakLabel(
  trend: { label: string; value: number }[] | undefined,
  suffix = "",
  prefix = ""
): string {
  if (!Array.isArray(trend) || trend.length === 0) return ""
  const vals = trend.map((t) => Number(t?.value)).filter((v) => Number.isFinite(v))
  if (vals.length === 0) return ""
  const peak = Math.max(...vals)
  if (peak === 0) return ""
  // 按量级自适应小数位，避免两类失真：
  //   · 极小值（如 Token 用量 0.01M）被压成 "0"
  //   · 大整数（如调用量 1500 次）出现冗长小数
  const shown =
    peak >= 100
      ? Math.round(peak).toLocaleString("en-US")
      : peak >= 1
        ? (Math.round(peak * 100) / 100).toString()
        : (Math.round(peak * 10000) / 10000).toString()
  return `峰值 ${prefix}${shown}${suffix}`
}

/** 读取用户自定义的 BENTO 模块顺序，未配置时返回默认四模块 */
export function getLargeModules(): string[] {
  try {
    const saved =
      Storage.get<string[]>(LARGE_MODULES_KEY, { shared: true }) ||
      Storage.get<string[]>(LARGE_MODULES_KEY)
    if (Array.isArray(saved)) {
      const valid = saved
        .map((m) => String(m || "").trim().toLowerCase())
        .filter((m) => (LARGE_MODULE_IDS as readonly string[]).includes(m))
      if (valid.length > 0) return valid.slice(0, 4)
    }
  } catch {}
  return [...DEFAULT_LARGE_MODULES]
}

/** 保存 BENTO 模块顺序 */
export function saveLargeModules(ids: string[]): void {
  try {
    const valid = (Array.isArray(ids) ? ids : [])
      .map((m) => String(m || "").trim().toLowerCase())
      .filter((m) => (LARGE_MODULE_IDS as readonly string[]).includes(m))
    Storage.set(LARGE_MODULES_KEY, valid, { shared: true })
    Storage.set(LARGE_MODULES_KEY, valid)
  } catch {}
}

/** 全局小组件配置与偏好 */
export const CONFIG = {
  // 留空表示自动选择：优先展示已配置凭证的服务，全部未配置时回落 DeepSeek 演示数据
  // 也可手动指定："workbuddy" | "deepseek" | "codex" | "antigravity"
  smallStyle: "",
  mediumStyle: "",
  // BENTO 大号看板模块顺序：可在 App 内「BENTO 大号看板 (模块配置)」中调整
  largeModules: getLargeModules(),
}

/**
 * 未显式指定参数时的默认服务。
 * 优先选中用户已配置（有凭证/端点）的服务，避免一律回落到 DeepSeek。
 * 全部未配置时再回落到 DeepSeek 演示数据。
 */
function pickDefaultService(): string {
  try {
    const configured: [string, boolean][] = [
      ["deepseek", hasDeepSeekConfigured()],
      // WorkBuddy 已合并为单一「官方直连」数据源
      ["workbuddy", hasWbDirectConfigured()],
      ["codex", hasCodexConfigured()],
      ["antigravity", hasAntigravityConfigured()],
      ["cpamp", hasCpampConfigured()],
      ["media", hasMediaConfigured()],
      ["github", hasGitHubConfigured()],
      ["loon", hasLoonConfigured()],
    ]
    const hit = configured.find(([, ok]) => ok)
    if (hit) return hit[0]
  } catch {}
  return "deepseek"
}

/** 预览激活 ID 的有效期：超过这个时间就视为过期，不再影响真实桌面组件 */
export const PREVIEW_ACTIVE_TTL_MS = 3 * 60 * 1000

/**
 * 读取「最近一次点击预览激活的组件 ID」。
 *
 * 背景：桌面组件参数为空时，曾无条件回落这个全局键。于是只要在 App 里点过
 * 一次某个看板的「预览」，之后所有未设参数的桌面组件都会跟着变成那个看板
 * —— 这正是「部分组件误显示 WorkBuddy 积分」的根因。
 *
 * 现在加时间戳：只在**预览刚点过的一小段时间内**生效（预览流程会立刻重新
 * 渲染一次，读到即可），过期后一律忽略，让组件回到「按已配置服务自动选择」。
 */
function readActivePreviewId(): string {
  try {
    const raw =
      Storage.get<any>("dashboard_kit_preview_active_id", { shared: true }) ??
      Storage.get<any>("dashboard_kit_preview_active_id")
    if (raw && typeof raw === "object") {
      const ts = Number(raw.at)
      const id = String(raw.id || "").trim().toLowerCase()
      if (id && Number.isFinite(ts) && Date.now() - ts <= PREVIEW_ACTIVE_TTL_MS) return id
      return ""
    }
    // 兼容旧格式（纯字符串，无时间戳）：无法判断新鲜度，保守起见忽略，
    // 避免历史遗留值长期劫持所有组件。
    return ""
  } catch {
    return ""
  }
}

/**
 * 方案 A 实现逻辑：
 * 桌面小组件读取用户在长按小组件选择的参数（Widget.parameter）
 * 若未设置或设置为 "media" 则默认展示 Media Nexus，
 * 若设置为 "deepseek" / "codex" / "antigravity" / "workbuddy" / "cpamp" 则渲染对应卡片。
 */
export function getWidgetView(paramOverride?: string, familyOverride?: string) {
  let p = (paramOverride || Widget.parameter || "").trim().toLowerCase()

  // 尝试解析 Widget.parameter（如果是 JSON 字符串）
  if (p.startsWith("{") && p.endsWith("}")) {
    try {
      const parsed = JSON.parse(p)
      const val = String(parsed.id || parsed.name || parsed.default || Object.values(parsed)[0] || "").toLowerCase()
      if (val) p = val
    } catch {}
  }

  // 若仍为空，读取最近一次点击预览激活的组件 ID（仅在有效期内生效）
  if (!p) p = readActivePreviewId()
  const family = familyOverride || Widget.family

  let param = p
  if (param.startsWith("{") && param.endsWith("}")) {
    try {
      const parsed = JSON.parse(param)
      const val = String(parsed.id || parsed.name || parsed.default || Object.values(parsed)[0] || "").toLowerCase()
      if (val) param = val
    } catch {}
  }

  // 0. 支持直接匹配 ID 或中文名称
  const target = param || p
  if (target.includes("antigravity") || target === "ag" || target.includes("anti-gravity")) param = "antigravity"
  else if (target.includes("codex")) param = "codex"
  // WorkBuddy 已合并为单一「官方直连」数据源；历史参数（含旧 workbuddy-direct /
  // wbd）一律归一化到 workbuddy，保证老用户已添加到桌面的组件照常渲染。
  else if (target.includes("workbuddy") || target.includes("wb-direct") || target === "wb" || target === "wbd") param = "workbuddy"
  else if (target.includes("deepseek") || target === "ds") param = "deepseek"
  else if (target.includes("github") || target === "gh") param = "github"
  else if (target.includes("loon")) param = "loon"
  else if (target.includes("media") || target.includes("moviepilot") || target.includes("emby") || target.includes("jellyfin")) param = "media"
  else if (target.includes("cpamp") || target.includes("cpa")) param = "cpamp"
  else if (target.includes("vpn") || target.includes("node") || target.includes("ip") || target.includes("节点")) param = "vpn"
  else if (target.includes("fuel") || target.includes("oil") || target.includes("油价")) param = "fuel"
  else if (target.includes("gold") || target.includes("金价") || target.includes("黄金")) param = "gold"

  // 1. 大型组件 (Large Widget): BENTO 模块化栅格
  if (family === "systemLarge") {
    return (
      <BentoLargeGridCard
        gold={getGoldData()}
        deepseek={getDeepSeekData()}
        fuel={getFuelData()}
        fx={getAuxMarketData()}
        modules={getLargeModules()}
      />
    )
  }

  // 2. 中型组件 (Medium Widget)
  //    五套 AI 服务共用 WaveformMediumTemplate（1:1 对齐 xubai2001 原版）；
  //    金价 / 油价共用 MarketMediumTemplate（4 联卡片 + 30 日走势）。
  if (family === "systemMedium") {
    const mService = param || CONFIG.mediumStyle || pickDefaultService()
    if (mService === "github") {
      return <GitHubMediumCard data={getGitHubData()} />
    } else if (mService === "loon") {
      return <LoonMediumCard data={getLoonData()} />
    } else if (mService === "workbuddy") {
      // WorkBuddy 已合并为单一「官方直连」数据源
      const d = getWbDirectData()
      return (
        <WaveformDashboardMediumCard
          props={{
            brand: "WorkBuddy",
            iconImage: brandIcon("workbuddy"),
            mainLabel: "积分剩余总量",
            mainValue: d.mainValue || "0",
            subTag1: `已用 ${d.subValue2 || "--"}`,
            subTag2: `${d.subValue1 || "--"}${d.validDays != null ? ` · 有效期 ${d.validDays} 天` : ""}`,
            chartTitle: "近7日已用积分",
            // 峰值来源：d.trend7d（每日快照累积的已用积分）
            peakText: peakLabel(d.trend7d, ""),
            trendData: d.trend7d || [],
            lineColor: "#6366F1",
            gradient: ["#A5B4FC", "rgba(165,180,252,0)"],
            updatedAt: d.updatedAt,
          }}
        />
      )
    } else if (mService === "codex") {
      const d = getCodexData()
      return (
        <WaveformDashboardMediumCard
          props={{
            brand: "Codex",
            iconImage: brandIcon("codex"),
            mainLabel: "5小时可用额度",
            mainValue: `${formatPct(d.item1?.pct ?? 0)}%`,
            subTag1: `周额度 ${formatPct(d.item2?.pct ?? 0)}%`,
            subTag2: `可重置 ${d.stat1?.value || "0"} 次`,
            chartTitle: "近7日可用额度",
            // 峰值来源：d.trend7d（Codex rate_limit 逐日快照累积的可用额度百分比）
            peakText: peakLabel(d.trend7d, "%"),
            trendData: d.trend7d || [],
            lineColor: "#10A37F",
            gradient: ["#6EE7B7", "rgba(110,231,183,0)"],
            updatedAt: d.updatedAt,
          }}
        />
      )
    } else if (mService === "antigravity") {
      const d = getAntigravityData()
      const agMode =
        Storage.get<string>("dashboard_kit_submode_antigravity", { shared: true }) ||
        Storage.get<string>("dashboard_kit_submode_antigravity") ||
        "gemini"
      const isClaude = agMode === "claude"

      // 左侧主指标展示「周额度剩余」（与参考版式一致），
      // 而不是把「额度重置倒计时」当作主数值 —— 后者才是之前观感不合理的根因。
      const weekText = isClaude ? (d.stat2?.value || "--") : (d.stat1?.value || "--")
      const otherWeekText = isClaude ? (d.stat1?.value || "--") : (d.stat2?.value || "--")
      const fiveHourPct = isClaude ? (d.item2?.pct ?? 0) : (d.item1?.pct ?? 0)
      const mainLabel = isClaude ? "Claude/GPT 周额度剩余" : "Gemini 周额度剩余"
      const mainValue = weekText
      const subTag1 = `5h 剩余 ${formatPct(fiveHourPct)}%`
      const subTag2 = isClaude ? `Gem 周 ${otherWeekText}` : `C/G 周 ${otherWeekText}`
      const chartTitle = isClaude ? "近7日 Claude 额度" : "近7日 Gemini 额度"
      // 切换后图表数据要真正随模式变化，而不是只换配色
      const modeTrend = d.trends?.[isClaude ? "claude" : "gemini"] || d.trend7d || []

      const modeSwitchNode = (
        <ModeSwitch
          service="antigravity"
          current={agMode}
          options={[
            { key: "gemini", label: "Gemini", color: "#0091FF" },
            { key: "claude", label: "Claude", color: "#D97706" },
          ]}
        />
      )

      return (
        <WaveformDashboardMediumCard
          props={{
            brand: "Antigravity",
            iconImage: brandIcon("antigravity"),
            mainLabel,
            mainValue,
            subTag1,
            subTag2,
            chartTitle,
            modeSwitch: modeSwitchNode,
            peakText: peakLabel(modeTrend, "%"),
            trendData: modeTrend,
            lineColor: isClaude ? "#D97706" : "#0091FF",
            gradient: isClaude
              ? ["#FDE68A", "rgba(253,230,138,0)"]
              : ["#7DD3FC", "rgba(125,211,252,0)"],
            updatedAt: d.updatedAt,
          }}
        />
      )
    } else if (mService === "cpamp") {
      const d = getCpampData()
      return (
        <WaveformDashboardMediumCard
          props={{
            brand: "CPA-Manager-Plus",
            svgCode: CPAMP_LOGO_SVG,
            titleColor: { light: "#005CFF", dark: "#3B82F6" },
            mainLabel: "今日调用",
            mainValue: d.mainValue || "0",
            subTag1: `成功 ${d.subValue1 || "--"} · 失败 ${d.subValue2 || "--"}`,
            subTag2: `消耗金额 ${d.costStr || "--"}`,
            chartTitle: "近7日调用量",
            // 峰值来源：d.trend7d（CPAMP dashboard/summary 逐日快照累积的当日调用量）
            peakText: peakLabel(d.trend7d, ""),
            trendData: d.trend7d || [],
            lineColor: "#005CFF",
            gradient: ["#7EB6FF", "rgba(126,182,255,0)"],
            updatedAt: d.updatedAt,
          }}
        />
      )
    } else if (mService === "media") {
      return <MediaNexusCard data={getMediaNexusData()} />
    } else if (mService === "fuel") {
      return <FuelPriceCard data={getFuelData()} family={family} />
    } else if (mService === "gold") {
      return <GoldPriceCard data={getGoldData()} family={family} />
    } else if (mService === "vpn") {
      return <VpnNodeCard data={getVpnData()} />
    } else {
      // 默认：DeepSeek 波形看板（原版 1:1）
      const d = getDeepSeekData()
      const dsMode =
        Storage.get<string>("dashboard_kit_submode_deepseek", { shared: true }) ||
        Storage.get<string>("dashboard_kit_submode_deepseek") ||
        "cost"
      const isBalance = dsMode === "balance"

      // 与 xubai2001 原版一致：两个模式是「余额 / Token」，不是「余额 / 消费」
      const modeSwitchNode = (
        <ModeSwitch
          service="deepseek"
          current={isBalance ? "balance" : "tokens"}
          options={[
            { key: "balance", label: "余额", color: "#2563EB" },
            { key: "tokens", label: "Token", color: "#10B981" },
          ]}
        />
      )
      const dsTrend = d.trends?.[isBalance ? "balance" : "tokens"] || d.trend7d || []

      return (
        <WaveformDashboardMediumCard
          props={{
            brand: "deepseek",
            svgCode: DEEPSEEK_WHALE_SVG,
            titleColor: { light: "#4D6BFE", dark: "#7C93FF" },
            mainLabel: "账户余额",
            symbol: d.prefix || "¥",
            mainValue: d.mainValue || "0.00",
            subTag1: `累计消费 ${d.totalCostText || "--"}`,
            subTag2: `近7日消耗 ${d.subValue2 || "--"}`,
            chartTitle: isBalance ? "近7天余额" : "近7天用量 (M)",
            modeSwitch: modeSwitchNode,
            // 峰值来源：当前模式对应的走势序列
            peakText: peakLabel(dsTrend, isBalance ? "" : "M", isBalance ? d.prefix || "¥" : ""),
            trendData: dsTrend,
            lineColor: isBalance ? "#2563EB" : "#10B981",
            gradient: isBalance
              ? ["#8AB4FF", "rgba(138,180,255,0)"]
              : ["#6EE7B7", "rgba(110,231,183,0)"],
            updatedAt: d.updatedAt,
          }}
        />
      )
    }
  }

  // 3. 小型组件 (Small Widget)
  const sService = param || CONFIG.smallStyle || pickDefaultService()
  if (sService === "workbuddy") {
    return <WorkBuddySmallCard data={getWbDirectData()} />
  } else if (sService === "codex") {
    return <CodexSmallCard data={getCodexData()} />
  } else if (sService === "antigravity") {
    return <AntigravitySmallCard data={getAntigravityData()} />
  } else if (sService === "cpamp") {
    return <CpampSmallCard data={getCpampData()} />
  } else if (sService === "vpn") {
    return <VpnNodeCard data={getVpnData()} />
  } else if (sService === "fuel") {
    return <FuelPriceCard data={getFuelData()} family={family} />
  } else if (sService === "gold") {
    return <GoldPriceCard data={getGoldData()} family={family} />
  } else {
    return <DeepSeekSmallCard data={getDeepSeekData()} />
  }
}

export default function DefaultWidget() {
  return getWidgetView()
}

async function main() {
  // 小组件唤醒执行时，后台轻量触发一次全局配额静默刷新（若有配置），拉取最新真实数据
  try {
    let p = (Widget.parameter || "").trim().toLowerCase()
    if (!p) p = readActivePreviewId()
    if (p.includes("antigravity") || p === "ag" || p.includes("anti-gravity")) {
      await refreshAntigravityData().catch(() => null)
    } else if (p.includes("codex")) {
      await refreshCodexData().catch(() => null)
    } else if (p.includes("deepseek") || p === "ds") {
      await refreshDeepSeekData().catch(() => null)
    } else if (p.includes("workbuddy") || p.includes("wb-direct") || p === "wb" || p === "wbd") {
      // WorkBuddy 已合并为单一「官方直连」数据源
      await refreshWbDirectData().catch(() => null)
    } else if (p.includes("media") || p.includes("moviepilot") || p.includes("emby") || p.includes("jellyfin")) {
      await refreshMediaData().catch(() => null)
    } else if (p.includes("cpamp")) {
      await refreshCpampData().catch(() => null)
    } else if (p.includes("vpn") || p.includes("node") || p.includes("ip")) {
      await refreshVpnData().catch(() => null)
    } else if (p.includes("fuel") || p.includes("oil") || p.includes("油价")) {
      await refreshFuelData().catch(() => null)
    } else if (p.includes("github") || p === "gh") {
      await refreshGitHubData().catch(() => null)
    } else if (p.includes("loon")) {
      await refreshLoonData().catch(() => null)
    } else if (p.includes("gold") || p.includes("黄金") || p.includes("金价")) {
      await refreshGoldData().catch(() => null)
    } else {
      // 未带参数时，优先按默认组件刷新
      if (Widget.family === "systemMedium" || Widget.family === "systemLarge") {
        await Promise.all([
          refreshGoldData().catch(() => null),
          refreshDeepSeekData().catch(() => null),
          refreshFuelData().catch(() => null),
        ])
      } else {
        await refreshDeepSeekData().catch(() => null)
      }
    }
  } catch {}

  const view = getWidgetView()
  // 设置 15 分钟系统 timeline 自动刷新（policy: "after"）
  Widget.present(view, {
    policy: "after",
    date: new Date(Date.now() + 15 * 60 * 1000),
  })
}

main().catch((e) => {
  console.log("Widget render error:", e)
})
