// @ts-nocheck
/// <reference path="./global.d.ts" />
// ============================================================
// 网络层：magpie 网关用量接口
//
// 实测确认（2026-11-26）：
//   GET /v1/magpie/usage?period=today|7d|30d|all
//       总费用 / calls / errors / tokens / 缓存 / agents[] / models[] / series[]
//   GET /v1/magpie/usage/requests?limit=500&period=today
//       逐条请求明细，用于「AGENT / 模型」两级聚合（limit 上限 500，超出静默截断）
//
// 认证：局域网访问必须带只读 gateway key；本机 127.0.0.1 免认证。
//       magpie gateway-key add <名字> --read-only 可生成。
// ============================================================
import { fetch } from "scripting"

/** 网关地址，形如 http://192.168.0.149:3425（不带尾斜杠） */
export function normalizeBase(raw: string): string {
  let base = (raw || "").trim()
  if (!base) return ""
  base = base.replace(/\/v1\/magpie\/.*$/i, "")
  base = base.replace(/\/+$/g, "")
  if (!/^https?:\/\//i.test(base)) base = "http://" + base
  return base
}

export type Period = "today" | "7d" | "30d" | "all"

export interface UsageAgent {
  id: string
  name?: string
  icon?: string
  calls: number
  errors?: number
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
  cost: number
  unpriced?: number
  last?: string
}

export interface UsageModel {
  id: string
  provider?: string
  model?: string
  host?: string
  name?: string
  sub?: string
  icon?: string
  calls: number
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
  cost: number
}

export interface UsageSeriesPoint {
  label: string
  time: string
  calls: number
  input?: number
  output?: number
  cache_read?: number
  cost: number
}

export interface UsagePayload {
  period: string
  since?: string
  calls: number
  errors: number
  input: number
  output: number
  cache_read: number
  cache_write: number
  cost: number
  unpriced: number
  series?: UsageSeriesPoint[]
  agents?: UsageAgent[]
  models?: UsageModel[]
}

/** 一条请求明细（/v1/magpie/usage/requests 的 rows） */
export interface UsageRow {
  t: string
  agent?: string
  agentName?: string
  model?: string
  provider?: string
  in?: number
  out?: number
  cache_read?: number
  cache_write?: number
  cost?: number
  status?: number
  priced?: boolean
}

interface RequestsPayload {
  rows?: UsageRow[]
  total?: number
  calls?: number
}

function headers(key: string): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" }
  if (key && key.trim()) h["Authorization"] = "Bearer " + key.trim()
  return h
}

/** 统一 GET：非 2xx 直接抛出后端的 error.message */
async function getJson(url: string, key: string, timeout = 12) {
  const insecure = url.indexOf("http://") === 0
  const res = await fetch(url, { headers: headers(key), timeout, allowInsecureRequest: insecure })
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new Error("返回不是 JSON（HTTP " + res.status + "）")
  }
  if (!res.ok) {
    const msg = (body && body.error && body.error.message) || (body && body.error) || ("HTTP " + res.status)
    throw new Error(String(msg))
  }
  if (body && body.error) throw new Error(String(body.error.message || body.error))
  return body
}

/** 读取某周期的用量聚合 */
export async function fetchUsage(base: string, key: string, period: Period): Promise<UsagePayload> {
  const url = normalizeBase(base) + "/v1/magpie/usage?period=" + period
  const body = await getJson(url, key)
  if (!body || typeof body.calls !== "number") throw new Error("用量数据格式不符")
  return body as UsagePayload
}

/**
 * 读取逐条请求明细。
 * limit 上限 500 —— magpie 会静默截断，调用方须按 complete 判断是否完整。
 */
export async function fetchRequests(
  base: string,
  key: string,
  period: Period,
  limit = 500,
  offset = 0
): Promise<{ rows: UsageRow[]; total: number; complete: boolean }> {
  const url =
    normalizeBase(base) +
    "/v1/magpie/usage/requests?limit=" + limit +
    "&offset=" + Math.max(0, offset) +
    "&period=" + period
  const body = (await getJson(url, key)) as RequestsPayload
  const rows = Array.isArray(body && body.rows) ? body.rows : []
  const total = Number(body && body.total) || rows.length
  return { rows, total, complete: rows.length >= total }
}

/** 轻量连通性测试 */
export async function pingGateway(base: string, key: string): Promise<{ ok: boolean; message: string }> {
  const b = normalizeBase(base)
  if (!b) return { ok: false, message: "未填写网关地址" }
  try {
    const body = await getJson(b + "/v1/magpie/limit", key, 8)
    return { ok: true, message: body && body.key ? "已连接，key：" + body.key : "已连接" }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e) }
  }
}
