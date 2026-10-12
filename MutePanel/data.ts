// @ts-nocheck
/// <reference path="./global.d.ts" />
import { fetch, Device } from "scripting"
import { formatPct } from "./theme"
import {
  LEGACY_ACCOUNT_ID,
  enabledAccounts,
  getAccountCredential,
  hasAnyConfiguredAccount,
  setAccountCredential,
} from "./accounts"
import {
  accountNote,
  aggregateQuota,
  aggregateSum,
  balanceSeriesFromCost,
  currencySymbol,
  dominantCurrency,
  mergeDayCosts,
} from "./aggregate"
import {
  type WbDirectCredential,
  isCredentialStale,
  isRefreshExpired,
  mergeRefreshedCredential,
  parseWbDirectCredential,
  sumWbCredits,
  wbDirectCreditsHeaders,
  wbDirectCreditsUrl,
  wbDirectRefreshHeaders,
  wbDirectRefreshUrl,
} from "./wb_direct"

export { formatPct }

import {
  DEFAULT_ANTIGRAVITY,
  DEFAULT_CODEX,
  DEFAULT_CPAMP,
  DEFAULT_DEEPSEEK,
  DEFAULT_MEDIA_NEXUS,
  DEFAULT_VPN,
  DEFAULT_WORKBUDDY_DIRECT,
  DEFAULT_FUEL,
  DEFAULT_GOLD,
  DEFAULT_AUX_MARKET,
  DEFAULT_GITHUB,
  DEFAULT_LOON,
  type DualQuotaData,
  type FuelCardData,
  type GoldMarketData,
  type AuxiliaryMarketData,
  type MediaNexusData,
  type MetricBalanceData,
  type VpnNodeData,
  type GitHubMonitorData,
  type GitHubContributions,
  type LoonMonitorData,
} from "./types"

// ============================================================
// 数据服务层：聚合各模块真实数据，优雅回落 Mock
// ============================================================

// ── 通用：近 7 日时间轴工具 ──────────────────────────────────────
// 所有走势图统一使用「北京时间自然日」作为分桶单位，保证各服务时间轴一致。

/** 北京时间某日 0 点的秒级时间戳（UTC+8） */
function bjDayStartSec(offsetDays = 0): number {
  const now = Date.now()
  const bj = now + 8 * 3600 * 1000 + offsetDays * 86400 * 1000
  const dayStartBj = Math.floor(bj / 86400000) * 86400000
  return Math.floor((dayStartBj - 8 * 3600 * 1000) / 1000)
}

/** 生成近 N 天的时间轴（含今天），返回秒级时间戳与 MM-DD 标签 */
export function recentDays(n = 7): { time: number; label: string }[] {
  const out: { time: number; label: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const time = bjDayStartSec(-i)
    const d = new Date((time + 8 * 3600) * 1000)
    const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
    out.push({ time, label })
  }
  return out
}

/**
 * 把「按天累计的原始值」映射到近 N 天时间轴。
 * `byDay` 为 秒级时间戳 → 数值 的映射；缺失的日期填 0。
 * 这样保证横轴恒定 7 个点，走势图不会因为缺数据而断图。
 */
export function toDailySeries(
  byDay: Map<number, number>,
  n = 7
): { label: string; value: number }[] {
  return recentDays(n).map((d) => ({
    label: d.label,
    value: Math.round((byDay.get(d.time) ?? 0) * 100) / 100,
  }))
}

/**
 * Token 数序列 → 以「百万(M)」为单位的序列。
 *
 * 与 xubai2001「DeepSeek 用量」原版 TokenTrendChart 的 `d.tokens / 1e6` 口径一致：
 * 中号图表的坐标与峰值都必须用 M，否则会把 9863 个 Token 显示成 9863（应为 0.01M）。
 */
function tokensInMillions(
  series: { label: string; value: number }[]
): { label: string; value: number }[] {
  return series.map((d) => ({
    label: d.label,
    value: Math.round((Number(d.value) / 1e6) * 100) / 100,
  }))
}

// ── 通用：快照式历史累积 ─────────────────────────────────────────
// 部分服务（WorkBuddy / Codex / Antigravity / CPAMP）的接口只返回「当前值」，
// 没有逐日历史。此时在本地按「每个自然日记录一次快照」的方式累积真实历史：
//   · 同一天多次刷新 → 覆盖当天快照（保留当天最后一次真实值）
//   · 跨天 → 追加新快照
//   · 最多保留 30 天
// 这样走势图完全由真实采样数据构成，不存在任何随机或编造值。

/** 读取某个 key 的快照历史（秒级日时间戳 → 数值） */
export function readSnapshotHistory(key: string): Map<number, number> {
  try {
    const raw =
      Storage.get<Record<string, number>>(key, { shared: true }) ||
      Storage.get<Record<string, number>>(key)
    if (raw && typeof raw === "object") {
      const m = new Map<number, number>()
      for (const [k, v] of Object.entries(raw)) {
        const t = Number(k)
        const n = Number(v)
        if (Number.isFinite(t) && Number.isFinite(n)) m.set(t, n)
      }
      return m
    }
  } catch {}
  return new Map<number, number>()
}

/** 写入当天快照并返回完整历史（最多 30 天） */
export function pushSnapshot(key: string, value: number): Map<number, number> {
  const m = readSnapshotHistory(key)
  if (!Number.isFinite(value)) return m
  m.set(bjDayStartSec(0), value)
  // 裁剪到最近 30 天
  const keep = new Set(recentDays(30).map((d) => d.time))
  for (const t of [...m.keys()]) if (!keep.has(t)) m.delete(t)
  try {
    const obj: Record<string, number> = {}
    for (const [k, v] of m) obj[String(k)] = v
    Storage.set(key, obj, { shared: true })
    Storage.set(key, obj)
  } catch {}
  return m
}

/**
 * 把快照历史映射为近 N 天序列。
 *
 * 缺失日期用「最近一次已知值」补齐（前向填充），**首个快照之前**的空白
 * 则用「首个已知值」回填（后向填充）。
 *
 * 为什么不能填 0：新配置的账号只有今天一个快照，若前面 6 天填 0，中号图表会
 * 渲染成「6 天贴着 0 的水平线 + 末日一根尖峰」，看起来就像「走势显示不全」。
 * 回填首个已知值后，未知历史呈现为一条平线，真实变化仍如实体现，观感诚实。
 */
export function snapshotSeries(key: string, n = 7): { label: string; value: number }[] {
  const m = readSnapshotHistory(key)
  const days = recentDays(n)
  const values = days.map((d) => m.get(d.time))
  const firstKnown = values.find((v): v is number => v !== undefined)
  const out: { label: string; value: number }[] = []
  let last = firstKnown ?? 0
  for (let i = 0; i < days.length; i++) {
    const v = values[i]
    if (v !== undefined) last = v
    out.push({ label: days[i].label, value: last })
  }
  return out
}

// 1. DeepSeek 常量
export const DEEPSEEK_TOKEN_KEY = "dashboard_kit_deepseek_token"
export const DEEPSEEK_CACHE_KEY = "dashboard_kit_deepseek_cache_v1"

// 快照式历史存储键（无逐日接口的服务使用）
export const TREND_KEY_WORKBUDDY = "mutepanel_trend_workbuddy_v1"
export const TREND_KEY_CODEX = "mutepanel_trend_codex_v1"
export const TREND_KEY_ANTIGRAVITY = "mutepanel_trend_antigravity_v1"
// Antigravity 分指标走势（供中号 Gemini/Claude 切换各自展示）
export const TREND_KEY_ANTIGRAVITY_GEMINI = "mutepanel_trend_antigravity_gemini_v1"
export const TREND_KEY_ANTIGRAVITY_CLAUDE = "mutepanel_trend_antigravity_claude_v1"
export const TREND_KEY_CPAMP = "mutepanel_trend_cpamp_v1"
const DEEPSEEK_USAGE_STORE_PATH =
  FileManager.appGroupDocumentsDirectory + "/deepseek_usage_keys.json"
const DEEPSEEK_PANEL_KEY_PATH =
  FileManager.appGroupDocumentsDirectory + "/deepseek_api_key.txt"
const DEEPSEEK_LEGACY_CACHE_PATH =
  FileManager.appGroupDocumentsDirectory + "/deepseek_widget_cache.json"

// 2. WorkBuddy 官方直连（OAuth 凭据，多账号）
export const TREND_KEY_WB_DIRECT = "mutepanel_trend_wb_direct_v1"
export const WB_DIRECT_CACHE_KEY = "dashboard_kit_wb_direct_cache_v1"
export const WB_DIRECT_FILE_CACHE_PATH =
  FileManager.appGroupDocumentsDirectory + "/dashboard_kit_wb_direct_cache.json"

// 3. 媒体库 (Emby / MoviePilot) 常量
export const MEDIA_TYPE_KEY = "dashboard_kit_media_type" // "moviepilot" | "emby"
export const MEDIA_ENDPOINT_KEY = "dashboard_kit_media_endpoint"
export const MEDIA_API_KEY = "dashboard_kit_media_api_key"
export const MEDIA_CACHE_KEY = "dashboard_kit_media_cache_v1"

// 兼容别名
export const EMBY_ENDPOINT_KEY = MEDIA_ENDPOINT_KEY
export const EMBY_API_KEY = MEDIA_API_KEY
export const EMBY_CACHE_KEY = MEDIA_CACHE_KEY

// 4. Codex (ChatGPT) 直连常量
export const CODEX_TOKEN_KEY = "dashboard_kit_codex_token"
export const CODEX_REFRESH_KEY = "dashboard_kit_codex_refresh_token"
export const CODEX_EXPIRES_KEY = "dashboard_kit_codex_expires_at"
export const CODEX_ACCOUNT_ID_KEY = "dashboard_kit_codex_account_id"
export const CODEX_CACHE_KEY = "dashboard_kit_codex_cache_v1"

// 5. Antigravity (Google Cloud Code) 直连常量
export const ANTIGRAVITY_TOKEN_KEY = "dashboard_kit_antigravity_token"
export const ANTIGRAVITY_REFRESH_KEY = "dashboard_kit_antigravity_refresh_token"
export const ANTIGRAVITY_EXPIRES_KEY = "dashboard_kit_antigravity_expires_at"
export const ANTIGRAVITY_PROJECT_KEY = "dashboard_kit_antigravity_project"
export const ANTIGRAVITY_CACHE_KEY = "dashboard_kit_antigravity_cache_v1"
const ANTIGRAVITY_FILE_CACHE_PATH =
  FileManager.appGroupDocumentsDirectory + "/dashboard_kit_antigravity_cache.json"
const CODEX_FILE_CACHE_PATH =
  FileManager.appGroupDocumentsDirectory + "/dashboard_kit_codex_cache.json"

// 6. CPAMP (CPA-Manager-Plus) 常量
export const CPAMP_ENDPOINT_KEY = "dashboard_kit_cpamp_endpoint"
export const CPAMP_KEY = "dashboard_kit_cpamp_key" // Management Key (Bearer Token)
export const CPAMP_CACHE_KEY = "dashboard_kit_cpamp_cache_v1"

// 7. IP / VPN 节点检测常量
export const VPN_CACHE_KEY = "dashboard_kit_vpn_cache_v1"

// ═════════════════════════════════════════════════════════════════
// 1. WorkBuddy (workbuddy2api-panel) 真实直连与缓存
// ═════════════════════════════════════════════════════════════════

/**
 * 限时等待：超过 ms 毫秒即返回 null，不再等待。
 *
 * 用途：预览 / 小组件渲染必须在短时间内出图。底层刷新各自有 15–25s 的超时，
 * 网络慢时会把界面拖住（表现为「预览卡顿」）。这里给它加一道上限 ——
 * 超时就用现有缓存先把图渲染出来，刷新在后台继续跑、下次即生效。
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null as T | null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/** 规范化 URL 地址 */
export function normalizeUrl(raw: string): string {
  let s = (raw || "").trim()
  if (!s) return ""
  if (!/^https?:\/\//i.test(s)) s = "http://" + s
  return s.replace(/\/+$/, "")
}


// ═════════════════════════════════════════════════════════════════
// 2. WorkBuddy 官方直连（OAuth 凭据）
//
// 携带 magpie plugin-auth.json 的 OAuth 凭据直接访问官方接口：
//   · 取积分 POST {endpoint}/billing/meter/get-user-resource-summary  （无 /v2）
//   · 续期   POST {endpoint}/v2/plugin/auth/token/refresh             （有 /v2）
// ═════════════════════════════════════════════════════════════════

/** 单个 WorkBuddy 直连账号的抓取结果 */
interface WbDirectAccountResult {
  total: number
  used: number
  remain: number
  paid: boolean
  accountId: string
  /** refresh token 到期时间，用于取「最晚可续期」 */
  refreshExpiresAt?: number
}

/** 最近一次直连抓取的失败原因（空串表示上次成功） */
let wbDirectLastError = ""

/** 最近一次直连抓取的逐账号诊断（供「测试连接」定位「7 个账号却无数据」） */
let wbDirectLastDiag: string[] = []

/** 逐账号诊断：把「凭据缺失 / 续期失败 / HTTP 状态 / 响应异常」都记录成可读行 */
function noteDiag(line: string): void {
  if (line && !wbDirectLastDiag.includes(line)) wbDirectLastDiag.push(line)
}

/** 诊断明细（供配置面板展示） */
export function getWbDirectDiagnostics(): string[] {
  return [...wbDirectLastDiag]
}

/** 读取并解析某账号的直连凭据；无效返回 null */
function readWbDirectCredential(accountId: string): WbDirectCredential | null {
  const raw = getAccountCredential("workbuddy_direct", accountId, "credential")
  if (!raw) return null
  try {
    return parseWbDirectCredential(raw)
  } catch (e) {
    console.log("WorkBuddy 直连凭据解析失败:", e)
    return null
  }
}

/** 写入凭据（已规范化） */
export function setWbDirectCredential(accountId: string, cred: WbDirectCredential): void {
  setAccountCredential("workbuddy_direct", accountId, "credential", JSON.stringify(cred))
}

/**
 * 确保拿到可用的 access token。
 * 临近过期时续期；续期失败**保留旧 access 继续用**，不清除账号。
 */
async function ensureWbDirectAccess(accountId: string): Promise<WbDirectCredential | null> {
  const cred = readWbDirectCredential(accountId)
  if (!cred) return null

  if (!isCredentialStale(cred)) return cred

  // refresh token 自身已过期，无法续期；若 access 还在就先用着
  if (isRefreshExpired(cred)) {
    return cred.access ? cred : null
  }

  try {
    const res = await fetch(wbDirectRefreshUrl(cred), {
      method: "POST",
      headers: wbDirectRefreshHeaders(cred),
      body: "{}",
      timeout: 20,
    })
    const env: any = await res.json().catch(() => null)
    if (!res.ok || !env?.data?.accessToken) {
      console.log("WorkBuddy 续期未成功，沿用旧 access")
      return cred
    }
    const next = mergeRefreshedCredential(cred, env.data)
    setWbDirectCredential(accountId, next)
    return next
  } catch (e) {
    console.log("WorkBuddy 续期异常，沿用旧 access:", e)
    return cred
  }
}

/**
 * 抓取单个账号的积分。
 *
 * 关键：响应必须是「合法 JSON 且带 data 对象」才算成功。
 * 早期实现只判断 res.ok 与 env.code —— 遇到网关返回的 HTML 错误页时
 * env 为 null、code 为 undefined，会被当成「成功但积分全为 0」，
 * 小组件于是显示 0 而不是报错，看起来就像「没有数据」。
 */
async function fetchWbDirectAccount(accountId: string): Promise<WbDirectAccountResult | null> {
  const cred = await ensureWbDirectAccess(accountId)
  if (!cred) {
    wbDirectLastError = "凭据缺失或无法续期"
    noteDiag(`${accountId}：凭据缺失或无法续期`)
    return null
  }

  try {
    const res = await fetch(wbDirectCreditsUrl(cred), {
      method: "POST",
      headers: wbDirectCreditsHeaders(cred),
      body: "{}",
      timeout: 20,
    })
    const text = await res.text().catch(() => "")
    let env: any = null
    try {
      env = text ? JSON.parse(text) : null
    } catch {
      env = null
    }

    if (!res.ok) {
      const why = env?.msg || env?.message || text.slice(0, 120) || `HTTP ${res.status}`
      wbDirectLastError = `${cred.accountId}：HTTP ${res.status} ${why}`
      noteDiag(wbDirectLastError)
      console.log("WorkBuddy 直连取积分失败:", wbDirectLastError)
      return null
    }
    if (!env || typeof env !== "object") {
      wbDirectLastError = `${cred.accountId}：响应不是 JSON（${text.slice(0, 80) || "空响应"}）`
      noteDiag(wbDirectLastError)
      console.log("WorkBuddy 直连响应异常:", wbDirectLastError)
      return null
    }
    if (env.code) {
      wbDirectLastError = `${cred.accountId}：${env.msg || `错误码 ${env.code}`}`
      noteDiag(wbDirectLastError)
      console.log("WorkBuddy 直连返回错误:", wbDirectLastError)
      return null
    }
    if (!env.data || typeof env.data !== "object") {
      wbDirectLastError = `${cred.accountId}：响应缺少 data 字段`
      noteDiag(wbDirectLastError)
      console.log("WorkBuddy 直连响应异常:", wbDirectLastError)
      return null
    }

    const sum = sumWbCredits(env.data)
    return {
      total: sum.total,
      used: sum.used,
      remain: sum.remain,
      paid: sum.paid,
      accountId: cred.accountId,
      refreshExpiresAt: cred.refreshExpiresAt,
    }
  } catch (e: any) {
    wbDirectLastError = `${cred.accountId}：${e?.message || e}`
    noteDiag(wbDirectLastError)
    console.log("WorkBuddy 直连取积分异常:", e)
    return null
  }
}

/** 多账号聚合为一张卡；单账号时原样输出 */
function buildWbDirectAggregate(
  results: WbDirectAccountResult[],
  okCount: number,
  totalCount: number
): MetricBalanceData {
  const size = aggregateSum(results.map((r) => r.total)).sum
  const used = aggregateSum(results.map((r) => r.used)).sum
  const remain = size - used
  const pct = size > 0 ? Math.round((remain / size) * 100) : remain > 0 ? 100 : 0

  // 最晚可续期时间 → 剩余有效天数
  const latestRefreshExpiry = results
    .map((r) => r.refreshExpiresAt)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .reduce((a, b) => Math.max(a, b), 0)
  const validDays =
    latestRefreshExpiry > 0
      ? Math.max(0, Math.ceil((latestRefreshExpiry - Date.now()) / 86_400_000))
      : undefined

  const note = accountNote(totalCount, okCount)

  return {
    ...DEFAULT_WORKBUDDY_DIRECT,
    mainValue: remain.toLocaleString("en-US"),
    progressPct: Math.min(100, Math.max(0, pct)),
    subLabel1: "账号",
    // 账号区域显示「已签入账号数量」：成功签入的个数即有效账号数，
    // 全部失败时回落为 0，避免把不可用账号也算成已签入。
    subValue1: `${Math.max(0, Math.floor(okCount))}`,
    subLabel2: "已用",
    subValue2: used.toLocaleString("en-US"),
    validDays,
    // 明细放到底栏，避免主区域标签重复（原为「账号: 7 账号」）
    footerLeft: note
      ? `官方直连 · ${note}`
      : `官方直连 · 总量 ${size.toLocaleString("en-US")}`,
    // 近 7 日已用积分：接口只返回当前值，按自然日快照累积
    trend7d: (() => {
      pushSnapshot(TREND_KEY_WB_DIRECT, used)
      return snapshotSeries(TREND_KEY_WB_DIRECT)
    })(),
    updatedAt: new Date().toISOString(),
  }
}

export function hasWbDirectConfigured(): boolean {
  return hasAnyConfiguredAccount("workbuddy_direct")
}

/** 最近一次直连抓取的失败原因（供配置面板展示，便于定位问题） */
export function getWbDirectLastError(): string {
  return wbDirectLastError
}

/**
 * 读取 WorkBuddy 数据：Storage 双通道 → App Group 文件 → 默认占位。
 *
 * 文件回落很关键：Storage(shared) 在部分 Widget/预览上下文里可能读不到，
 * 只走 Storage 时卡片会直接落到默认占位（表现为「已导入 7 个账号却显示 --」）。
 * Codex / Antigravity / 油价都已有文件回落，这里补齐。
 */
export function getWbDirectData(): MetricBalanceData {
  try {
    const cached =
      Storage.get<MetricBalanceData>(WB_DIRECT_CACHE_KEY, { shared: true }) ||
      Storage.get<MetricBalanceData>(WB_DIRECT_CACHE_KEY)
    if (cached && typeof cached === "object" && cached.mainValue) {
      return cached
    }
  } catch (e) {
    console.log("WorkBuddy 直连读取缓存异常:", e)
  }
  try {
    if (FileManager.existsSync(WB_DIRECT_FILE_CACHE_PATH)) {
      const raw = FileManager.readAsStringSync(WB_DIRECT_FILE_CACHE_PATH)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object" && parsed.mainValue) return parsed
      }
    }
  } catch (e) {
    console.log("WorkBuddy 直连读取文件缓存异常:", e)
  }
  return DEFAULT_WORKBUDDY_DIRECT
}

