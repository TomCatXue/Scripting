// @ts-nocheck
/// <reference path="./global.d.ts" />
// ============================================================
// 哑巴面板 · 可复用组件模板库
// ------------------------------------------------------------
// 把版式抽象成「填空即可复用」的模板：新增品类时只需提供数据与配色，
// 无需重写布局。共四套：
//
//   1) TrendSmallTemplate     小号行情走势图（金价 / 油价 / 指数 / 汇率…）
//      参考「走势图模版」：顶部涨跌三角 + 标题 + 副标题，中部 30 点走势线，
//      底部左侧超大压缩数字、右侧涨跌额与涨跌幅；线条带同色投影，观感突出。
//
//   2) AiSmallTemplate        小号 AI 用量看板（WorkBuddy / DeepSeek / Codex /
//      Antigravity / CPA-Manager-Plus…）
//      顶部品牌图标 + 名称，中部 2×2 指标栅格，底部进度槽或状态行。
//
//   3) WaveformMediumTemplate 中号 AI 波形看板（1:1 对齐 xubai2001
//      「DeepSeek 用量」原版）：左侧 112pt 固定栏，右侧 7 日平滑面积波形图。
//      五套 AI 服务共用同一版式，仅数据与配色不同。
//
//   4) MarketMediumTemplate   中号行情 4 联卡片（金价 / 油价共用）：
//      顶部行情来源与涨跌，中部 4 张等宽等高卡片，底部 30 日走势图。
// ============================================================
import {
  Chart,
  AreaChart,
  LineChart,
  HStack,
  Image,
  RoundedRectangle,
  Spacer,
  SVG,
  Text,
  VStack,
  ZStack,
} from "scripting"
import { THEME, formatTime, remainColor } from "./theme"
import { SetWidgetSubModeIntent } from "./app_intents"

// ── 通用常量与工具 ───────────────────────────────────────────────

/** 小号组件统一内边距 */
export const SMALL_PAD = 14

/** 涨跌配色：红涨绿跌，深浅色模式各取高饱和值 */
export const TREND_COLORS = {
  up: { light: "#FF3B30", dark: "#FF453A" } as any,
  down: { light: "#00B368", dark: "#30D158" } as any,
}

/** 按涨跌方向取色 */
export function trendColor(isUp: boolean): any {
  return isUp ? TREND_COLORS.up : TREND_COLORS.down
}

/** 涨跌三角图标名 */
export function trendSymbol(isUp: boolean): string {
  return isUp ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill"
}

