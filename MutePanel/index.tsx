// @ts-nocheck
import {
  Button,
  Circle,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  RoundedRectangle,
  Script,
  Section,
  Spacer,
  Text,
  useEffect,
  VStack,
  Widget,
  ZStack,
} from "scripting"
import { BrandHeaderIcon } from "./cards"
import {
  LARGE_MODULE_IDS,
  getLargeModules,
  saveLargeModules,
} from "./widget"
import {
  GOLD_SOURCE_KEY,
  formatPct,
  getGoldData,
  refreshGoldData,
  ANTIGRAVITY_CACHE_KEY,
  CODEX_CACHE_KEY,
  CPAMP_CACHE_KEY,
  CPAMP_ENDPOINT_KEY,
  CPAMP_KEY,
  DEEPSEEK_CACHE_KEY,
  findDiscoveredDeepSeekToken,
  MEDIA_API_KEY,
  MEDIA_ENDPOINT_KEY,
  MEDIA_TYPE_KEY,
  FUEL_OIL_KEY,
  FUEL_PROVINCE_KEY,
  FUEL_PROVINCE_MAP,
  VPN_CACHE_KEY,
  WB_API_KEY,
  WB_ENDPOINT_KEY,
  getMediaType,
  hasAntigravityConfigured,
  hasCodexConfigured,
  hasCpampConfigured,
  hasDeepSeekConfigured,
  hasMediaConfigured,
  hasWbConfigured,
  hasWbDirectConfigured,
  normalizeUrl,
  refreshAntigravityData,
  refreshCodexData,
  refreshCpampData,
  refreshDeepSeekData,
  refreshEmbyData,
  refreshFuelData,
  refreshMediaData,
  refreshVpnData,
  refreshWorkBuddyData,
  refreshWbDirectData,
  setWbDirectCredential,
  WB_DIRECT_CACHE_KEY,
  WB_CACHE_KEY,
  TREND_KEY_WB_DIRECT,
} from "./data"
import {
  LEGACY_ACCOUNT_ID,
  addAccount,
  clearLegacyCredentials,
  getDefaultAccountId,
  listAccounts,
  registryKey,
  removeAccount,
  renameAccount,
  setAccountCredential,
  setAccountEnabled,
  setDefaultAccount,
} from "./accounts"
import { parseWbDirectCredential } from "./wb_direct"
import {
  completeAntigravityOAuth,
  completeCodexOAuth,
  startAntigravityOAuth,
  startCodexOAuth,
} from "./oauth"
import { THEME, formatTime, remainColor } from "./theme"
import {
  CPAMP_LOGO_SVG,
  DEFAULT_ANTIGRAVITY,
  DEFAULT_CODEX,
  DEFAULT_WORKBUDDY,
  DEEPSEEK_WHALE_SVG,
  WIDGET_OPTIONS,
} from "./types"

// 引用系统标准全局 Dialog 对话框（Scripting 官方标准 API）
const gPrompt = (options: any) => Dialog.prompt(options)
const gAlert = (message: string) => Dialog.alert(message)
const gConfirm = (message: string) => Dialog.confirm(message)
const gActionSheet = async (title: string, options: string[]) => {
  const actions = options.filter((o) => o !== "取消").map((o) => ({ label: o }))
  const idx = await Dialog.actionSheet({
    title,
    actions,
    cancelButton: true,
  })
  if (idx === -1 || idx === undefined || idx === null || idx >= actions.length) return "取消"
  return actions[idx].label
}

const COLOR_SUCCESS = THEME.green
const COLOR_WARN = THEME.yellow
const BG_BOX = { light: "#F1F5F9", dark: "#1E293B" } as any

const C_TITLE = { light: "#111827", dark: "#F9FAFB" } as any
const C_SUBTITLE = { light: "#6B7280", dark: "#9CA3AF" } as any
const C_SECTION_HEADER = { light: "#4B5563", dark: "#9CA3AF" } as any

const PROMO_DISMISSED_KEY = "dashboard_kit_promo_dismissed"

export async function triggerPromo(_force = false) {
  // 已彻底移除弹窗与支持作者提示
}

function OptionBrandIcon({ id }: { id: string }) {
  if (id === "deepseek") {
    return <BrandHeaderIcon svgCode={DEEPSEEK_WHALE_SVG} size={20} />
  }
  if (id === "codex") {
    return <BrandHeaderIcon iconImage={DEFAULT_CODEX.iconImage} size={20} />
  }
  if (id === "antigravity") {
    return <BrandHeaderIcon iconImage={DEFAULT_ANTIGRAVITY.iconImage} size={20} />
  }
  if (id === "media") {
    return (
      <Image
        systemName="play.tv.fill"
        font={{ name: "system", size: 16 }}
        foregroundStyle="#38BDF8"
      />
    )
  }
  if (id === "workbuddy" || id === "workbuddy-direct") {
    return (
      <Image
        image={DEFAULT_WORKBUDDY.wordmarkImage}
        resizable={true}
        frame={{ width: 30, height: Math.round(30 * (57 / 248)) }}
      />
    )
  }
  if (id === "cpamp") {
    return <BrandHeaderIcon svgCode={CPAMP_LOGO_SVG} size={20} />
  }
  if (id === "vpn") {
    return (
      <Image
        systemName="antenna.radiowaves.left.and.right"
        font={{ name: "system", size: 16 }}
        foregroundStyle="#10B981"
      />
    )
  }
  if (id === "fuel") {
    return (
      <Image
        systemName="fuelpump.fill"
        font={{ name: "system", size: 16 }}
        foregroundStyle="#F59E0B"
      />
    )
  }
  if (id === "gold") {
    return (
      <Image
        systemName="centsign.circle.fill"
        font={{ name: "system", size: 16 }}
        foregroundStyle="#F59E0B"
      />
    )
  }
  if (id === "bento") {
    return (
      <Image
        systemName="square.grid.2x2.fill"
        font={{ name: "system", size: 16 }}
        foregroundStyle="#0A84FF"
      />
    )
  }
  return (
    <Image
      systemName="square.grid.2x2.fill"
      font={{ name: "system", size: 16 }}
      foregroundStyle="#6B7280"
    />
  )
}

