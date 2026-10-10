// @ts-nocheck
// ============================================================
// 多账号注册表与凭据寻址
//
// 设计要点：
//  1. 注册表（非敏感：id / 标签 / 启用态）存 Storage，键 `mutepanel_accounts_<svc>_v1`。
//  2. 凭据（敏感）存 Keychain，键 `mutepanel_acct_<svc>_<id>_<field>`。
//  3. 老配置零迁移：注册表缺失但存在遗留单账号键时，自动播种一个
//     id 为 "legacy" 的账号，其凭据读取回落至原有遗留键（含历史别名）。
//     遗留键永不改写、永不删除（除非用户显式清除该账号）。
// ============================================================

/** 由遗留单账号键播种出来的账号 id，同时作为保留 id 不可被占用 */
export const LEGACY_ACCOUNT_ID = "legacy"

/** 支持多账号的服务。workbuddy_direct 用于键名，展示 id 为 workbuddy-direct */
export type AccountService = "deepseek" | "codex" | "antigravity" | "workbuddy_direct"

export interface AccountMeta {
  id: string
  label: string
  on: boolean
  addedAt: string
}

interface Registry {
  version: number
  defaultId: string | null
  accounts: AccountMeta[]
}

// ── 每服务的凭据字段与遗留键映射 ────────────────────────────────

const FIELDS: Record<AccountService, string[]> = {
  deepseek: ["token"],
  codex: ["token", "refresh", "expires", "accountid"],
  antigravity: ["token", "refresh", "expires", "project"],
  workbuddy_direct: ["credential"],
}

/** 遗留键按优先级排列：靠前的优先命中 */
const LEGACY_KEYS: Record<AccountService, Record<string, string[]>> = {
  deepseek: {
    token: ["dashboard_kit_deepseek_token"],
  },
  codex: {
    token: ["dashboard_kit_codex_token"],
    refresh: ["dashboard_kit_codex_refresh_token"],
    expires: ["dashboard_kit_codex_expires_at"],
    accountid: ["dashboard_kit_codex_account_id"],
  },
  antigravity: {
    token: ["dashboard_kit_antigravity_token"],
    // 历史别名 dashboard_kit_antigravity_refresh 排在主键之后
    refresh: ["dashboard_kit_antigravity_refresh_token", "dashboard_kit_antigravity_refresh"],
    expires: ["dashboard_kit_antigravity_expires_at"],
    project: ["dashboard_kit_antigravity_project"],
  },
  workbuddy_direct: {},
}

/** 判定「该服务是否曾配置过单账号」的探测键（含别名） */
const LEGACY_PRESENCE: Record<AccountService, string[]> = {
  deepseek: ["dashboard_kit_deepseek_token"],
  codex: ["dashboard_kit_codex_token"],
  antigravity: [
    "dashboard_kit_antigravity_token",
    "dashboard_kit_antigravity_refresh_token",
    "dashboard_kit_antigravity_refresh",
  ],
  workbuddy_direct: [],
}

// ── 键名构造 ────────────────────────────────────────────────────

export function registryKey(service: AccountService): string {
  return `mutepanel_accounts_${service}_v1`
}

/** 账号 id 需为 Keychain 安全的短串，且不能与键分隔符冲突 */
export function isValidAccountId(id: string): boolean {
  return typeof id === "string" && /^[a-z0-9]{4,16}$/.test(id)
}

/** 由任意种子生成合法账号 id（slug + 短哈希，保证唯一且安全） */
export function makeAccountId(seed: string): string {
  const raw = String(seed || "").toLowerCase()
  const slug = raw.replace(/[^a-z0-9]/g, "").slice(0, 8)
  let h = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const hash = h.toString(36).slice(0, 6).padStart(4, "0")
  const id = (slug || "acct") + hash
  return id.slice(0, 16)
}

function accountKeyName(service: AccountService, id: string, field: string): string {
  return `mutepanel_acct_${service}_${id}_${field.toLowerCase()}`
}

// ── 注册表读写 ──────────────────────────────────────────────────

