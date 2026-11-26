// @ts-nocheck
/// <reference path="./global.d.ts" />
// ============================================================
// 卡片视图：2×2 / 4×2 / 4×4，按参考图逐像素对齐
//
// 从放大后的原图读出的关键版式（与之前实现的主要差异）：
//   1. 标题是喜鹊图标 + 「每日 AI 账单」，副标题「经 magpie 路由」在其正下方
//   2. 「API 总费用」在金额的**右边**（基线对齐），不是压在金额上面
//   3. 请求数那一行里「连续 10 天」跟在错误数后面，同一行
//   4. AGENT 列表**每行只有一行**：名字 + 金额 + (tokens)
//      百分比紧跟金额右边，**绝不另起一行**
//   5. 列表下方有一条**细进度条**显示该 agent 的费用占比
//   6. 分隔线是点线（dashed），不是实线
// ============================================================
import { HStack, RoundedRectangle, SVG, Spacer, Text, VStack, ZStack } from "scripting"
import { C, F, FL, FONT } from "./theme"
import { fontNameOrNull } from "./fonts"
import { MAGPIE_SVG } from "./icons"
import { count, money, percent, shortModel, upper, type BillSettings, type BillState } from "./widget_data"

// ── 基础原子 ────────────────────────────────────────────────

/** 分隔线：原图是点线。用等距小方块模拟，比 solid 更接近小票 */
function Dots({ color = C.rule, gap = 1.6 }: { color?: string; gap?: number }) {
  const n = 56
  return (
    <HStack spacing={gap} frame={{ maxWidth: "infinity", height: 1 }}>
      {Array.from({ length: n }, (_, i) => (
        <RoundedRectangle key={i} fill={color} cornerRadius={0.5} frame={{ width: 1, height: 1 }} />
      ))}
      <Spacer minLength={0} />
    </HStack>
  )
}

/**
 * 纸张上的文字：等宽 + 单行
 *
 * 关键：font 参数绝不能给一个系统里不存在的字体名 —— Scripting 的 Text
 * 遇到未知字体名不会降级，而是直接让整个视图渲染失败（表现为「界面进不去」）。
 * 所以这里先问 fontNameOrNull()：注册成功才用内嵌字体，否则退回纯数字字号
 * （系统等宽），保证任何情况下都能渲染出来。
 */
function Ink({
  children,
  size = F.body,
  color = C.body,
  weight = "regular",
}: {
  children: any
  size?: number
  color?: string
  weight?: any
}) {
  const family = fontNameOrNull()
  const font = family ? { name: family, size } : size
  return (
    <Text font={font} fontWeight={weight} foregroundStyle={color} lineLimit={1}>
      {children}
    </Text>
  )
}

/**
 * 喜鹊 + 「每日 AI 账单」+ 「经 magpie 路由」
 *
 * 4×4 要放大：原图里大组件的标题是 15pt，而 2×2/4×2 只要 11pt。
 * icon / tag 跟着标题一起缩放，保持视觉比例。
 */
function Head({ size = F.title, tag = F.tag }: { size?: number; tag?: number }) {
  return (
    <HStack alignment="top" spacing={size * 0.34}>
      <SVG code={MAGPIE_SVG} resizable={true} frame={{ width: size * 1.14, height: size * 1.14 }} />
      <VStack alignment="leading" spacing={size * 0.05}>
        <Ink size={size} color={C.ink} weight="bold">
          每日 AI 账单
        </Ink>
        <Ink size={tag} color={C.dim}>
          经 magpie 路由
        </Ink>
      </VStack>
    </HStack>
  )
}

/** 金额 + 「API 总费用」并排：金额大、标签贴在右边底部 */
function Amount({ value, size }: { value: string; size: number }) {
  return (
    <HStack alignment="bottom" spacing={6}>
      <Ink size={size} color={C.ink}>
        {value}
      </Ink>
      <VStack alignment="leading" spacing={0} padding={{ bottom: size * 0.16 }}>
        <Ink size={F.tag} color={C.dim}>
          API 总费用
        </Ink>
      </VStack>
    </HStack>
  )
}