/** 引导录入 WorkBuddy 配置 */
async function configureWorkBuddy() {
  const currentUrl = Keychain.contains(WB_ENDPOINT_KEY)
    ? Keychain.get(WB_ENDPOINT_KEY) || ""
    : ""
  const currentKey = Keychain.contains(WB_API_KEY)
    ? Keychain.get(WB_API_KEY) || ""
    : ""

  const url = await gPrompt({
    title: "配置 WorkBuddy · 后台地址",
    message: "请输入 workbuddy2api-panel 服务地址\n例如 http://192.168.1.100:7863",
    defaultValue: currentUrl,
    placeholder: "http://192.168.1.100:7863",
    keyboardType: "URL",
    confirmLabel: "下一步",
    cancelLabel: "取消",
  })
  if (url === null) return

  const key = await gPrompt({
    title: "配置 WorkBuddy · API Key (密钥)",
    message: "请输入配置文件中的 api_key 密钥\n（若 config.json 中未设置 api_key 可直接留空跳过）",
    defaultValue: currentKey,
    placeholder: "api_key（选填，未设则留空）",
    obscureText: true,
    confirmLabel: "保存并测试连接",
    cancelLabel: "取消",
  })
  if (key === null) return

  if (!url.trim()) {
    await gAlert("后台服务地址不能为空")
    return
  }

  const cleanUrl = normalizeUrl(url.trim())
  Keychain.set(WB_ENDPOINT_KEY, cleanUrl, {
    accessibility: "first_unlock_this_device",
  })
  if (key.trim()) {
    Keychain.set(WB_API_KEY, key.trim(), {
      accessibility: "first_unlock_this_device",
    })
  } else {
    Keychain.remove(WB_API_KEY)
  }

  const res = await refreshWorkBuddyData()
  if (res) {
    Widget.reloadAll()
    await gAlert(
      `✓ 连接成功！\n\n剩余积分：${res.mainValue}\n已签到：${res.subValue1} · 已用：${res.subValue2}\n\n小组件与看板现已直接展示你的真实账号池数据！`
    )
  } else {
    await gAlert(
      "已保存配置，但首次连接测试未通过。\n请检查：\n1. 手机与后台是否在同一局域网（或已打通穿透）\n2. api_key 是否与 config.json 中的一致"
    )
  }
}

/** 清理 WorkBuddy 配置 */
async function clearWorkBuddyConfig() {
  const ok = await gConfirm("确定要清除本机保存的 WorkBuddy 后台配置吗？")
  if (!ok) return
  Keychain.remove(WB_ENDPOINT_KEY)
  Keychain.remove(WB_API_KEY)
  await gAlert("已清除配置，WorkBuddy 卡片已恢复为默认演示数据。")
}

// ═════════════════════════════════════════════════════════════════
// 多账号通用管理
//
// 采用与现有配置流程一致的 Dialog 交互（actionSheet + prompt），
// 不额外引入自定义页面，避免改动 NavigationStack 结构。
// ═════════════════════════════════════════════════════════════════

/** 服务展示名，用于文案 */
const ACCOUNT_SERVICE_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  codex: "Codex",
  antigravity: "Antigravity",
  workbuddy_direct: "WorkBuddy 直连",
}

/**
 * 账号管理入口：选择账号 → 操作（启用/停用、设默认、重命名、删除）。
 * @param onAdd 该服务新增账号的引导函数
 * @param onChanged 任一变更后的回调（通常触发刷新与重载）
 */
async function manageAccounts(
  service: string,
  onAdd: () => Promise<boolean>,
  onChanged: () => Promise<void>
) {
  const label = ACCOUNT_SERVICE_LABELS[service] || service

  while (true) {
    const accounts = listAccounts(service as any)
    const defaultId = getDefaultAccountId(service as any)

    if (accounts.length === 0) {
      const choice = await gActionSheet(`管理 ${label} 账号`, ["➕ 添加账号", "取消"])
      if (choice !== "➕ 添加账号") return
      if (await onAdd()) await onChanged()
      return
    }

    const rows = accounts.map((a) => {
      const marks: string[] = []
      if (a.id === defaultId) marks.push("默认")
      if (!a.on) marks.push("已停用")
      return `${a.on ? "●" : "○"} ${a.label}${marks.length ? ` (${marks.join("·")})` : ""}`
    })

    const choice = await gActionSheet(`管理 ${label} 账号（${accounts.length}）`, [
      ...rows,
      "➕ 添加账号",
      "取消",
    ])
    if (choice === "取消") return

    if (choice === "➕ 添加账号") {
      if (await onAdd()) await onChanged()
      continue
    }

    const idx = rows.indexOf(choice)
    if (idx < 0) return
    const acc = accounts[idx]

    const isDefault = acc.id === defaultId
    const actions: string[] = []
    if (!isDefault) actions.push("设为默认")
    actions.push(acc.on ? "停用（不计入汇总）" : "启用")
    actions.push("重命名")
    actions.push("删除")

    const op = await gActionSheet(`${acc.label}`, actions)
    if (op === "取消") continue

    if (op === "设为默认") {
      setDefaultAccount(service as any, acc.id)
    } else if (op === "停用（不计入汇总）" || op === "启用") {
      setAccountEnabled(service as any, acc.id, op === "启用")
    } else if (op === "重命名") {
      const name = await gPrompt({
        title: "重命名账号",
        defaultValue: acc.label,
        placeholder: "账号备注名",
        confirmLabel: "保存",
        cancelLabel: "取消",
      })
      if (name === null) continue
      if (name.trim()) renameAccount(service as any, acc.id, name.trim())
    } else if (op === "删除") {
      const ok = await gConfirm(`确定删除账号「${acc.label}」吗？\n其保存的凭据会一并移除。`)
      if (!ok) continue
      removeAccount(service as any, acc.id)
    }

    await onChanged()
  }
}

/**
 * 清除某服务的全部账号（含注册表、各账号凭据与聚合缓存）。
 * 对由遗留配置播种出来的 legacy 账号，同时清理遗留键 —— 这是唯一会
 * 触碰遗留键的路径，且仅在用户显式确认后执行。
 */
async function clearAllAccounts(
  service: string,
  cacheKeys: string[],
  confirmText: string
) {
  const ok = await gConfirm(confirmText)
  if (!ok) return

  const accounts = listAccounts(service as any)
  const hadLegacy = accounts.some((a) => a.id === LEGACY_ACCOUNT_ID)
  for (const a of accounts) removeAccount(service as any, a.id)
  if (hadLegacy) clearLegacyCredentials(service as any)

  Storage.remove(registryKey(service as any), { shared: true })
  Storage.remove(registryKey(service as any))
  for (const key of cacheKeys) {
    Storage.remove(key, { shared: true })
    Storage.remove(key)
  }

  Widget.reloadAll()
  await gAlert("已清除该服务的全部账号与凭据，卡片已恢复为默认数据。")
}

