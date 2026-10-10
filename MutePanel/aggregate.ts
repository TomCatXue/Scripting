// @ts-nocheck
// ============================================================
// 多账号聚合的纯函数（无 IO、无全局依赖，可直接单测）
//
// 口径约定：
//  · 数值型（DeepSeek 余额、WorkBuddy 积分）→ 求和
//  · 百分比型（Codex / Antigravity 配额）→ 求和，并额外标注「最低」
//    因为两个 83% 相加是 166%，单看求和会误判；卡片同时用
//    progressPct 表示均值、用最低值提示最紧张的账号。
//
// 单账号不走这里：调用方对 n === 1 直接透传原始结果，
// 以保证与改造前的输出逐字段一致。
// ============================================================

import { formatPct } from "./theme"

/** 各账号某个百分比指标的摘要 */
export interface QuotaPart {
  /** 主指标剩余百分比 */
  pct1: number
  /** 次指标剩余百分比 */
  pct2: number
}

export interface QuotaAggregate {
  /** 主指标求和 */
  sum1: number
  /** 次指标求和 */
  sum2: number
  /** 主指标（pct1）跨账号的最小值 —— 与求和同口径，便于对照 */
  lowest: number
  /** 任意指标（含 pct2）跨账号的最小值 —— 用于「最紧」提示 */
  lowestAny: number
  /** 参与聚合的账号数 */
  count: number
  /** 标注文案，如 "2 账号 · 最低 41.0%" */
  note: string
}

function finite(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 百分比配额聚合：求和 + 标注最低 */
export function aggregateQuota(parts: QuotaPart[]): QuotaAggregate {
  const valid = (Array.isArray(parts) ? parts : []).filter((p) => p && Number.isFinite(Number(p.pct1)))
  if (valid.length === 0) {
    return { sum1: 0, sum2: 0, lowest: 0, lowestAny: 0, count: 0, note: "" }
  }

  let sum1 = 0
  let sum2 = 0
  let lowest = Number.POSITIVE_INFINITY
  let lowestAny = Number.POSITIVE_INFINITY

  for (const p of valid) {
    const a = finite(p.pct1)
    const b = finite(p.pct2)
    sum1 += a
    sum2 += b
    // lowest 只看主指标，保证与 sum1 同口径可比
    if (a < lowest) lowest = a
    // lowestAny 覆盖两个指标，用于「最紧」这类跨指标提示
    if (a < lowestAny) lowestAny = a
    if (b < lowestAny) lowestAny = b
  }
  if (!Number.isFinite(lowest)) lowest = 0
  if (!Number.isFinite(lowestAny)) lowestAny = 0

  return {
    sum1,
    sum2,
    lowest,
    lowestAny,
    count: valid.length,
    note: accountNote(valid.length, valid.length, lowest),
  }
}

/** 求和聚合（余额 / 积分等绝对值） */
export interface SumAggregate {
  sum: number
  count: number
}

export function aggregateSum(values: number[]): SumAggregate {
  const valid = (Array.isArray(values) ? values : []).map((v) => Number(v)).filter((v) => Number.isFinite(v))
  let sum = 0
  for (const v of valid) sum += v
  return { sum, count: valid.length }
}

/**
 * 百分比服务的平均剩余：Σ剩余 / (100 × N) × 100。
 * 用于 DualQuotaData 没有 progressPct 字段时的进度槽取值，
 * 结果恒在 0–100，避免多账号求和后超过 100 导致进度条溢出。
 */
export function averagePct(values: number[]): number {
  const valid = (Array.isArray(values) ? values : []).map((v) => Number(v)).filter((v) => Number.isFinite(v))
  if (valid.length === 0) return 0
  let sum = 0
  for (const v of valid) sum += v
  const avg = sum / valid.length
  return Math.max(0, Math.min(100, avg))
}

/**
 * 把多个账号的「按自然日消费」合并为一份。
 * DeepSeek 有真实逐日数据，聚合时必须按日相加，
 * 而不是退化成快照累积（那样会丢失真实历史）。
 */
export function mergeDayCosts(maps: Map<number, number>[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const m of Array.isArray(maps) ? maps : []) {
    if (!m || typeof m.forEach !== "function") continue
    m.forEach((value, day) => {
      const v = Number(value)
      const d = Number(day)
      if (!Number.isFinite(v) || !Number.isFinite(d)) return
      out.set(d, (out.get(d) ?? 0) + v)
    })
  }
  return out
}

/**
 * 账号数标注文案。
 * @param count       参与聚合的账号数
 * @param onlineCount 本次成功刷新的账号数（少于 count 时提示部分失败）
 * @param lowest      最低剩余百分比（可选；数值型服务不传）
 */
export function accountNote(count: number, onlineCount: number, lowest?: number): string {
  const n = Math.max(0, Math.floor(finite(count)))
  if (n === 0) return ""
  const parts = [`${n} 账号`]
  if (lowest != null && Number.isFinite(Number(lowest))) {
    parts.push(`最低 ${formatPct(Number(lowest))}%`)
  }
  const ok = Math.floor(finite(onlineCount, n))
  if (ok < n) parts.push(`可用 ${ok}/${n}`)
  return parts.join(" · ")
}

/**
 * 由「逐日消费」回推「逐日余额」曲线。
 *
 * DeepSeek 没有余额历史接口，只有当前余额与逐日消费。
 * 在「窗口内无充值」的假设下，第 i 天的余额 ≈ 当前余额 + 第 i 天之后各天消费之和。
 * 口径与 xubai2001「DeepSeek 用量」原版的 BalanceTrendChart 一致。
 *
 * @param costSeries     逐日消费（按时间升序）
 * @param currentBalance 当前余额（含赠送）
 */
export function balanceSeriesFromCost(
  costSeries: { label: string; value: number }[],
  currentBalance: number
): { label: string; value: number }[] {
  const list = Array.isArray(costSeries) ? costSeries : []
  if (list.length === 0) return []

  // 从最新一天往前回推：after 为「该日之后各天消费之和」
  let after = 0
  for (const d of list) after += Number(d?.value) || 0

  const out: { label: string; value: number }[] = []
  for (const d of list) {
    const cost = Number(d?.value) || 0
    after -= cost
    out.push({
      label: String(d?.label ?? ""),
      value: Math.round((currentBalance + after) * 100) / 100,
    })
  }
  return out
}

/** 多币种混合时取账号数最多的币种，避免把 USD 与 CNY 直接相加 */
export function dominantCurrency(currencies: string[]): string {
  const tally = new Map<string, number>()
  for (const c of Array.isArray(currencies) ? currencies : []) {
    const key = String(c || "CNY").toUpperCase()
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
  let best = "CNY"
  let bestN = -1
  tally.forEach((n, key) => {
    if (n > bestN) {
      bestN = n
      best = key
    }
  })
  return best
}

/** 货币符号 */
export function currencySymbol(currency: string): string {
  const c = String(currency || "CNY").toUpperCase()
  if (c === "USD") return "$"
  if (c === "EUR") return "€"
  return "¥"
}
