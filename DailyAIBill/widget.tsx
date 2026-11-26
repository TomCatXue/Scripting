// @ts-nocheck
/// <reference path="./global.d.ts" />
// ============================================================
// 小组件入口：读缓存 → 抓数据 → 渲染 → Widget.present
//
// 关键约束（Scripting 运行时）：
//   · Widget.present 是唯一渲染入口，必须在同一次 run 里调用
//   · Script.exit() 必须调用，否则进程挂起
//   · 抓取失败时用缓存兜底，绝不白屏
// ============================================================
import { Script, Text, VStack, Widget } from "scripting"
import { fetchBill, loadSettings, money, readCache, saveCache, type BillSettings, type BillState } from "./widget_data"
import { C } from "./theme"
import { ensureFont } from "./fonts"
import { LargeCard, MediumCard, SmallBudgetCard, SmallModelCard } from "./cards"

/** 15 分钟刷新一次 */
const RELOAD_MS = 15 * 60 * 1000

export type Variant = "model" | "budget"

function emptyState(): BillState {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
    period: "today",
    calls: 0,
    errors: 0,
    costUsd: 0,
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheHit: 0,
    unpriced: 0,
    streak: 0,
    agents: [],
    exact: true,
    updatedAt: Date.now(),
  }
}

/** 从 Widget.parameter 解析变体（2×2 才有两种） */
function variantOf(): Variant {
  const raw = String(Widget.parameter || "").trim().toLowerCase()
  if (raw.includes("budget") || raw.includes("预算")) return "budget"
  return "model"
}

/** 纸张容器：统一底色 + 圆角，保证三种尺寸质感一致 */
function Paper({ children }: { children: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      background={C.paper}
      clipShape={{ type: "rect", cornerRadius: 38, style: "continuous" }}
    >
      {children}
    </VStack>
  )
}

function view(state: BillState, s: BillSettings) {
  const family = Widget.family
  if (family === "systemLarge") {
    return (
      <Paper>
        <LargeCard state={state} s={s} />
      </Paper>
    )
  }
  if (family === "systemMedium") {
    return (
      <Paper>
        <MediumCard state={state} s={s} />
      </Paper>
    )
  }
  return (
    <Paper>
      {variantOf() === "budget" ? <SmallBudgetCard state={state} s={s} /> : <SmallModelCard state={state} s={s} />}
    </Paper>
  )
}

async function main() {
  // 先注册内嵌字体，再渲染；失败则自动退回系统等宽
  ensureFont()
  const s = loadSettings()
  const cached = readCache()

  // 没配置就先渲染空状态，避免卡在加载中
  if (!s.base) {
    let p: any
    try {
      p = view(cached || emptyState(), s)
    } catch (e) {
      console.log("空状态渲染失败:", String(e))
      p = <Text font={12}>请先在 App 内配置 magpie 网关</Text>
    }
    Widget.present(p, {
      reloadPolicy: { policy: "after", date: new Date(Date.now() + RELOAD_MS) },
    })
    Script.exit()
    return
  }

  const { state, error } = await fetchBill(s)

  let final: BillState
  if (state) {
    saveCache(state)
    final = state
  } else {
    // 抓取失败：缓存兜底，时间戳保留原始抓取时间
    final = cached || emptyState()
    if (error) console.log("读取用量失败:", error)
  }

  // 兜底：万一视图构建抛错（例如某个属性不被运行时支持），
  // 也不能让小组件白屏或整个 App 进不去 —— 退化成纯文字卡。
  let body: any
  try {
    body = view(final, s)
  } catch (e) {
    console.log("视图构建失败:", String(e))
    body = (
      <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        padding={{ top: 12, bottom: 12, leading: 12, trailing: 12 }}>
        <Text font={10} fontWeight="bold">每日 AI 账单</Text>
        <Text font={20}>{money(final.costUsd, s)}</Text>
        <Text font={8}>请求 {final.calls} · 错误 {final.errors}</Text>
      </VStack>
    )
  }

  Widget.present(body, {
    reloadPolicy: { policy: "after", date: new Date(Date.now() + RELOAD_MS) },
  })
  Script.exit()
}

main()