/** 引导录入 WorkBuddy 官方直连凭据（粘贴整段 OAuth JSON） */
async function configureWbDirect(editAccountId?: string): Promise<boolean> {
  const raw = await gPrompt({
    title: editAccountId ? "更新 WorkBuddy 直连凭据" : "配置 WorkBuddy 直连",
    message:
      "请粘贴 magpie plugin-auth.json 中 workbuddy / workbuddy-ai 条目的完整 JSON\n" +
      "（含 access、refresh、uid、domain 等字段）",
    placeholder: '{"access":"...","refresh":"...","uid":"..."}',
    obscureText: true,
    confirmLabel: editAccountId ? "更新" : "解析并添加",
    cancelLabel: "取消",
  })
  if (raw === null) return false

  let cred
  try {
    cred = parseWbDirectCredential(raw)
  } catch (e: any) {
    await gAlert(`凭据解析失败：\n${e?.message || e}`)
    return false
  }

  const buildLabel = cred.build === "workbuddy-ai" ? "国际版 (workbuddy-ai)" : "国内版 (workbuddy)"
  const confirmed = await gConfirm(
    `已解析凭据：\n\n账号：${cred.accountId}\n版本：${buildLabel}\n域名：${cred.domain}\n\n确定${editAccountId ? "更新" : "添加"}该账号吗？`
  )
  if (!confirmed) return false

  // 编辑已有账号时直接覆盖凭据；否则新建账号
  const acc = editAccountId
    ? { id: editAccountId }
    : addAccount("workbuddy_direct", cred.accountId)
  setWbDirectCredential(acc.id, cred)
  if (editAccountId) renameAccount("workbuddy_direct", editAccountId, cred.accountId)

  const res = await refreshWbDirectData()
  if (res) {
    Widget.reloadAll()
    await gAlert(
      `✓ ${cred.accountId} 连接成功！\n\n积分剩余：${res.mainValue}\n已用：${res.subValue2}\n账号：${res.subValue1}`
    )
  } else {
    await gAlert("凭据已保存，但首次拉取积分失败。\n请确认网络可达，或凭据是否已过期。")
  }
  return true
}

/** 添加一个 DeepSeek 账号（写入账号命名空间，不覆盖遗留配置） */
async function addDeepSeekAccount(): Promise<boolean> {
  // 保留原有「一键导入其他小组件密钥」能力
  const discovered = findDiscoveredDeepSeekToken()
  let preset = ""

  if (discovered) {
    const choice = await Dialog.actionSheet({
      title: "添加 DeepSeek 账号",
      message: "检测到本机其他 DeepSeek 小组件中已有可用密钥/Token",
      actions: [
        { label: "⚡️ 直接一键导入 (推荐)" },
        { label: "✍️ 手动输入其他 Token / API Key" },
      ],
    })
    if (choice === null) return false
    if (choice === 0) preset = discovered
  }

  let token = preset
  if (!token) {
    const input = await gPrompt({
      title: "添加 DeepSeek 账号",
      message: "请输入该账号的 User Token 或开放平台 API Key",
      placeholder: "sk-... 或网页 User Token",
      obscureText: true,
      confirmLabel: "保存并测试",
      cancelLabel: "取消",
    })
    if (input === null || !input.trim()) return false
    token = input.trim()
  }

  const label = token.startsWith("sk-") ? `API Key …${token.slice(-4)}` : "网页 Token 账号"
  const acc = addAccount("deepseek", label)
  setAccountCredential("deepseek", acc.id, "token", token)

  const res = await refreshDeepSeekData()
  if (res) {
    Widget.reloadAll()
    await gAlert(`✓ 已添加账号「${acc.label}」\n\n汇总余额：${res.mainValue}`)
  } else {
    await gAlert("凭据已保存，但拉取失败，请检查 Token 是否有效。")
  }
  return true
}

/** 添加一个 Codex 账号（复用与单账号一致的两种授权方式） */
async function addCodexAccount(): Promise<boolean> {
  const choice = await gActionSheet("添加 Codex 账号", ["🌐 网页授权", "🔑 手动粘贴 Token", "取消"])
  if (choice === "取消") return false

  let token = ""
  let accountId = ""

  if (choice === "🌐 网页授权") {
    try {
      const authUrl = await startCodexOAuth()
      try {
        await Safari.present(authUrl, true)
      } catch {
        await Safari.openURL(authUrl)
      }
      const callbackUrl = await gPrompt({
        title: "完成 Codex 授权",
        message: "在 Safari 登录并授权后，地址栏将跳转到 localhost:1455...\n请复制地址栏全部内容粘贴到下方：",
        placeholder: "http://localhost:1455/auth/callback?code=...",
        confirmLabel: "完成登录",
        cancelLabel: "取消",
      })
      if (!callbackUrl) return false

      // 先建账号，再把 OAuth 结果写进该账号的命名空间
      const acc = addAccount("codex", "Codex 账号")
      const label = await completeCodexOAuth(callbackUrl, acc.id)
      renameAccount("codex", acc.id, label || acc.label)

      const res = await refreshCodexData()
      if (res) {
        Widget.reloadAll()
        await gAlert(`✓ ${label} 已添加\n\n5 小时额度合计：${formatPct(res.item1.pct)}%`)
      } else {
        await gAlert("已完成授权，但拉取用量失败，请稍后重试。")
      }
      return true
    } catch (e: any) {
      await gAlert(`授权失败：${e?.message || e}`)
      return false
    }
  }

  // 手动录入
  const t = await gPrompt({
    title: "添加 Codex 账号 · Access Token",
    message: "请输入 ChatGPT 的 Access Token (Bearer Token)",
    placeholder: "ey...",
    obscureText: true,
    confirmLabel: "下一步",
    cancelLabel: "取消",
  })
  if (t === null || !t.trim()) return false
  token = t.trim()

  const a = await gPrompt({
    title: "添加 Codex 账号 · ChatGPT-Account-Id",
    message: "若为 Team/Enterprise 账号请输入 Account ID，个人账号直接留空即可",
    placeholder: "可选，个人账号留空",
    confirmLabel: "保存并测试",
    cancelLabel: "取消",
  })
  if (a === null) return false
  accountId = a.trim()

  const acc = addAccount("codex", accountId || `Token …${token.slice(-4)}`)
  setAccountCredential("codex", acc.id, "token", token)
  if (accountId) setAccountCredential("codex", acc.id, "accountid", accountId)

  const res = await refreshCodexData()
  if (res) {
    Widget.reloadAll()
    await gAlert(`✓ 已添加账号「${acc.label}」\n\n5 小时额度合计：${formatPct(res.item1.pct)}%`)
  } else {
    await gAlert("凭据已保存，但拉取用量失败，请检查 Token 是否有效。")
  }
  return true
}