/** 预算进度条 */
function Bar({ ratio, h = 4, color = C.ink }: { ratio: number; h?: number; color?: string }) {
  const r = Math.max(0, Math.min(1, ratio || 0))
  return (
    <ZStack alignment="leading" frame={{ height: h, maxWidth: "infinity" }}>
      <RoundedRectangle fill={C.track} cornerRadius={h / 2} frame={{ height: h, maxWidth: "infinity" }} />
      <RoundedRectangle fill={color} cornerRadius={h / 2} frame={{ width: `${(r * 100).toFixed(2)}%`, height: h }} />
    </ZStack>
  )
}

/** 内边距 */
const PAD = { top: 13, bottom: 13, leading: 14, trailing: 14 }

// ── 2×2 ────────────────────────────────────────────────────

/**
 * 2×2 模型版。原图从上到下：
 *   喜鹊+标题 / 金额+API总费用 / 请求数·错误·连续天数 / 最贵模型+金额 / 状态点+Tokens
 */
export function SmallModelCard({ state, s }: { state: BillState; s: BillSettings }) {
  const top = state.agents[0]
  const name = top ? shortModel(top.topModel || top.name) : "-"
  return (
    <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={PAD}>
      <Head />
      <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 8, bottom: 6 }}>
        <Amount value={money(state.costUsd, s)} size={F.amount} />
      </VStack>
      <Ink size={F.body} color={C.body}>
        请求数 {state.calls} · 错误 {state.errors} · 连续 {state.streak || 1} 天
      </Ink>
      <Spacer minLength={6} />
      <Dots />
      <HStack alignment="baseline" spacing={0} frame={{ maxWidth: "infinity" }} padding={{ top: 7 }}>
        <Ink size={F.body} color={C.ink} weight="bold">
          {name}
        </Ink>
        <Spacer minLength={4} />
        <Ink size={F.body} color={C.ink} weight="bold">
          {top ? money(top.cost, s) : "-"}
        </Ink>
      </HStack>
      <HStack alignment="center" spacing={4} padding={{ top: 5 }}>
        <RoundedRectangle fill={C.ok} cornerRadius={2.5} frame={{ width: 5, height: 5 }} />
        <Ink size={F.body} color={C.ok} weight="bold">
          正常运转
        </Ink>
        <Ink size={F.body} color={C.dim}>
          · {count(state.tokens)} Tokens
        </Ink>
      </HStack>
    </VStack>
  )
}

/**
 * 2×2 预算版：把「连续天数」换成预算进度条。
 * 原图 4×2 左栏的压缩版。
 */
export function SmallBudgetCard({ state, s }: { state: BillState; s: BillSettings }) {
  const used = state.costUsd * (s.currency === "cny" ? s.rate : 1)
  const hasBudget = s.budget > 0
  return (
    <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={PAD}>
      <Head />
      <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 8, bottom: 4 }}>
        <Amount value={money(state.costUsd, s)} size={F.amount} />
      </VStack>
      {hasBudget ? (
        <VStack alignment="leading" spacing={0}>
          <Ink size={F.body} color={C.body}>
            已限额 {money(s.budget / (s.currency === "cny" ? s.rate : 1), s)} · {percent(used / s.budget)} 已用
          </Ink>
          <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 4, bottom: 5 }}>
            <Bar ratio={used / s.budget} h={4} />
          </VStack>
        </VStack>
      ) : null}
      <Ink size={F.body} color={C.body}>
        请求数 {state.calls} · 错误 {state.errors}
      </Ink>
      <Spacer minLength={4} />
      <Ink size={F.body} color={C.body}>
        缓存命中率 {percent(state.cacheHit)}
      </Ink>
    </VStack>
  )
}

// ── 4×2 中组件 ─────────────────────────────────────────────