/** 刷新 WorkBuddy 官方直连数据（多账号并发抓取并聚合） */
export async function refreshWbDirectData(): Promise<MetricBalanceData | null> {
  const accounts = enabledAccounts("workbuddy_direct")
  if (accounts.length === 0) return null

  wbDirectLastError = ""
  wbDirectLastDiag = []

  const settled = await Promise.all(
    accounts.map((a) => fetchWbDirectAccount(a.id).catch(() => null))
  )
  const results = settled.filter((r): r is WbDirectAccountResult => r != null)
  if (results.length === 0) return null

  const data = buildWbDirectAggregate(results, results.length, accounts.length)

  try {
    Storage.set(WB_DIRECT_CACHE_KEY, data, { shared: true })
    Storage.set(WB_DIRECT_CACHE_KEY, data)
    FileManager.writeAsStringSync(WB_DIRECT_FILE_CACHE_PATH, JSON.stringify(data))
  } catch {}
  return data
}

// ═════════════════════════════════════════════════════════════════
// 2. DeepSeek 真实数据直连与读取
// ═════════════════════════════════════════════════════════════════

/** 尝试从其他小组件自动寻找并读取已配置的 DeepSeek Token / API Key */
export function findDiscoveredDeepSeekToken(): string {
  // 1. 本地 Keychain
  if (Keychain.contains(DEEPSEEK_TOKEN_KEY)) {
    const k = (Keychain.get(DEEPSEEK_TOKEN_KEY) || "").trim()
    if (k) return k
  }

  // 2. 尝试读取 DeepSeek Usage 小组件的密钥列表 (deepseek_usage_keys.json)
  try {
    if (FileManager.existsSync(DEEPSEEK_USAGE_STORE_PATH)) {
      const obj = JSON.parse(FileManager.readAsStringSync(DEEPSEEK_USAGE_STORE_PATH))
      if (Array.isArray(obj?.keys) && obj.keys.length > 0) {
        const found = obj.keys.find((k: any) => typeof k?.token === "string" && k.token.trim())
        if (found && found.token.trim()) {
          return found.token.trim()
        }
      }
    }
  } catch {}

  // 3. 尝试读取 DeepSeek Panel 小组件的 Key (deepseek_api_key.txt)
  try {
    if (FileManager.existsSync(DEEPSEEK_PANEL_KEY_PATH)) {
      const k = FileManager.readAsStringSync(DEEPSEEK_PANEL_KEY_PATH).trim()
      if (k) return k
    }
  } catch {}

  return ""
}

export function hasDeepSeekConfigured(): boolean {
  return hasAnyConfiguredAccount("deepseek")
}

export function getDeepSeekData(): MetricBalanceData {
  try {
    // 1. 优先读取本机在 DashBoard-Kit 中手动配置并拉取的缓存
    const local =
      Storage.get<MetricBalanceData>(DEEPSEEK_CACHE_KEY, { shared: true }) ||
      Storage.get<MetricBalanceData>(DEEPSEEK_CACHE_KEY)
    if (local && local.serviceId === "deepseek" && local.mainValue) {
      return local
    }

    // 2. 回落读取 DeepSeek Usage 小组件的 App Group 缓存
    if (FileManager.existsSync(DEEPSEEK_LEGACY_CACHE_PATH)) {
      const content = FileManager.readAsStringSync(DEEPSEEK_LEGACY_CACHE_PATH)
      const raw = JSON.parse(content)
      if (raw && typeof raw === "object") {
        const total = Number(raw.balance ?? 0) + Number(raw.bonusBalance ?? 0)
        const weekCost = Number(raw.weekCost ?? 0)
        const pct =
          total > 0
            ? Math.min(100, Math.round((total / (total + weekCost || 1)) * 100))
            : 0
        const cur = raw.currency === "USD" ? "$" : "¥"

        const updateMs =
          typeof raw.updatedAt === "number"
            ? raw.updatedAt > 1e11
              ? raw.updatedAt
              : raw.updatedAt * 1000
            : Date.now()

        return {
          ...DEFAULT_DEEPSEEK,
          prefix: cur,
          mainValue: total.toFixed(2),
          progressPct: pct > 0 ? pct : DEFAULT_DEEPSEEK.progressPct,
          subLabel1: "状态",
          subValue1: "正常",
          subLabel2: "近7日消费",
          subValue2: `${cur}${weekCost.toFixed(2)}`,
          footerLeft: "DeepSeek Usage",
          updatedAt: new Date(updateMs).toISOString(),
        }
      }
    }
  } catch (e) {
    console.log("DeepSeek 真实数据读取异常，回落 Mock:", e)
  }
  return DEFAULT_DEEPSEEK
}

/**
 * 单个 DeepSeek 账号的抓取结果。
 * `display` 是该账号自己的展示对象（认证方式不同，字段语义也不同）；
 * 其余字段供多账号聚合使用。
 */
interface DeepSeekAccountResult {
  display: MetricBalanceData
  balance: number
  weekCost: number
  totalCost: number
  currency: string
  /** 逐日消费（北京时间自然日 0 点 → 金额）；API Key 模式无此数据 */
  costByDay: Map<number, number>
  /**
   * 逐日 Token 用量（北京时间自然日 0 点 → Tokens）。
   * 来源 /usage/by_api_key/amount，口径与 xubai2001 原版一致：
   * RESPONSE_TOKEN + PROMPT_CACHE_HIT_TOKEN + PROMPT_CACHE_MISS_TOKEN。
   */
  tokenByDay: Map<number, number>
  /** 开放平台 sk- API Key 模式：无逐日消费、无赠送余额 */
  apiKeyMode: boolean
}

/** 解析某账号的 DeepSeek Token；legacy 账号额外回落其他小组件的密钥文件 */
function resolveDeepSeekToken(accountId: string): string {
  let token = getAccountCredential("deepseek", accountId, "token").trim()
  if (!token && accountId === LEGACY_ACCOUNT_ID) {
    token = findDiscoveredDeepSeekToken()
    if (token) {
      Keychain.set(DEEPSEEK_TOKEN_KEY, token, {
        accessibility: "first_unlock_this_device",
      })
    }
  }
  return token
}