/** 添加一个 Antigravity 账号 */
async function addAntigravityAccount(): Promise<boolean> {
  const choice = await gActionSheet("添加 Antigravity 账号", ["🌐 网页授权", "🔑 手动粘贴 Token", "取消"])
  if (choice === "取消") return false

  if (choice === "🌐 网页授权") {
    try {
      const authUrl = await startAntigravityOAuth()
      try {
        await Safari.present(authUrl, true)
      } catch {
        await Safari.openURL(authUrl)
      }
      const callbackUrl = await gPrompt({
        title: "完成 Antigravity 授权",
        message: "在 Safari 登录并授权后，复制地址栏中 localhost:51121/oauth-callback 的完整地址粘贴到下方：",
        placeholder: "http://localhost:51121/oauth-callback?code=...",
        confirmLabel: "完成登录",
        cancelLabel: "取消",
      })
      if (!callbackUrl) return false

      const acc = addAccount("antigravity", "Antigravity 账号")
      const label = await completeAntigravityOAuth(callbackUrl, acc.id)
      renameAccount("antigravity", acc.id, label || acc.label)

      const res = await refreshAntigravityData()
      if (res) {
        Widget.reloadAll()
        await gAlert(`✓ ${label} 已添加\n\nGemini 额度合计：${formatPct(res.item1.pct)}%`)
      } else {
        await gAlert("已完成授权，但拉取配额失败，请稍后重试。")
      }
      return true
    } catch (e: any) {
      await gAlert(`授权失败：${e?.message || e}`)
      return false
    }
  }

  const t = await gPrompt({
    title: "添加 Antigravity 账号 · Access Token",
    message: "请输入 Google 的 Access Token (Bearer Token)",
    placeholder: "ya29...",
    obscureText: true,
    confirmLabel: "下一步",
    cancelLabel: "取消",
  })
  if (t === null || !t.trim()) return false

  const p = await gPrompt({
    title: "添加 Antigravity 账号 · Project ID",
    message: "可选，留空则自动探测绑定的 Cloud 项目",
    placeholder: "可选",
    confirmLabel: "保存并测试",
    cancelLabel: "取消",
  })
  if (p === null) return false

  const acc = addAccount("antigravity", `Token …${t.trim().slice(-4)}`)
  setAccountCredential("antigravity", acc.id, "token", t.trim())
  if (p.trim()) setAccountCredential("antigravity", acc.id, "project", p.trim())

  const res = await refreshAntigravityData()
  if (res) {
    Widget.reloadAll()
    await gAlert(`✓ 已添加账号「${acc.label}」\n\nGemini 额度合计：${formatPct(res.item1.pct)}%`)
  } else {
    await gAlert("凭据已保存，但拉取配额失败，请检查 Token 是否有效。")
  }
  return true
}

/** 引导录入 MoviePilot / Emby 媒体库配置 */
async function configureMedia() {
  const currentType = getMediaType()
  const currentUrl = Keychain.contains(MEDIA_ENDPOINT_KEY)
    ? Keychain.get(MEDIA_ENDPOINT_KEY) || ""
    : ""
  const currentKey = Keychain.contains(MEDIA_API_KEY)
    ? Keychain.get(MEDIA_API_KEY) || ""
    : ""

  const actionIdx = await Dialog.actionSheet({
    title: "选择媒体服务类型",
    message: "Media Nexus 支持对接 MoviePilot 或 Emby/Jellyfin",
    cancelButton: true,
    actions: [
      { label: "MoviePilot（支持入库统计与转移记录）" },
      { label: "Emby / Jellyfin（媒体库统计）" },
    ],
  })
  if (actionIdx === null || actionIdx === undefined || actionIdx < 0) return

  const isMP = actionIdx === 0
  const chosenType = isMP ? "moviepilot" : "emby"

  const defaultUrl = currentUrl
  const defaultKey = currentKey

  const url = await gPrompt({
    title: isMP ? "配置 MoviePilot · 地址" : "配置 Emby · 地址",
    message: isMP
      ? "请输入 MoviePilot 服务器地址\n例如 http://192.168.1.100:3068"
      : "请输入 Emby / Jellyfin 服务器地址\n例如 http://192.168.1.100:8096",
    defaultValue: defaultUrl,
    placeholder: isMP ? "http://192.168.1.100:3068" : "http://192.168.1.100:8096",
    keyboardType: "URL",
    confirmLabel: "下一步",
    cancelLabel: "取消",
  })
  if (url === null) return

  const key = await gPrompt({
    title: isMP ? "配置 MoviePilot · API Key" : "配置 Emby · API Key",
    message: isMP
      ? "请输入 MoviePilot 的 API 密钥 (apikey)"
      : "请输入 Emby 生成的 API 密钥",
    defaultValue: defaultKey,
    placeholder: "API Key",
    obscureText: true,
    confirmLabel: "保存并测试连接",
    cancelLabel: "取消",
  })
  if (key === null) return

  if (!url.trim() || !key.trim()) {
    await gAlert("地址和 API Key 不能为空")
    return
  }

  const cleanUrl = normalizeUrl(url.trim())
  Keychain.set(MEDIA_TYPE_KEY, chosenType, {
    accessibility: "first_unlock_this_device",
  })
  Keychain.set(MEDIA_ENDPOINT_KEY, cleanUrl, {
    accessibility: "first_unlock_this_device",
  })
  Keychain.set(MEDIA_API_KEY, key.trim(), {
    accessibility: "first_unlock_this_device",
  })

  const res = await refreshMediaData()
  if (res) {
    Widget.reloadAll()
    await gAlert(
      `✓ 连接成功！\n\n来源：${res.title}\n电影：${res.movies.toLocaleString()} 部 · 剧集：${res.shows.toLocaleString()} 部\n分集：${res.episodes.toLocaleString()} 集\n\n小组件与看板现已直接展示你的真实媒体数据！`
    )
  } else {
    await gAlert(
      "已保存配置，但首次连接测试未通过。\n请检查：\n1. 手机与该地址是否处于同一局域网\n2. API Key 是否正确"
    )
  }
}