/**
 * 4×2。原图版式：
 *   左栏：标题 / 金额 / API总费用 / 限额行 / 进度条 / 请求数 / 缓存命中率
 *   右栏：表头 / AGENT(模型) 金额 / 占比进度条 / 百分比  ← 百分比在进度条右端
 *   右栏底部：Token 总量 · 输入 · 输出
 */
export function MediumCard({ state, s }: { state: BillState; s: BillSettings }) {
  const used = state.costUsd * (s.currency === "cny" ? s.rate : 1)
  const hasBudget = s.budget > 0
  const list = state.agents.slice(0, 3)

  return (
    <HStack alignment="top" spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} padding={PAD}>
      {/* 左栏 */}
      <VStack alignment="leading" spacing={0} frame={{ width: 118 }}>
        <Head size={F.title - 0.5} />
        <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 6, bottom: 3 }}>
          <Amount value={money(state.costUsd, s)} size={F.amount - 3} />
        </VStack>
        {hasBudget ? (
          <VStack alignment="leading" spacing={0}>
            <Ink size={F.bodySm} color={C.body}>
              已限额 {money(s.budget / (s.currency === "cny" ? s.rate : 1), s)} · {percent(used / s.budget)} 已用
            </Ink>
            <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 3, bottom: 5 }}>
              <Bar ratio={used / s.budget} h={4} />
            </VStack>
          </VStack>
        ) : null}
        <Ink size={F.bodySm} color={C.body}>
          请求数 {state.calls} · 错误 {state.errors}
        </Ink>
        <Ink size={F.bodySm} color={C.body}>
          缓存命中率 {percent(state.cacheHit)}
        </Ink>
        <Spacer minLength={2} />
      </VStack>

      {/* 竖分隔 */}
      <RoundedRectangle fill={C.rule} cornerRadius={0} frame={{ width: 1, maxHeight: "infinity" }} padding={{ leading: 11, trailing: 11 }} />

      {/* 右栏 */}
      <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <HStack spacing={0} frame={{ maxWidth: "infinity" }}>
          <Ink size={F.micro} color={C.dim}>
            {state.exact ? "清单 / 模型" : "清单 / 模型（仅总量）"}
          </Ink>
          <Spacer minLength={4} />
          <Ink size={F.micro} color={C.dim}>
            费用
          </Ink>
        </HStack>
        <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 3 }}>
          <Dots />
        </VStack>

        {list.map((a) => (
          <VStack key={a.id} alignment="leading" spacing={0} padding={{ top: 5 }}>
            <HStack alignment="baseline" spacing={0} frame={{ maxWidth: "infinity" }}>
              <Ink size={F.bodySm} color={C.ink} weight="bold">
                {upper(a.name)}{" "}
                <Text font={F.bodySm} fontDesign="monospaced" foregroundStyle={C.dim}>
                  ({shortModel(a.topModel || "-")})
                </Text>
              </Ink>
              <Spacer minLength={4} />
              <Ink size={F.bodySm} color={C.ink} weight="bold">
                {money(a.cost, s)}
              </Ink>
            </HStack>
            {/* 占比：进度条 + 右端百分比，同一行 */}
            <HStack alignment="center" spacing={5} frame={{ maxWidth: "infinity" }} padding={{ top: 2 }}>
              <VStack frame={{ maxWidth: "infinity" }}>
                <Bar ratio={a.share} h={3} />
              </VStack>
              <Ink size={F.micro} color={C.dim}>
                {percent(a.share)}
              </Ink>
            </HStack>
          </VStack>
        ))}

        <Spacer minLength={2} />
        <Dots />
        <Ink size={F.micro} color={C.body} padding={{ top: 4 }}>
          Token 总量 {count(state.tokens)}
        </Ink>
        <Ink size={F.micro} color={C.body}>
          输入 {count(state.inputTokens)} · 输出 {count(state.outputTokens)}
        </Ink>
      </VStack>
    </HStack>
  )
}

// ── 4×4 大组件 ─────────────────────────────────────────────

