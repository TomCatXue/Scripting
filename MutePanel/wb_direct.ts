// @ts-nocheck
// ============================================================
// WorkBuddy 官方直连：凭据解析与规范化
//
// 凭据形态对齐 magpie 的 plugin-auth.json（oauth 类型）：
//   { type, access, refresh, expires, refreshExpiresAt, accountId, uid, domain, tokenType }
//
// 两套 build（接口基址不同，accountId 形态不同）：
//   workbuddy     国内版  https://copilot.tencent.com   accountId = 手机号
//   workbuddy-ai  国际版  https://www.workbuddy.ai      accountId = 邮箱
//
// 路径前缀有差异，容易踩坑：
//   取积分 POST {endpoint}/billing/meter/get-user-resource-summary   （无 /v2）
//   续期   POST {endpoint}/v2/plugin/auth/token/refresh              （有 /v2）
//
// 本模块为纯函数，不做任何网络与存储 IO。
// ============================================================

export const WB_ENDPOINT_CN = "https://copilot.tencent.com"
export const WB_ENDPOINT_INTL = "https://www.workbuddy.ai"

/** 续期提前量：access 剩余不足 5 分钟即刷新 */
export const WB_REFRESH_LEAD_MS = 5 * 60_000

export type WbDirectBuild = "workbuddy" | "workbuddy-ai"

export interface WbDirectCredential {
  type: "oauth"
  access: string
  refresh: string
  /** access 到期时间，毫秒 epoch */
  expires: number
  /** refresh 到期时间，毫秒 epoch；缺失表示不限期 */
  refreshExpiresAt?: number
  accountId: string
  uid: string
  domain: string
  tokenType?: string
  build: WbDirectBuild
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

/** 把秒级时间戳与 ISO 串统一成毫秒 epoch；无法识别返回 0 */
function asMs(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v > 1e11 ? v : v * 1000
  }
  if (typeof v === "string" && v.trim()) {
    const asNum = Number(v)
    if (Number.isFinite(asNum)) return asNum > 1e11 ? asNum : asNum * 1000
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

/** 由域名/accountId 形态推断 build */
function inferBuild(domain: string, accountId: string): WbDirectBuild {
  const d = domain.toLowerCase()
  if (d.includes("workbuddy.ai")) return "workbuddy-ai"
  if (d.includes("tencent.com")) return "workbuddy"
  // 域名缺失时按账号形态兜底：含 @ 视为国际版
  return accountId.includes("@") ? "workbuddy-ai" : "workbuddy"
}

function defaultDomain(build: WbDirectBuild): string {
  return build === "workbuddy-ai" ? "www.workbuddy.ai" : "copilot.tencent.com"
}

/**
 * 解析并规范化凭据。
 *
 * 容错：
 *  · 接受裸凭据对象，也接受 { "workbuddy": {...} } / { "workbuddy-ai": {...} } 外层包裹
 *  · 缺 domain 时按 build 回落官方主机名
 *  · 缺 refreshExpiresAt 时视为不限期
 *
 * @param raw              JSON 文本或已解析对象
 * @param buildHint        可选，用于 domain 缺失时确定 build
 * @throws 缺少 access / refresh / uid，或 JSON 非法时抛错
 */
export function parseWbDirectCredential(raw: unknown, buildHint?: WbDirectBuild): WbDirectCredential {
  let obj: any = raw

  if (typeof raw === "string") {
    const text = raw.trim()
    if (!text) throw new Error("凭据为空，请粘贴完整的 OAuth JSON")
    try {
      obj = JSON.parse(text)
    } catch {
      throw new Error("凭据 JSON 解析失败，请确认粘贴的是完整的 JSON 文本")
    }
  }

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("凭据 JSON 解析失败：顶层不是对象")
  }

  // 外层包裹：plugin-auth.json 里形如 { "workbuddy": { ... } }
  const WRAPPERS = ["workbuddy", "workbuddy-ai", "workbuddy_direct", "workbuddy-direct"]
  const looksLikeCredential = obj.access !== undefined || obj.refresh !== undefined
  if (!looksLikeCredential) {
    for (const key of WRAPPERS) {
      const inner = obj[key]
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        obj = inner
        break
      }
    }
  }

  const access = asString(obj.access)
  const refresh = asString(obj.refresh)
  const uid = asString(obj.uid)
  const accountId = asString(obj.accountId) || asString(obj.account_id) || asString(obj.email)
  let domain = asString(obj.domain)

  if (!access) throw new Error("凭据缺少 access 字段")
  if (!refresh) throw new Error("凭据缺少 refresh 字段")
  if (!uid) throw new Error("凭据缺少 uid 字段（请求头 X-User-Id 需要）")

  const build = buildHint ?? inferBuild(domain, accountId)
  if (!domain) domain = defaultDomain(build)