/** 清理媒体库配置 */
async function clearMediaConfig() {
  const ok = await gConfirm("确定要清除本机保存的 Media Nexus 媒体库配置吗？")
  if (!ok) return
  Keychain.remove(MEDIA_TYPE_KEY)
  Keychain.remove(MEDIA_ENDPOINT_KEY)
  Keychain.remove(MEDIA_API_KEY)
  await gAlert("已清除配置，媒体看板卡片已恢复为默认演示数据。")
}

/** 引导配置 CPA-Manager-Plus (CPAMP) */
async function configureCpamp() {
  const currentEndpoint = Keychain.contains(CPAMP_ENDPOINT_KEY)
    ? Keychain.get(CPAMP_ENDPOINT_KEY) || ""
    : ""
  const currentKey = Keychain.contains(CPAMP_KEY)
    ? Keychain.get(CPAMP_KEY) || ""
    : ""

  const endpoint = await gPrompt({
    title: "配置 CPA-Manager-Plus · 服务地址",
    message: "请输入 CPAMP 服务地址\n例如 http://192.168.1.100:8317 或 https://cpamp.yourdomain.com",
    defaultValue: currentEndpoint,
    placeholder: "http://192.168.1.100:8317",
    keyboardType: "URL",
    confirmLabel: "下一步",
    cancelLabel: "取消",
  })
  if (endpoint === null) return

  const key = await gPrompt({
    title: "配置 CPA-Manager-Plus · 管理密钥",
    message: "请输入 Management Key (管理密钥)\n对应服务端的 ADMIN_KEY 或 MANAGEMENT_KEY\n（若未开启鉴权可直接留空跳过）",
    defaultValue: currentKey,
    placeholder: "Management Key（选填，未设则留空）",
    obscureText: true,
    confirmLabel: "保存并测试连接",
    cancelLabel: "取消",
  })
  if (key === null) return

  if (!endpoint.trim()) {
    await gAlert("服务地址不能为空")
    return
  }

  Keychain.set(CPAMP_ENDPOINT_KEY, endpoint.trim(), {
    accessibility: "first_unlock_this_device",
  })
  if (key.trim()) {
    Keychain.set(CPAMP_KEY, key.trim(), {
      accessibility: "first_unlock_this_device",
    })
  } else {
    Keychain.remove(CPAMP_KEY)
  }

  const res = await refreshCpampData()
  if (res) {
    Widget.reloadAll()
    await gAlert(
      `✓ 连接成功！\n\n今日调用：${res.mainValue} 次\n成功：${res.subValue1} · 失败：${res.subValue2}\n成功率：${res.progressPct}%\n消耗 Token：${res.footerLeft}\n消耗金额：${res.costStr || "—"}\n\n小组件现已直接展示真实 CPAMP 用量！`
    )
  } else {
    await gAlert(
      "已保存配置，但首次拉取数据失败。\n请确认：\n1. 服务地址与端口是否正确（默认 8317 端口）\n2. Management Key 是否匹配\n3. 手机与服务端网络是否连通"
    )
  }
}

/** 清理 CPAMP 配置 */
async function clearCpampConfig() {
  const ok = await gConfirm("确定要清除本机保存的 CPAMP 配置吗？")
  if (!ok) return
  Keychain.remove(CPAMP_ENDPOINT_KEY)
  Keychain.remove(CPAMP_KEY)
  Storage.remove(CPAMP_CACHE_KEY, { shared: true })
  Storage.remove(CPAMP_CACHE_KEY)
  await gAlert("已清除配置，CPAMP 卡片已恢复为默认数据。")
}

/** 一键重新检测当前 IP 与 VPN 节点状态 */
async function triggerVpnDetection() {
  const res = await refreshVpnData()
  if (res) {
    Widget.reloadAll()
    await gAlert(
      `✓ IP 检测完成！\n\n出口 IP：${res.ip}\n节点状态：${res.statusTitle}\n归属地：${res.location}\n运营商：${res.isp}\n风险指数：${res.riskPct}%\n网络属性：${res.tag1} · ${res.tag2}\n\n小组件已同步刷新最新节点！`
    )
  } else {
    await gAlert("网络连接超时或无法检测出口 IP，请检查手机网络后重试。")
  }
}

/** 配置黄金行情关注源与机构牌价 */
async function configureGoldSettings() {
  const goldSources = [
    { label: "上海黄金交易所 Au9999", key: "sge_au9999" },
    { label: "上海黄金交易所 Au(T+D)", key: "sge_autd" },
    { label: "招商银行积存金 (买入价)", key: "cmb" },
    { label: "浙商银行积存金 (京东金融)", key: "zs" },
  ]
  const currentSource = Storage.get<string>(GOLD_SOURCE_KEY, { shared: true }) || "sge_au9999"
  const chosen = await gActionSheet("请选择首选关注黄金行情源", [
    ...goldSources.map((g) => (g.key === currentSource ? `${g.label} (当前)` : g.label)),
    "取消",
  ])
  if (!chosen || chosen === "取消") return

  const clean = chosen.replace(" (当前)", "").trim()
  const target = goldSources.find((g) => g.label === clean)
  if (target) {
    Storage.set(GOLD_SOURCE_KEY, target.key, { shared: true })
    Storage.set(GOLD_SOURCE_KEY, target.key)
    await refreshGoldData()
    Widget.reloadAll()
  }
}

/** BENTO 模块的展示名称 */
const BENTO_MODULE_LABELS: Record<string, string> = {
  gold: "Au9999 金价",
  deepseek: "DeepSeek 余额",
  fx: "USD / CNY 汇率",
  oil: "今日油价",
  stock: "A 股大盘",
}

/**
 * 配置 BENTO 大号看板的模块与顺序。
 * 每轮选择一个模块追加到列表，选「完成」保存；最多 4 个模块（2×2 栅格）。
 */