/**
 * 4×4。原图版式：
 *   头部：喜鹊+标题+副标题        右：日期 / 时间
 *   金额行：¥2.32 + API总费用      右：本月累计 ¥64.80 / 限额 ¥200
 *   四格：连续使用 / 请求数(错误) / Token总量 / 缓存命中率
 *   表头：AGENT / 模型与供应商列表           费用
 *   每个 agent 单行：● ALMA (DeepSeek-V4.1-Flash)  ¥2.28 (1.2M tokens)
 *   再下一行：进度条（占比）
 *   底部：堆叠条 + 图例
 *   页脚：输入 · 输出 · 缓存命中 / usemagpie.ai · ...
 */
export function LargeCard({ state, s }: { state: BillState; s: BillSettings }) {
  const used = state.costUsd * (s.currency === "cny" ? s.rate : 1)
  const list = state.agents.slice(0, 4)
  const dayLabel = (() => {
    const [y, m, d] = state.date.split("-")
    return `${y}年${Number(m)}月${Number(d)}日`
  })()

  return (
    <VStack
      alignment="leading"
      spacing={0}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      padding={{ top: 13, bottom: 11, leading: 15, trailing: 15 }}
    >
      {/* 头部 */}
      <HStack alignment="top" spacing={0} frame={{ maxWidth: "infinity" }}>
        <Head size={FL.title} tag={FL.tag} />
        <Spacer minLength={6} />
        <VStack alignment="trailing" spacing={2}>
          <Ink size={FL.bodySm} color={C.body}>
            {dayLabel}
          </Ink>
          <Ink size={FL.bodySm} color={C.dim}>
            {state.time}
          </Ink>
        </VStack>
      </HStack>

      <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 8, bottom: 7 }}>
        <Dots />
      </VStack>

      {/* 金额行 */}
      <HStack alignment="bottom" spacing={0} frame={{ maxWidth: "infinity" }}>
        <HStack alignment="bottom" spacing={6}>
          <Ink size={FL.amount} color={C.ink}>
            {money(state.costUsd, s)}
          </Ink>
          <VStack alignment="leading" spacing={1} padding={{ bottom: 6 }}>
            <Ink size={FL.bodySm} color={C.body}>
              API 总费用
            </Ink>
            <Ink size={FL.micro} color={C.dim}>
              本卡累计 {money(state.costUsd, s)}
              {s.budget > 0 ? ` / 限额 ${money(s.budget / (s.currency === "cny" ? s.rate : 1), s)}` : ""}
            </Ink>
          </VStack>
        </HStack>
        <Spacer minLength={4} />
      </HStack>

      <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 7, bottom: 7 }}>
        <Dots />
      </VStack>

      {/* 统计：2 列 3 行，撑满中部 */}
      <HStack alignment="top" spacing={12} frame={{ maxWidth: "infinity" }}>
        <VStack alignment="leading" spacing={9} frame={{ maxWidth: "infinity" }}>
          <statRow label="连续使用" value={`${state.streak || 1} 天`} />
          <statRow label="Token 总量" value={count(state.tokens)} />
          <statRow label="输入" value={count(state.inputTokens)} />
        </VStack>
        <VStack alignment="leading" spacing={9} frame={{ maxWidth: "infinity" }}>
          <statRow label="请求数" value={`${state.calls}（错误 ${state.errors}）`} />
          <statRow label="缓存命中率" value={percent(state.cacheHit)} />
          <statRow label="输出" value={count(state.outputTokens)} />
        </VStack>
      </HStack>

      <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 8, bottom: 0 }}>
        <Dots />
      </VStack>

      {/* 表头 */}
      <HStack spacing={0} frame={{ maxWidth: "infinity" }} padding={{ top: 6, bottom: 3 }}>
        <Ink size={FL.micro} color={C.dim}>
          {state.exact ? "AGENT / 模型与供应商列表" : "AGENT 列表（仅总量）"}
        </Ink>
        <Spacer minLength={4} />
        <Ink size={FL.micro} color={C.dim}>
          费用
        </Ink>
      </HStack>

      {/* 列表：单行 + 进度条 */}
      <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity" }}>
        {list.map((a, i) => (
          <VStack key={a.id} alignment="leading" spacing={0} padding={{ top: 4 }}>
            <HStack alignment="center" spacing={5} frame={{ maxWidth: "infinity" }}>
              <RoundedRectangle fill={C.bars[i % C.bars.length]} cornerRadius={2.5} frame={{ width: 5, height: 5 }} />
              <Ink size={FL.body} color={C.ink} weight="bold">
                {upper(a.name)}
              </Ink>
              <Ink size={FL.body} color={C.dim}>
                ({shortModel(a.topModel || "-")})
              </Ink>
              <Spacer minLength={4} />
              <Ink size={FL.body} color={C.ink} weight="bold">
                {money(a.cost, s)}
              </Ink>
              <Ink size={FL.micro} color={C.dim}>
                ({count(a.tokens)} tokens)
              </Ink>
            </HStack>
            <HStack alignment="center" spacing={5} frame={{ maxWidth: "infinity" }} padding={{ top: 2 }}>
              <VStack frame={{ maxWidth: "infinity" }}>
                <Bar ratio={a.share} h={3} color={C.bars[i % C.bars.length]} />
              </VStack>
              <Ink size={FL.micro} color={C.dim}>
                {percent(a.share)}
              </Ink>
            </HStack>
          </VStack>
        ))}
      </VStack>

      <Spacer minLength={4} />

      {/* 堆叠条 */}
      <HStack spacing={0} frame={{ height: 5, maxWidth: "infinity" }} padding={{ bottom: 5 }}>
        {list.map((a, i) => {
          const w = Math.max(0, a.share * 100)
          if (w < 0.5) return null
          return (
            <RoundedRectangle
              key={a.id}
              fill={C.bars[i % C.bars.length]}
              cornerRadius={0}
              frame={{ width: `${w.toFixed(2)}%`, height: 5 }}
            />
          )
        })}
      </HStack>

      {/* 图例 */}
      <HStack alignment="center" spacing={10} frame={{ maxWidth: "infinity" }}>
        {list.slice(0, 3).map((a, i) => (
          <HStack key={a.id} alignment="center" spacing={3}>
            <RoundedRectangle fill={C.bars[i % C.bars.length]} cornerRadius={2.5} frame={{ width: 5, height: 5 }} />
            <Ink size={FL.micro} color={C.body}>
              {legendName(a)}
            </Ink>
            <Ink size={FL.micro} color={C.body} weight="bold">
              {percent(a.share)}
            </Ink>
          </HStack>
        ))}
        <Spacer minLength={0} />
      </HStack>

      <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 6, bottom: 4 }}>
        <Dots />
      </VStack>

      <Ink size={FL.micro} color={C.body}>
        按 API 价格折算 · 非发票
      </Ink>
      <Ink size={FL.footer} color={C.faint}>
        usemagpie.ai · Mac/Windows/Linux 多模型网关
      </Ink>
    </VStack>
  )
}

/** 统计行：左标签灰、右值黑 */
function statRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack alignment="baseline" spacing={0} frame={{ maxWidth: "infinity" }}>
      <Ink size={FL.bodySm} color={C.dim}>
        {label}
      </Ink>
      <Spacer minLength={4} />
      <Ink size={FL.bodySm} color={C.ink} weight="bold">
        {value}
      </Ink>
    </HStack>
  )
}

/** 图例名：取模型的短名，首字母大写 */
function legendName(a: any): string {
  const m = String(a.topModel || "").toLowerCase()
  if (m.includes("deepseek")) return "DeepSeek"
  if (m.includes("hunyuan")) return "Hunyuan"
  if (m.includes("gemini")) return "Gemini"
  if (m.includes("claude")) return "Claude"
  if (m.includes("hy3")) return "HY3"
  if (m.includes("gpt")) return "GPT"
  return a.name ? a.name : "其他"
}
