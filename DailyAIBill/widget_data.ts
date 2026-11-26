// @ts-nocheck
/// <reference path="./global.d.ts" />
// ============================================================
// 数据层：抓取 → 归一化 → 聚合 → 缓存
//
// 视觉一比一复刻参考图，所以这里要产出「后端接口拿不到」的东西：
//   1. AGENT → 模型 的两级结构。HTTP 接口只给平行的 agents[] / models[]，
//      没有归属字段，只能拉 rows 自行聚合。
//   2. 币种符号与汇率。接口只回 USD 数值，没有 rate 字段。
//   3. 每个 agent 的 tokens（供 4×4 的 [1.2M Tokens] 标注）。
// ============================================================
import { fetchRequests, fetchUsage, normalizeBase, type Period, type UsageRow } from "./api"

// 转出给 UI 层：Period 定义在 api.ts，UI 只需从一处导入
export type { Period }

export const CACHE_KEY = "daily_ai_bill_state_v1"

export interface BillModel {
  name: string
  tokens: number
  cost: number
  calls: number
  share: number
}

export interface BillAgent {
  id: string
  name: string
  cost: number
  tokens: number
  calls: number
  errors: number
  share: number
  models: BillModel[]
  topModel: string
}

export interface BillState {
  date: string
  time: string
  period: Period
  calls: number
  errors: number
  costUsd: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cacheHit: number
  unpriced: number
  streak: number
  agents: BillAgent[]
  exact: boolean
  updatedAt: number
}

export interface BillSettings {
  base: string
  key: string
  rate: number
  currency: "cny" | "usd"
  budget: number
  period: Period
}

export const DEFAULT_SETTINGS: BillSettings = {
  base: "",
  key: "",
  rate: 6.67,
  currency: "cny",
  budget: 10,
  period: "today",
}

// ── 数值格式化 ──────────────────────────────────────────────

/** 1234 → 1.2K；49195391 → 49.2M */
export function count(n: number): string {
  const v = Number(n) || 0
  const a = Math.abs(v)
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 1 : 2) + "B"
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2) + "M"
  if (a >= 1e5) return (v / 1e3).toFixed(0) + "K"
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "K"
  return String(Math.round(v))
}

/** 金额：cny 时按汇率换算并加 ¥ 前缀 */
export function money(usd: number, s: BillSettings): string {
  const v = Number(usd) || 0
  const sym = s.currency === "cny" ? "¥" : "$"
  const r = s.currency === "cny" ? Number(s.rate) || 0 : 1
  const n = v * r
  if (n === 0) return sym + "0.00"
  if (n < 0.01) return "<" + sym + "0.01"
  return sym + n.toFixed(2)
}

/** 0.992 → 99.2%；太小给 <0.1% */
export function percent(r: number): string {
  if (!isFinite(r) || r < 0) return "–"
  const p = r * 100
  if (p > 0 && p < 0.1) return "<0.1%"
  if (p < 1) return p.toFixed(1) + "%"
  return Math.round(p) + "%"
}


/** 
 * 模型名缩写：4×2 右栏只有 163pt，完整名会顶掉右侧金额。
 * "deepseek-v4.1-flash" → "DEEPSEEK-V4.1"，与原图一致。
 */