async function configureBentoModules() {
  const picked: string[] = []
  const all = LARGE_MODULE_IDS as readonly string[]

  while (picked.length < 4) {
    const remaining = all.filter((id) => !picked.includes(id))
    if (remaining.length === 0) break

    const options = remaining.map((id) => BENTO_MODULE_LABELS[id] || id)
    const doneLabel = picked.length >= 1 ? "完成并保存" : "取消"
    const chosen = await gActionSheet(
      picked.length === 0
        ? "选择第 1 个模块（最多 4 个）"
        : `已选：${picked.map((p) => BENTO_MODULE_LABELS[p] || p).join(" → ")}\n请选择第 ${picked.length + 1} 个模块`,
      [...options, doneLabel]
    )
    if (!chosen || chosen === "取消") return
    if (chosen === doneLabel) break

    const id = all.find((k) => (BENTO_MODULE_LABELS[k] || k) === chosen)
    if (id) picked.push(id)
  }

  if (picked.length === 0) return
  saveLargeModules(picked)
  await gAlert(`已保存 BENTO 模块顺序：\n${picked.map((p) => BENTO_MODULE_LABELS[p] || p).join(" → ")}`)
  Widget.reloadAll()
}

/** 恢复 BENTO 默认模块顺序 */
async function resetBentoModules() {
  const ok = await gConfirm("恢复 BENTO 大号看板的默认模块顺序？")
  if (!ok) return
  saveLargeModules(["gold", "deepseek", "fx", "oil"])
  await gAlert("已恢复默认顺序：金价 → DeepSeek → 汇率 → 油价")
  Widget.reloadAll()
}

/** 配置今日油价监测省份与主力关注油品 */
async function configureFuelSettings() {
  const currentProv =
    Storage.get<string>(FUEL_PROVINCE_KEY, { shared: true }) ||
    Storage.get<string>(FUEL_PROVINCE_KEY) ||
    "北京"
  const currentOil =
    Storage.get<string>(FUEL_OIL_KEY, { shared: true }) ||
    Storage.get<string>(FUEL_OIL_KEY) ||
    "oil92"

  const provList = Object.keys(FUEL_PROVINCE_MAP)
  const selectedProv = await gActionSheet("请选择油价监测省份", [
    ...provList.map((p) => (p === currentProv ? `${p} (当前)` : p)),
    "取消",
  ])
  if (!selectedProv || selectedProv === "取消") return

  const cleanProv = selectedProv.replace(" (当前)", "").trim()

  const oilOptions = [
    { label: "92# 汽油", key: "oil92" },
    { label: "95# 汽油", key: "oil95" },
    { label: "98# 汽油", key: "oil98" },
    { label: "0# 柴油", key: "oil0" },
  ]
  const selectedOilLabel = await gActionSheet("请选择主力关注油品（小号组件高光展示）", [
    ...oilOptions.map((o) => (o.key === currentOil ? `${o.label} (当前)` : o.label)),
    "取消",
  ])
  if (!selectedOilLabel || selectedOilLabel === "取消") return

  const cleanOilKey =
    oilOptions.find((o) => selectedOilLabel.startsWith(o.label))?.key || "oil92"

  Storage.set(FUEL_PROVINCE_KEY, cleanProv, { shared: true })
  Storage.set(FUEL_PROVINCE_KEY, cleanProv)
  Storage.set(FUEL_OIL_KEY, cleanOilKey, { shared: true })
  Storage.set(FUEL_OIL_KEY, cleanOilKey)

  // 同时也写入独立脚本使用的 fuel_price_settings.json，实现双向兼容
  try {
    const fuelSettingsPath = `${FileManager.appGroupDocumentsDirectory}/fuel_price_settings.json`
    let s: any = {}
    if (FileManager.existsSync(fuelSettingsPath)) {
      try {
        s = JSON.parse(FileManager.readAsStringSync(fuelSettingsPath))
      } catch {}
    }
    s.selectedProvince = cleanProv
    s.focusOil = cleanOilKey
    FileManager.writeAsStringSync(fuelSettingsPath, JSON.stringify(s))
  } catch {}

  const res = await refreshFuelData()
  if (res) {
    Widget.reloadAll()
    await gAlert(
      `✓ 今日油价配置成功！\n\n省份：${res.province}\n主力油品：${res.oilFullName} (现价 ¥${res.focusPrice})\n预测：${res.smallTrend}\n\n桌面小组件已同步刷新最新油价！`
    )
  } else {
    await gAlert("已保存设置，但拉取油价数据超时，请检查网络后重试。")
  }
}