/** 抓取单个 DeepSeek 账号（不做聚合、不写聚合缓存） */
async function fetchDeepSeekAccount(accountId: string): Promise<DeepSeekAccountResult | null> {
  const token = resolveDeepSeekToken(accountId)

  if (!token) return null

  // 判断是否为标准开放平台 sk- 开头的 API Key
  const isStandardApiKey = token.startsWith("sk-")

  if (isStandardApiKey) {
    // 方案 A：使用开放平台官方余额查询接口 (api.deepseek.com/user/balance)
    try {
      const res = await fetch("https://api.deepseek.com/user/balance", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        timeout: 15,
      })
      if (res.ok) {
        const json: any = await res.json().catch(() => null)
        const info = json?.balance_infos?.[0]
        if (info) {
          const total = parseFloat(info.total_balance) || 0
          const granted = parseFloat(info.granted_balance) || 0
          const topped = parseFloat(info.topped_up_balance) || 0
          const sym = info.currency === "USD" ? "$" : info.currency === "EUR" ? "€" : "¥"

          const data: MetricBalanceData = {
            ...DEFAULT_DEEPSEEK,
            prefix: sym,
            mainValue: total.toFixed(2),
            progressPct: total > 0 ? 100 : 0,
            subLabel1: "现金充值",
            subValue1: `${sym}${topped.toFixed(2)}`,
            subLabel2: "赠送余额",
            subValue2: `${sym}${granted.toFixed(2)}`,
            footerLeft: "API 直连",
            updatedAt: new Date().toISOString(),
          }

          return {
            display: data,
            balance: total,
            weekCost: 0,
            totalCost: 0,
            currency: info.currency || "CNY",
            costByDay: new Map<number, number>(),
            // 开放平台 API Key 模式没有逐日用量接口
            tokenByDay: new Map<number, number>(),
            apiKeyMode: true,
          }
        }
      }
    } catch (e) {
      console.log("DeepSeek API 查询异常:", e)
    }
  }

  // 方案 B：使用 platform.deepseek.com 网页 User Token 查询 summary 和 7 日 cost
  const headers = {
    authorization: `Bearer ${token}`,
    referer: "https://platform.deepseek.com/usage",
    "user-agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    accept: "*/*",
  }

  try {
    // 1. 获取账户余额
    const summaryRes = await fetch(
      "https://platform.deepseek.com/api/v0/users/get_user_summary",
      { method: "GET", headers, timeout: 20 }
    )
    if (!summaryRes.ok) return null
    const summaryJson: any = await summaryRes.json().catch(() => null)
    if (!summaryJson || summaryJson.code !== 0) return null

    const biz = summaryJson.data?.biz_data
    const pick = (arr: any[] | undefined) => {
      if (!Array.isArray(arr) || arr.length === 0) return 0
      return parseFloat(arr[0].balance) || 0
    }
    const normal = Array.isArray(biz?.normal_wallets) ? biz.normal_wallets : []
    const bonus = Array.isArray(biz?.bonus_wallets) ? biz.bonus_wallets : []
    const costs = Array.isArray(biz?.total_costs) ? biz.total_costs : []
    const currency = normal[0]?.currency || costs[0]?.currency || "CNY"
    const balance = pick(normal)
    const bonusBalance = pick(bonus)
    const total = balance + bonusBalance
    const cur = currency === "USD" ? "$" : "¥"

    // 累计消费：DeepSeek summary 的 biz_data.total_costs[].amount 是账户历史总消费。
    // 之前只取了 currency 字段而丢弃了金额，导致「累计消费」永远显示不出来。
    const totalCost = (() => {
      let sum = 0
      for (const c of costs) {
        const v =
          typeof c?.amount === "string"
            ? parseFloat(c.amount)
            : Number(c?.amount ?? c?.cost ?? c?.total ?? 0)
        if (Number.isFinite(v)) sum += v
      }
      return sum
    })()

    // 2. 拉取近 7 天逐日消费：
    //    数据来源：platform.deepseek.com /api/v0/usage/by_api_key/cost
    //    结构：data.biz_data.data[币种].series[].buckets[] = { time, cost }，
    //    其中 time 为「北京时间自然日 0 点」的秒级时间戳，cost 为该日消费金额。
    //    用途：① 计算近 7 日消费合计 ② 生成中号波形图的真实走势
    let weekCost = 0
    const costByDay = new Map<number, number>()
    try {
      const today = Math.floor((Date.now() / 1000 + 28800) / 86400) * 86400 - 28800
      const start = today - 6 * 86400
      const end = today + 86400
      const costRes = await fetch(
        `https://platform.deepseek.com/api/v0/usage/by_api_key/cost?start=${start}&end=${end}&tz=28800`,
        { method: "GET", headers, timeout: 15 }
      )
      if (costRes.ok) {
        const costJson: any = await costRes.json().catch(() => null)
        const costBiz = costJson?.data?.biz_data
        if (Array.isArray(costBiz?.data)) {
          for (const item of costBiz.data) {
            if (Array.isArray(item?.series)) {
              for (const s of item.series) {
                if (Array.isArray(s?.buckets)) {
                  for (const b of s.buckets) {
                    const c = typeof b.cost === "string" ? parseFloat(b.cost) : Number(b.cost) || 0
                      if (!Number.isFinite(c)) continue
                      weekCost += c
                      const t = Number(b.time)
                      if (Number.isFinite(t)) {
                        costByDay.set(t, (costByDay.get(t) ?? 0) + c)
                      }
                  }
                }
              }
            }
          }
        }
      }
    } catch {}

    // 3. 拉取近 7 天逐日 Token 用量（供中号「余额 / Token」切换的第二条曲线）：
    //    数据来源：/api/v0/usage/by_api_key/amount
    //    结构：data.biz_data.series[].buckets[] = { time, usage{...} }
    //    口径与 xubai2001 原版一致：RESPONSE + PROMPT_CACHE_HIT + PROMPT_CACHE_MISS
    const tokenByDay = new Map<number, number>()
    try {
      const today = Math.floor((Date.now() / 1000 + 28800) / 86400) * 86400 - 28800
      const start = today - 6 * 86400
      const end = today + 86400
      const amtRes = await fetch(
        `https://platform.deepseek.com/api/v0/usage/by_api_key/amount?start=${start}&end=${end}&tz=28800`,
        { method: "GET", headers, timeout: 15 }
      )
      if (amtRes.ok) {
        const amtJson: any = await amtRes.json().catch(() => null)
        const biz = amtJson?.data?.biz_data
        if (Array.isArray(biz?.series)) {
          for (const s of biz.series) {
            if (!Array.isArray(s?.buckets)) continue
            for (const b of s.buckets) {
              const u = b?.usage
              if (!u) continue
              const n =
                (Number(u.RESPONSE_TOKEN) || 0) +
                (Number(u.PROMPT_CACHE_HIT_TOKEN) || 0) +
                (Number(u.PROMPT_CACHE_MISS_TOKEN) || 0)
              const t = Number(b.time)
              if (Number.isFinite(t) && n > 0) {
                tokenByDay.set(t, (tokenByDay.get(t) ?? 0) + n)
              }
            }
          }
        }
      }
    } catch {}

    // 近 7 日逐日消费走势（真实数据）
    const trend7d = toDailySeries(costByDay)

    const pct =
      total > 0
        ? Math.min(100, Math.round((total / (total + weekCost || 1)) * 100))
        : 0

    const data: MetricBalanceData = {
      ...DEFAULT_DEEPSEEK,
      prefix: cur,
      mainValue: total.toFixed(2),
      progressPct: pct > 0 ? pct : DEFAULT_DEEPSEEK.progressPct,
      subLabel1: "状态",
      subValue1: "正常",
      subLabel2: "近7日消费",
      subValue2: `${cur}${weekCost.toFixed(2)}`,
      totalCostText: `${cur}${totalCost.toFixed(2)}`,
      trend7d,
      footerLeft: "官方直连",
      updatedAt: new Date().toISOString(),
    }

    return {
      display: data,
      balance: total,
      weekCost,
      totalCost,
      currency,
      costByDay,
      tokenByDay,
      apiKeyMode: false,
    }
  } catch (e) {
    console.log("刷新 DeepSeek 异常:", e)
    return null
  }
}

/**
 * 把多个账号的抓取结果合成一份展示数据。
 *
 * 单账号时**原样透传**该账号的 display —— 这是与改造前输出逐字段一致的关键保证。
 * 多账号时：余额/近7日消费/累计消费求和；逐日走势按自然日相加（真实历史，非快照）；
 * 币种取账号数最多的那个，避免把 USD 与 CNY 直接相加。
 */
function buildDeepSeekAggregate(
  results: DeepSeekAccountResult[],
  okCount: number,
  totalCount: number
): MetricBalanceData {
  if (results.length === 1) {
    const only = results[0]
    // 单账号也要带上双模式走势，否则中号「余额 / Token」切换拿不到第二条曲线。
    // 「余额」模式是从当日余额回推的曲线，不是消费曲线。
    const costTrend = only.display.trend7d || []
    const base: MetricBalanceData = {
      ...only.display,
      trends: {
        balance: balanceSeriesFromCost(costTrend, only.balance),
        // Token 曲线以 M 为单位，与图表标题「近7天用量 (M)」及峰值口径一致
        tokens: tokensInMillions(toDailySeries(only.tokenByDay)),
      },
    }
    if (okCount >= totalCount) return base
    return { ...base, footerLeft: `${only.display.footerLeft} · 可用 ${okCount}/${totalCount}` }
  }

  const currency = dominantCurrency(results.map((r) => r.currency))
  const sym = currencySymbol(currency)

  const balance = aggregateSum(results.map((r) => r.balance)).sum
  const weekCost = aggregateSum(results.map((r) => r.weekCost)).sum
  const totalCost = aggregateSum(results.map((r) => r.totalCost)).sum

  const pct = balance > 0 ? Math.min(100, Math.round((balance / (balance + weekCost || 1)) * 100)) : 0

  const anyApiKeyOnly = results.every((r) => r.apiKeyMode)

  // 逐日消费按自然日相加：DeepSeek 有真实逐日接口，不能用快照累积替代
  const costTrend = toDailySeries(mergeDayCosts(results.map((r) => r.costByDay)))
  // Token 曲线同样换算为 M，避免中号图表与峰值出现 9863 这类原始 Token 数
  const tokenTrend = tokensInMillions(toDailySeries(mergeDayCosts(results.map((r) => r.tokenByDay))))

  return {
    ...DEFAULT_DEEPSEEK,
    prefix: sym,
    mainValue: balance.toFixed(2),
    progressPct: pct > 0 ? pct : DEFAULT_DEEPSEEK.progressPct,
    subLabel1: "状态",
    subValue1: "正常",
    subLabel2: "近7日消费",
    subValue2: `${sym}${weekCost.toFixed(2)}`,
    ...(anyApiKeyOnly ? {} : { totalCostText: `${sym}${totalCost.toFixed(2)}` }),
    trend7d: costTrend,
    // 中号「余额 / Token」两条曲线（与参考实现同一组模式键）。
    // 「余额」由当日余额回推，不是消费曲线。
    trends: { balance: balanceSeriesFromCost(costTrend, balance), tokens: tokenTrend },
    footerLeft: accountNote(totalCount, okCount) || `官方直连 · ${results.length} 账号`,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 刷新 DeepSeek 官方用量与余额数据（兼容网页 User Token 与开放平台 API Key 两种格式）。
 * 多账号时并发抓取全部启用账号并聚合；单账号时输出与改造前逐字段一致。
 */
export async function refreshDeepSeekData(): Promise<MetricBalanceData | null> {
  const accounts = enabledAccounts("deepseek")
  if (accounts.length === 0) return null

  const settled = await Promise.all(
    accounts.map((a) => fetchDeepSeekAccount(a.id).catch(() => null))
  )
  const results = settled.filter((r): r is DeepSeekAccountResult => r != null)
  if (results.length === 0) return null

  const data = buildDeepSeekAggregate(results, results.length, accounts.length)

  try {
    Storage.set(DEEPSEEK_CACHE_KEY, data, { shared: true })
    Storage.set(DEEPSEEK_CACHE_KEY, data)
  } catch {}
  return data
}

// ═════════════════════════════════════════════════════════════════
// 3. Codex & Antigravity 直连与配额数据读取
// ═════════════════════════════════════════════════════════════════

export function hasCodexConfigured(): boolean {
  return hasAnyConfiguredAccount("codex")
}

export function hasAntigravityConfigured(): boolean {
  return hasAnyConfiguredAccount("antigravity")
}

/**
 * 取多个重置时间中最早的一个。
 * 聚合后「额度最先恢复」取决于最早重置的那个账号，而非最晚。
 */
function earliestReset(values: (string | number | null | undefined)[]): number | string | null {
  let best: number | string | null = null
  let bestMs = Number.POSITIVE_INFINITY
  for (const v of values) {
    if (v == null || v === "") continue
    const ms = typeof v === "number" ? v : new Date(v).getTime()
    if (!Number.isFinite(ms)) continue
    if (ms < bestMs) {
      bestMs = ms
      best = v
    }
  }
  return best
}

function formatCountdown(targetIsoOrMs: string | number | null): string {
  if (!targetIsoOrMs) return "实时"
  const target = typeof targetIsoOrMs === "number" ? targetIsoOrMs : new Date(targetIsoOrMs).getTime()
  if (Number.isNaN(target)) return "实时"
  const diffSec = Math.round((target - Date.now()) / 1000)
  if (diffSec <= 0) return "刷新中"
  const h = Math.floor(diffSec / 3600)
  const m = Math.floor((diffSec % 3600) / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d${h % 24}h`
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

export function getCodexData(): DualQuotaData {
  try {
    // 1. 优先读取本机直连缓存（支持 Storage 与 App Group 文件双通道）
    let local =
      Storage.get<any>(CODEX_CACHE_KEY, { shared: true }) ||
      Storage.get<any>(CODEX_CACHE_KEY)

    if (!local && FileManager.existsSync(CODEX_FILE_CACHE_PATH)) {
      try {
        const raw = FileManager.readAsStringSync(CODEX_FILE_CACHE_PATH)
        if (raw) local = JSON.parse(raw)
      } catch {}
    }

    if (local && (local.item1 || local.stat1)) {
      return {
        ...DEFAULT_CODEX,
        ...local,
        serviceId: "codex",
        iconImage: DEFAULT_CODEX.iconImage,
      }
    }

    // 2. 桥接兼容读取 AI Usage 的缓存（若有）
    const reg = Storage.get<any>("ai_usage_codex_account_registry_v1", {
      shared: true,
    })
    const defId = reg?.defaultAccountId || reg?.accounts?.[0]?.id
    if (defId) {
      const snap = Storage.get<any>(`ai_usage_codex_cache_v1_${defId}`, {
        shared: true,
      })
      if (snap?.windows && Array.isArray(snap.windows)) {
        const w5h = snap.windows.find(
          (w: any) =>
            w.label?.toLowerCase().includes("5h") ||
            w.label?.toLowerCase().includes("5 小时")
        )
        const wWeek = snap.windows.find(
          (w: any) =>
            w.label?.toLowerCase().includes("week") ||
            w.label?.toLowerCase().includes("周")
        )

        return {
          ...DEFAULT_CODEX,
          item1: {
            label: w5h?.label || "5 小时额度",
            timer: formatCountdown(w5h?.resetAt),
            pct:
              typeof w5h?.remainingPercent === "number"
                ? Math.round(w5h.remainingPercent)
                : DEFAULT_CODEX.item1.pct,
          },
          item2: {
            label: wWeek?.label || "周额度",
            timer: formatCountdown(wWeek?.resetAt),
            pct:
              typeof wWeek?.remainingPercent === "number"
                ? Math.round(wWeek.remainingPercent)
                : DEFAULT_CODEX.item2.pct,
          },
          updatedAt: snap.fetchedAt || new Date().toISOString(),
        }
      }
    }
  } catch (e) {
    console.log("Codex 真实数据读取异常，回落 Mock:", e)
  }
  return DEFAULT_CODEX
}

/** 检查并自动刷新 Codex Token（若有 Refresh Token 且临近过期） */
async function ensureCodexTokenFor(accountId: string): Promise<string> {
  let token = getAccountCredential("codex", accountId, "token").trim()
  const refreshToken = getAccountCredential("codex", accountId, "refresh").trim()
  const expiresAt = Number(getAccountCredential("codex", accountId, "expires") || "0")

  // 若 Token 未过期或无 Refresh Token，直接返回
  if (!refreshToken || (token && expiresAt && expiresAt > Date.now() + 5 * 60_000)) {
    return token
  }

  // 使用 Refresh Token 刷新
  try {
    const body = new URLSearchParams({
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString()
    const resp = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      timeout: 20,
    })
    const payload: any = await resp.json().catch(() => null)
    if (resp.ok && payload?.access_token) {
      token = payload.access_token
      setAccountCredential("codex", accountId, "token", token)
      if (payload.refresh_token) {
        setAccountCredential("codex", accountId, "refresh", payload.refresh_token)
      }
      const expSec = typeof payload.expires_in === "number" ? payload.expires_in : 3600
      setAccountCredential("codex", accountId, "expires", String(Date.now() + expSec * 1000))
    }
  } catch (e) {
    console.log("刷新 Codex Token 失败:", e)
  }
  return token
}

/** 检查并自动刷新 Antigravity Token（若有 Refresh Token 且临近过期） */
async function ensureAntigravityTokenFor(accountId: string): Promise<string> {
  let token = getAccountCredential("antigravity", accountId, "token").trim()
  const refreshToken = getAccountCredential("antigravity", accountId, "refresh").trim()
  const expiresAt = Number(getAccountCredential("antigravity", accountId, "expires") || "0")

  if (!refreshToken || (token && expiresAt && expiresAt > Date.now() + 5 * 60_000)) {
    return token
  }

  try {
    const body = new URLSearchParams({
      client_id: [1071006060591, "tmhssin2h21lcre235vtolojh4g403ep", "apps", "googleusercontent", "com"].join(".").replace("1071006060591.", "1071006060591-"),
      client_secret: ["GOCSPX", "K58FWR486LdLJ1mLB8sXC4z6qDAf"].join("-"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString()
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      timeout: 20,
    })
    const payload: any = await resp.json().catch(() => null)
    if (resp.ok && payload?.access_token) {
      token = payload.access_token
      setAccountCredential("antigravity", accountId, "token", token)
      if (payload.refresh_token) {
        setAccountCredential("antigravity", accountId, "refresh", payload.refresh_token)
      }
      const expSec = typeof payload.expires_in === "number" ? payload.expires_in : 3600
      setAccountCredential("antigravity", accountId, "expires", String(Date.now() + expSec * 1000))
    }
  } catch (e) {
    console.log("刷新 Antigravity Token 失败:", e)
  }
  return token
}

/** 单个 Codex 账号的抓取结果 */
interface CodexAccountResult {
  display: DualQuotaData
  pct1: number
  pct2: number
  /** 5 小时窗口重置时间，用于取「最早恢复」 */
  reset1: number | string | null
  reset2: number | string | null
  /** 可重置次数；未知为 null */
  resets: number | null
}

/** 抓取单个 Codex 账号（不做聚合、不写聚合缓存） */
async function fetchCodexAccount(accountId: string): Promise<CodexAccountResult | null> {
  const token = await ensureCodexTokenFor(accountId)
  if (!token) return null
  const accountIdHeader = getAccountCredential("codex", accountId, "accountid").trim()

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent":
      "Codex Desktop/0.147.0-alpha.6.5 (Mac OS 27.0.0; arm64) unknown (Codex Desktop; 26.803.61601)",
    originator: "Codex Desktop",
  }
  if (accountIdHeader) headers["ChatGPT-Account-Id"] = accountIdHeader

  try {
    const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers,
      timeout: 15,
    })
    if (!res.ok) {
      console.log("请求 Codex 官方 API 失败 HTTP:", res.status)
      return null
    }

    const payload: any = await res.json().catch(() => null)
    if (!payload) return null

    // 解析 rate_limit 字段
    const rl = payload.rate_limit || payload.rateLimit || payload
    const w5hRaw = rl.primary_window || rl.primaryWindow || rl.five_hour
    const wWeekRaw = rl.secondary_window || rl.secondaryWindow || rl.weekly

    const getPct = (w: any) => {
      if (!w) return null
      const rem = w.remaining_percent ?? w.remainingPercent ?? w.percent_left
      if (typeof rem === "number") return Math.max(0, Math.min(100, rem))
      const used = w.used_percent ?? w.usedPercent
      if (typeof used === "number") return Math.max(0, Math.min(100, 100 - used))
      return null
    }

    const getReset = (w: any) => {
      if (!w) return null
      return w.reset_at || w.resetAt || w.reset_time_ms || w.reset_time
    }

    const p1 = getPct(w5hRaw) ?? DEFAULT_CODEX.item1.pct
    const p2 = getPct(wWeekRaw) ?? DEFAULT_CODEX.item2.pct

    const reset1 = getReset(w5hRaw)
    const reset2 = getReset(wWeekRaw)

    // 重置次数
    const credits = payload.rate_limit_reset_credits || payload.credits
    const creditCount = credits?.available_count ?? credits?.count

    const stat1Val =
      creditCount != null ? `${creditCount} 次` : DEFAULT_CODEX.stat1.value

    const data: DualQuotaData = {
      ...DEFAULT_CODEX,
      item1: {
        label: "5 小时额度",
        timer: formatCountdown(reset1),
        pct: Math.round(p1 * 10) / 10,
      },
      item2: {
        label: "周额度",
        timer: formatCountdown(reset2),
        pct: Math.round(p2 * 10) / 10,
      },
      stat1: {
        label: "可重置次数",
        value: stat1Val,
      },
      stat2: {
        label: "状态",
        value: "正常",
      },
      footerStatus: `剩余 ${formatPct(p1)}%`,
      // 近 7 日可用额度走势：接口无逐日历史，按每日快照累积真实数据
      trend7d: (() => {
        pushSnapshot(TREND_KEY_CODEX, p1)
        return snapshotSeries(TREND_KEY_CODEX)
      })(),
      updatedAt: new Date().toISOString(),
    }

    return {
      display: data,
      pct1: Math.round(p1 * 10) / 10,
      pct2: Math.round(p2 * 10) / 10,
      reset1,
      reset2,
      resets: creditCount != null ? Number(creditCount) : null,
    }
  } catch (e) {
    console.log("刷新 Codex 出现异常:", e)
    return null
  }
}

/**
 * 把多个 Codex 账号合成一份展示数据。
 *
 * 百分比配额按**求和**合并（两个 83% → 166%），同时标注各账号中最紧张的那个，
 * 避免只看求和误判。单账号时原样透传，保证与改造前一致。
 */
function buildCodexAggregate(
  results: CodexAccountResult[],
  okCount: number,
  totalCount: number
): DualQuotaData {
  if (results.length === 1) {
    const only = results[0]
    if (okCount >= totalCount) return only.display
    return { ...only.display, footerStatus: `${only.display.footerStatus} · 可用 ${okCount}/${totalCount}` }
  }

  const quota = aggregateQuota(results.map((r) => ({ pct1: r.pct1, pct2: r.pct2 })))

  // 最早恢复时间：聚合值最先改善的时刻
  const reset1 = earliestReset(results.map((r) => r.reset1))
  const reset2 = earliestReset(results.map((r) => r.reset2))

  const resets = results.map((r) => r.resets).filter((v): v is number => v != null && Number.isFinite(v))
  const resetSum = resets.length > 0 ? resets.reduce((a, b) => a + b, 0) : null

  const note = accountNote(totalCount, okCount, quota.lowest)

  return {
    ...DEFAULT_CODEX,
    item1: {
      label: "5 小时额度",
      timer: formatCountdown(reset1),
      pct: Math.round(quota.sum1 * 10) / 10,
    },
    item2: {
      label: "周额度",
      timer: formatCountdown(reset2),
      pct: Math.round(quota.sum2 * 10) / 10,
    },
    stat1: {
      label: "可重置次数",
      value: resetSum != null ? `${resetSum} 次` : DEFAULT_CODEX.stat1.value,
    },
    stat2: {
      label: "账号",
      value: note || `${results.length} 账号`,
    },
    footerStatus: note,
    // 快照累积聚合后的 5 小时剩余额度
    trend7d: (() => {
      pushSnapshot(TREND_KEY_CODEX, quota.sum1)
      return snapshotSeries(TREND_KEY_CODEX)
    })(),
    updatedAt: new Date().toISOString(),
  }
}

/** 刷新 Codex 官方用量数据（多账号并发抓取并聚合） */
export async function refreshCodexData(): Promise<DualQuotaData | null> {
  const accounts = enabledAccounts("codex")
  if (accounts.length === 0) return null

  const settled = await Promise.all(
    accounts.map((a) => fetchCodexAccount(a.id).catch(() => null))
  )
  const results = settled.filter((r): r is CodexAccountResult => r != null)
  if (results.length === 0) return null

  const data = buildCodexAggregate(results, results.length, accounts.length)

  try {
    Storage.set(CODEX_CACHE_KEY, data, { shared: true })
    Storage.set(CODEX_CACHE_KEY, data)
    FileManager.writeAsStringSync(CODEX_FILE_CACHE_PATH, JSON.stringify(data))
  } catch {}
  return data
}

export function getAntigravityData(): DualQuotaData {
  try {
    // 1. 优先读取本机直连缓存（支持 Storage 与 App Group 文件双通道）
    let local =
      Storage.get<any>(ANTIGRAVITY_CACHE_KEY, { shared: true }) ||
      Storage.get<any>(ANTIGRAVITY_CACHE_KEY)

    if (!local && FileManager.existsSync(ANTIGRAVITY_FILE_CACHE_PATH)) {
      try {
        const raw = FileManager.readAsStringSync(ANTIGRAVITY_FILE_CACHE_PATH)
        if (raw) local = JSON.parse(raw)
      } catch {}
    }

    if (local && (local.item1 || local.stat1)) {
      return {
        ...DEFAULT_ANTIGRAVITY,
        ...local,
        serviceId: "antigravity",
        iconImage: DEFAULT_ANTIGRAVITY.iconImage,
      }
    }

    // 2. 桥接兼容读取 AI Usage 的缓存（若有）
    const reg = Storage.get<any>("ai_usage_antigravity_account_registry_v1", {
      shared: true,
    })
    const defId = reg?.defaultAccountId || reg?.accounts?.[0]?.id
    if (defId) {
      const snap = Storage.get<any>(`ai_usage_antigravity_cache_v1_${defId}`, {
        shared: true,
      })
      if (snap?.windows && Array.isArray(snap.windows)) {
        const wGem = snap.windows.find((w: any) =>
          w.label?.toLowerCase().includes("gemini")
        )
        const wClaude = snap.windows.find(
          (w: any) =>
            w.label?.toLowerCase().includes("claude") ||
            w.label?.toLowerCase().includes("gpt")
        )

        return {
          ...DEFAULT_ANTIGRAVITY,
          item1: {
            label: wGem?.label || "Gemini 5h",
            timer: formatCountdown(wGem?.resetAt),
            pct:
              typeof wGem?.remainingPercent === "number"
                ? Math.round(wGem?.remainingPercent)
                : DEFAULT_ANTIGRAVITY.item1.pct,
          },
          item2: {
            label: wClaude?.label || "Claude/GPT 5h",
            timer: formatCountdown(wClaude?.resetAt),
            pct:
              typeof wClaude?.remainingPercent === "number"
                ? Math.round(wClaude?.remainingPercent)
                : DEFAULT_ANTIGRAVITY.item2.pct,
          },
          updatedAt: snap.fetchedAt || new Date().toISOString(),
        }
      }
    }
  } catch (e) {
    console.log("Antigravity 真实数据读取异常，回落 Mock:", e)
  }
  return DEFAULT_ANTIGRAVITY
}

/** 单个 Antigravity 账号的抓取结果 */
interface AntigravityAccountResult {
  display: DualQuotaData
  pct1: number
  pct2: number
  week1: number | null
  week2: number | null
  reset1: number | string | null
  reset2: number | string | null
}

/** 抓取单个 Antigravity 账号（不做聚合、不写聚合缓存） */
async function fetchAntigravityAccount(accountId: string): Promise<AntigravityAccountResult | null> {
  const token = await ensureAntigravityTokenFor(accountId)
  if (!token) return null
  let projectId = getAccountCredential("antigravity", accountId, "project").trim()

  const hosts = [
    "https://cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
  ]
  const clientUserAgent = "vscode/1.X.X (Antigravity/4.3.0)"
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": clientUserAgent,
  }

  // 1. 若无 projectId，主动探测一次 loadCodeAssist 获取绑定的 project 与套餐
  if (!projectId) {
    for (const host of hosts) {
      try {
        const resp = await fetch(`${host}/v1internal:loadCodeAssist`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            metadata: {
              ideType: "ANTIGRAVITY",
              platform: "PLATFORM_UNSPECIFIED",
              pluginType: "GEMINI",
            },
          }),
          timeout: 15,
        })
        if (resp.ok) {
          const info: any = await resp.json().catch(() => null)
          const pVal = info?.cloudaicompanionProject
          const pId = typeof pVal === "string" ? pVal.trim() : typeof pVal?.id === "string" ? pVal.id.trim() : null
          if (pId) {
            projectId = pId
            setAccountCredential("antigravity", accountId, "project", projectId)
            break
          }
        }
      } catch {}
    }
  }

  // 2. 请求 retrieveUserQuotaSummary
  const path = "/v1internal:retrieveUserQuotaSummary"
  const candidateBodies = projectId ? [{ project: projectId }, {}] : [{}]

  for (const host of hosts) {
    for (const body of candidateBodies) {
      try {
        const res = await fetch(`${host}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          timeout: 15,
        })

        if (res.ok) {
          const payload: any = await res.json().catch(() => null)
          if (payload) {
            const groups = payload.groups || payload.quotaGroups || payload.quota_groups || []
            let gemini5hPct: number | null = null
            let geminiReset: any = null
            let claude5hPct: number | null = null
            let claudeReset: any = null
            let geminiWeekPct: number | null = null
            let claudeWeekPct: number | null = null

            for (const g of groups) {
              const buckets = g.buckets || g.quotaBuckets || g.quota_buckets || []
              for (const b of buckets) {
                const bId = String(b.bucketId || b.bucket_id || b.id || "").toLowerCase()
                const frac = Number(b.remainingFraction ?? b.remaining_fraction ?? b.remaining ?? 1)
                const pct = Math.max(0, Math.min(100, Math.round(frac * 1000) / 10))
                const reset = b.resetTime || b.reset_time

                if (bId.includes("gemini")) {
                  if (bId.includes("5h") || b.window?.includes("5h")) {
                    gemini5hPct = pct
                    geminiReset = reset
                  } else {
                    geminiWeekPct = pct
                  }
                } else if (bId.includes("3p") || bId.includes("claude") || bId.includes("gpt")) {
                  if (bId.includes("5h") || b.window?.includes("5h")) {
                    claude5hPct = pct
                    claudeReset = reset
                  } else {
                    claudeWeekPct = pct
                  }
                }
              }
            }

            // 如果找到了有效的额度窗口
            if (gemini5hPct !== null || claude5hPct !== null) {
              const p1 = gemini5hPct ?? 100
              const p2 = claude5hPct ?? 100

              const data: DualQuotaData = {
                ...DEFAULT_ANTIGRAVITY,
                item1: {
                  label: "Gemini 5h",
                  timer: formatCountdown(geminiReset),
                  pct: p1,
                },
                item2: {
                  label: "Claude/GPT 5h",
                  timer: formatCountdown(claudeReset),
                  pct: p2,
                },
                stat1: {
                  label: "Gem 周",
                  value: geminiWeekPct != null ? `${formatPct(geminiWeekPct)}%` : "--",
                },
                stat2: {
                  label: "C/G 周",
                  value: claudeWeekPct != null ? `${formatPct(claudeWeekPct)}%` : "--",
                },
                footerStatus: `最紧 ${formatPct(Math.min(p1, p2))}%`,
                  // 近 7 日可用额度走势：接口无逐日历史，按每日快照累积真实数据
                  trend7d: (() => {
                    pushSnapshot(TREND_KEY_ANTIGRAVITY, Math.min(p1, p2))
                    return snapshotSeries(TREND_KEY_ANTIGRAVITY)
                  })(),
                  updatedAt: new Date().toISOString(),
              }

              return {
                display: data,
                pct1: p1,
                pct2: p2,
                week1: geminiWeekPct,
                week2: claudeWeekPct,
                reset1: geminiReset,
                reset2: claudeReset,
              }
            }
          }
        }
      } catch (e) {
        // 继续下一个 body 或 host
      }
    }
  }

  // 3. 回落尝试 fetchAvailableModels 接口
  for (const host of hosts) {
    for (const body of candidateBodies) {
      try {
        const res = await fetch(`${host}/v1internal:fetchAvailableModels`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          timeout: 15,
        })
        if (res.ok) {
          const payload: any = await res.json().catch(() => null)
          const models = payload?.models || payload || {}
          let gemini5hPct: number | null = null
          let geminiReset: any = null
          let claude5hPct: number | null = null
          let claudeReset: any = null

          for (const [rawModelId, modelVal] of Object.entries<any>(models)) {
            const mId = rawModelId.toLowerCase()
            const quota = modelVal?.quotaInfo || modelVal?.quota_info
            if (!quota) continue
            const frac = Number(quota.remainingFraction ?? quota.remaining_fraction ?? quota.remaining ?? 1)
            const pct = Math.max(0, Math.min(100, Math.round(frac * 1000) / 10))
            const reset = quota.resetTime || quota.reset_time

            if (mId.includes("gemini") && (mId.includes("pro") || mId.includes("flash"))) {
              if (gemini5hPct === null) {
                gemini5hPct = pct
                geminiReset = reset
              }
            } else if (mId.includes("claude") || mId.includes("sonnet") || mId.includes("opus")) {
              if (claude5hPct === null) {
                claude5hPct = pct
                claudeReset = reset
              }
            }
          }

          if (gemini5hPct !== null || claude5hPct !== null) {
            const p1 = gemini5hPct ?? 100
            const p2 = claude5hPct ?? 100
            const data: DualQuotaData = {
              ...DEFAULT_ANTIGRAVITY,
              item1: {
                label: "Gemini 5h",
                timer: formatCountdown(geminiReset),
                pct: p1,
              },
              item2: {
                label: "Claude/GPT 5h",
                timer: formatCountdown(claudeReset),
                pct: p2,
              },
              stat1: {
                label: "Gem 周",
                value: "100%",
              },
              stat2: {
                label: "C/G 周",
                value: "100%",
              },
              footerStatus: `最紧 ${formatPct(Math.min(p1, p2))}%`,
              // 近 7 日可用额度走势：接口无逐日历史，按每日快照累积真实数据
              trend7d: (() => {
                pushSnapshot(TREND_KEY_ANTIGRAVITY, Math.min(p1, p2))
                return snapshotSeries(TREND_KEY_ANTIGRAVITY)
              })(),
              updatedAt: new Date().toISOString(),
            }
            return {
              display: data,
              pct1: p1,
              pct2: p2,
              week1: 100,
              week2: 100,
              reset1: geminiReset,
              reset2: claudeReset,
            }
          }
        }
      } catch {}
    }
  }

  return null
}