export function shortModel(m: string, max = 14): string {
  const raw = String(m || "").trim()
  if (!raw) return "-"
  // 去掉 -flash / -latest 之类的尾巴，保留主版本号
  let s = raw.replace(/-?(flash|latest|preview|mini|thinking|tiered)$/gi, "")
  s = s.toUpperCase()
  if (s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}
/** AGENT 名统一大写，与原图一致 */
export function upper(s: string): string {
  return String(s || "").toUpperCase()
}

/** 连续使用天数：从 date 往前数，今天没调用则从昨天起算 */
export function streak(days: { date: string; calls: number }[], date: string): number {
  const had = new Set(days.filter((d) => Number(d.calls) > 0).map((d) => d.date))
  const shift = (s: string, k: number) => {
    const t = new Date(s + "T00:00:00Z")
    t.setUTCDate(t.getUTCDate() + k)
    return t.toISOString().slice(0, 10)
  }
  let at = date
  if (!had.has(at)) at = shift(at, -1)
  let n = 0
  while (had.has(at)) {
    n++
    at = shift(at, -1)
  }
  return n
}

// ── 抓取与聚合 ──────────────────────────────────────────────

function rowTokens(r: UsageRow): number {
  return (Number(r.in) || 0) + (Number(r.out) || 0) + (Number(r.cache_read) || 0) + (Number(r.cache_write) || 0)
}

/** 把 rows 聚合成 AGENT → 模型 两级，按费用倒序 */
export function aggregate(rows: UsageRow[]): BillAgent[] {
  const byAgent = new Map<string, any>()

  for (const r of rows) {
    const aRaw = String(r.agentName || r.agent || "").trim() || "未标明"
    const aKey = aRaw.toLowerCase()
    const mName = String(r.model || "").trim() || "未标明"
    const cost = Number(r.cost) || 0
    const tok = rowTokens(r)
    const isErr = Number(r.status) >= 400 || Number(r.status) === 0

    let a = byAgent.get(aKey)
    if (!a) {
      a = { name: aRaw, cost: 0, tokens: 0, calls: 0, errors: 0, models: new Map() }
      byAgent.set(aKey, a)
    }
    a.cost += cost
    a.tokens += tok
    a.calls += 1
    if (isErr) a.errors += 1

    const mKey = mName.toLowerCase()
    let m = a.models.get(mKey)
    if (!m) {
      m = { cost: 0, tokens: 0, calls: 0 }
      a.models.set(mKey, m)
    }
    m.cost += cost
    m.tokens += tok
    m.calls += 1
  }

  const totalCost = [...byAgent.values()].reduce((s: number, a: any) => s + a.cost, 0)
  const list: BillAgent[] = []

  for (const a of byAgent.values()) {
    const models: BillModel[] = [...a.models.entries()]
      .map(([k, m]: [string, any]) => ({
        name: k,
        tokens: m.tokens,
        cost: m.cost,
        calls: m.calls,
        share: a.cost > 0 ? m.cost / a.cost : 0,
      }))
      .sort((x, y) => y.cost - x.cost || y.tokens - x.tokens)

    list.push({
      id: a.name.toLowerCase(),
      name: a.name,
      cost: a.cost,
      tokens: a.tokens,
      calls: a.calls,
      errors: a.errors,
      share: totalCost > 0 ? a.cost / totalCost : 0,
      models,
      topModel: models.length ? models[0].name : "",
    })
  }
  return list.sort((x, y) => y.cost - x.cost || y.tokens - x.tokens)
}

/** 本地时间 "2026-11-26" / "11:20" */
function stamp(): { date: string; time: string } {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return {
    date: d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()),
    time: p(d.getHours()) + ":" + p(d.getMinutes()),
  }
}

export interface FetchResult {
  state: BillState | null
  error: string
}

/**
 * 拉取并组装一次账单。
 * 聚合用 rows 拿两级结构；rows 上限 500，超出标记 exact=false。
 * rows 失败时降级用 /usage 的 agents 数组（无模型层级但准确）。
 */