/** 带符号格式化：涨跌额 / 涨跌幅 */
export function signedText(value: number, digits = 2, suffix = ""): string {
  const v = Number.isFinite(value) ? value : 0
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${suffix}`
}

// ═════════════════════════════════════════════════════════════════
// 1. 小号行情走势图模板（金价 / 油价 / 其他行情类）
// ═════════════════════════════════════════════════════════════════

export interface TrendSmallTemplateProps {
  /** 标题，如「Au9999」「92# 汽油」 */
  title: string
  /** 副标题，如「上金所实时价」 */
  subtitle: string
  /** 走势序列（取末尾 30 点绘制） */
  data: { label: string; value: number }[]
  /** 现价文本（已格式化） */
  priceText: string
  /** 涨跌额文本（含正负号） */
  changeText: string
  /** 涨跌幅文本（含正负号与 %） */
  rateText: string
  /** 是否上涨（决定配色与三角方向） */
  isUp: boolean
  /** 底部补充说明（可选） */
  footnote?: string
}

/**
 * 小号行情走势图：严格对齐「走势图模版」的层级与字号。
 * 结构：Header（三角 + 标题 / 副标题）→ 走势线 → 底部（超大数字 + 涨跌两行）
 */
export function TrendSmallTemplate(props: TrendSmallTemplateProps) {
  const info = props.data.slice(-30)
  // 少于 2 个点时不绘制折线：单点会渲染成一条水平直线，
  // 看起来像「价格一直没变」，属于误导性展示。
  const hasTrend = info.length >= 2
  const values = info.length > 0 ? info.map((d) => d.value) : [0]
  const minY = Math.min(...values)
  const color = trendColor(props.isUp)
  // 平移到 0 基线让走势线占满图高（与模版 value - minY 一致）
  const marks = info.map((d, idx) => ({
    label: String(idx),
    value: d.value - minY,
    foregroundStyle: color,
    // 同色投影是模版让线条「发光」的关键
    shadow: { color, radius: 7, y: 7 },
  }))

  return (
    <VStack
      padding={SMALL_PAD}
      spacing={0}
      alignment="leading"
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* Header：涨跌三角 + 标题 */}
      <HStack spacing={5} alignment="center">
        <Image
          systemName={trendSymbol(props.isUp)}
          font={{ name: "system", size: 13 }}
          foregroundStyle={color}
        />
        <Text
          font={17}
          fontWeight="semibold"
          foregroundStyle={THEME.text}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {props.title}
        </Text>
        <Spacer />
      </HStack>
      <Text
        font={11}
        fontWeight="semibold"
        foregroundStyle={THEME.dim}
        lineLimit={1}
        minScaleFactor={0.7}
      >
        {props.subtitle}
      </Text>

      {/* 走势线：隐藏坐标轴，仅保留平滑曲线。
          历史不足 2 天时不画线 —— 单点会连成一条误导性的水平直线。 */}
      {hasTrend ? (
        <Chart
          chartXAxis="hidden"
          chartYAxis="hidden"
          frame={{ maxWidth: "infinity", height: 46 }}
          padding={{ top: 2, bottom: 2 }}
        >
          <LineChart marks={marks} interpolationMethod="catmullRom" />
        </Chart>
      ) : (
        <HStack
          alignment="center"
          frame={{ maxWidth: "infinity", height: 46 }}
          padding={{ top: 2, bottom: 2 }}
        >
          <Spacer />
          <Text font={10} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.8}>
            累积走势中 · 需 2 天以上
          </Text>
          <Spacer />
        </HStack>
      )}

      <Spacer minLength={2} />

      {/* 底部：左超大数字，右涨跌两行 */}
      <HStack alignment="bottom">
        <Text
          font={34}
          fontWeight="bold"
          fontWidth="compressed"
          monospacedDigit
          foregroundStyle={THEME.text}
          lineLimit={1}
          minScaleFactor={0.55}
        >
          {props.priceText}
        </Text>
        <Spacer minLength={4} />
        <VStack spacing={0} alignment="trailing">
          <Text
            font={12}
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={color}
            lineLimit={1}
          >
            {props.changeText}
          </Text>
          <Text
            font={12}
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={color}
            lineLimit={1}
          >
            {props.rateText}
          </Text>
        </VStack>
      </HStack>

      {props.footnote ? (
        <Text
          font={9.5}
          foregroundStyle={THEME.dim}
          lineLimit={1}
          minScaleFactor={0.8}
          padding={{ top: 1 }}
        >
          {props.footnote}
        </Text>
      ) : null}
    </VStack>
  )
}

// ═════════════════════════════════════════════════════════════════
// 2. 小号 AI 用量看板模板
//    WorkBuddy / DeepSeek / Codex / Antigravity / CPA-Manager-Plus
// ═════════════════════════════════════════════════════════════════

export interface AiSmallCell {
  icon: string
  iconColor: any
  label: string
  value: string
  /** 数值后缀，如「次」「天」 */
  suffix?: string
  valueColor?: any
}

export interface AiSmallTemplateProps {
  /** 品牌名，如 WorkBuddy */
  brand: string
  /** 品牌图标：内嵌 Base64（brandIcon 的返回值） */
  iconImage?: any
  /** 品牌图标：内联 SVG（与 title 并排） */
  svgCode?: string
  /** 品牌图标：SF Symbol 兜底 */
  iconName?: string
  iconColor?: any
  /** 品牌标题颜色（DeepSeek 等需要专属色） */
  titleColor?: any
  /** 主指标（跨两列的强调数值），可选 */
  primary?: AiSmallCell
  /** 指标栅格：无 primary 时 4 个（2×2）；有 primary 时 2 个（单行） */
  cells: AiSmallCell[]
  /** 底部进度槽百分比（0-100）；与 footer 二选一 */
  progressPct?: number
  /** 底部状态行左侧文案 */
  footerLeft?: string
  /** 底部状态行右侧文案 */
  footerRight?: string
  footerRightColor?: any
}

/** 单个指标单元：图标 + 标签一行，数值一行，全部左对齐 */
export function AiMetricCell({ cell }: { cell: AiSmallCell }) {
  return (
    <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={4} alignment="center">
        <Image
          systemName={cell.icon}
          font={{ name: "system", size: 11 }}
          foregroundStyle={cell.iconColor}
        />
        <Text font={11} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.75}>
          {cell.label}
        </Text>
      </HStack>
      <HStack alignment="lastTextBaseline" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text
          font={21}
          fontWeight="heavy"
          foregroundStyle={cell.valueColor || THEME.text}
          monospacedDigit
          lineLimit={1}
          minScaleFactor={0.55}
        >
          {cell.value}
        </Text>
        {cell.suffix ? (
          <Text font={13} fontWeight="bold" foregroundStyle={THEME.text} lineLimit={1}>
            {cell.suffix}
          </Text>
        ) : null}
      </HStack>
    </VStack>
  )
}

/**
 * 小号 AI 用量看板：品牌行 + 主指标（可选）+ 2×2 栅格 + 底部进度槽/状态行。
 * 五套 AI 服务共用，保证字号、间距、对齐完全一致。
 */
export function AiSmallTemplate(props: AiSmallTemplateProps) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={SMALL_PAD}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* Header：品牌图标 + 名称 */}
      <HStack spacing={7} alignment="center" frame={{ height: 22 }}>
        {props.svgCode ? (
          <SVG code={props.svgCode} resizable={true} frame={{ width: 20, height: 20 }} />
        ) : null}
        {props.iconImage ? (
          <Image
            image={props.iconImage}
            resizable={true}
            scaleToFit={true}
            frame={{ width: 19, height: 19 }}
          />
        ) : null}
        {!props.svgCode && !props.iconImage && props.iconName ? (
          <Image
            systemName={props.iconName}
            font={{ name: "system", size: 17 }}
            foregroundStyle={props.iconColor || THEME.blue}
          />
        ) : null}
        <Text
          font={15}
          fontWeight="heavy"
          foregroundStyle={props.titleColor || THEME.text}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {props.brand}
        </Text>
        <Spacer />
      </HStack>

      <Spacer minLength={5} />

      {/* 主指标（可选）：占一行强调核心数值，并替代第一行栅格 */}
      {props.primary ? (
        <>
          <AiMetricCell cell={props.primary} />
          <Spacer minLength={4} />
        </>
      ) : null}

      {/* 指标行 1 */}
      <HStack alignment="top" spacing={8}>
        <AiMetricCell cell={props.cells[0]} />
        <AiMetricCell cell={props.cells[1]} />
      </HStack>

      {/* 指标行 2：仅在无主指标时渲染（有主指标时它已占据一整行） */}
      {!props.primary && props.cells.length > 2 ? (
        <>
          <Spacer minLength={5} />
          <HStack alignment="top" spacing={8}>
            <AiMetricCell cell={props.cells[2]} />
            <AiMetricCell cell={props.cells[3]} />
          </HStack>
        </>
      ) : null}

      <Spacer minLength={5} />

      {/* 底部：进度槽 或 状态行 */}
      {props.progressPct !== undefined ? (
        <AiProgressBar pct={props.progressPct} />
      ) : (
        <HStack alignment="center">
          <Text font={10.5} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.8}>
            {props.footerLeft || ""}
          </Text>
          <Spacer />
          <Text
            font={10.5}
            foregroundStyle={props.footerRightColor || THEME.dim}
            monospacedDigit
            lineLimit={1}
          >
            {props.footerRight || ""}
          </Text>
        </HStack>
      )}
    </VStack>
  )
}

/** 10 段独立方块进度槽：按剩余额度平滑变色（绿→黄→橙→红） */
export function AiProgressBar({ pct, size = 10 }: { pct: number; size?: number }) {
  const total = 10
  const filled = Math.max(0, Math.min(total, Math.round((pct / 100) * total)))
  const color = remainColor(pct)
  const inactive = { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.10)" } as any
  return (
    <HStack spacing={4} alignment="center" frame={{ maxWidth: "infinity", height: size }}>
      {Array.from({ length: total }).map((_, i) => (
        <ZStack key={i} frame={{ width: size, height: size }}>
          <RoundedRectangle
            fill={i < filled ? color : inactive}
            cornerRadius={2}
            frame={{ width: size, height: size }}
          />
        </ZStack>
      ))}
      <Spacer />
    </HStack>
  )
}

// ═════════════════════════════════════════════════════════════════

export interface ModeOption {
  key: string
  label: string
  color?: any
}

export function ModeSwitch({
  service,
  current,
  options,
}: {
  service: string
  current: string
  options: ModeOption[]
}) {
  return (
    <HStack spacing={2} alignment="center">
      {options.map((opt) => {
        const active = current === opt.key
        const activeBg = opt.color || THEME.blue
        const activeFg = "#FFFFFF"
        const inactiveFg = THEME.dim
        return (
          <Button
            key={opt.key}
            intent={SetWidgetSubModeIntent(`${service}:${opt.key}`)}
            buttonStyle="plain"
          >
            <Text
              font={9}
              fontWeight={active ? "semibold" : "regular"}
              foregroundStyle={active ? activeFg : inactiveFg}
              padding={{ horizontal: 6, vertical: 2 }}
              background={active ? activeBg : "rgba(0,0,0,0)"}
              clipShape={{ type: "rect", cornerRadius: 5 }}
            >
              {opt.label}
            </Text>
          </Button>
        )
      })}
    </HStack>
  )
}

// 3. 中号 AI 波形看板模板
//    1:1 对齐 xubai2001「DeepSeek 用量」原版
// ═════════════════════════════════════════════════════════════════

export interface WaveformMediumTemplateProps {
  /** 品牌区：内嵌图标（brandIcon 的返回值） */
  iconImage?: any
  /** 品牌区：内联 SVG */
  svgCode?: string
  /** 品牌区：SF Symbol 兜底 */
  iconName?: string
  iconColor?: any
  /** 品牌名 */
  brand: string
  /** 品牌标题颜色 */
  titleColor?: any
  /** 主指标标题，如「账户余额」 */
  mainLabel: string
  /** 主数值（已格式化，不含货币符号） */
  mainValue: string
  /** 货币符号，如 ¥ */
  symbol?: string
  /** 明细行 1 / 2 */
  subTag1: string
  subTag2: string
  /** 图表标题（居中） */
  chartTitle: string
  /** 图表右上角峰值文本（可选；留空时自动按数据计算，不显示则传空字符串） */
  peakText?: string
  /** 走势序列 */
  trendData: { label: string; value: number }[]
  /** 折线主色 */
  lineColor: any
  /** 面积渐变（首色实、末色透明） */
  gradient: [any, any]
  updatedAt: string
  /** 可选：图表下方的模式切换胶囊（如 Antigravity 的 Gemini/Claude） */
  modeSwitch?: any
}

/**
 * 中号 AI 波形看板：左侧 112pt 固定栏 + 右侧通栏平滑面积波形图。
 * 版式、字号、间距与 xubai2001「DeepSeek 用量」原版一致。
 */
export function WaveformMediumTemplate(props: WaveformMediumTemplateProps) {
  const marks = props.trendData.length > 0 ? props.trendData : [{ label: "今日", value: 0 }]
  const n = marks.length
  const axisValues = [
    marks[0]?.label || "7天前",
    marks[Math.floor((n - 1) / 2)]?.label || "3天前",
    marks[n - 1]?.label || "今日",
  ]

  return (
    <HStack padding={12} spacing={12} alignment="top">
      {/* 左侧 112pt 固定栏 */}
      <VStack spacing={4} alignment="leading" frame={{ width: 112 }}>
        {/* 品牌区 */}
        <HStack spacing={5} alignment="center" frame={{ height: 22 }}>
          {props.svgCode ? (
            <SVG code={props.svgCode} scaleToFit resizable frame={{ width: 22, height: 22 }} />
          ) : null}
          {props.iconImage ? (
            <Image
              image={props.iconImage}
              resizable={true}
              scaleToFit={true}
              frame={{ width: 17, height: 17 }}
            />
          ) : null}
          {!props.svgCode && !props.iconImage ? (
            <Image
              systemName={props.iconName || "circle.fill"}
              font={{ name: "system", size: 15 }}
              foregroundStyle={props.iconColor || THEME.blue}
            />
          ) : null}
          <Text
            font={13}
            fontWeight="heavy"
            foregroundStyle={props.titleColor || THEME.text}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {props.brand}
          </Text>
        </HStack>

        {/* 主指标标题 */}
        <Text font={11} fontWeight="semibold" foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.7}>
          {props.mainLabel}
        </Text>

        {/* 大号数值 */}
        <HStack spacing={2} alignment="lastTextBaseline">
          {props.symbol ? (
            <Text font={18} fontWeight="semibold" foregroundStyle={THEME.text} lineLimit={1}>
              {props.symbol}
            </Text>
          ) : null}
          <Text
            font={34}
            fontWeight="bold"
            foregroundStyle={THEME.text}
            monospacedDigit
            lineLimit={1}
            minScaleFactor={0.6}
          >
            {props.mainValue}
          </Text>
        </HStack>

        {/* 明细两行 */}
        <Text font={10} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.7}>
          {props.subTag1}
        </Text>
        <Text font={10} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.7}>
          {props.subTag2}
        </Text>

        {/* 更新时间 */}
        <Text font={9.5} foregroundStyle={THEME.dim} monospacedDigit>
          {`更新于 ${formatTime(props.updatedAt)}`}
        </Text>
      </VStack>

      {/* 右侧波形图 */}
      <VStack spacing={3} alignment="leading" frame={{ maxWidth: "infinity" }}>
        <Spacer />
        <HStack alignment="center">
          <Text
            font={10}
            fontWeight="semibold"
            foregroundStyle={THEME.dim}
              frame={{ maxWidth: "infinity", alignment: props.peakText ? "center" : "leading" }}
          >
            {props.chartTitle}
          </Text>
            {props.peakText ? (
              <Text font={9.5} fontWeight="bold" foregroundStyle={props.lineColor} lineLimit={1}>
                {props.peakText}
              </Text>
            ) : null}
        </HStack>
        <Spacer />

        {/*
          坐标轴整体隐藏：原生图表不在左右边缘留内边距，首尾刻度按
          multiLabelAlignment:"center" 对齐时会被图表边界截断（只剩月份）。
          改为在图表下方用 HStack + Spacer 独立渲染首/中/尾三个日期，
          由布局保证任何屏宽下都完整显示。
        */}
        <Chart
          frame={{ maxWidth: "infinity", height: 68 }}
          chartXAxis="hidden"
          chartYAxis="hidden"
        >
          <AreaChart
            marks={marks.map((m) => ({
              ...m,
              interpolationMethod: "catmullRom",
              foregroundStyle: props.gradient as any,
            }))}
          />
          <LineChart
            marks={marks.map((m, i) => {
              const isLast = i === marks.length - 1
              return {
                ...m,
                interpolationMethod: "catmullRom",
                foregroundStyle: props.lineColor,
                lineStyle: { lineWidth: 2.6, lineCap: "round", lineJoin: "round" },
                symbol: isLast ? "circle" : undefined,
                symbolSize: isLast ? 40 : undefined,
              }
            })}
          />
        </Chart>

        {/* 独立日期轴：首 / 中 / 尾三点等距分布，左右各留 2pt 防截断 */}
        <HStack
          alignment="center"
          frame={{ maxWidth: "infinity" }}
          padding={{ leading: 2, trailing: 2, top: 1 }}
        >
          {axisValues.flatMap((v, i) => {
            const node = (
              <Text
                key={`axis-${i}`}
                font={9}
                foregroundStyle={THEME.dim}
                monospacedDigit
                lineLimit={1}
                minScaleFactor={0.75}
              >
                {v}
              </Text>
            )
            return i === 0 ? [node] : [<Spacer key={`axis-sp-${i}`} />, node]
          })}
        </HStack>

        {/* 可选：模式切换胶囊 */}
        {props.modeSwitch ? (
          <HStack alignment="center" frame={{ maxWidth: "infinity" }} padding={{ top: 2 }}>
            <Spacer />
            {props.modeSwitch}
            <Spacer />
          </HStack>
        ) : null}
      </VStack>
    </HStack>
  )
}

// ═════════════════════════════════════════════════════════════════
// 4. 中号行情 4 联卡片模板（金价 / 油价共用）
// ═════════════════════════════════════════════════════════════════

export interface MarketMediumItem {
  name: string
  price: string
  textColor: string
  tagBg: string
}

export interface MarketMediumTemplateProps {
  /** 顶部图标 */
  iconName: string
  iconColor: any
  /** 顶部标题 */
  title: string
  /** 顶部涨跌徽章文本（含括号涨跌幅） */
  badgeText: string
  badgeColor: any
  badgeBg: any
  /** 4 张等宽卡片 */
  items: MarketMediumItem[]
  /** 底部走势序列（可为空：为空时自动隐藏图表区，不出现空白/断图） */
  trendData: { label: string; value: number }[]
  /** 走势线颜色 */
  lineColor: any
  updatedAt: string
}

/**
 * 中号行情 4 联卡片：顶部来源与涨跌 → 4 张等宽等高卡片 → 底部 30 日走势。
 * 金价与油价共用，保证两套组件的卡片尺寸完全一致。
 *
 * 走势图渲染规则：
 *   - 少于 2 个数据点：隐藏图表，改显示一行说明，避免「一条斜线」的误导性观感。
 *   - 2 个以上数据点：平滑曲线 + 渐变面积 + 最新点光斑，并按实际区间收紧 Y 轴。
 */
export function MarketMediumTemplate(props: MarketMediumTemplateProps) {
  // 过滤非法值，避免 NaN 造成空白图
  const marks = props.trendData.filter(
    (m) => m && typeof m.value === "number" && Number.isFinite(m.value)
  )
  const hasTrend = marks.length >= 2

  const values = hasTrend ? marks.map((m) => m.value) : [0]
  const minY = Math.min(...values)
  const maxY = Math.max(...values)
  const span = Math.max(maxY - minY, Math.abs(maxY) * 0.004, 0.01)
  const yScale = { from: minY - span * 0.12, to: maxY + span * 0.12 }
  // 数据点少时用更粗的线与更大的光斑，保证小样本也清晰
  const lineWidth = marks.length <= 3 ? 3.2 : 2.6
  const dotSize = marks.length <= 3 ? 56 : 32

  return (
    <VStack
      alignment="leading"
      padding={{ top: 12, bottom: 10, leading: 10, trailing: 10 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* 顶部 Header */}
      <HStack alignment="center" padding={{ leading: 4, trailing: 4 }}>
        <HStack alignment="center" spacing={4}>
          <Image
            systemName={props.iconName}
            font={{ name: "system", size: 14 }}
            foregroundStyle={props.iconColor}
          />
          <Text font={14} fontWeight="bold" foregroundStyle={THEME.text} lineLimit={1} minScaleFactor={0.8}>
            {props.title}
          </Text>
          {props.badgeText ? (
            <HStack
              padding={{ top: 1, bottom: 1, leading: 5, trailing: 5 }}
              widgetBackground={props.badgeBg}
            >
              <Text font={9.5} fontWeight="bold" foregroundStyle={props.badgeColor} lineLimit={1}>
                {props.badgeText}
              </Text>
            </HStack>
          ) : null}
        </HStack>
        <Spacer />
        <Text font={10} foregroundStyle={THEME.dim} monospacedDigit>
          {`更新于 ${formatTime(props.updatedAt)}`}
        </Text>
      </HStack>

      <Spacer minLength={6} />

      {/* 4 联卡片：等宽等高 */}
      <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
        {props.items.map((item, idx) => (
          <VStack key={idx} alignment="center" spacing={6} frame={{ maxWidth: "infinity" }}>
            <HStack
              alignment="center"
              padding={{ top: 2.5, bottom: 2.5, leading: 7, trailing: 7 }}
              background={item.tagBg}
              clipShape={{ type: "rect", cornerRadius: 5 }}
            >
              <Text
                font={11}
                fontWeight="bold"
                foregroundStyle={item.textColor as any}
                lineLimit={1}
                allowsTightening={true}
              >
                {item.name}
              </Text>
            </HStack>
            <HStack
              alignment="center"
              padding={{ top: 6, bottom: 6, leading: 4, trailing: 4 }}
              background={{
                light: "rgba(0, 0, 0, 0.05)",
                dark: "rgba(255, 255, 255, 0.09)",
              }}
              clipShape={{ type: "rect", cornerRadius: 8 }}
              frame={{ maxWidth: "infinity", height: 30 }}
            >
              <Spacer />
              <Text
                font={15}
                fontWeight="bold"
                foregroundStyle={THEME.text}
                monospacedDigit
                lineLimit={1}
                allowsTightening={true}
                minScaleFactor={0.7}
              >
                {item.price}
              </Text>
              <Spacer />
            </HStack>
          </VStack>
        ))}
      </HStack>

      <Spacer minLength={5} />

      {/* 底部走势区：数据不足时降级为说明文案，绝不渲染误导性的直线 */}
      {hasTrend ? (
        <VStack spacing={0} frame={{ maxWidth: "infinity", height: 46 }} padding={{ leading: 4, trailing: 4 }}>
          <Chart
            chartXAxis="hidden"
            chartYAxis="hidden"
            chartYScale={yScale}
            frame={{ maxWidth: "infinity", height: 46 }}
          >
            <AreaChart
              marks={marks.map((m) => ({
                label: m.label,
                value: m.value,
                interpolationMethod: "catmullRom",
                foregroundStyle: [props.lineColor, "rgba(0, 0, 0, 0)"] as any,
              }))}
            />
            <LineChart
              marks={marks.map((m, i) => {
                const isLast = i === marks.length - 1
                return {
                  label: m.label,
                  value: m.value,
                  interpolationMethod: "catmullRom",
                  foregroundStyle: props.lineColor,
                  lineStyle: { lineWidth, lineCap: "round", lineJoin: "round" },
                  // 最新数据点加实心光斑
                  symbol: isLast ? "circle" : undefined,
                  symbolSize: isLast ? dotSize : undefined,
                }
              })}
            />
          </Chart>
        </VStack>
      ) : (
        <HStack
          alignment="center"
          frame={{ maxWidth: "infinity", height: 46 }}
          padding={{ leading: 4, trailing: 4 }}
        >
          <Text font={10} foregroundStyle={THEME.dim} lineLimit={1}>
            暂无历史走势数据
          </Text>
          <Spacer />
        </HStack>
      )}
    </VStack>
  )
}