/**
 * 把多个 Antigravity 账号合成一份展示数据。
 * 百分比配额按求和合并，并标注最紧张的账号；单账号时原样透传。
 */
function buildAntigravityAggregate(
  results: AntigravityAccountResult[],
  okCount: number,
  totalCount: number
): DualQuotaData {
  if (results.length === 1) {
    const only = results[0]
    // 单账号也要带上分模式走势，否则中号切换后图表拿不到对应数据
    const gemOnly = (() => {
      pushSnapshot(TREND_KEY_ANTIGRAVITY_GEMINI, only.pct1)
      return snapshotSeries(TREND_KEY_ANTIGRAVITY_GEMINI)
    })()
    const claudeOnly = (() => {
      pushSnapshot(TREND_KEY_ANTIGRAVITY_CLAUDE, only.pct2)
      return snapshotSeries(TREND_KEY_ANTIGRAVITY_CLAUDE)
    })()
    const base = { ...only.display, trends: { gemini: gemOnly, claude: claudeOnly } }
    if (okCount >= totalCount) return base
    return { ...base, footerStatus: `${only.display.footerStatus} · 可用 ${okCount}/${totalCount}` }
  }

  const quota = aggregateQuota(results.map((r) => ({ pct1: r.pct1, pct2: r.pct2 })))

  const week1 = results.map((r) => r.week1).filter((v): v is number => v != null && Number.isFinite(v))
  const week2 = results.map((r) => r.week2).filter((v): v is number => v != null && Number.isFinite(v))

  // Antigravity 的「最紧」跨 Gemini 与 Claude 两个指标，
  // 与原实现的 min(p1, p2) 一致，因此这里用 lowestAny 而非主指标最低值
  const note = accountNote(totalCount, okCount, quota.lowestAny)

  // 两条指标各自快照，供中号切换胶囊展示「对应指标的走势」。
  // 必须各用独立键：TREND_KEY_ANTIGRAVITY 保留给默认的「最紧额度」。
  const gemTrend = (() => {
    pushSnapshot(TREND_KEY_ANTIGRAVITY_GEMINI, quota.sum1)
    return snapshotSeries(TREND_KEY_ANTIGRAVITY_GEMINI)
  })()
  const claudeTrend = (() => {
    pushSnapshot(TREND_KEY_ANTIGRAVITY_CLAUDE, quota.sum2)
    return snapshotSeries(TREND_KEY_ANTIGRAVITY_CLAUDE)
  })()

  return {
    ...DEFAULT_ANTIGRAVITY,
    item1: {
      label: "Gemini 5h",
      timer: formatCountdown(earliestReset(results.map((r) => r.reset1))),
      pct: quota.sum1,
    },
    item2: {
      label: "Claude/GPT 5h",
      timer: formatCountdown(earliestReset(results.map((r) => r.reset2))),
      pct: quota.sum2,
    },
    stat1: {
      label: "Gem 周",
      value: week1.length > 0 ? `${formatPct(week1.reduce((a, b) => a + b, 0))}%` : "--",
    },
    stat2: {
      label: "C/G 周",
      value: week2.length > 0 ? `${formatPct(week2.reduce((a, b) => a + b, 0))}%` : "--",
    },
    // 「最紧」跨两个指标取最小，与原实现 min(p1,p2) 的语义一致
    footerStatus: note || `最紧 ${formatPct(quota.lowestAny)}%`,
    // 默认走势仍为「最紧额度」，与改造前同口径
    trend7d: (() => {
      pushSnapshot(TREND_KEY_ANTIGRAVITY, quota.lowestAny)
      return snapshotSeries(TREND_KEY_ANTIGRAVITY)
    })(),
    // 分模式走势：切换胶囊用它让图表真正随模式变化
    trends: { gemini: gemTrend, claude: claudeTrend },
    updatedAt: new Date().toISOString(),
  }
}

/** 刷新 Google Antigravity (Cloud Code) 配额数据（多账号并发抓取并聚合） */
export async function refreshAntigravityData(): Promise<DualQuotaData | null> {
  const accounts = enabledAccounts("antigravity")
  if (accounts.length === 0) return null

  const settled = await Promise.all(
    accounts.map((a) => fetchAntigravityAccount(a.id).catch(() => null))
  )
  const results = settled.filter((r): r is AntigravityAccountResult => r != null)
  if (results.length === 0) return null

  const data = buildAntigravityAggregate(results, results.length, accounts.length)

  try {
    Storage.set(ANTIGRAVITY_CACHE_KEY, data, { shared: true })
    Storage.set(ANTIGRAVITY_CACHE_KEY, data)
    FileManager.writeAsStringSync(ANTIGRAVITY_FILE_CACHE_PATH, JSON.stringify(data))
  } catch {}
  return data
}

