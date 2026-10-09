// @ts-nocheck
/// <reference path="./global.d.ts" />
import { Widget } from "scripting"
import { DEEPSEEK_LOGO_SVG } from "./types"
import {
  AntigravitySmallCard,
  BentoLargeGridCard,
  CodexSmallCard,
  DeepSeekSmallCard,
  DualQuotaCard,
  FuelPriceCard,
  GoldPriceCard,
  MediaNexusCard,
  MetricBalanceCard,
  VpnNodeCard,
  WaveformDashboardMediumCard,
  WorkBuddySmallCard,
} from "./cards"
import {
  getAntigravityData,
  getCodexData,
  getCpampData,
  getDeepSeekData,
  getFuelData,
  getGoldData,
  getMediaNexusData,
  getVpnData,
  getWorkBuddyData,
  refreshAntigravityData,
  refreshCodexData,
  refreshCpampData,
  refreshDeepSeekData,
  refreshFuelData,
  refreshGoldData,
  refreshMediaData,
  refreshVpnData,
  refreshWorkBuddyData,
} from "./data"

/** 全局小组件配置与偏好 */
export const CONFIG = {
  smallStyle: "deepseek",  // "workbuddy" | "deepseek" | "codex" | "antigravity"
  mediumStyle: "deepseek", // "deepseek" | "workbuddy" | "codex" | "antigravity"
  largeModules: ["gold", "deepseek", "fx", "oil"],
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

  // 若仍为空，读取最近一次点击预览激活的组件 ID
  if (!p) {
    p = (
      Storage.get<string>("dashboard_kit_preview_active_id", { shared: true }) ||
      Storage.get<string>("dashboard_kit_preview_active_id") ||
      ""
    ).trim().toLowerCase()
  }

  const activePath = FileManager.appGroupDocumentsDirectory + "/dashboard_kit_preview_active.txt"
  if (!p && FileManager.existsSync(activePath)) {
    try {
      p = (FileManager.readAsStringSync(activePath) || "").trim().toLowerCase()
    } catch {}
  }
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
  else if (target.includes("workbuddy") || target === "wb") param = "workbuddy"
  else if (target.includes("deepseek") || target === "ds") param = "deepseek"
  else if (target.includes("media") || target.includes("moviepilot") || target.includes("emby") || target.includes("jellyfin")) param = "media"
  else if (target.includes("cpamp") || target.includes("cpa")) param = "cpamp"
  else if (target.includes("vpn") || target.includes("node") || target.includes("ip") || target.includes("节点")) param = "vpn"
  else if (target.includes("fuel") || target.includes("oil") || target.includes("油价")) param = "fuel"
  else if (target.includes("gold") || target.includes("金价") || target.includes("黄金")) param = "gold"

  // 1. 大型组件 (Large Widget): 2x2 Bento 模块化网格
  if (family === "systemLarge") {
    return (
      <BentoLargeGridCard
        gold={getGoldData()}
        deepseek={getDeepSeekData()}
        fuel={getFuelData()}
        modules={CONFIG.largeModules}
      />
    )
  }

  // 2. 中型组件 (Medium Widget): 全部 4 大核心服务均支持原版通栏平滑贝塞尔波形图
  if (family === "systemMedium") {
    const mService = param || CONFIG.mediumStyle
    if (mService === "workbuddy") {
      const d = getWorkBuddyData()
      return (
        <WaveformDashboardMediumCard
          props={{
            title: "WorkBuddy",
            iconPath: { light: "assets/workbuddy-icon-light.png", dark: "assets/workbuddy-icon-dark.png" },
            mainLabel: "积分剩余总量",
            mainValue: d.mainValue || "12,164",
            subTag1: `已用 ${d.subValue2 || "7,796"}`,
            subTag2: `已签 ${d.subValue1 || "0/4"} · 有效期 ${d.footerLeft || "51天"}`,
            chartTitle: "近7日消耗趋势",
            peakText: "峰值 1,300",
            trendData: [
              { label: "7天前", value: 820 },
              { label: "5天前", value: 1140 },
              { label: "3天前", value: 950 },
              { label: "前天", value: 1300 },
              { label: "昨日", value: 1020 },
              { label: "今日", value: 890 },
            ],
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
            title: "Codex",
            iconPath: { light: "assets/codex-light.png", dark: "assets/codex-dark.png" },
            mainLabel: "5小时可用额度",
            mainValue: `${Math.round(d.item1?.pct ?? 83)}%`,
            subTag1: `周额度 ${Math.round(d.item2?.pct ?? 0)}%`,
            subTag2: `可重置 ${d.stat1?.value || "0次"} · 剩余 ${d.stat2?.value || "83%"}`,
            chartTitle: "近7日配额占用",
            peakText: "峰值 90%",
            trendData: [
              { label: "7天前", value: 45 },
              { label: "5天前", value: 60 },
              { label: "3天前", value: 80 },
              { label: "前天", value: 65 },
              { label: "昨日", value: 90 },
              { label: "今日", value: 83 },
            ],
            lineColor: "#10A37F",
            gradient: ["#6EE7B7", "rgba(110,231,183,0)"],
            updatedAt: d.updatedAt,
          }}
        />
      )
    } else if (mService === "antigravity") {
      const d = getAntigravityData()
      return (
        <WaveformDashboardMediumCard
          props={{
            title: "Antigravity",
            iconPath: { light: "assets/antigravity-light.png", dark: "assets/antigravity-dark.png" },
            mainLabel: "Gemini 冷却倒计时",
            mainValue: d.item1?.timer || "12m",
            subTag1: `Claude/GPT ${d.item2?.timer || "4h59m"}`,
            subTag2: `Gem周 ${Math.round(d.item1?.pct ?? 82)}% · 最新 39%`,
            chartTitle: "近7日调用走势",
            peakText: "峰值 75%",
            trendData: [
              { label: "7天前", value: 20 },
              { label: "5天前", value: 45 },
              { label: "3天前", value: 75 },
              { label: "前天", value: 50 },
              { label: "昨日", value: 65 },
              { label: "今日", value: 39 },
            ],
            lineColor: "#0091FF",
            gradient: ["#7DD3FC", "rgba(125,211,252,0)"],
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
    } else {
      // 默认展示 DeepSeek 1:1 原版平滑贝塞尔波形图看板
      const d = getDeepSeekData()
      return (
        <WaveformDashboardMediumCard
          props={{
            title: "deepseek",
            svgCode: DEEPSEEK_LOGO_SVG,
            mainLabel: "账户余额",
            symbol: "¥",
            mainValue: d.mainValue || "1.86",
            subTag1: `累计消费 ${d.subValue2 || "¥ 5.39"}`,
            subTag2: `7天消耗 ¥ 0.42 · 正常`,
            chartTitle: "近7天余额",
            peakText: "峰值 ¥ 1.86",
            trendData: [
              { label: "7天前", value: 1.20 },
              { label: "5天前", value: 1.45 },
              { label: "3天前", value: 0.90 },
              { label: "前天", value: 1.60 },
              { label: "昨日", value: 1.86 },
              { label: "今日", value: 1.86 },
            ],
            lineColor: "#2563EB",
            gradient: ["#8AB4FF", "rgba(138,180,255,0)"],
            updatedAt: d.updatedAt,
          }}
        />
      )
    }
  }

  // 3. 小型组件 (Small Widget): 4 套精细化像素级模板
  const sService = param || CONFIG.smallStyle
  if (sService === "workbuddy") {
    return <WorkBuddySmallCard data={getWorkBuddyData()} />
  } else if (sService === "codex") {
    return <CodexSmallCard data={getCodexData()} />
  } else if (sService === "antigravity") {
    return <AntigravitySmallCard data={getAntigravityData()} />
  } else if (sService === "cpamp") {
    return <MetricBalanceCard data={getCpampData()} />
  } else if (sService === "vpn") {
    return <VpnNodeCard data={getVpnData()} />
  } else if (sService === "fuel") {
    return <FuelPriceCard data={getFuelData()} family={family} />
  } else if (sService === "gold") {
    return <GoldPriceCard data={getGoldData()} family={family} />
  } else {
    // 默认展示 DeepSeek 小型模板
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
    if (!p) {
      p = (
        Storage.get<string>("dashboard_kit_preview_active_id", { shared: true }) ||
        Storage.get<string>("dashboard_kit_preview_active_id") ||
        ""
      ).trim().toLowerCase()
    }
    const activePath = FileManager.appGroupDocumentsDirectory + "/dashboard_kit_preview_active.txt"
    if (!p && FileManager.existsSync(activePath)) {
      try {
        p = (FileManager.readAsStringSync(activePath) || "").trim().toLowerCase()
      } catch {}
    }
    if (p.includes("antigravity") || p === "ag" || p.includes("anti-gravity")) {
      await refreshAntigravityData().catch(() => null)
    } else if (p.includes("codex")) {
      await refreshCodexData().catch(() => null)
    } else if (p.includes("deepseek") || p === "ds") {
      await refreshDeepSeekData().catch(() => null)
    } else if (p.includes("workbuddy") || p === "wb") {
      await refreshWorkBuddyData().catch(() => null)
    } else if (p.includes("media") || p.includes("moviepilot") || p.includes("emby") || p.includes("jellyfin")) {
      await refreshMediaData().catch(() => null)
    } else if (p.includes("cpamp")) {
      await refreshCpampData().catch(() => null)
    } else if (p.includes("vpn") || p.includes("node") || p.includes("ip")) {
      await refreshVpnData().catch(() => null)
    } else if (p.includes("fuel") || p.includes("oil") || p.includes("油价")) {
      await refreshFuelData().catch(() => null)
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