export async function fetchBill(s: BillSettings): Promise<FetchResult> {
  const base = normalizeBase(s.base)
  if (!base) return { state: null, error: "未配置网关地址" }

  const period: Period = s.period || "today"
  const st = stamp()

  let usage: any = null
  try {
    usage = await fetchUsage(base, s.key, period)
  } catch (e) {
    return { state: null, error: String((e && e.message) || e) }
  }

  let agents: BillAgent[] = []
  let exact = true
  try {
    // rows 的 limit 上限 500，可用 offset 翻页。
    // 但 today 之外动辄上万条（7d 已有 6k+），翻页既慢又吃内存 ——
    // 设一个上限，超出就放弃两级结构，改用 /usage 的准确 agents 总量。
    const MAX_ROWS = 3000
    let allRows: UsageRow[] = []
    let offset = 0
    let total = Infinity
    while (offset < total && allRows.length < MAX_ROWS) {
      const req = await fetchRequests(base, s.key, period, 500, offset)
      total = req.total
      allRows = allRows.concat(req.rows)
      if (req.rows.length === 0) break
      offset += req.rows.length
    }
    if (allRows.length >= total) {
      exact = true
      agents = aggregate(allRows)
    } else {
      throw new Error("rows 过多，改用聚合总量")
    }
  } catch {
    // 回退：扁平 agents（数据准确，但没有模型层级）
    exact = false
    agents = (usage.agents || []).map((a: any) => ({
      id: String(a.id || a.name || ""),
      name: String(a.name || a.id || "未标明"),
      cost: Number(a.cost) || 0,
      tokens:
        (Number(a.input) || 0) + (Number(a.output) || 0) + (Number(a.cache_read) || 0) + (Number(a.cache_write) || 0),
      calls: Number(a.calls) || 0,
      errors: Number(a.errors) || 0,
      share: 0,
      models: [],
      topModel: "",
    }))
    const sum = agents.reduce((x, y) => x + y.cost, 0)
    agents.forEach((a) => (a.share = sum > 0 ? a.cost / sum : 0))
    agents.sort((x, y) => y.cost - x.cost)
  }

  const cacheRead = Number(usage.cache_read) || 0
  const prompt = (Number(usage.input) || 0) + cacheRead + (Number(usage.cache_write) || 0)

  const state: BillState = {
    date: st.date,
    time: st.time,
    period,
    calls: Number(usage.calls) || 0,
    errors: Number(usage.errors) || 0,
    costUsd: Number(usage.cost) || 0,
    tokens:
      (Number(usage.input) || 0) + (Number(usage.output) || 0) + cacheRead + (Number(usage.cache_write) || 0),
    inputTokens: Number(usage.input) || 0,
    outputTokens: Number(usage.output) || 0,
    cacheHit: prompt > 0 ? Math.min(1, cacheRead / prompt) : 0,
    unpriced: Number(usage.unpriced) || 0,
    streak: 0,
    agents,
    exact,
    updatedAt: Date.now(),
  }

  // 连续天数需要「每天是否有调用」。
  // today 的 series 是 24 个小时桶，算不出来；其余周期的 series 本身就是日桶。
  const toDays = (series: any[]) =>
    (series || []).map((p: any) => ({
      date: String(p.time || "").slice(0, 10),
      calls: Number(p.calls) || 0,
    }))

  if (period !== "today") {
    state.streak = streak(toDays(usage.series), st.date)
  } else {
    // 额外拉一次 all，只为拿日桶序列；失败不影响主数据
    try {
      const hist = await fetchUsage(base, s.key, "all")
      state.streak = streak(toDays(hist.series), st.date)
    } catch {
      state.streak = 0
    }
  }

  return { state, error: "" }
}

// ── 缓存 ────────────────────────────────────────────────────

export function readCache(): BillState | null {
  try {
    const raw = Storage.get<string>(CACHE_KEY, { shared: true })
    if (!raw) return null
    const o = JSON.parse(raw)
    return o && typeof o.calls === "number" ? (o as BillState) : null
  } catch {
    return null
  }
}

export function saveCache(s: BillState): void {
  try {
    Storage.set(CACHE_KEY, JSON.stringify(s), { shared: true })
  } catch {}
}

// ── 设置 ────────────────────────────────────────────────────

const S_BASE = "daily_ai_bill_base"
const S_KEY = "daily_ai_bill_key"
const S_RATE = "daily_ai_bill_rate"
const S_CUR = "daily_ai_bill_currency"
const S_BUDGET = "daily_ai_bill_budget"
const S_PERIOD = "daily_ai_bill_period"

export function loadSettings(): BillSettings {
  const num = (v: any, d: number) => {
    const n = Number(v)
    return isFinite(n) && n > 0 ? n : d
  }
  return {
    base: Storage.get<string>(S_BASE, { shared: true }) || DEFAULT_SETTINGS.base,
    key: Storage.get<string>(S_KEY, { shared: true }) || DEFAULT_SETTINGS.key,
    rate: num(Storage.get<string>(S_RATE, { shared: true }), DEFAULT_SETTINGS.rate),
    currency: (Storage.get<string>(S_CUR, { shared: true }) as any) || DEFAULT_SETTINGS.currency,
    budget: Number(Storage.get<string>(S_BUDGET, { shared: true })) || 0,
    period: ((Storage.get<string>(S_PERIOD, { shared: true }) as any) || DEFAULT_SETTINGS.period) as Period,
  }
}

export function saveSettings(s: BillSettings): void {
  Storage.set(S_BASE, s.base, { shared: true })
  Storage.set(S_KEY, s.key, { shared: true })
  Storage.set(S_RATE, String(s.rate), { shared: true })
  Storage.set(S_CUR, s.currency, { shared: true })
  Storage.set(S_BUDGET, String(s.budget), { shared: true })
  Storage.set(S_PERIOD, s.period, { shared: true })
}