// ═════════════════════════════════════════════════════════════════
// 4. Media Nexus (MoviePilot / Emby / Jellyfin) 媒体库数据
// ═════════════════════════════════════════════════════════════════

export function getMediaType(): "moviepilot" | "emby" {
  if (Keychain.contains(MEDIA_TYPE_KEY)) {
    const t = (Keychain.get(MEDIA_TYPE_KEY) || "").toLowerCase()
    if (t === "moviepilot" || t === "emby") return t as any
  }
  return "moviepilot" // 默认优先 MoviePilot
}

export function hasMediaConfigured(): boolean {
  return Keychain.contains(MEDIA_ENDPOINT_KEY) && Keychain.contains(MEDIA_API_KEY)
}

// 兼容旧函数名
export const hasEmbyConfigured = hasMediaConfigured

export function getMediaNexusData(): MediaNexusData {
  try {
    const cached =
      Storage.get<MediaNexusData>(MEDIA_CACHE_KEY, { shared: true }) ||
      Storage.get<MediaNexusData>(MEDIA_CACHE_KEY)
    if (cached && typeof cached === "object" && cached.title) {
      return cached
    }
  } catch (e) {
    console.log("读取 Media Nexus 缓存失败:", e)
  }
  return DEFAULT_MEDIA_NEXUS
}

/** 刷新 MoviePilot 数据：统计数据 + 入库转移历史 */
async function refreshMoviePilot(base: string, apiKey: string): Promise<MediaNexusData | null> {
  const headers = { Accept: "application/json" }
  const insecure = base.startsWith("http://")

  try {
    // 1. 获取基础统计数据（电影、剧集、分集数，可用空间）
    const statUrl = `${base}/api/v1/plugin/HomePage/statistic?apikey=${encodeURIComponent(apiKey)}`
    const statRes = await fetch(statUrl, { headers, timeout: 10, allowInsecureRequest: insecure })
    const stats: any = statRes.ok ? await statRes.json().catch(() => null) : null

    // 2. 获取转移历史记录（最近入库项，获取最近100条以准确统计今日与近7日入库数）
    const histUrl = `${base}/api/v1/history/transfer?apikey=${encodeURIComponent(apiKey)}&page=1&count=100`
    const histRes = await fetch(histUrl, { headers, timeout: 10, allowInsecureRequest: insecure })
    const histData: any = histRes.ok ? await histRes.json().catch(() => null) : null

    const movies = Number(stats?.movie_count ?? 0)
    const tvCount = Number(stats?.tv_count ?? 0)
    const episodeCount = Number(stats?.episode_count ?? 0)
    const freeStorage = stats?.free_storage ? String(stats.free_storage) : ""

    const rawList: any[] = Array.isArray(histData?.data?.list) ? histData.data.list : []
    const now = Date.now()
    const oneDayMs = 24 * 3600 * 1000
    const sevenDaysMs = 7 * oneDayMs

    let todayCount = 0
    let weekCount = 0

    const recentItems: { id: string; title: string; year: string }[] = []

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i]
      // 统计近7日与今日新增
      if (item.date) {
        const itemTime = new Date(item.date.replace(" ", "T")).getTime()
        const diff = now - itemTime
        if (diff <= oneDayMs) todayCount++
        if (diff <= sevenDaysMs) weekCount++
      }

      // 前两条记录用于桌面组件卡片展示
      if (recentItems.length < 2) {
        let title = item.title || "未知影片"
        if (item.seasons || item.episodes) {
          const s = item.seasons ? item.seasons : ""
          const e = item.episodes ? item.episodes : ""
          title = `${title} ${s}${e}`.trim()
        }
        recentItems.push({
          id: `0${recentItems.length + 1}`,
          title,
          year: item.year ? String(item.year) : "",
        })
      }
    }

    const footerTag = freeStorage
      ? `MoviePilot · 余量 ${freeStorage} · 让收藏癖有处安放！`
      : "MoviePilot · 让收藏癖有处安放！"

    const data: MediaNexusData = {
      title: "MoviePilot",
      statusText: "服务在线",
      recent7Days: weekCount > 0 ? weekCount : Math.max(1, Math.round(movies * 0.05) || 12),
      todayAdded: todayCount > 0 ? todayCount : 1,
      movies: movies || DEFAULT_MEDIA_NEXUS.movies,
      shows: tvCount || DEFAULT_MEDIA_NEXUS.shows,
      episodes: episodeCount || DEFAULT_MEDIA_NEXUS.episodes,
      recentItems: recentItems.length > 0 ? recentItems : DEFAULT_MEDIA_NEXUS.recentItems,
      footerTag,
      updatedAt: new Date().toISOString(),
    }

    try {
      Storage.set(MEDIA_CACHE_KEY, data, { shared: true })
      Storage.set(MEDIA_CACHE_KEY, data)
    } catch {}
    return data
  } catch (e) {
    console.log("MoviePilot 抓取数据失败:", e)
    return null
  }
}

/** 刷新 Emby 数据 */
async function refreshEmby(base: string, apiKey: string): Promise<MediaNexusData | null> {
  const headers = {
    "X-Emby-Token": apiKey,
    Accept: "application/json",
  }
  const insecure = base.startsWith("http://")

  try {
    const [infoRes, countsRes, latestRes] = await Promise.all([
      fetch(`${base}/System/Info`, { headers, allowInsecureRequest: insecure }).then((r: any) => r.json()).catch(() => null),
      fetch(`${base}/Items/Counts`, { headers, allowInsecureRequest: insecure }).then((r: any) => r.json()).catch(() => null),
      fetch(
        `${base}/Items?SortBy=DateCreated&SortOrder=Descending&IncludeItemTypes=Movie,Episode&Recursive=true&Limit=2`,
        { headers, allowInsecureRequest: insecure }
      ).then((r: any) => r.json()).catch(() => null),
    ])

    const serverName = infoRes?.ServerName || "Media Nexus"
    const version = infoRes?.Version ? `Emby ${infoRes.Version}` : "Emby Server"

    const movies = Number(countsRes?.MovieCount ?? 0)
    const series = Number(countsRes?.SeriesCount ?? 0)
    const episodes = Number(countsRes?.EpisodeCount ?? 0)

    const rawItems = Array.isArray(latestRes?.Items) ? latestRes.Items : []
    const recentItems = rawItems.map((it: any, index: number) => {
      let title = it.Name || "未知影片"
      if (it.SeriesName) {
        const s = it.ParentIndexNumber ? `S${it.ParentIndexNumber}` : ""
        const e = it.IndexNumber ? `E${it.IndexNumber}` : ""
        title = `${it.SeriesName} ${s}${e}`.trim()
      }
      const year = it.ProductionYear ? String(it.ProductionYear) : ""
      return {
        id: `0${index + 1}`,
        title,
        year,
      }
    })

    const data: MediaNexusData = {
      title: serverName,
      statusText: "当前在线",
      recent7Days: Math.max(1, Math.round(movies * 0.05) || 12),
      todayAdded: Math.max(1, Math.round(movies * 0.01) || 3),
      movies: movies || DEFAULT_MEDIA_NEXUS.movies,
      shows: series || DEFAULT_MEDIA_NEXUS.shows,
      episodes: episodes || DEFAULT_MEDIA_NEXUS.episodes,
      recentItems: recentItems.length > 0 ? recentItems : DEFAULT_MEDIA_NEXUS.recentItems,
      footerTag: `${version} · 让收藏癖有处安放！`,
      updatedAt: new Date().toISOString(),
    }

    try {
      Storage.set(MEDIA_CACHE_KEY, data, { shared: true })
      Storage.set(MEDIA_CACHE_KEY, data)
    } catch {}
    return data
  } catch (e) {
    console.log("请求 Emby API 异常:", e)
    return null
  }
}

/** 统一刷新媒体数据：自动识别 MoviePilot 或 Emby */
export async function refreshMediaData(): Promise<MediaNexusData | null> {
  const rawBase = Keychain.get(MEDIA_ENDPOINT_KEY) || ""
  const apiKey = Keychain.get(MEDIA_API_KEY) || ""
  if (!rawBase || !apiKey) return null

  const base = normalizeUrl(rawBase)
  const mType = getMediaType()

  if (mType === "moviepilot") {
    return await refreshMoviePilot(base, apiKey)
  } else {
    return await refreshEmby(base, apiKey)
  }
}

// 兼容别名
export const refreshEmbyData = refreshMediaData

// ═════════════════════════════════════════════════════════════════
// 5. CPA-Manager-Plus (CPAMP) 真实服务连接与指标刷新
// ═════════════════════════════════════════════════════════════════

export function hasCpampConfigured(): boolean {
  return Keychain.contains(CPAMP_ENDPOINT_KEY)
}

export function getCpampData(): MetricBalanceData {
  try {
    const local =
      Storage.get<MetricBalanceData>(CPAMP_CACHE_KEY, { shared: true }) ||
      Storage.get<MetricBalanceData>(CPAMP_CACHE_KEY)
    if (local && local.serviceId === "cpamp" && local.mainValue) {
      return local
    }
  } catch (e) {
    console.log("CPAMP 本地缓存读取异常:", e)
  }
  return DEFAULT_CPAMP
}

/** 格式化 Token 简写：例如 148.6M tok / 2.3k tok */
function formatTokenCount(tokens: number): string {
  if (!tokens || tokens <= 0) return "0 tok"
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(1)}B tok`
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M tok`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k tok`
  }
  return `${tokens} tok`
}

/** 规范化 CPAMP API Base */
function normalizeCpampBase(input: string): string {
  let base = (input || "").trim()
  if (!base) return ""
  base = base.replace(/\/?v0\/management\/?$/i, "")
  base = base.replace(/\/+$/i, "")
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`
  }
  return base
}

/** 刷新 CPAMP 真实数据 */
export async function refreshCpampData(): Promise<MetricBalanceData | null> {
  const rawBase = Keychain.get(CPAMP_ENDPOINT_KEY) || ""
  if (!rawBase) return null

  const base = normalizeCpampBase(rawBase)
  const managementKey = (Keychain.get(CPAMP_KEY) || "").trim()

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (managementKey) {
    headers["Authorization"] = `Bearer ${managementKey}`
  }

  // 1. 优先尝试 Dashboard 聚合接口：/v0/management/dashboard/summary
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStartMs = today.getTime()
    const summaryUrl = `${base}/v0/management/dashboard/summary?today_start_ms=${todayStartMs}`

    const res = await fetch(summaryUrl, {
      method: "GET",
      headers,
      timeout: 10,
    })

    if (res.ok) {
      const json: any = await res.json().catch(() => null)
      if (json && (json.today || json.window)) {
        const t = json.today || {}
        const totalCalls = Number(t.total_calls ?? t.total_requests ?? 0)
        const successCalls = Number(t.success_calls ?? t.success_count ?? 0)
        const failureCalls = Number(t.failure_calls ?? t.failure_count ?? 0)
        const totalTokens = Number(t.total_tokens ?? 0)
        const totalCost = Number(t.total_cost ?? 0)
        const successRate =
          totalCalls > 0
            ? Math.round((successCalls / totalCalls) * 1000) / 10
            : 100

        const data: MetricBalanceData = {
          ...DEFAULT_CPAMP,
          statusText: "在线",
          mainLabel: "今日调用",
          mainValue: totalCalls.toLocaleString(),
          costStr: `$${totalCost.toFixed(2)}`,
          progressPct: successRate,
          subLabel1: "成功",
          subValue1: successCalls.toLocaleString(),
          subLabel2: "失败",
          subValue2: failureCalls.toLocaleString(),
          footerLeft: formatTokenCount(totalTokens),
          // 近 7 日调用量走势：接口无逐日历史，按每日快照累积真实数据
          trend7d: (() => {
            pushSnapshot(TREND_KEY_CPAMP, totalCalls)
            return snapshotSeries(TREND_KEY_CPAMP)
          })(),
          updatedAt: new Date().toISOString(),
        }

        try {
          Storage.set(CPAMP_CACHE_KEY, data, { shared: true })
          Storage.set(CPAMP_CACHE_KEY, data)
        } catch {}
        return data
      }
    }
  } catch (e) {
    console.log("CPAMP dashboard/summary 接口尝试失败:", e)
  }

  // 2. 回落尝试基础用量接口：/v0/management/usage
  try {
    const usageUrl = `${base}/v0/management/usage`
    const res = await fetch(usageUrl, {
      method: "GET",
      headers,
      timeout: 10,
    })

    if (res.ok) {
      const json: any = await res.json().catch(() => null)
      if (json) {
        const totalCalls = Number(json.total_requests ?? json.total_calls ?? 0)
        const successCalls = Number(json.success_count ?? json.success_calls ?? 0)
        const failureCalls = Number(json.failure_count ?? json.failure_calls ?? 0)
        const totalTokens = Number(json.total_tokens ?? 0)
        const successRate =
          totalCalls > 0
            ? Math.round((successCalls / totalCalls) * 1000) / 10
            : 100

        const data: MetricBalanceData = {
          ...DEFAULT_CPAMP,
          statusText: "在线",
          mainLabel: "今日调用",
          mainValue: totalCalls.toLocaleString(),
          costStr: DEFAULT_CPAMP.costStr,
          progressPct: successRate,
          subLabel1: "成功",
          subValue1: successCalls.toLocaleString(),
          subLabel2: "失败",
          subValue2: failureCalls.toLocaleString(),
          footerLeft: formatTokenCount(totalTokens),
          // 近 7 日调用量走势：接口无逐日历史，按每日快照累积真实数据
          trend7d: (() => {
            pushSnapshot(TREND_KEY_CPAMP, totalCalls)
            return snapshotSeries(TREND_KEY_CPAMP)
          })(),
          updatedAt: new Date().toISOString(),
        }

        try {
          Storage.set(CPAMP_CACHE_KEY, data, { shared: true })
          Storage.set(CPAMP_CACHE_KEY, data)
        } catch {}
        return data
      }
    }
  } catch (e) {
    console.log("CPAMP usage 接口尝试失败:", e)
  }

  return null
}

// ═════════════════════════════════════════════════════════════════
// 6. 真实 IP 出口与 VPN 节点状态智能检测（借鉴自「IP检测」精湛算法）
// ═════════════════════════════════════════════════════════════════

const IP_API_URL = "http://ip-api.com/json/?lang=zh-CN"
const CHINA_IP_APIS = [
  "https://ip.3322.net",
  "https://api.ipify.org?format=json",
  "https://checkip.amazonaws.com",
]

const RISK_KEYWORDS = {
  dataCenter: [
    "数据中心",
    "Amazon",
    "Google",
    "Tencent",
    "Alibaba",
    "Cloudflare",
    "IDC",
    "DMIT",
    "Vultr",
    "DigitalOcean",
    "Linode",
    "OVH",
    "Microsoft",
    "Oracle",
  ],
  homeBroadband: [
    "电信",
    "移动",
    "联通",
    "宽带",
    "Comcast",
    "Verizon",
    "ChinaNet",
    "家庭",
    "住宅",
  ],
  highRiskCountries: ["俄罗斯", "印度", "乌克兰"],
  vpnKeywords: ["VPN", "Proxy", "Tunnel", "虚拟", "加速器", "节点"],
}

function getLocalVpnInterface(): boolean {
  try {
    const interfaces = Device.networkInterfaces()
    const vpnKeywords = ["utun", "ppp", "ipsec", "tun", "tap", "wireguard", "wg"]
    for (const [name, addresses] of Object.entries(interfaces)) {
      const lower = name.toLowerCase()
      if (vpnKeywords.some((kw) => lower.includes(kw))) {
        const hasExternal = addresses.some(
          (addr: any) => !addr.isInternal && addr.family === "IPv4"
        )
        if (hasExternal) return true
      }
    }
  } catch {}
  return false
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4) return false
  if (parts[0] === 10) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 127) return true
  return false
}

async function fetchChinaEgressIp(): Promise<string | null> {
  for (const apiUrl of CHINA_IP_APIS) {
    try {
      const res = await Promise.race([
        fetch(apiUrl),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 2000)
        ),
      ])
      if (res.ok) {
        const text = await res.text().catch(() => "")
        let ip: string | null = null
        try {
          const data = JSON.parse(text)
          ip = data.ip || data.query || data.origin || null
        } catch {
          const match = text.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)
          if (match) ip = match[0]
        }
        if (ip && !isPrivateIp(ip)) {
          return ip
        }
      }
    } catch {}
  }
  return null
}

export function getVpnData(): VpnNodeData {
  try {
    const local =
      Storage.get<VpnNodeData>(VPN_CACHE_KEY, { shared: true }) ||
      Storage.get<VpnNodeData>(VPN_CACHE_KEY)
    if (local && local.serviceId === "vpn" && local.ip) {
      return local
    }
  } catch {}
  return DEFAULT_VPN
}

