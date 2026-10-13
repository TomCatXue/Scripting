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
  Button,
  Chart,
  ChartPlotStyle,
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
import { THEME, HIG_FONT, formatDateCompact, formatTime, remainColor, softTint } from "./theme"
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

/**
 * 行情小号卡主数值字号。
 *
 * 油价（如 8.55，4 字符）与金价（如 904.48，6 字符）此前共用同一字号，
 * 但 SwiftUI 只在「放不下」时才启用 minScaleFactor —— 于是位数多的金价被
 * 缩小、位数少的油价保持原尺寸，两张卡片看起来字号不一致。
 *
 * 这里选一个「最长价格也能完整放下」的字号，并给价格一个固定宽度，
 * 两张卡片的数字实际渲染尺寸因此完全相同。
 */
// 宽度预算：小号组件内容区 ≈ 130pt（158pt 机型扣掉 SMALL_PAD 28pt）。
// 最长价格 904.48（6 字符）在 22pt 粗体下约 80pt，加上 4pt 间隔与 46pt 涨跌列
// 正好 ≈ 130pt —— 价格与「涨跌额/涨跌幅」两行都能以原字号完整渲染。
// 旧值 26pt 时价格就要吃掉 90pt+，涨跌列被挤到截断（用户反馈「百分比看不见」）。
export const PRICE_FONT_SIZE = 22
/**
 * 价格行不设固定列宽，改用「弹性价格 + 固定涨跌列」。
 *
 * 历史问题：价格列与涨跌列都写死宽度（84 + 4 + 40 = 128pt）后，在
 * 155pt 及以下的小号组件上必然溢出 —— 系统小号组件尺寸随机型变化：
 *   430 宽机型 170pt / 390 宽 158pt / 375 宽 155pt 或 148pt / 320 宽 141pt
 * 扣掉 SMALL_PAD 后内容区仅剩 113~142pt。固定 128pt 的硬需求会让
 * SwiftUI 压缩弹性最小的一方；而价格带 layoutPriority，被牺牲的就是
 * 涨跌列 —— 表现正是用户反馈的「涨跌金额看不见」。
 *
 * 现在只固定涨跌列（它必须完整：金额与百分比两行都不能截断），价格改为
 * 可伸缩并由字号缩放兜底。列宽按最长实际文本（「+0.27%」「-1.52%」在 11pt
 * 下 ≈ 37–41pt，三位数涨跌幅「-12.34%」≈ 48pt）取 46pt，留出余量；
 * 旧值 38pt 时「+0.27%」这类六字符文本必然被压缩/截断。
 */