  const expires = asMs(obj.expires ?? obj.expiresAt)
  const refreshExpiresAtRaw = obj.refreshExpiresAt ?? obj.refresh_expires_at
  const refreshExpiresAt = refreshExpiresAtRaw == null ? undefined : asMs(refreshExpiresAtRaw) || undefined

  const tokenType = asString(obj.tokenType) || undefined

  return {
    type: "oauth",
    access,
    refresh,
    expires,
    ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
    accountId: accountId || uid,
    uid,
    domain,
    ...(tokenType ? { tokenType } : {}),
    build,
  }
}

/** 接口基址（不含路径） */
export function wbDirectEndpoint(cred: WbDirectCredential): string {
  if (cred.build === "workbuddy-ai") return WB_ENDPOINT_INTL
  if (cred.domain.includes("workbuddy.ai")) return WB_ENDPOINT_INTL
  if (cred.domain.includes("tencent.com")) return WB_ENDPOINT_CN
  // 自建/未知域名：按域名直连
  return `https://${cred.domain}`
}

/** 取积分地址（无 /v2 前缀） */
export function wbDirectCreditsUrl(cred: WbDirectCredential): string {
  return `${wbDirectEndpoint(cred)}/billing/meter/get-user-resource-summary`
}

/** 续期地址（有 /v2 前缀） */
export function wbDirectRefreshUrl(cred: WbDirectCredential): string {
  return `${wbDirectEndpoint(cred)}/v2/plugin/auth/token/refresh`
}

/** 取积分所需的鉴权与标识头 */
export function wbDirectCreditsHeaders(cred: WbDirectCredential, uaVersion = "5.5.6"): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${cred.access}`,
    "X-User-Id": cred.uid,
    "X-Domain": cred.domain,
    "X-Product": "SaaS",
    "X-IDE-Type": "WorkBuddy",
    "User-Agent": `WorkBuddy/${uaVersion}`,
  }
}

/** 续期所需的头 */
export function wbDirectRefreshHeaders(cred: WbDirectCredential, uaVersion = "5.5.6"): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Refresh-Token": cred.refresh,
    "X-Auth-Refresh-Source": "plugin",
    "X-Domain": cred.domain,
    "User-Agent": `WorkBuddy/${uaVersion}`,
  }
}

/** access 是否临近或已过期 */
export function isCredentialStale(cred: WbDirectCredential, now = Date.now()): boolean {
  if (!cred.expires || cred.expires <= 0) return true
  return now >= cred.expires - WB_REFRESH_LEAD_MS
}

/** refresh token 自身是否已过期（过期即无法再续期） */
export function isRefreshExpired(cred: WbDirectCredential, now = Date.now()): boolean {
  if (!cred.refreshExpiresAt) return false
  return now >= cred.refreshExpiresAt
}

/**
 * 把续期接口返回的结果合并进原凭据。
 *
 * 关键约定：
 *  · 续期未返回 refreshToken 时**保留原 refresh**，否则将永久失去续期能力
 *  · 续期失败（got 为空）时**原样返回旧凭据**，调用方继续用旧 access
 *  · expiresAt（毫秒）优先于 expiresIn（秒）
 */
export function mergeRefreshedCredential(
  cred: WbDirectCredential,
  got: any,
  now = Date.now()
): WbDirectCredential {
  if (!got || typeof got !== "object") return cred

  const access = asString(got.accessToken) || cred.access
  const refresh = asString(got.refreshToken) || cred.refresh

  let expires = cred.expires
  const atMs = asMs(got.expiresAt)
  if (atMs > 0) {
    expires = atMs
  } else if (Number.isFinite(Number(got.expiresIn)) && Number(got.expiresIn) > 0) {
    expires = now + Number(got.expiresIn) * 1000
  }

  let refreshExpiresAt = cred.refreshExpiresAt
  const rAtMs = asMs(got.refreshExpiresAt)
  if (rAtMs > 0) {
    refreshExpiresAt = rAtMs
  } else if (Number.isFinite(Number(got.refreshExpiresIn)) && Number(got.refreshExpiresIn) > 0) {
    refreshExpiresAt = now + Number(got.refreshExpiresIn) * 1000
  }

  const domain = asString(got.domain) || cred.domain
  const tokenType = asString(got.tokenType) || cred.tokenType

  return {
    ...cred,
    access,
    refresh,
    expires,
    ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
    domain,
    ...(tokenType ? { tokenType } : {}),
  }
}

/** 把取积分接口返回的 Packages 汇总为剩余/总量（字符串容量做 parseFloat） */
export function sumWbCredits(summary: any): { total: number; used: number; remain: number; paid: boolean } {
  const packages = Array.isArray(summary?.Packages) ? summary.Packages : []
  let total = 0
  let used = 0
  for (const p of packages) {
    const t = Number(p?.CycleTotalCapacity)
    const u = Number(p?.CycleUsedCapacity)
    if (Number.isFinite(t)) total += t
    if (Number.isFinite(u)) used += u
  }
  return {
    total,
    used,
    remain: total - used,
    paid: summary?.IsPaidUser === true,
  }
}