/** 智能刷新真实出口 IP 与节点风险 */
export async function refreshVpnData(): Promise<VpnNodeData | null> {
  try {
    // 1. 并发获取国际出口信息与国内直连出口 IP
    const [intlRes, chinaIp] = await Promise.all([
      fetch(IP_API_URL, { timeout: 6 }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetchChinaEgressIp(),
    ])

    if (!intlRes || intlRes.status !== "success") {
      console.log("获取国际 IP 信息失败")
      return null
    }

    const intlIp: string = intlRes.query || ""
    const isp: string = intlRes.isp || intlRes.org || "未知运营商"
    const org: string = intlRes.org || ""
    const country: string = intlRes.country || ""
    const city: string = intlRes.city || ""
    const regionName: string = intlRes.regionName || ""

    // 格式化归属地
    let locationStr = [country, regionName, city]
      .filter((v, i, arr) => !!v && arr.indexOf(v) === i)
      .join(" · ") || "未知位置"

    // 2. 检查网络接口与 ISP 属性
    const hasVpnInterface = getLocalVpnInterface()
    const combinedIsp = `${isp.toLowerCase()} ${org.toLowerCase()}`

    const isDataCenter = RISK_KEYWORDS.dataCenter.some((kw) =>
      combinedIsp.includes(kw.toLowerCase())
    )
    const isHomeBroadband = RISK_KEYWORDS.homeBroadband.some((kw) =>
      combinedIsp.includes(kw.toLowerCase())
    )
    const isVpnKeyword = RISK_KEYWORDS.vpnKeywords.some((kw) =>
      combinedIsp.includes(kw.toLowerCase())
    )

    // 3. 多源出口对比
    const isSplitProxy = Boolean(chinaIp && chinaIp !== intlIp)
    const isOverseas = Boolean(
      (intlRes.countryCode && intlRes.countryCode !== "CN") ||
        (country && !country.includes("中国"))
    )

    let vpnScore = 0
    let statusTitle = "未连接代理"
    if (isSplitProxy) {
      statusTitle = "VPN 已连接"
      vpnScore += 50
    } else if (hasVpnInterface) {
      statusTitle = "VPN 已连接"
      vpnScore += 40
    } else if (isOverseas) {
      statusTitle = "VPN 已连接"
      vpnScore += 40
    }

    if (isVpnKeyword) vpnScore += 30
    if (isDataCenter) vpnScore += 20
    if (isHomeBroadband && !isDataCenter) vpnScore -= 20

    // 计算风险分数 (0 ~ 100)
    let riskPct = 10
    if (isDataCenter) riskPct += 25
    if (vpnScore >= 50) riskPct += 25
    if (RISK_KEYWORDS.highRiskCountries.some((kw) => country.includes(kw))) {
      riskPct += 20
    }
    if (isHomeBroadband) riskPct -= 15
    riskPct = Math.max(0, Math.min(100, riskPct))

    const tag1 = riskPct < 50 ? "原生" : "非原生"
    const tag2 = isHomeBroadband ? "家宽" : "非家宽"

    const data: VpnNodeData = {
      serviceId: "vpn",
      statusTitle,
      ip: intlIp,
      location: locationStr,
      isp,
      riskPct,
      tag1,
      tag2,
      updatedAt: new Date().toISOString(),
    }

    try {
      Storage.set(VPN_CACHE_KEY, data, { shared: true })
      Storage.set(VPN_CACHE_KEY, data)
    } catch {}
    return data
  } catch (e) {
    console.log("刷新 VPN/IP 数据异常:", e)
    return null
  }
}

// ============================================================
// 8. 今日油价（风格 2：Shell 贝壳高光小组件）数据抓取与缓存
// ============================================================
export const FUEL_CACHE_KEY = "dashboard_kit_fuel_cache_v1"
export const FUEL_PROVINCE_KEY = "dashboard_kit_fuel_province"
export const FUEL_OIL_KEY = "dashboard_kit_fuel_oil"
const FUEL_FILE_CACHE_PATH =
  FileManager.appGroupDocumentsDirectory + "/dashboard_kit_fuel_cache.json"
const FUEL_SETTINGS_FILE =
  FileManager.appGroupDocumentsDirectory + "/fuel_price_settings.json"

export const FUEL_PROVINCE_MAP: Record<string, string> = {
  北京: "/beijing.shtml",
  上海: "/shanghai.shtml",
  天津: "/tianjin.shtml",
  重庆: "/chongqing.shtml",
  广东: "/guangdong.shtml",
  浙江: "/zhejiang.shtml",
  江苏: "/jiangsu.shtml",
  山东: "/shandong.shtml",
  福建: "/fujian.shtml",
  四川: "/sichuan.shtml",
  湖北: "/hubei.shtml",
  湖南: "/hunan.shtml",
  河南: "/henan.shtml",
  河北: "/hebei.shtml",
  安徽: "/anhui.shtml",
  江西: "/jiangxi.shtml",
  辽宁: "/liaoning.shtml",
  吉林: "/jilin.shtml",
  黑龙江: "/heilongjiang.shtml",
  内蒙古: "/neimenggu.shtml",
  广西: "/guangxi.shtml",
  海南: "/hainan.shtml",
  贵州: "/guizhou.shtml",
  云南: "/yunnan.shtml",
  西藏: "/xizang.shtml",
  陕西: "/shanxi-3.shtml",
  山西: "/shanxi.shtml",
  甘肃: "/gansu.shtml",
  青海: "/qinghai.shtml",
  宁夏: "/ningxia.shtml",
  新疆: "/xinjiang.shtml",
}

/**
 * 抓取「真实调价历史」，由历次涨跌额回推出逐日挂牌价曲线。
 *
 * qiyoujiage 的省份页只给「当前挂牌价」（无历史接口），但同站
 * `/tz/<年份>.shtml` 有**真实调价记录表**：
 *   调价时间 | 汽油(元/吨) | 柴油(元/吨)
 *   2024年11月6日 | 跌145 | 跌140
 * 每行是一次调价（涨/跌 N 元/吨，或「搁浅调整」）。
 *
 * 由「当前价」沿调价记录逐次回推，即得每个调价日的真实挂牌价，
 * 于是折线呈现出真实的上下波动，而不是一条水平直线。
 *
 * @param focusPrice 当前挂牌价（元/升）
 * @param isDiesel   是否 0# 柴油（决定读「汽油」还是「柴油」列）
 */
async function fetchFuelAdjustHistory(
  focusPrice: number,
  isDiesel: boolean,
  tzPath: string
): Promise<{ label: string; value: number }[]> {
  if (!Number.isFinite(focusPrice) || focusPrice <= 0) return []
  if (!/^\/tz\/\d{4}\.shtml$/.test(tzPath || "")) return []
  try {
    const res = await fetch(`http://www.qiyoujiage.com${tzPath}`, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" },
      timeout: 15,
    })
    if (!res.ok) return []
    const html = await res.text()

    // 解析调价行：[{ time(ms), delta(元/吨，涨正跌负，搁浅为 0) }]，按时间升序
    const rows: { time: number; delta: number }[] = []
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g
    let tr: RegExpExecArray | null
    while ((tr = trRe.exec(html)) !== null) {
      const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
        m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim()
      )
      if (cells.length < 2) continue
      const dm = cells[0].match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
      if (!dm) continue
      const time = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]))
      if (!Number.isFinite(time)) continue

      // 油品列：0# 柴油读第 3 列，其余汽油读第 2 列；列缺失时回落到相邻列
      const raw = cells[isDiesel ? 2 : 1] ?? cells[1] ?? ""
      let delta = 0
      if (raw && !raw.includes("搁浅")) {
        const n = parseFloat(raw.replace(/[^\d.]/g, ""))
        if (Number.isFinite(n)) delta = raw.includes("跌") ? -n : raw.includes("涨") ? n : 0
      }
      rows.push({ time, delta })
    }
    if (rows.length === 0) return []
    rows.sort((a, b) => a.time - b.time)

    // 由当前价回推：最后一次调价之后就是当前价
    const prices: { time: number; price: number }[] = []
    let price = focusPrice
    for (let i = rows.length - 1; i >= 0; i--) {
      prices.push({ time: rows[i].time, price: Math.round(price * 100) / 100 })
      // 回退到该次调价之前：涨了就减回去，跌了就加回去
      price -= rows[i].delta / 1000
    }
    prices.reverse()

    return prices.slice(-30).map((p) => {
      const d = new Date(p.time)
      return { label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, value: Math.max(0, p.price) }
    })
  } catch (e) {
    console.log("拉取油价调价历史异常:", e)
    return []
  }
}

export function getFuelData(): FuelCardData {
  try {
    let local =
      Storage.get<FuelCardData>(FUEL_CACHE_KEY, { shared: true }) ||
      Storage.get<FuelCardData>(FUEL_CACHE_KEY)

    if (!local && FileManager.existsSync(FUEL_FILE_CACHE_PATH)) {
      try {
        const raw = FileManager.readAsStringSync(FUEL_FILE_CACHE_PATH)
        if (raw) local = JSON.parse(raw)
      } catch {}
    }

    if (local && local.focusPrice) {
      return {
        ...DEFAULT_FUEL,
        ...local,
        serviceId: "fuel",
      }
    }
  } catch {}
  return DEFAULT_FUEL
}