function readRegistry(service: AccountService): Registry | null {
  let raw: any = null
  try {
    raw = Storage.get(registryKey(service), { shared: true }) || Storage.get(registryKey(service))
  } catch {
    return null
  }
  if (raw == null) return null
  // 兼容被写成字符串的损坏值
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.accounts)) return null
  return raw as Registry
}

function writeRegistry(service: AccountService, reg: Registry): void {
  try {
    Storage.set(registryKey(service), reg, { shared: true })
    Storage.set(registryKey(service), reg)
  } catch {}
}

function hasLegacy(service: AccountService): boolean {
  try {
    return LEGACY_PRESENCE[service].some((k) => Keychain.contains(k))
  } catch {
    return false
  }
}

/** 规范化：过滤非法 id、去重、裁剪标签 */
function normalize(reg: Registry): Registry {
  const seen = new Set<string>()
  const accounts: AccountMeta[] = []
  for (const a of reg.accounts) {
    const id = String(a?.id || "")
    if (!isValidAccountId(id) || seen.has(id)) continue
    seen.add(id)
    accounts.push({
      id,
      label: String(a?.label || id).slice(0, 60),
      on: a?.on !== false,
      addedAt: typeof a?.addedAt === "string" ? a.addedAt : new Date().toISOString(),
    })
  }
  const defaultId = accounts.some((a) => a.id === reg.defaultId) ? reg.defaultId : null
  return { version: 1, defaultId, accounts }
}

function seedRegistry(service: AccountService): Registry {
  return {
    version: 1,
    defaultId: LEGACY_ACCOUNT_ID,
    accounts: [
      { id: LEGACY_ACCOUNT_ID, label: "默认账号", on: true, addedAt: new Date().toISOString() },
    ],
  }
}

/**
 * 取得注册表。缺失时按需播种（仅在确实存在遗留配置时才写盘，
 * 避免在小组件渲染路径上反复写入空注册表）。
 */
export function ensureRegistry(service: AccountService): Registry {
  const existing = readRegistry(service)
  if (existing) return normalize(existing)

  if (hasLegacy(service)) {
    const seeded = seedRegistry(service)
    writeRegistry(service, seeded)
    return seeded
  }
  return { version: 1, defaultId: null, accounts: [] }
}

export function listAccounts(service: AccountService): AccountMeta[] {
  return ensureRegistry(service).accounts
}

export function getDefaultAccountId(service: AccountService): string | null {
  return ensureRegistry(service).defaultId
}

/** 实际应优先使用的账号：默认账号 → 首个启用账号 → 首个账号 */
export function primaryAccountId(service: AccountService): string | null {
  const reg = ensureRegistry(service)
  if (reg.defaultId) return reg.defaultId
  const on = reg.accounts.find((a) => a.on)
  if (on) return on.id
  return reg.accounts[0]?.id ?? null
}

export function getAccount(service: AccountService, id: string): AccountMeta | null {
  return listAccounts(service).find((a) => a.id === id) ?? null
}

// ── 注册表 CRUD ─────────────────────────────────────────────────

export function addAccount(service: AccountService, label: string, forcedId?: string): AccountMeta {
  if (forcedId && forcedId === LEGACY_ACCOUNT_ID) {
    throw new Error("legacy 为保留账号 id，不可占用")
  }
  const reg = ensureRegistry(service)

  let id = forcedId && isValidAccountId(forcedId) ? forcedId : makeAccountId(label + Date.now())
  while (reg.accounts.some((a) => a.id === id)) {
    id = makeAccountId(id + Math.random())
  }

  const meta: AccountMeta = {
    id,
    label: String(label || id).slice(0, 60),
    on: true,
    addedAt: new Date().toISOString(),
  }
  reg.accounts.push(meta)
  if (!reg.defaultId) reg.defaultId = id
  writeRegistry(service, reg)
  return meta
}

export function removeAccount(service: AccountService, id: string): void {
  const reg = ensureRegistry(service)
  const before = reg.accounts.length
  reg.accounts = reg.accounts.filter((a) => a.id !== id)
  if (reg.accounts.length === before) return

  if (reg.defaultId === id) {
    reg.defaultId = reg.accounts.find((a) => a.on)?.id ?? reg.accounts[0]?.id ?? null
  }
  writeRegistry(service, reg)
  clearAccountCredentials(service, id)
}