export const PRICE_CHANGE_COLUMN_WIDTH = 46

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
  /** 右上角标签提示（可选，如「10月15日调价」） */
  tagText?: string
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
  /*
   * 平移到 0 基线，并显式锁定 Y 轴域 [0, 跨度]。
   *
   * 只把数据平移是不够的：Chart 会自动把 Y 轴域向外扩展到「整齐刻度」，
   * 于是最小值落在基线之上、曲线整体被顶到绘图区顶部，下面空出一大片
   * ——用户看到的「线下面一大批空白」正是这个原因。
   *
   * 显式给 chartYScale 后，最小值贴住底边、最大值贴住顶边，曲线铺满绘图区。
   * 跨度加 1% 余量，避免极值正好压在边界上被裁掉。
   */
  // 全平序列（跨度 0）时给一个最小域，避免上下界相等导致绘图区塌陷
  const span = Math.max(Math.max(...values) - minY, Math.abs(minY) * 0.01, 0.01)
  const yScale = { from: -span * 0.01, to: span * 1.01 }
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
      {/*
        Header：涨跌三角 + 标题 + 右上角调价胶囊。

        一行实测预算（158pt 机型，内容区 130pt）：
        三角 13 +「92# 汽油」约 45 + 间距 5 + 胶囊「10月15日调价」约 62 + 留白 4
        ≈ 129pt，可以放下。关键点：胶囊必须带 layoutPriority，否则 SwiftUI 会
        优先压缩它（弹性最小的一方），一路压到接近 0 宽 —— 这正是之前
        「调价信息完全不可见」的原因。此外调价日期文案已在数据层压缩成
        「M月D日调价」（去掉「24时」等时间尾巴），避免 8 个字把胶囊撑爆。
      */}
      <HStack spacing={5} alignment="center">
        <Image
          systemName={trendSymbol(props.isUp)}
          font={{ name: "system", size: HIG_FONT.smallTitle }}
          foregroundStyle={color}
        />
        <Text
          font={HIG_FONT.smallTitle}
          fontWeight="semibold"
          foregroundStyle={THEME.text}
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.65}
        >
          {props.title}
        </Text>
        <Spacer minLength={4} />
        {props.tagText ? (
          <Text
            font={HIG_FONT.caption}
            fontWeight="semibold"
            foregroundStyle={color}
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.85}
            layoutPriority={1}
            padding={{ leading: 4, trailing: 4, top: 2.5, bottom: 2.5 }}
            background={softTint(color) as any}
            clipShape="capsule"
          >
            {props.tagText}
          </Text>
        ) : null}
      </HStack>
      <Text
        font={HIG_FONT.subhead}
        fontWeight="medium"
        foregroundStyle={THEME.dim}
        lineLimit={1}
        allowsTightening={true}
        minScaleFactor={0.7}
      >
        {props.subtitle}
      </Text>

      {/* 走势线：隐藏坐标轴，仅保留平滑曲线。
          绘图区吃掉全部剩余高度（不再写死 36pt），竖轴因此明显变长；
          与价格行的间隔改由底部 6pt 内边距承担 —— 之前用的是会贪婪扩张的
          Spacer，会把多出来的高度全吃掉，表现为「线下面一大片空白」。 */}
      {hasTrend ? (
        <Chart
          chartXAxis="hidden"
          chartYAxis="hidden"
          chartYScale={yScale}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          padding={{ top: 1, bottom: 6 }}
        >
          <LineChart marks={marks} interpolationMethod="catmullRom" />
        </Chart>
      ) : (
        <HStack
          alignment="center"
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          padding={{ top: 1, bottom: 6 }}
        >
          <Spacer />
          <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.8}>
            累积走势中 · 需 2 天以上
          </Text>
          <Spacer />
        </HStack>
      )}

      {/* 底部：左超大数字，右涨跌两行。

          只固定涨跌列（38pt），价格吃剩余宽度：
            · 涨跌列必须完整 —— 金额与百分比是「跌了多少」的有效信息，
              一旦被压缩就出现「涨跌金额不可见」的问题；
            · 价格有 layoutPriority + 字号缩放，空间不足时由它让位，
              数字仍能完整读出，不会像涨跌列那样直接消失；
            · 整个底部 HStack 赋予 layoutPriority={1}，防止被系统折叠。 */}
      <HStack alignment="lastTextBaseline" layoutPriority={1}>
        <Text
          font={PRICE_FONT_SIZE}
          fontWeight="bold"
          monospacedDigit
          foregroundStyle={THEME.text}
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.7}
          layoutPriority={1}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {props.priceText}
        </Text>
        <Spacer minLength={4} />
        {/* 涨跌列固定宽度且不参与压缩，保证金额与百分比永远完整可读 */}
        <VStack
          spacing={0}
          alignment="trailing"
          frame={{ width: PRICE_CHANGE_COLUMN_WIDTH }}
        >
          <Text
            font={HIG_FONT.subhead}
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={color}
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.85}
            layoutPriority={1}
          >
            {props.changeText}
          </Text>
          <Text
            font={HIG_FONT.subhead}
            fontWeight="semibold"
            monospacedDigit
            foregroundStyle={color}
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.85}
            layoutPriority={1}
          >
            {props.rateText}
          </Text>
        </VStack>
      </HStack>

      {props.footnote ? (
        <Text
          font={HIG_FONT.subhead}
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

/**
 * 单个指标单元：图标 + 标签一行，数值一行，全部左对齐。
 *
 * 关键：标签行与数值行都使用**固定行高**。
 * 早期实现让两行高度随内容自适应，于是「积分剩余 / 已用」这类并排单元
 * 只要文字长度不同（或触发缩放）就会各自错位，看起来像没对齐。
 */
export function AiMetricCell({ cell }: { cell: AiSmallCell }) {
  return (
    <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={4} alignment="center" frame={{ maxWidth: "infinity", height: 14 }}>
        <Image
          systemName={cell.icon}
          font={{ name: "system", size: HIG_FONT.caption }}
          foregroundStyle={cell.iconColor}
        />
        <Text
          font={HIG_FONT.caption}
          foregroundStyle={THEME.dim}
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.7}
        >
          {cell.label}
        </Text>
      </HStack>
      <HStack
        alignment="lastTextBaseline"
        spacing={2}
        frame={{ maxWidth: "infinity", height: 21, alignment: "leading" }}
      >
        <Text
          font={HIG_FONT.statMedium}
          fontWeight="bold"
          foregroundStyle={cell.valueColor || THEME.text}
          monospacedDigit
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.5}
        >
          {cell.value}
        </Text>
        {cell.suffix ? (
          <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={THEME.text} lineLimit={1}>
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
      <HStack spacing={6} alignment="center" frame={{ height: 20 }}>
        {props.svgCode ? (
          <SVG code={props.svgCode} resizable={true} frame={{ width: 17, height: 17 }} />
        ) : null}
        {props.iconImage ? (
          <Image
            image={props.iconImage}
            resizable={true}
            scaleToFit={true}
            frame={{ width: 16, height: 16 }}
          />
        ) : null}
        {!props.svgCode && !props.iconImage && props.iconName ? (
          <Image
            systemName={props.iconName}
            font={{ name: "system", size: HIG_FONT.smallTitle }}
            foregroundStyle={props.iconColor || THEME.blue}
          />
        ) : null}
        <Text
          font={HIG_FONT.smallTitle}
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
        <HStack alignment="center" frame={{ maxWidth: "infinity", height: 14 }}>
          <Text
            font={HIG_FONT.caption}
            foregroundStyle={THEME.dim}
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.65}
          >
            {props.footerLeft || ""}
          </Text>
          <Spacer />
          <Text
            font={HIG_FONT.caption}
            foregroundStyle={props.footerRightColor || THEME.dim}
            monospacedDigit
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.7}
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

/**
 * 模式切换胶囊（余额 / Token 这类）。
 * 几何参数 1:1 对齐 xubai2001「DeepSeek 用量」的 ChartModeSwitch：
 * font 9、horizontal 7 / vertical 3、cornerRadius 6 continuous、间距 2。
 */
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
        return (
          <Button
            key={opt.key}
            intent={SetWidgetSubModeIntent(`${service}:${opt.key}`)}
            buttonStyle="plain"
          >
            <Text
              font={HIG_FONT.caption}
              fontWeight={active ? "semibold" : "regular"}
              foregroundStyle={active ? "#FFFFFF" : THEME.dim}
              padding={{ horizontal: 7, vertical: 3 }}
              background={active ? opt.color || THEME.blue : "clear"}
              clipShape={{ type: "rect", cornerRadius: 6, style: "continuous" }}
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
              font={{ name: "system", size: HIG_FONT.smallTitle }}
              foregroundStyle={props.iconColor || THEME.blue}
            />
          ) : null}
          <Text
            font={HIG_FONT.smallTitle}
            fontWeight="heavy"
            foregroundStyle={props.titleColor || THEME.text}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {props.brand}
          </Text>
        </HStack>

        {/* 主指标标题 */}
        <Text font={HIG_FONT.subhead} fontWeight="medium" foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.65}>
          {props.mainLabel}
        </Text>

        {/* 大号数值：加粗 + 等宽数字，超长时靠 minScaleFactor 缩放完整展示 */}
        <HStack
          spacing={2}
          alignment="lastTextBaseline"
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {props.symbol ? (
            <Text
              font={HIG_FONT.statLarge}
              fontWeight="bold"
              foregroundStyle={THEME.text}
              lineLimit={1}
              allowsTightening={true}
              minScaleFactor={0.6}
              layoutPriority={1}
            >
              {props.symbol}
            </Text>
          ) : null}
          <Text
            font={HIG_FONT.mediumHero}
            fontWeight="bold"
            foregroundStyle={THEME.text}
            monospacedDigit
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.35}
          >
            {props.mainValue}
          </Text>
        </HStack>

        {/* 明细两行 */}
        <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.65}>
          {props.subTag1}
        </Text>
        <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.65}>
          {props.subTag2}
        </Text>

        {/* 更新时间 */}
        <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} monospacedDigit>
          {`更新于 ${formatTime(props.updatedAt)}`}
        </Text>
      </VStack>

      {/* 右侧波形图 */}
      <VStack spacing={3} alignment="leading" frame={{ maxWidth: "infinity" }}>
        <Spacer />
        {/* 标题行：标题居中，右侧放模式切换胶囊（与原版一致） */}
        <HStack alignment="center">
          <Text
            font={HIG_FONT.caption}
            fontWeight="semibold"
            foregroundStyle={THEME.dim}
            frame={{ maxWidth: "infinity", alignment: "center" }}
          >
            {props.chartTitle}
          </Text>
          {props.modeSwitch ? props.modeSwitch : null}
        </HStack>
        {/* 峰值标签单独一行，避免挤压标题与胶囊 */}
        {props.peakText ? (
          <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={props.lineColor} lineLimit={1}>
            {props.peakText}
          </Text>
        ) : null}
        <Spacer />

        {/*
          1:1 对齐 xubai2001「DeepSeek 用量」：
          · 右侧图表栏不限宽，占满剩余空间（宽度交给布局分配，不做硬编码）
          · 折线宽 2，并用 ChartPlotStyle 裁切绘图区
          · 坐标轴整体隐藏，日期在图表下方用 HStack + Spacer 独立渲染
            （原生轴在左右无内边距时会把首尾日期截断）
        */}
        <Chart
          frame={{ maxWidth: "infinity", height: 80 }}
          chartXAxis="hidden"
        >
          <AreaChart
            marks={marks.map((m) => ({
              ...m,
              interpolationMethod: "catmullRom",
              foregroundStyle: props.gradient as any,
            }))}
          />
          <LineChart
            marks={marks.map((m) => ({
              ...m,
              interpolationMethod: "catmullRom",
              foregroundStyle: props.lineColor,
              lineStyle: { lineWidth: 2, lineCap: "round", lineJoin: "round" },
            }))}
          />
          <ChartPlotStyle>{(plot: any) => plot.clipShape("rect")}</ChartPlotStyle>
        </Chart>

        {/* 独立日期轴：首 / 中 / 尾三点等距分布。
            右侧留白 12 与原版一致，使末位日期与绘图区右缘大致对齐。 */}
        <HStack
          alignment="center"
          frame={{ maxWidth: "infinity" }}
          padding={{ top: 2, trailing: 12 }}
        >
          {axisValues.flatMap((v, i) => {
            const node = (
              <Text
                key={`axis-${i}`}
                font={HIG_FONT.caption}
                foregroundStyle={THEME.dim}
                lineLimit={1}
                minScaleFactor={0.7}
              >
                {v}
              </Text>
            )
            return i === 0 ? [node] : [<Spacer key={`axis-sp-${i}`} />, node]
          })}
        </HStack>

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
            font={{ name: "system", size: HIG_FONT.title }}
            foregroundStyle={props.iconColor}
          />
          <Text font={HIG_FONT.title} fontWeight="semibold" foregroundStyle={THEME.text} lineLimit={1} minScaleFactor={0.75}>
            {props.title}
          </Text>
          {props.badgeText ? (
            <Text
              font={HIG_FONT.subhead}
              fontWeight="semibold"
              foregroundStyle={props.badgeColor}
              lineLimit={1}
              allowsTightening={true}
              minScaleFactor={0.85}
              padding={{ top: 3, bottom: 3, leading: 8, trailing: 8 }}
              background={props.badgeBg}
              clipShape="capsule"
            >
              {props.badgeText}
            </Text>
          ) : null}
        </HStack>
        <Spacer />
        <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} monospacedDigit>
          {formatDateCompact(props.updatedAt)}
        </Text>
      </HStack>

      <Spacer minLength={6} />

      {/* 4 联卡片：等宽等高 */}
      <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
        {props.items.map((item, idx) => (
          <VStack key={idx} alignment="center" spacing={6} frame={{ maxWidth: "infinity" }}>
            {/* 品类标签：统一胶囊几何（垂直 3 / 水平 7、真胶囊端），
                与顶部涨跌徽章、GitHub 切换胶囊保持同一视觉语言。 */}
            <Text
              font={HIG_FONT.subhead}
              fontWeight="semibold"
              foregroundStyle={item.textColor as any}
              lineLimit={1}
              allowsTightening={true}
              minScaleFactor={0.9}
              padding={{ top: 3, bottom: 3, leading: 7, trailing: 7 }}
              background={item.tagBg}
              clipShape="capsule"
            >
              {item.name}
            </Text>
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
                font={HIG_FONT.title}
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
          <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>
            暂无历史走势数据
          </Text>
          <Spacer />
        </HStack>
      )}
    </VStack>
  )
}