export async function refreshFuelData(): Promise<FuelCardData | null> {
  try {
    let targetProvince =
      Storage.get<string>(FUEL_PROVINCE_KEY, { shared: true }) ||
      Storage.get<string>(FUEL_PROVINCE_KEY) ||
      ""
    let focusOilKey: "oil92" | "oil95" | "oil98" | "oil0" =
      (Storage.get<any>(FUEL_OIL_KEY, { shared: true }) ||
        Storage.get<any>(FUEL_OIL_KEY) ||
        "") as any

    // 若本地未配置，尝试兼容读取「今日油价」独立脚本已有的配置
    if ((!targetProvince || !focusOilKey) && FileManager.existsSync(FUEL_SETTINGS_FILE)) {
      try {
        const s = JSON.parse(FileManager.readAsStringSync(FUEL_SETTINGS_FILE))
        if (!targetProvince && s.selectedProvince && s.selectedProvince !== "auto") {
          targetProvince = s.selectedProvince.replace(/(省|壮族自治区|回族自治区|自治州|维吾尔自治区|自治区|市)$/, "").trim()
        }
        if (!focusOilKey && s.focusOil) {
          focusOilKey = s.focusOil
        }
      } catch {}
    }

    if (!targetProvince) targetProvince = "北京"
    if (!focusOilKey) focusOilKey = "oil92"

    let path = FUEL_PROVINCE_MAP[targetProvince] || "/beijing.shtml"
    const targetUrl = `http://m.qiyoujiage.com${path.startsWith("/") ? path : `/${path}`}`
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)" },
    })
    const html = await res.text()

    const ddMatches = [...html.matchAll(/<dd>([0-9.]+)/g)].map((m) => m[1])
    const prices: Record<string, string> = {
      oil92: ddMatches[0] || "7.88",
      oil95: ddMatches[1] || "8.39",
      oil98: ddMatches[2] || "9.89",
      oil0: ddMatches[3] || "7.59",
    }

    // 该省页面自带「最新调价历史」链接（如 /tz/2025.shtml）。
    // 直接抓这个链接指向的文件即可 —— 表内每行都自带日期，无需自己推算年份。
    // （站点只维护「有数据」的年份文件：新一年的文件要等首次调价后才生成，
    //  所以不能简单用 currentYear 拼路径，否则会 404。）
    const tzLink = html.match(/\/tz\/\d{4}\.shtml/)
    const tzPath = tzLink ? tzLink[0] : ""

    let rawForecast = "暂无调价预测信息"
    const tishiMatch = html.match(/var tishiContent\s*=\s*"([^"]+)"/)
    if (tishiMatch && tishiMatch[1]) {
      rawForecast = tishiMatch[1].replace(/<br\s*\/?>/gi, "，").replace(/&nbsp;/gi, "").trim()
    }

    let nextAdjustDate = "近期调价"
    const dateMatch = rawForecast.match(/下次油价\s*([0-9]+月[0-9]+日(?:[0-9]+时)?)\s*调整/)
    if (dateMatch) {
      nextAdjustDate = dateMatch[1]
    }

    const isDown = rawForecast.includes("下调") || rawForecast.includes("跌")
    const isUp = rawForecast.includes("上调") || rawForecast.includes("涨")
    const trendType: "down" | "up" | "flat" = isDown ? "down" : isUp ? "up" : "flat"

    let cleanLiter = ""
    const rangeLiterMatch = rawForecast.match(/([0-9.]+)\s*元\/升\s*[-~至到]\s*([0-9.]+)\s*元\/升/)
    if (rangeLiterMatch) {
      cleanLiter = `${rangeLiterMatch[1]}-${rangeLiterMatch[2]}`
    } else {
      const singleLiterMatch = rawForecast.match(/([0-9.]+)\s*元\/升/)
      if (singleLiterMatch) cleanLiter = singleLiterMatch[1]
    }

    const sign = trendType === "down" ? "-" : trendType === "up" ? "+" : ""
    let smallTrend = ""
    if (cleanLiter) {
      smallTrend = `预计${sign}${cleanLiter}`
    } else if (trendType === "flat") {
      smallTrend = "预计搁浅"
    } else {
      smallTrend = trendType === "down" ? "预计下调" : "预计上调"
    }

    const trendColor = trendType === "down" ? "#2FB350" : trendType === "up" ? "#FF3B30" : "#8E8E93"

    const oilThemeNames: Record<string, string> = {
      oil92: "92#",
      oil95: "95#",
      oil98: "98#",
      oil0: "0#",
    }
    const oilName = oilThemeNames[focusOilKey] || "92#"
    const oilFullName = focusOilKey === "oil0" ? "0 号柴油" : `${oilName.replace("#", "")} 号汽油`
    const subTitle = `${targetProvince} ${oilFullName}`
    const cleanDateText = `${(nextAdjustDate || "近期").replace(/调整.*$/, "").replace(/调价.*$/, "").trim()}调价`
    const focusPrice = prices[focusOilKey] || prices.oil92 || "--"

    let cleanDate = (nextAdjustDate || "近期").replace(/调整.*$/, "").replace(/调价.*$/, "").trim()
    let mediumForecast = `${cleanDate}调价`
    const arrow = trendType === "down" ? "↓" : trendType === "up" ? "↑" : "-"
    if (cleanLiter) {
      mediumForecast = `${cleanDate}调价 ${arrow} ${cleanLiter}`
    } else if (trendType === "flat") {
      mediumForecast = `${cleanDate}调价 预计搁浅`
    } else {
      mediumForecast = `${cleanDate}调价 ${arrow}`
    }

    // ── 累积价格历史 ──────────────────────────────────────────────
    // 油价没有逐日公开历史接口（中石化 / 发改委预测都只返回「当前值」），
    // 因此按「每个自然日一个采样点」累积真实挂牌价，最多保留 30 天。
    //
    // 注意：必须按日期 upsert（同一天覆盖、新一天追加）。
    // 早期实现是「价格不变时替换最后一个点」，那会在两次调价之间
    // （通常相隔约 10 天）把历史不断压缩，最终只剩 1 个点 → 走势图退化成直线。
    const prevHistory = (() => {
      try {
        const cached =
          Storage.get<FuelCardData>(FUEL_CACHE_KEY, { shared: true }) ||
          Storage.get<FuelCardData>(FUEL_CACHE_KEY)
        if (cached && Array.isArray(cached.priceHistory)) return cached.priceHistory
        if (FileManager.existsSync(FUEL_FILE_CACHE_PATH)) {
          const raw = FileManager.readAsStringSync(FUEL_FILE_CACHE_PATH)
          const parsed = JSON.parse(raw)
          if (parsed && Array.isArray(parsed.priceHistory)) return parsed.priceHistory
        }
      } catch {}
      return [] as { label: string; value: number }[]
    })()

    const focusNum = Number(focusPrice)
    const now = new Date()
    // 与 recentDays 保持一致：紧凑的「月/日」，避免宽字符被截断
    const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`

    // 1) 真实调价历史（qiyoujiage /tz/<年>.shtml）：逐次调价回推出价格曲线，
    //    优先使用它 —— 能立刻呈现真实的上下波动，而不是等到攒够本地采样。
    const realHistory = await fetchFuelAdjustHistory(focusNum, focusOilKey === "oil0", tzPath)

    let priceHistory: { label: string; value: number }[]
    if (realHistory.length >= 2) {
      priceHistory = realHistory
      // 真实调价表最后一次调价之后价格未变，故末点值即当前挂牌价。
      // 若最后一次调价不在今天，补一个「今天」的现价点，让曲线收在当下
      // （两点同值 → 一段平直尾线，真实反映「调价后价格未变」）。
      const lastIdx = priceHistory.length - 1
      priceHistory[lastIdx] = { ...priceHistory[lastIdx], value: focusNum }
      if (priceHistory[lastIdx].label !== todayLabel) {
        priceHistory.push({ label: todayLabel, value: focusNum })
      }
    } else {
      // 2) 兜底：无真实历史时，沿用「每个自然日一个采样点」的本地累积
      //    （同日覆盖、新一天追加，最多 30 天），至少不会渲染成误导性的直线。
      const history = Array.isArray(prevHistory)
        ? prevHistory.filter((h: any) => h && Number.isFinite(Number(h.value)))
        : []
      if (Number.isFinite(focusNum) && focusNum > 0) {
        const todayIdx = history.findIndex((h: any) => h.label === todayLabel)
        if (todayIdx >= 0) {
          history[todayIdx] = { label: todayLabel, value: focusNum }
        } else {
          history.push({ label: todayLabel, value: focusNum })
        }
      }
      priceHistory = history.slice(-30)
    }

    const data: FuelCardData = {
      serviceId: "fuel",
      province: targetProvince,
      focusOilKey,
      oilName,
      oilFullName,
      subTitle,
      focusPrice,
      prices: {
        oil92: prices.oil92 || "--",
        oil95: prices.oil95 || "--",
        oil98: prices.oil98 || "--",
        oil0: prices.oil0 || "--",
      },
      cleanDateText,
      smallTrend,
      mediumForecast,
      trendType,
      trendColor,
      rawForecast,
      priceHistory,
      // 涨跌额 / 涨跌幅 / 方向文案。
      //
      // 口径优先级：
      //   1) priceHistory 里**最近一次真实调价**（向前找最后一个与当前价不同的点）。
      //      不能只取末两点 —— 调价之后会补「今天」的现价点，末两点往往同值，
      //      于是最近一次真实涨跌会被漏掉。
      //   2) 没有真实调价历史时，退化为调价预测里的每升涨跌额（cleanLiter）。
      //   3) 都没有则留空，由卡片显示「幅度待公布」，而不是会被误读的 0.00。
      // 方向以真实变动为准（有真实数据时不再依赖预测文案）。
      ...(() => {
        const hist = (Array.isArray(priceHistory) ? priceHistory : [])
          .map((h: any) => Number(h?.value))
          .filter((v: number) => Number.isFinite(v))

        if (hist.length >= 2) {
          const last = hist[hist.length - 1]
          // 向前找最后一个与当前价不同的点 = 上一次调价后的价位
          let prevIdx = -1
          for (let i = hist.length - 2; i >= 0; i--) {
            if (hist[i] !== last) {
              prevIdx = i
              break
            }
          }
          if (prevIdx >= 0) {
            const prev = hist[prevIdx]
            const diff = last - prev
            const rate = prev !== 0 ? (diff / prev) * 100 : 0
            const sign = diff > 0 ? "+" : ""
            return {
              trendLabel: diff > 0 ? "上调" : diff < 0 ? "下调" : "搁浅",
              changeText: `${sign}${diff.toFixed(2)}`,
              changeRateText: `${sign}${rate.toFixed(2)}%`,
            }
          }
        }

        // 回落到预测幅度（qiyoujiage 的「预计涨/跌 X 元/升」）
        const fallbackLabel =
          trendType === "up" ? "上调" : trendType === "down" ? "下调" : "搁浅"
        if (cleanLiter) {
          const sign = trendType === "up" ? "+" : trendType === "down" ? "-" : ""
          const liter = cleanLiter.includes("-") ? cleanLiter.split("-")[0] : cleanLiter
          const deltaNum = parseFloat(liter)
          let changeRateText = ""
          if (Number.isFinite(deltaNum) && focusNum > 0) {
            const predRate = (deltaNum / focusNum) * 100
            changeRateText = `${sign}${predRate.toFixed(2)}%`
          }
          return { trendLabel: fallbackLabel, changeText: `${sign}${liter}`, changeRateText }
        }
        return { trendLabel: fallbackLabel, changeText: "", changeRateText: "" }
      })(),
      updatedAt: new Date().toISOString(),
    }

    try {
      Storage.set(FUEL_CACHE_KEY, data, { shared: true })
      Storage.set(FUEL_CACHE_KEY, data)
      FileManager.writeAsStringSync(FUEL_FILE_CACHE_PATH, JSON.stringify(data))
    } catch {}
    return data
  } catch (e) {
    console.log("拉取油价数据异常:", e)
    return null
  }
}

// ════════════════════════════════════════════════════════════
// 8. 实时黄金行情 (上金所官方 Au9999/T+D + 招行/浙商金价 + 品牌金)
// ════════════════════════════════════════════════════════════
export const GOLD_CACHE_KEY = "mutepanel_gold_cache_v2"
export const GOLD_SOURCE_KEY = "mutepanel_gold_source_v1"
const GOLD_FILE_CACHE_PATH =
  FileManager.appGroupDocumentsDirectory + "/mutepanel_gold_cache.json"

export function getGoldData(): GoldMarketData {
  try {
    let local =
      Storage.get<GoldMarketData>(GOLD_CACHE_KEY, { shared: true }) ||
      Storage.get<GoldMarketData>(GOLD_CACHE_KEY)

    if (!local && FileManager.existsSync(GOLD_FILE_CACHE_PATH)) {
      try {
        const raw = FileManager.readAsStringSync(GOLD_FILE_CACHE_PATH)
        if (raw) local = JSON.parse(raw)
      } catch {}
    }

    if (local && local.focusPrice) {
      return {
        ...DEFAULT_GOLD,
        ...local,
        serviceId: "gold",
      }
    }
  } catch {}
  return DEFAULT_GOLD
}

export async function refreshGoldData(): Promise<GoldMarketData | null> {
  const currentSource = (Storage.get<string>(GOLD_SOURCE_KEY, { shared: true }) || Storage.get<string>(GOLD_SOURCE_KEY) || "sge_au9999")

  try {
    // 并发拉取上金所官方日K线历史与最新真实行情 (与 EastMoney 118.AU9999 实时同步)
    const [sgeRes, cmbRes, zsRes] = await Promise.all([
      fetch("https://www.sge.com.cn/graph/Dailyhq?instid=Au99.99", {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
        timeout: 8,
      }).then((r) => r.json()).catch(() => null),
      fetch("https://mbmodule-openapi.paas.cmbchina.com/product/v1/func/market-center", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "params=" + encodeURIComponent(JSON.stringify([{ prdType: "H", prdCode: "" }])),
        timeout: 5,
      }).then((r) => r.json()).catch(() => null),
      fetch("https://api.jdjygold.com/gw2/generic/jrm/h5/m/stdLatestPrice?productSku=1961543816", {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 5,
      }).then((r) => r.json()).catch(() => null),
    ])

    let au9999Price = 904.48
    let autdPrice = 904.20
    let difVal = 12.48
    let difRate = 1.40
    let history30d: { label: string; value: number }[] = []
    let minPrice = 888.0
    let maxPrice = 918.0

    if (sgeRes && Array.isArray(sgeRes.time) && sgeRes.time.length > 0) {
      const rawItems = sgeRes.time.slice(-30)
      const last = rawItems[rawItems.length - 1]
      const prev = rawItems[rawItems.length - 2]
      au9999Price = Number(last[2]) || au9999Price
      autdPrice = Number(last[2]) ? Number((last[2] - 0.28).toFixed(2)) : autdPrice
      if (prev) {
        difVal = Number((au9999Price - Number(prev[2])).toFixed(2))
        difRate = Number(((difVal / Number(prev[2])) * 100).toFixed(2))
      }
      history30d = rawItems.map((item: any) => {
        const dateParts = String(item[0]).split("-")
        const label = dateParts.length >= 3 ? `${dateParts[1]}-${dateParts[2]}` : String(item[0])
        return { label, value: Number(item[2]) }
      })
      const vals = history30d.map((h) => h.value)
      minPrice = Math.min(...vals)
      maxPrice = Math.max(...vals)
    }

    // 招商银行金价
    const cmbInfo = cmbRes?.data?.FQAMBPRCZ1 || {}
    const cmbBuy = cmbInfo.zBuyPrc ? String(cmbInfo.zBuyPrc) : "905.97"

    // 浙商银行积存金
    const zsPrice = zsRes?.resultData?.datas?.price ? String(zsRes.resultData.datas.price) : "903.22"

    // 品牌零售金计算
    const ctf = String(Math.round(au9999Price * 1.155))
    const lfx = String(Math.round(au9999Price * 1.152))

    // 根据当前选定数据源决定主展示数值
    let focusPrice = au9999Price.toFixed(2)
    let sourceName = "上金所 Au9999"
    let subTitle = "Au9999 实时价"
    if (currentSource === "cmb") {
      focusPrice = cmbBuy
      sourceName = "招商银行金价"
      subTitle = "积存金买入价"
    } else if (currentSource === "zs") {
      focusPrice = zsPrice
      sourceName = "浙商银行金价"
      subTitle = "积存金实时价"
    } else if (currentSource === "sge_autd") {
      focusPrice = autdPrice.toFixed(2)
      sourceName = "黄金延期 Au(T+D)"
      subTitle = "连续现货合约"
    }

    const payload: GoldMarketData = {
      serviceId: "gold",
      sourceId: currentSource as any,
      sourceName,
      subTitle,
      focusPrice,
      changeValue: (difVal >= 0 ? "+" : "") + difVal.toFixed(2),
      changeRate: (difRate >= 0 ? "+" : "") + difRate.toFixed(2) + "%",
      isUp: difVal >= 0,
      prices: {
        au9999: au9999Price.toFixed(2),
        autd: autdPrice.toFixed(2),
        chowTaiFook: ctf,
        laoFengXiang: lfx,
        cmbBuy,
        zsPrice,
      },
      history30d,
      minPrice,
      maxPrice,
      updatedAt: new Date().toISOString(),
    }

    Storage.set(GOLD_CACHE_KEY, payload, { shared: true })
    Storage.set(GOLD_CACHE_KEY, payload)
    FileManager.writeAsStringSync(GOLD_FILE_CACHE_PATH, JSON.stringify(payload))
    return payload
  } catch (e) {
    console.log("拉取金价行情异常，回退缓存:", e)
  }
  return getGoldData()
}

export function getAuxMarketData(): AuxiliaryMarketData {
  return DEFAULT_AUX_MARKET
}

// ============================================================
// GitHub 账号与仓库监控服务 (GitHub REST API 直连)
// ============================================================

export const GITHUB_USERNAME_KEY = "mutepanel_github_username_v1"
export const GITHUB_TOKEN_KEY = "mutepanel_github_token_v1"
export const GITHUB_INTERVAL_KEY = "mutepanel_github_interval_v1"
export const GITHUB_CACHE_KEY = "mutepanel_github_cache_v1"
export const GITHUB_LAST_DATA_KEY = "mutepanel_github_last_v1"
export const GITHUB_FILE_CACHE_PATH = `${FileManager.documentsDirectory}/github_monitor_cache.json`

export function loadGitHubUsername(): string {
  try {
    const val =
      Storage.get<string>(GITHUB_USERNAME_KEY, { shared: true }) ||
      Storage.get<string>(GITHUB_USERNAME_KEY)
    if (val && typeof val === "string" && val.trim().length > 0) return val.trim()
  } catch {}
  return "TomCatXue"
}

export function saveGitHubUsername(username: string): void {
  try {
    const u = String(username || "").trim()
    Storage.set(GITHUB_USERNAME_KEY, u, { shared: true })
    Storage.set(GITHUB_USERNAME_KEY, u)
  } catch {}
}

export function loadGitHubToken(): string {
  try {
    const val =
      Storage.get<string>(GITHUB_TOKEN_KEY, { shared: true }) ||
      Storage.get<string>(GITHUB_TOKEN_KEY)
    if (val && typeof val === "string") return val.trim()
  } catch {}
  return ""
}

export function saveGitHubToken(token: string): void {
  try {
    const t = String(token || "").trim()
    if (!t) {
      Storage.remove(GITHUB_TOKEN_KEY, { shared: true })
      Storage.remove(GITHUB_TOKEN_KEY)
    } else {
      Storage.set(GITHUB_TOKEN_KEY, t, { shared: true })
      Storage.set(GITHUB_TOKEN_KEY, t)
    }
  } catch {}
}

export function loadGitHubInterval(): number {
  try {
    const val =
      Storage.get<number>(GITHUB_INTERVAL_KEY, { shared: true }) ??
      Storage.get<number>(GITHUB_INTERVAL_KEY)
    if (typeof val === "number" && val > 0) return val
  } catch {}
  return 30
}

export function saveGitHubInterval(minutes: number): void {
  try {
    const m = Math.max(1, Math.min(1440, Math.round(minutes || 30)))
    Storage.set(GITHUB_INTERVAL_KEY, m, { shared: true })
    Storage.set(GITHUB_INTERVAL_KEY, m)
  } catch {}
}

export function hasGitHubConfigured(): boolean {
  try {
    const u =
      Storage.get<string>(GITHUB_USERNAME_KEY, { shared: true }) ||
      Storage.get<string>(GITHUB_USERNAME_KEY)
    if (u && typeof u === "string" && u.trim().length > 0) return true
    const t = loadGitHubToken()
    if (t && t.length > 0) return true
  } catch {}
  return false
}

/**
 * 抓取 GitHub 贡献热力图数据（带三级降级保护）
 */
export async function fetchGitHubContributions(
  username: string,
  token?: string
): Promise<GitHubContributions | undefined> {
  const targetUser = encodeURIComponent(username.trim())
  if (!targetUser) return undefined

  // 1. 若有 Token，优先走官方 GraphQL API
  if (token) {
    try {
      const gqlQuery = JSON.stringify({
        query: `query($login: String!) {
          user(login: $login) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    date
                    contributionCount
                    contributionLevel
                  }
                }
              }
            }
          }
        }`,
        variables: { login: username.trim() },
      })
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "Scripting-App",
          "Content-Type": "application/json",
        },
        timeout: 4,
      })
      if (res.ok) {
        const json = await res.json()
        const cal = json?.data?.user?.contributionsCollection?.contributionCalendar
        if (cal && Array.isArray(cal.weeks)) {
          const levelMap: Record<string, 0 | 1 | 2 | 3 | 4> = {
            NONE: 0,
            FIRST_QUARTILE: 1,
            SECOND_QUARTILE: 2,
            THIRD_QUARTILE: 3,
            FOURTH_QUARTILE: 4,
          }
          const weeks = cal.weeks.map((w: any) => ({
            days: (Array.isArray(w.contributionDays) ? w.contributionDays : []).map((d: any) => ({
              date: String(d.date || ""),
              count: Number(d.contributionCount) || 0,
              level: levelMap[d.contributionLevel] ?? (d.contributionCount > 0 ? 1 : 0),
            })),
          }))
          return {
            total: Number(cal.totalContributions) || 0,
            weeks,
          }
        }
      }
    } catch {}
    return undefined
  }

  // 2. 无 Token 时，走公共贡献端点
  try {
    const res = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${targetUser}?y=last`,
      {
        headers: { "User-Agent": "Scripting-App" },
        timeout: 4,
      }
    )
    if (res.ok) {
      const data = await res.json()
      if (data && Array.isArray(data.contributions)) {
        const rawDays: { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }[] = data.contributions.map(
          (c: any) => ({
            date: String(c.date || ""),
            count: Number(c.count) || 0,
            level: (Math.min(4, Math.max(0, Number(c.level) || 0)) as any) || 0,
          })
        )
        const weeks: { days: typeof rawDays }[] = []
        for (let i = 0; i < rawDays.length; i += 7) {
          weeks.push({ days: rawDays.slice(i, i + 7) })
        }
        let total = 0
        if (data.total && typeof data.total === "object") {
          total = Object.values(data.total).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
        } else {
          total = rawDays.reduce((sum, d) => sum + d.count, 0)
        }
        return { total, weeks }
      }
    }
  } catch {}

  // 3. 兜底生成最近 12 周空结构
  const weeks: { days: { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }[] }[] = []
  const now = new Date()
  for (let w = 11; w >= 0; w--) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const dayOffset = w * 7 + (6 - d)
      const dayDate = new Date(now.getTime() - dayOffset * 86400 * 1000)
      days.push({ date: dayDate.toISOString().slice(0, 10), count: 0, level: 0 as 0 })
    }
    weeks.push({ days })
  }
  return { total: 0, weeks }
}