export default function ConfigView() {
  const dismiss = Navigation.useDismiss()
  const hasMedia = hasMediaConfigured()
  const mediaType = getMediaType()
  const hasWb = hasWbConfigured()
  const hasWbDirect = hasWbDirectConfigured()
  const hasDeepSeek = hasDeepSeekConfigured()
  const hasCodex = hasCodexConfigured()
  const hasAntigravity = hasAntigravityConfigured()
  const hasCpamp = hasCpampConfigured()

  // 各服务已配置的账号数（用于在状态行上显示「N 个账号」）
  const countAccounts = (svc: string) => {
    try {
      return listAccounts(svc as any).length
    } catch {
      return 0
    }
  }

  useEffect(() => {
    // 首次进入设置面板后 500ms 轻量触发
    const timer = setTimeout(() => {
      // 已彻底移除欢迎弹窗
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const mediaLabel = hasMedia
    ? `Media Nexus (${mediaType === "moviepilot" ? "MoviePilot" : "Emby"})`
    : "Media Nexus (影视媒体库)"

  return (
    <NavigationStack>
      <List
        navigationTitle="哑巴面板"
        navigationBarTitleDisplayMode="large"
        toolbar={{
          confirmationAction: (
            <Button
              title="保存"
              action={() => {
                Widget.reloadAll()
                dismiss()
              }}
            />
          ),
        }}
      >
        {/* 数据源状态汇总 */}
        <Section header={<Text>数据源状态（真实数据优先）</Text>}>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle={hasWb ? "#10B981" : "#F59E0B"}
            />
            <Text font={14} fontWeight="medium">WorkBuddy (Panel)</Text>
            <Spacer />
            <Button
              title={hasWb ? "已配置 · 修改" : "去配置"}
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await configureWorkBuddy()
              }}
            />
            {hasWb ? (
              <Button
                title="清除"
                role="destructive"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await clearWorkBuddyConfig()
                }}
              />
            ) : null}
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle={hasWbDirect ? "#10B981" : "#F59E0B"}
            />
            <Text font={14} fontWeight="medium">
              WorkBuddy 直连{countAccounts("workbuddy_direct") > 1 ? ` · ${countAccounts("workbuddy_direct")} 个账号` : ""}
            </Text>
            <Spacer />
            <Button
              title={hasWbDirect ? "管理" : "去配置"}
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await manageAccounts(
                  "workbuddy_direct",
                  async () => configureWbDirect(),
                  async () => {
                    await refreshWbDirectData()
                    Widget.reloadAll()
                  }
                )
              }}
            />
            {hasWbDirect ? (
              <Button
                title="清除"
                role="destructive"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await clearAllAccounts(
                    "workbuddy_direct",
                    [WB_DIRECT_CACHE_KEY, TREND_KEY_WB_DIRECT],
                    "确定要清除 WorkBuddy 直连的全部账号与凭据吗？"
                  )
                }}
              />
            ) : null}
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle={hasDeepSeek ? "#10B981" : "#F59E0B"}
            />
            <Text font={14} fontWeight="medium">
              DeepSeek{countAccounts("deepseek") > 1 ? ` · ${countAccounts("deepseek")} 个账号` : ""}
            </Text>
            <Spacer />
            <Button
              title={hasDeepSeek ? "管理" : "去配置"}
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await manageAccounts("deepseek", addDeepSeekAccount, async () => {
                  await refreshDeepSeekData()
                  Widget.reloadAll()
                })
              }}
            />
            {hasDeepSeek ? (
              <Button
                title="清除"
                role="destructive"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await clearAllAccounts(
                    "deepseek",
                    [DEEPSEEK_CACHE_KEY],
                    "确定要清除 DeepSeek 的全部账号与凭据吗？"
                  )
                }}
              />
            ) : null}
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle={hasCodex ? "#10B981" : "#F59E0B"}
            />
            <Text font={14} fontWeight="medium">
              Codex{countAccounts("codex") > 1 ? ` · ${countAccounts("codex")} 个账号` : ""}
            </Text>
            <Spacer />
            <Button
              title={hasCodex ? "管理" : "去配置"}
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await manageAccounts("codex", addCodexAccount, async () => {
                  await refreshCodexData()
                  Widget.reloadAll()
                })
              }}
            />
            {hasCodex ? (
              <Button
                title="清除"
                role="destructive"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await clearAllAccounts(
                    "codex",
                    [CODEX_CACHE_KEY],
                    "确定要清除 Codex 的全部账号与凭据吗？"
                  )
                }}
              />
            ) : null}
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle={hasAntigravity ? "#10B981" : "#F59E0B"}
            />
            <Text font={14} fontWeight="medium">
              Antigravity{countAccounts("antigravity") > 1 ? ` · ${countAccounts("antigravity")} 个账号` : ""}
            </Text>
            <Spacer />
            <Button
              title={hasAntigravity ? "管理" : "去配置"}
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await manageAccounts("antigravity", addAntigravityAccount, async () => {
                  await refreshAntigravityData()
                  Widget.reloadAll()
                })
              }}
            />
            {hasAntigravity ? (
              <Button
                title="清除"
                role="destructive"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await clearAllAccounts(
                    "antigravity",
                    [ANTIGRAVITY_CACHE_KEY],
                    "确定要清除 Antigravity 的全部账号与凭据吗？"
                  )
                }}
              />
            ) : null}
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle={hasMedia ? "#10B981" : "#F59E0B"}
            />
            <Text font={14} fontWeight="medium">{mediaLabel}</Text>
            <Spacer />
            <Button
              title={hasMedia ? "已配置 · 修改" : "去配置"}
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await configureMedia()
              }}
            />
            {hasMedia ? (
              <Button
                title="清除"
                role="destructive"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await clearMediaConfig()
                }}
              />
            ) : null}
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle={hasCpamp ? "#10B981" : "#F59E0B"}
            />
            <Text font={14} fontWeight="medium">CPA-Manager-Plus</Text>
            <Spacer />
            <Button
              title={hasCpamp ? "已配置 · 修改" : "去配置"}
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await configureCpamp()
              }}
            />
            {hasCpamp ? (
              <Button
                title="清除"
                role="destructive"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await clearCpampConfig()
                }}
              />
            ) : null}
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle="#10B981"
            />
            <Text font={14} fontWeight="medium">IP / 节点检测</Text>
            <Spacer />
            <Button
              title="立即检测"
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await triggerVpnDetection()
              }}
            />
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle="#F59E0B"
            />
            <Text font={14} fontWeight="medium">黄金行情 (关注源/机构)</Text>
            <Spacer />
            <Button
              title="切换金价源"
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await configureGoldSettings()
              }}
            />
          </HStack>
          <HStack spacing={10} alignment="center">
            <Image
              systemName="circle.fill"
              font={{ name: "system", size: 8 }}
              foregroundStyle="#10B981"
            />
            <Text font={14} fontWeight="medium">今日油价 (省份/油品)</Text>
            <Spacer />
            <Button
              title="设置省份"
              buttonStyle="bordered"
              controlSize="mini"
              action={async () => {
                await configureFuelSettings()
              }}
            />
          </HStack>
            <HStack spacing={10} alignment="center">
              <Image
                systemName="square.grid.2x2.fill"
                font={{ name: "system", size: 14 }}
                foregroundStyle="#0A84FF"
              />
              <VStack alignment="leading" spacing={2}>
                <Text font={14} fontWeight="medium">BENTO 大号看板 (模块配置)</Text>
                <Text font={11} foregroundStyle={C_SUBTITLE}>
                  当前：{getLargeModules().map((m) => BENTO_MODULE_LABELS[m] || m).join(" → ")}
                </Text>
              </VStack>
              <Spacer />
              <Button
                title="调整顺序"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await configureBentoModules()
                }}
              />
              <Button
                title="恢复默认"
                buttonStyle="bordered"
                controlSize="mini"
                action={async () => {
                  await resetBentoModules()
                }}
              />
            </HStack>
          <HStack spacing={10} alignment="center" padding={{ top: 4 }}>
            <Image
              systemName="arrow.clockwise.circle.fill"
              font={{ name: "system", size: 16 }}
              foregroundStyle="#3B82F6"
            />
            <VStack alignment="leading" spacing={2}>
              <Text font={14} fontWeight="medium">强制刷新所有桌面小组件</Text>
              <Text font={11} foregroundStyle={C_SUBTITLE}>重新拉取所有在线凭证并触发 Widget 重新渲染</Text>
            </VStack>
            <Spacer />
            <Button
              title="立即刷新"
              buttonStyle="borderedProminent"
              controlSize="small"
              action={async () => {
                try {
                  const tasks: Promise<any>[] = []
                  if (hasWb) tasks.push(refreshWorkBuddyData().catch((e) => console.log("wb err:", e)))
                  if (hasWbDirect) tasks.push(refreshWbDirectData().catch((e) => console.log("wbd err:", e)))
                  if (hasMedia) tasks.push(refreshEmbyData().catch((e) => console.log("media err:", e)))
                  if (hasDeepSeek) tasks.push(refreshDeepSeekData().catch((e) => console.log("ds err:", e)))
                  if (hasCodex) tasks.push(refreshCodexData().catch((e) => console.log("codex err:", e)))
                  if (hasAntigravity) tasks.push(refreshAntigravityData().catch((e) => console.log("ag err:", e)))
                  if (hasCpamp) tasks.push(refreshCpampData().catch((e) => console.log("cpamp err:", e)))
                  tasks.push(refreshVpnData().catch((e) => console.log("vpn err:", e)))
                  tasks.push(refreshFuelData().catch((e) => console.log("fuel err:", e)))

                  await Promise.all(tasks)
                  Widget.reloadAll()
                  await gAlert("✓ 桌面小组件刷新完成！\n已同步更新数据源缓存并通知 iOS 桌面重新渲染。")
                } catch (e: any) {
                  await gAlert(`刷新异常：${e?.message || e}`)
                }
              }}
            />
          </HStack>
        </Section>

        {/* 方案 A 使用说明 */}
        <Section header={<Text>桌面多组件配置说明（方案 A）</Text>}>
          <VStack alignment="leading" spacing={6} padding={{ top: 4, bottom: 4 }}>
            <Text font={14} fontWeight="semibold" foregroundStyle={C_SECTION_HEADER}>
              如何在桌面添加不同组件？
            </Text>
            <Text font={12} foregroundStyle={C_SUBTITLE}>
              1. 在手机桌面长按空白处 → 点击左上角「+」→ 找到「哑巴面板」小组件。
            </Text>
            <Text font={12} foregroundStyle={C_SUBTITLE}>
              2. 长按已添加的小组件，点击「编辑小组件」。
            </Text>
            <Text font={12} foregroundStyle={C_SUBTITLE}>
              3. 在「参数 (Parameter)」一栏输入下方对应的组件 ID（例如 deepseek、workbuddy 或 media）即可切换。
            </Text>
          </VStack>
        </Section>

        {/* 各看板列表与预览入口 */}
        <Section header={<Text>支持的看板模版（点击即刻预览）</Text>}>
          {WIDGET_OPTIONS.map((opt) => (
            <HStack
              key={opt.id}
              spacing={12}
              padding={{ top: 6, bottom: 6 }}
              alignment="center"
            >
              <ZStack
                frame={{ width: 36, height: 36 }}
                alignment="center"
              >
                <RoundedRectangle
                  fill={BG_BOX}
                  cornerRadius={10}
                  frame={{ width: 36, height: 36 }}
                />
                <OptionBrandIcon id={opt.id} />
              </ZStack>

              <VStack alignment="leading" spacing={3}>
                <HStack spacing={6}>
                  <Text font={15} fontWeight="bold" foregroundStyle={C_TITLE}>
                    {opt.name}
                  </Text>
                  <Text
                    font={11}
                    fontWeight="medium"
                    foregroundStyle="#6366F1"
                  >
                    {`ID: ${opt.id}`}
                  </Text>
                </HStack>
                <Text font={12} foregroundStyle={C_SUBTITLE}>
                  {opt.desc}
                </Text>
              </VStack>
              <Spacer />
              <Button
                title="预览"
                buttonStyle="borderedProminent"
                controlSize="small"
                action={async () => {
                  const paramOptions = Object.fromEntries(
                    WIDGET_OPTIONS.map((o) => [o.name, o.id])
                  )
                  // 针对带账号的在线看板，在启动预览前触发一次数据准备
                  if (opt.id === "antigravity") {
                    await refreshAntigravityData().catch(() => null)
                  } else if (opt.id === "codex") {
                    await refreshCodexData().catch(() => null)
                  } else if (opt.id === "deepseek") {
                    await refreshDeepSeekData().catch(() => null)
                  } else if (opt.id === "workbuddy") {
                    await refreshWorkBuddyData().catch(() => null)
                  } else if (opt.id === "workbuddy-direct") {
                    await refreshWbDirectData().catch(() => null)
                  } else if (opt.id === "cpamp") {
                    await refreshCpampData().catch(() => null)
                  } else if (opt.id === "vpn") {
                    await refreshVpnData().catch(() => null)
                  } else if (opt.id === "fuel") {
                    await refreshFuelData().catch(() => null)
                  } else if (opt.id === "media") {
                    await refreshMediaData().catch(() => null)
                  }

                  // 保存当前预览卡片 ID 供预览渲染时优先读取
                  try {
                    Storage.set("dashboard_kit_preview_active_id", opt.id, { shared: true })
                    Storage.set("dashboard_kit_preview_active_id", opt.id)
                    FileManager.writeAsStringSync(
                      FileManager.appGroupDocumentsDirectory + "/dashboard_kit_preview_active.txt",
                      opt.id
                    )
                  } catch {}

                  let previewFamily = opt.defaultFamily as any
                  if (opt.id === "deepseek" || opt.id === "workbuddy" || opt.id === "workbuddy-direct" || opt.id === "codex" || opt.id === "antigravity") {
                    const chosen = await gActionSheet("请选择预览尺寸", [
                      "小号组件",
                      "中号组件",
                      "取消",
                    ])
                    if (!chosen || chosen === "取消") return
                    previewFamily = chosen.includes("中号") ? "systemMedium" : "systemSmall"
                  }
                  if (opt.id === "gold") {
                    const chosen = await gActionSheet("请选择预览尺寸", [
                      "小号组件",
                      "中号组件",
                      "取消",
                    ])
                    if (!chosen || chosen === "取消") return
                    previewFamily = chosen.includes("中号") ? "systemMedium" : "systemSmall"
                  }
                  if (opt.id === "fuel") {
                    const chosen = await gActionSheet("请选择预览尺寸", [
                      "小号组件",
                      "中号组件",
                      "取消",
                    ])
                    if (!chosen || chosen === "取消") return
                    previewFamily = chosen.includes("中号") ? "systemMedium" : "systemSmall"
                  }

                  await Widget.preview({
                    family: previewFamily,
                    parameters: {
                      options: paramOptions,
                      default: opt.name,
                    },
                  })
                }}
              />
            </HStack>
          ))}
        </Section>

      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present(<ConfigView />)
  Script.exit()
}

run()