export function setAccountEnabled(service: AccountService, id: string, on: boolean): void {
  const reg = ensureRegistry(service)
  const acc = reg.accounts.find((a) => a.id === id)
  if (!acc) return
  acc.on = on !== false
  writeRegistry(service, reg)
}

export function setDefaultAccount(service: AccountService, id: string): void {
  const reg = ensureRegistry(service)
  if (!reg.accounts.some((a) => a.id === id)) return
  reg.defaultId = id
  writeRegistry(service, reg)
}

export function renameAccount(service: AccountService, id: string, label: string): void {
  const reg = ensureRegistry(service)
  const acc = reg.accounts.find((a) => a.id === id)
  if (!acc) return
  acc.label = String(label || id).slice(0, 60)
  writeRegistry(service, reg)
}

// ── 凭据寻址 ────────────────────────────────────────────────────

/**
 * 读取某账号某字段的凭据。
 * 仅 legacy 账号回落至遗留单账号键；新账号读不到遗留键，
 * 避免两个账号意外共用同一份凭据。
 */
export function getAccountCredential(service: AccountService, id: string, field: string): string {
  if (!isValidAccountId(id)) return ""
  const own = accountKeyName(service, id, field)
  try {
    if (Keychain.contains(own)) return Keychain.get(own) || ""
  } catch {}

  if (id !== LEGACY_ACCOUNT_ID) return ""

  const candidates = LEGACY_KEYS[service][field.toLowerCase()] ?? []
  for (const key of candidates) {
    try {
      if (Keychain.contains(key)) return Keychain.get(key) || ""
    } catch {}
  }
  return ""
}

export function setAccountCredential(
  service: AccountService,
  id: string,
  field: string,
  value: string
): void {
  if (!isValidAccountId(id)) return
  const key = accountKeyName(service, id, field)
  try {
    if (value === "" || value == null) {
      Keychain.remove(key)
    } else {
      Keychain.set(key, String(value), { accessibility: "first_unlock_this_device" })
    }
  } catch {}

  // 遗留账号写透：同步写回原有固定键，使其他读取该键的小组件仍能拿到新值。
  // 只在写入非空值时同步；绝不隐式删除遗留键（删除只发生在显式清除流程）。
  if (id === LEGACY_ACCOUNT_ID && value !== "" && value != null) {
    const legacy = LEGACY_KEYS[service][field.toLowerCase()]?.[0]
    if (legacy) {
      try {
        Keychain.set(legacy, String(value), { accessibility: "first_unlock_this_device" })
      } catch {}
    }
  }
}

/** 清除该账号在 Keychain 中的全部字段（不动遗留键） */
export function clearAccountCredentials(service: AccountService, id: string): void {
  if (!isValidAccountId(id)) return
  for (const field of FIELDS[service] ?? []) {
    try {
      Keychain.remove(accountKeyName(service, id, field))
    } catch {}
  }
}

/**
 * 显式清除 legacy 账号的遗留键。
 * 只在用户主动「清除配置」时调用 —— 迁移与日常读取永不触发。
 */
export function clearLegacyCredentials(service: AccountService): void {
  const map = LEGACY_KEYS[service] ?? {}
  const keys = new Set<string>()
  for (const list of Object.values(map)) for (const k of list) keys.add(k)
  for (const key of keys) {
    try {
      Keychain.remove(key)
    } catch {}
  }
}

// ── 状态判定 ────────────────────────────────────────────────────

/** 该服务是否已配置（有账号，或存在遗留单账号配置） */
export function hasAnyConfiguredAccount(service: AccountService): boolean {
  const reg = ensureRegistry(service)
  if (reg.accounts.length > 0) return true
  return hasLegacy(service)
}

/** 参与聚合的账号（启用态） */
export function enabledAccounts(service: AccountService): AccountMeta[] {
  return listAccounts(service).filter((a) => a.on)
}