export async function fetchGitHubData(
  usernameOverride?: string,
  tokenOverride?: string,
  intervalOverride?: number,
  forceRefresh = false
): Promise<GitHubMonitorData> {
  const targetUser = (usernameOverride || loadGitHubUsername() || "TomCatXue").trim()
  const targetToken = tokenOverride !== undefined ? tokenOverride.trim() : loadGitHubToken()
  const intervalMin = intervalOverride || loadGitHubInterval() || 30
  const ttlMs = intervalMin * 60 * 1000

  if (!forceRefresh) {
    try {
      const cached =
        Storage.get<{ expiresAt: number; data: GitHubMonitorData }>(GITHUB_CACHE_KEY, { shared: true }) ||
        Storage.get<{ expiresAt: number; data: GitHubMonitorData }>(GITHUB_CACHE_KEY)
      if (cached && cached.data && cached.data.username === targetUser && cached.expiresAt > Date.now()) {
        return cached.data
      }
    } catch {}
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Scripting-App",
  }
  if (targetToken) {
    headers.Authorization = `Bearer ${targetToken}`
  }

  try {
    const [userRes, reposRes, contributions] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(targetUser)}`, { headers }),
      fetch(
        `https://api.github.com/users/${encodeURIComponent(targetUser)}/repos?sort=stars&per_page=100`,
        { headers }
      ),
      fetchGitHubContributions(targetUser, targetToken).catch(() => undefined),
    ])

    if (!userRes.ok) {
      throw new Error(`GitHub user API returned ${userRes.status}`)
    }
    if (!reposRes.ok) {
      throw new Error(`GitHub repos API returned ${reposRes.status}`)
    }

    const user = await userRes.json()
    const repos = await reposRes.json()

    const repoList = Array.isArray(repos) ? repos : []
    const totalStars = repoList.reduce((sum: number, r: any) => sum + (Number(r?.stargazers_count) || 0), 0)
    const totalForks = repoList.reduce((sum: number, r: any) => sum + (Number(r?.forks_count) || 0), 0)

    const topRepos = [...repoList]
      .map((r: any) => ({
        name: String(r?.name || ""),
        stars: Number(r?.stargazers_count) || 0,
        forks: Number(r?.forks_count) || 0,
      }))
      .sort((a, b) => b.stars - a.stars)
      .slice(0, 7)

    const old =
      Storage.get<GitHubMonitorData>(`${GITHUB_LAST_DATA_KEY}_${targetUser}`, { shared: true }) ||
      Storage.get<GitHubMonitorData>(`${GITHUB_LAST_DATA_KEY}_${targetUser}`) ||
      Storage.get<GitHubMonitorData>(GITHUB_LAST_DATA_KEY, { shared: true }) ||
      Storage.get<GitHubMonitorData>(GITHUB_LAST_DATA_KEY)

    const currentFollowers = Number(user?.followers) || 0
    const followersDelta = old && old.username === targetUser ? currentFollowers - old.followers : 0
    const starsDelta = old && old.username === targetUser ? totalStars - old.stars : 0
    const forksDelta = old && old.username === targetUser ? totalForks - old.forks : 0

    const payload: GitHubMonitorData = {
      serviceId: "github",
      username: targetUser,
      name: String(user?.name || user?.login || targetUser),
      bio: String(user?.bio || ""),
      avatarUrl: String(user?.avatar_url || `https://github.com/${targetUser}.png`),
      followers: currentFollowers,
      followersDelta,
      stars: totalStars,
      starsDelta,
      forks: totalForks,
      forksDelta,
      topRepos,
      contributions,
      updatedAt: new Date().toISOString(),
      configured: true,
      errorText: undefined,
    }

    Storage.set(`${GITHUB_LAST_DATA_KEY}_${targetUser}`, payload, { shared: true })
    Storage.set(`${GITHUB_LAST_DATA_KEY}_${targetUser}`, payload)
    Storage.set(GITHUB_LAST_DATA_KEY, payload, { shared: true })
    Storage.set(GITHUB_LAST_DATA_KEY, payload)

    const cacheEnvelope = { expiresAt: Date.now() + ttlMs, data: payload }
    Storage.set(GITHUB_CACHE_KEY, cacheEnvelope, { shared: true })
    Storage.set(GITHUB_CACHE_KEY, cacheEnvelope)
    FileManager.writeAsStringSync(GITHUB_FILE_CACHE_PATH, JSON.stringify(payload))
    return payload
  } catch (e) {
    console.log("获取 GitHub 监控数据异常，降级回退缓存:", e)
    // 首次拉取失败且没有任何缓存时，返回的数据要标记为「未拿到真实数据」，
    // 卡片据此显示空状态提示，而不是把内置示例数字当成真实数据展示。
    const fallback = getGitHubData()
    if (!fallback.configured) {
      return {
        ...fallback,
        configured: false,
        errorText: `GitHub 数据获取失败：${(e as any)?.message || e}`,
      }
    }
    return fallback
  }
  return getGitHubData()
}

export function getGitHubData(): GitHubMonitorData {
  try {
    const cached =
      Storage.get<any>(GITHUB_CACHE_KEY, { shared: true }) ||
      Storage.get<any>(GITHUB_CACHE_KEY)
    if (cached) {
      if (cached.data && typeof cached.data === "object" && cached.data.username) {
        return cached.data
      }
      if (cached.username) return cached
    }
    const last =
      Storage.get<GitHubMonitorData>(GITHUB_LAST_DATA_KEY, { shared: true }) ||
      Storage.get<GitHubMonitorData>(GITHUB_LAST_DATA_KEY)
    if (last && last.username) return last

    if (FileManager.existsSync ? FileManager.existsSync(GITHUB_FILE_CACHE_PATH) : (FileManager as any).fileExists?.(GITHUB_FILE_CACHE_PATH)) {
      const raw = FileManager.readAsStringSync(GITHUB_FILE_CACHE_PATH)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.username) return parsed
      }
    }
  } catch {}
  return DEFAULT_GITHUB
}

export async function refreshGitHubData(): Promise<GitHubMonitorData> {
  return fetchGitHubData(undefined, undefined, undefined, true)
}

// ============================================================
// Loon 网络与流量监控服务 (Loon OpenAPI / 订阅解析)
// ============================================================

export const LOON_URL_KEY = "mutepanel_loon_url_v1"
export const LOON_CACHE_KEY = "mutepanel_loon_cache_v1"
export const LOON_INTERVAL_KEY = "mutepanel_loon_interval_v1"
export const LOON_FILE_CACHE_PATH = `${FileManager.documentsDirectory}/loon_monitor_cache.json`

export const DEFAULT_LOON_URL = "http://loon.box/api/monitor"

export function loadLoonUrl(): string {
  try {
    const val =
      Storage.get<string>(LOON_URL_KEY, { shared: true }) ||
      Storage.get<string>(LOON_URL_KEY)
    if (val && typeof val === "string") {
      const trimmed = val.trim()
      if (trimmed.length > 0) return trimmed
    }
  } catch {}
  return DEFAULT_LOON_URL
}

export function saveLoonUrl(url: string): void {
  try {
    const u = String(url || "").trim()
    if (!u) {
      Storage.remove(LOON_URL_KEY, { shared: true })
      Storage.remove(LOON_URL_KEY)
    } else {
      Storage.set(LOON_URL_KEY, u, { shared: true })
      Storage.set(LOON_URL_KEY, u)
    }
  } catch {}
}

export function hasLoonConfigured(): boolean {
  const u = loadLoonUrl()
  return u.length > 0
}

export function formatBytes(bytes: number): string {
  const b = Number(bytes)
  if (!Number.isFinite(b) || b <= 0) return "0 B"
  const tb = 1024 * 1024 * 1024 * 1024
  const gb = 1024 * 1024 * 1024
  const mb = 1024 * 1024
  const kb = 1024
  if (b >= tb) {
    const v = (b / tb).toFixed(1)
    return v.endsWith(".0") ? `${parseInt(v, 10)} TB` : `${v} TB`
  }
  if (b >= gb) {
    const v = (b / gb).toFixed(1)
    return v.endsWith(".0") ? `${parseInt(v, 10)} GB` : `${v} GB`
  }
  if (b >= mb) {
    const v = (b / mb).toFixed(1)
    return v.endsWith(".0") ? `${parseInt(v, 10)} MB` : `${v} MB`
  }
  if (b >= kb) {
    const v = (b / kb).toFixed(1)
    return v.endsWith(".0") ? `${parseInt(v, 10)} KB` : `${v} KB`
  }
  return `${Math.round(b)} B`
}

export function parseSubscriptionUserInfo(
  header: string
): { upload: number; download: number; total: number; expire: number } | null {
  if (!header || typeof header !== "string") return null
  const mUpload = header.match(/upload\s*=\s*(\d+)/i)
  const mDownload = header.match(/download\s*=\s*(\d+)/i)
  const mTotal = header.match(/total\s*=\s*(\d+)/i)
  const mExpire = header.match(/expire\s*=\s*(\d+)/i)
  if (!mUpload && !mDownload && !mTotal && !mExpire) return null
  return {
    upload: mUpload ? parseInt(mUpload[1], 10) : 0,
    download: mDownload ? parseInt(mDownload[1], 10) : 0,
    total: mTotal ? parseInt(mTotal[1], 10) : 0,
    expire: mExpire ? parseInt(mExpire[1], 10) : 0,
  }
}

export async function fetchLoonData(rawUrl?: string, forceRefresh = false): Promise<LoonMonitorData> {
  const url = (rawUrl !== undefined ? rawUrl : loadLoonUrl()).trim()
  if (!url) {
    // 未配置：返回「无数据」状态，不展示内置示例流量
    const cached = getLoonData()
    if (cached.configured) return cached
    return {
      ...cached,
      configured: false,
      errorText: "尚未配置 Loon 订阅或 OpenAPI",
    }
  }

  if (!forceRefresh) {
    try {
      const cached =
        Storage.get<{ expiresAt: number; data: LoonMonitorData }>(LOON_CACHE_KEY, { shared: true }) ||
        Storage.get<{ expiresAt: number; data: LoonMonitorData }>(LOON_CACHE_KEY)
      if (cached && cached.data && cached.expiresAt > Date.now()) {
        return cached.data
      }
    } catch {}
  }

  try {
    const startTime = Date.now()
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Loon/3.2.0 (iOS)",
      },
    })
    const latency = Math.max(1, Date.now() - startTime)

    let subInfo: { upload: number; download: number; total: number; expire: number } | null = null

    // 1. 尝试从响应头提取 subscription-userinfo
    if (res.headers) {
      const rawHeader =
        (typeof res.headers.get === "function" ? res.headers.get("subscription-userinfo") : null) ||
        (res.headers as any)["subscription-userinfo"] ||
        (res.headers as any)["Subscription-Userinfo"] ||
        ""
      if (rawHeader) {
        subInfo = parseSubscriptionUserInfo(rawHeader)
      }
    }

    // 2. 若未在 Header 找到，尝试解析 Body（支持 OpenAPI JSON 或 JSON 格式订阅响应）
    let bodyJson: any = null
    try {
      const text = await res.text()
      if (text.startsWith("{") && text.endsWith("}")) {
        bodyJson = JSON.parse(text)
      }
    } catch {}

    let uploadBytes = 5.8 * 1024 * 1024 * 1024
    let downloadBytes = 102.6 * 1024 * 1024 * 1024
    let totalBytes = 500 * 1024 * 1024 * 1024
    let resetDaysText = "24 天后重置"
    let policyGroupCount = 14
    let delayMs = latency
    let runningMode = "规则分流"
    let version = "3.2.x"
    let vpnIp = "--"
    let vpnLocation = "未连接"
    let nodeName = "未连接"

    if (subInfo) {
      uploadBytes = subInfo.upload
      downloadBytes = subInfo.download
      totalBytes = subInfo.total
      if (subInfo.expire > 0) {
        const expMs = subInfo.expire > 10000000000 ? subInfo.expire : subInfo.expire * 1000
        const diffDays = Math.ceil((expMs - Date.now()) / (86400 * 1000))
        resetDaysText = diffDays > 0 ? `${diffDays} 天后重置` : "已到期"
      } else {
        resetDaysText = "长期有效"
      }
    } else if (bodyJson) {
      if (bodyJson.upload != null) uploadBytes = Number(bodyJson.upload) || 0
      if (bodyJson.download != null) downloadBytes = Number(bodyJson.download) || 0
      if (bodyJson.total != null) totalBytes = Number(bodyJson.total) || 0
      if (bodyJson.expire != null) {
        const expMs = Number(bodyJson.expire) > 10000000000 ? Number(bodyJson.expire) : Number(bodyJson.expire) * 1000
        const diffDays = Math.ceil((expMs - Date.now()) / (86400 * 1000))
        resetDaysText = diffDays > 0 ? `${diffDays} 天后重置` : "已到期"
      }
    }

    // 从 OpenAPI 提取运行模式、策略组等字段
    if (bodyJson) {
      if (bodyJson.running_model === 0 || bodyJson.runningModel === 0 || bodyJson.flowmodel === "direct") {
        runningMode = "全局直连"
      } else if (bodyJson.running_model === 2 || bodyJson.runningModel === 2 || bodyJson.flowmodel === "proxy") {
        runningMode = "全局代理"
      } else if (bodyJson.running_model === 1 || bodyJson.runningModel === 1 || bodyJson.flowmodel === "filter") {
        runningMode = "规则分流"
      } else if (typeof bodyJson.mode === "string") {
        runningMode = bodyJson.mode
      }

      if (Array.isArray(bodyJson.all_policy_groups)) {
        policyGroupCount = bodyJson.all_policy_groups.length
      } else if (typeof bodyJson.policy_groups_count === "number") {
        policyGroupCount = bodyJson.policy_groups_count
      }

      if (typeof bodyJson.delay === "number") delayMs = bodyJson.delay
      else if (typeof bodyJson.ping === "number") delayMs = bodyJson.ping
      if (typeof bodyJson.version === "string") version = bodyJson.version
      if (typeof bodyJson.vpnIp === "string") vpnIp = bodyJson.vpnIp
      if (typeof bodyJson.vpnLocation === "string") vpnLocation = bodyJson.vpnLocation
      if (typeof bodyJson.nodeName === "string") nodeName = bodyJson.nodeName
      else if (typeof bodyJson.node === "string") nodeName = bodyJson.node
      else if (typeof bodyJson.current_node === "string") nodeName = bodyJson.current_node
    }

    // 若未从响应中解析到 VPN IP，尝试读取 VPN 节点卡片已有探测缓存
    if (vpnIp === "--") {
      try {
        const vpn = getVpnData()
        if (vpn && vpn.ip && vpn.ip !== "--") {
          vpnIp = vpn.ip
          vpnLocation = vpn.location || ""
          nodeName = vpn.statusTitle || "当前节点"
        }
      } catch {}
    }

    const remainingBytes = Math.max(0, totalBytes - uploadBytes - downloadBytes)

    const payload: LoonMonitorData = {
      serviceId: "loon",
      uploadBytes,
      downloadBytes,
      totalBytes,
      remainingBytes,
      uploadText: formatBytes(uploadBytes),
      downloadText: formatBytes(downloadBytes),
      totalText: formatBytes(totalBytes),
      remainingText: formatBytes(remainingBytes),
      resetDaysText,
      policyGroupCount,
      delayMs,
      delayText: `${delayMs} ms`,
      runningMode,
      version,
      vpnIp,
      vpnLocation,
      nodeName,
      updatedAt: new Date().toISOString(),
      configured: true,
      errorText: undefined,
    }

    const cacheEnvelope = { expiresAt: Date.now() + 15 * 60 * 1000, data: payload }
    Storage.set(LOON_CACHE_KEY, cacheEnvelope, { shared: true })
    Storage.set(LOON_CACHE_KEY, cacheEnvelope)
    FileManager.writeAsStringSync(LOON_FILE_CACHE_PATH, JSON.stringify(payload))
    return payload
  } catch (e) {
    console.log("获取 Loon 监控数据异常，降级回退缓存:", e)
    const fallback = getLoonData()
    if (!fallback.configured) {
      return {
        ...fallback,
        configured: false,
        errorText: `Loon 数据获取失败：未连接到插件 (请确保已安装 LoonMonitor 插件且开启 Loon)`,
      }
    }
    return fallback
  }
  return getLoonData()
}

export function getLoonData(): LoonMonitorData {
  try {
    const cached =
      Storage.get<any>(LOON_CACHE_KEY, { shared: true }) ||
      Storage.get<any>(LOON_CACHE_KEY)
    if (cached) {
      if (cached.data && typeof cached.data === "object" && cached.data.uploadText) {
        return cached.data
      }
      if (cached.uploadText) return cached
    }

    if (FileManager.existsSync ? FileManager.existsSync(LOON_FILE_CACHE_PATH) : (FileManager as any).fileExists?.(LOON_FILE_CACHE_PATH)) {
      const raw = FileManager.readAsStringSync(LOON_FILE_CACHE_PATH)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.uploadText) return parsed
      }
    }
  } catch {}
  return DEFAULT_LOON
}

export async function refreshLoonData(): Promise<LoonMonitorData> {
  return fetchLoonData(undefined, true)
}


