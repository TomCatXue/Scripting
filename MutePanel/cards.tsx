// @ts-nocheck
/// <reference path="./global.d.ts" />
import {
  Button,
  Circle,
  GeometryReader,
  HStack,
  Image,
  RoundedRectangle,
  SVG,
  Script,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "scripting"
import { RefreshWidgetIntent, SetWidgetSubModeIntent } from "./app_intents"
import { THEME, HIG_FONT, formatPct, formatTime, remainColor, softTint } from "./theme"
import { brandIcon } from "./icons"
import {
  AiSmallTemplate,
  MarketMediumTemplate,
  signedText,
  TrendSmallTemplate,
  WaveformMediumTemplate,
  type WaveformMediumTemplateProps,
} from "./templates"
import {
  DualQuotaData,
  FuelCardData,
  GoldMarketData,
  AuxiliaryMarketData,
  MediaNexusData,
  MetricBalanceData,
  VpnNodeData,
  DEEPSEEK_WHALE_SVG,
  CPAMP_LOGO_SVG,
  GitHubMonitorData,
  LoonMonitorData,
} from "./types"

// ── 品牌图标渲染（支持 SVG、UIImage、本地图片、SF Symbol）──
// 相对资源路径基于 Script.directory 解析：Widget 上下文无法访问 documentsDirectory
function resolveAsset(rel: string): string {
  if (!rel) return rel
  if (rel.startsWith("/")) return rel
  try {
    const base = (Script as any)?.directory || `${FileManager.documentsDirectory}/scripts/MutePanel`
    return `${base}/${rel}`
  } catch {
    return `${FileManager.documentsDirectory}/scripts/MutePanel/${rel}`
  }
}

export function BrandHeaderIcon({
  iconName,
  iconColor,
  iconImage,
  iconPath,
  svgCode,
  size = 16,
}: {
  iconName?: string
  iconColor?: any
  iconImage?: any
  iconPath?: { light: string; dark: string } | string
  svgCode?: string
  size?: number
}) {
  if (svgCode) {
    return (
      <SVG
        code={svgCode}
        resizable={true}
        frame={{ width: size, height: size }}
      />
    )
  }
  // 优先使用数据层已解析好的 UIImage（loadIcon 基于 Script.directory，Widget 下同样有效）
  if (iconImage) {
    return (
      <Image
        image={iconImage}
        resizable={true}
        scaleToFit={true}
        frame={{ width: size, height: size }}
      />
    )
  }
  if (iconPath) {
    const light = resolveAsset(typeof iconPath === "string" ? iconPath : iconPath.light)
    const darkRaw = typeof iconPath === "string" ? iconPath : iconPath.dark
    const dark = resolveAsset(darkRaw || light)
    // 仅当资源确实存在时才渲染文件，否则继续回落到 UIImage / SF Symbol
    if (FileManager.existsSync(light)) {
      return (
        <Image
          filePath={FileManager.existsSync(dark) ? { light, dark } : light}
          resizable={true}
          scaleToFit={true}
          frame={{ width: size, height: size }}
        />
      )
    }
  }
  return (
    <Image
      systemName={iconName || "circle.fill"}
      font={{ name: "system", size: size }}
      foregroundStyle={iconColor || THEME.blue}
    />
  )
}

// ── 统一轻量刷新按钮（圆角微胶囊质感，完美复刻原图）──
export function RefreshButton() {
  return (
    <Button intent={RefreshWidgetIntent(undefined)} buttonStyle="plain">
      <ZStack frame={{ width: 22, height: 22 }}>
        <Circle
          fill={THEME.fill as any}
        />
        <Circle
          stroke={{
            // 用不透明描边：半透明环叠在浅灰卡片上会一边显白一边显灰
            shapeStyle: THEME.borderSolid as any,
            strokeStyle: { lineWidth: 0.8 },
          }}
        />
        <Image
          systemName="arrow.triangle.2.circlepath"
          font={{ name: "system", size: HIG_FONT.caption }}
          foregroundStyle={{ light: "#64748B", dark: "#94A3B8" } as any}
        />
      </ZStack>
    </Button>
  )
}

/**
 * 统一的「暂无数据」空状态卡片。
 *
 * 用于尚未配置数据源（或首次拉取失败、没有可用缓存）的监控类组件。
 * 关键原则：**不展示内置示例数字**——那会让人以为监控已经在工作，
 * 而实际拿不到任何真实数据。这里只说明「当前没有数据」以及怎么接入。
 */
export function EmptyStateCard({
  icon,
  iconImage,
  title,
  message,
  hint,
}: {
  icon: string
  /** 品牌图标（可选）：传入时优先于 SF Symbol，保证品牌组件观感统一 */
  iconImage?: any
  title: string
  message: string
  hint?: string
}) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 14, bottom: 12, leading: 16, trailing: 16 }}
      // frame 必须先于 widgetBackground（见 GitHubMediumCard 的说明）
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={THEME.cardBg}
    >
      {/* 顶栏：图标 + 标题 + 刷新 */}
      <HStack spacing={6} alignment="center" frame={{ height: 20 }}>
        {iconImage ? (
          <Image
            image={iconImage}
            resizable={true}
            scaleToFit={true}
            frame={{ width: 14, height: 14 }}
          />
        ) : (
          <Image systemName={icon} font={HIG_FONT.smallTitle} foregroundStyle={THEME.blue} />
        )}
        <Text font={HIG_FONT.smallTitle} fontWeight="bold" foregroundStyle={THEME.text} lineLimit={1}>
          {title}
        </Text>
        <Spacer />
        <RefreshButton />
      </HStack>

      <Spacer minLength={8} />

      {/* 主体：说明当前没有数据 */}
      <HStack spacing={8} alignment="center" frame={{ maxWidth: "infinity" }}>
        <Image
          systemName="tray"
          font={{ name: "system", size: HIG_FONT.statLarge }}
          foregroundStyle={THEME.dim}
        />
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <Text
            font={HIG_FONT.body}
            fontWeight="semibold"
            foregroundStyle={THEME.text}
            lineLimit={2}
            minScaleFactor={0.8}
          >
            {message}
          </Text>
          {hint ? (
            <Text
              font={HIG_FONT.caption}
              foregroundStyle={THEME.dim}
              lineLimit={2}
              minScaleFactor={0.75}
            >
              {hint}
            </Text>
          ) : null}
        </VStack>
      </HStack>
    </VStack>
  )
}

// ── 胶囊动态进度条 ──
export function ProgressBar({
  value,
  color,
  height = 4.5,
}: {
  value: number
  color?: any
  height?: number
}) {
  const v = Math.max(0, Math.min(100, value)) / 100
  const barColor = color || remainColor(value)
  const r = height / 2

  return (
    <ZStack alignment="leading" frame={{ maxWidth: "infinity", height }}>
      <RoundedRectangle
        fill={{ light: "#E2E8F0", dark: "#1E293B" } as any}
        cornerRadius={r}
        frame={{ maxWidth: "infinity", height }}
      />
      <GeometryReader>
        {(p: any) =>
          v > 0 ? (
            <RoundedRectangle
              fill={barColor}
              cornerRadius={r}
              frame={{ width: Math.max(height, Math.round(p.size.width * v)), height }}
            />
          ) : (
            <VStack />
          )
        }
      </GeometryReader>
    </ZStack>
  )
}

// ═════════════════════════════════════════════════════════════════
// 1. 中号媒体看板：Media Nexus 风格（精确像素级复刻原图）
// ═════════════════════════════════════════════════════════════════
export function MediaNexusCard({ data }: { data: MediaNexusData }) {
  const cTitle = { light: "#1D64E8", dark: "#3B82F6" } as any
  const cGreen = { light: "#10B981", dark: "#34D399" } as any
  const cBlue = { light: "#1D64E8", dark: "#3B82F6" } as any
  const cLabel = { light: "#64748B", dark: "#94A3B8" } as any
  const cText = { light: "#1E293B", dark: "#F1F5F9" } as any
  // 辅助文字：浅色模式必须比深色模式更深（原来写反了，浅色下几乎看不见）
  const cDim = { light: "#64748B", dark: "#94A3B8" } as any
  const cDivider = { light: "#CBD5E1", dark: "#334155" } as any
  const cFilm = { light: "#D97706", dark: "#FBBF24" } as any

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 15, bottom: 13, leading: 18, trailing: 18 }}
      widgetBackground={{ light: "#FFFFFF", dark: "#0F172A" } as any}
    >
      {/* 1. 顶部标题栏 */}
      <HStack spacing={7} alignment="center">
        <Text font={HIG_FONT.statLarge} fontWeight="bold" foregroundStyle={cTitle}>
          {data.title}
        </Text>
        <Circle fill={cGreen} frame={{ width: 7, height: 7 }} />
        <Spacer />
        <Text font={HIG_FONT.body} fontWeight="regular" foregroundStyle={cLabel}>
          {data.statusText || "当前空闲"}
        </Text>
        <RefreshButton />
      </HStack>

      <Spacer minLength={10} />

      {/* 2. 核心数据网格：[左半区：靠左对齐] | 分割线 (~37%) | [右半区：均分撑满] */}
      <HStack alignment="center" spacing={0}>
        {/* 左半区：近7日入库（靠左贴齐标题） + 今日入库 */}
        <HStack alignment="center" spacing={18}>
          <VStack alignment="center" spacing={3}>
            <Text font={HIG_FONT.statLarge} fontWeight="bold" foregroundStyle={cGreen} monospacedDigit lineLimit={1} allowsTightening={true} minScaleFactor={0.7}>
              {`+${data.recent7Days}`}
            </Text>
            <Text font={HIG_FONT.subhead} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              近7日入库
            </Text>
          </VStack>
          <VStack alignment="center" spacing={3}>
            <Text font={HIG_FONT.statLarge} fontWeight="bold" foregroundStyle={cGreen} monospacedDigit lineLimit={1} allowsTightening={true} minScaleFactor={0.7}>
              {`+${data.todayAdded}`}
            </Text>
            <Text font={HIG_FONT.subhead} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              今日入库
            </Text>
          </VStack>
        </HStack>

        <Spacer minLength={16} />

        {/* 细纵向分割线（自然落在约 37% 黄金分割位置） */}
        <RoundedRectangle
          fill={cDivider}
          cornerRadius={0.5}
          frame={{ width: 1, height: 28 }}
        />

        <Spacer minLength={16} />

        {/* 右半区：电影 / 剧集 / 分集 往中间聚合，两边留有适度边距 */}
        <HStack alignment="center" spacing={0} frame={{ maxWidth: "infinity" }} padding={{ leading: 8, trailing: 8 }}>
          <VStack alignment="center" spacing={3}>
            <Text font={HIG_FONT.statLarge} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1} allowsTightening={true} minScaleFactor={0.7}>
              {data.movies.toLocaleString("en-US")}
            </Text>
            <Text font={HIG_FONT.subhead} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              电影
            </Text>
          </VStack>
          <Spacer />
          <VStack alignment="center" spacing={3}>
            <Text font={HIG_FONT.statLarge} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1} allowsTightening={true} minScaleFactor={0.7}>
              {data.shows.toLocaleString("en-US")}
            </Text>
            <Text font={HIG_FONT.subhead} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              剧集
            </Text>
          </VStack>
          <Spacer />
          <VStack alignment="center" spacing={3}>
            <Text font={HIG_FONT.statLarge} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1} allowsTightening={true} minScaleFactor={0.7}>
              {data.episodes.toLocaleString("en-US")}
            </Text>
            <Text font={HIG_FONT.subhead} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              分集
            </Text>
          </VStack>
        </HStack>
      </HStack>

      <Spacer minLength={10} />

      {/* 3. 最近入库板块 */}
      <VStack alignment="leading" spacing={5}>
        <Text font={HIG_FONT.subhead} fontWeight="medium" foregroundStyle={cLabel}>
          最近入库
        </Text>
        {data.recentItems.slice(0, 2).map((item) => (
          <HStack key={item.id} spacing={6} alignment="center">
            <Text font={HIG_FONT.subhead} fontWeight="medium" foregroundStyle={cDim} monospacedDigit>
              {item.id}
            </Text>
            <Image
              systemName="film"
              font={{ name: "system", size: HIG_FONT.caption }}
              foregroundStyle={cFilm}
            />
            <Text
              font={HIG_FONT.subhead}
              fontWeight="regular"
              foregroundStyle={cText}
              lineLimit={1}
            >
              {item.title}
            </Text>
            <Spacer />
            <Text font={HIG_FONT.subhead} fontWeight="regular" foregroundStyle={cDim} monospacedDigit>
              {item.year}
            </Text>
          </HStack>
        ))}
      </VStack>

      <Spacer minLength={8} />

      {/* 4. 底栏：左侧版本/Slogan · 右侧更新时间 */}
      <HStack spacing={6} alignment="center">
        <Text font={HIG_FONT.caption} fontWeight="regular" foregroundStyle={cDim} lineLimit={1}>
          {data.footerTag}
        </Text>
        <Spacer />
        <Text font={HIG_FONT.caption} fontWeight="regular" foregroundStyle={cDim} monospacedDigit>
          {`更新于 ${formatTime(data.updatedAt)}`}
        </Text>
      </HStack>
    </VStack>
  )
}

// ═════════════════════════════════════════════════════════════════
// 2. 小号大额度/余额卡片：DeepSeek / WorkBuddy / CPAMP 风格
// ═════════════════════════════════════════════════════════════════
export function MetricBalanceCard({ data }: { data: MetricBalanceData }) {
  const pColor = remainColor(data.progressPct)
  const isWorkBuddy = data.serviceId === "workbuddy"
  const isDeepSeek = data.serviceId === "deepseek"
  const isCpamp = data.serviceId === "cpamp"

  // 主数值颜色：WorkBuddy与DeepSeek原图均为绿色大字，CPAMP为深蓝大字
  const mainNumColor = isCpamp
    ? ({ light: "#4338CA", dark: "#6366F1" } as any)
    : THEME.green

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 14, bottom: 12, leading: 14, trailing: 14 }}
      widgetBackground={THEME.bg}
    >
      {/* 顶栏：字标或 图标+标题 + 纯轻量刷新图标 */}
      <HStack spacing={6} alignment="center" frame={{ height: 18 }}>
        {data.wordmarkImage ? (
          <Image
            image={data.wordmarkImage}
            resizable={true}
            frame={{ width: Math.round(16 * (248 / 57)), height: 16 }}
          />
        ) : (
          <HStack spacing={5} alignment="center">
            <BrandHeaderIcon
              iconName={data.iconName}
              iconColor={data.iconColor}
              iconImage={data.iconImage}
              svgCode={data.svgCode}
              size={16}
            />
            {data.brandTitle ? (
              <Text
                font={HIG_FONT.smallTitle}
                fontWeight="bold"
                foregroundStyle={data.brandTitleColor || THEME.text}
              >
                {data.brandTitle}
              </Text>
            ) : null}
          </HStack>
        )}
        <Spacer />
        <RefreshButton />
      </HStack>

      <Spacer minLength={7} />

      {/* 标签 */}
      <Text font={HIG_FONT.subhead} fontWeight="medium" foregroundStyle={THEME.dim}>
        {data.mainLabel}
      </Text>

      {/* 主大数值 */}
      <HStack alignment="lastTextBaseline" spacing={2}>
        {data.prefix ? (
          <Text font={HIG_FONT.statLarge} fontWeight="bold" foregroundStyle={mainNumColor}>
            {data.prefix}
          </Text>
        ) : null}
        <Text
          font={HIG_FONT.heroNumber}
          fontWeight="bold"
          foregroundStyle={mainNumColor}
          monospacedDigit
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.5}
        >
          {data.mainValue}
        </Text>
        {isCpamp && (
          <Text
            font={HIG_FONT.subhead}
            fontWeight="bold"
            foregroundStyle={THEME.orange}
            monospacedDigit
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {` ${data.costStr || "$85.06"}`}
          </Text>
        )}
      </HStack>

      <Spacer minLength={7} />

      {/* 进度条 + 右侧百分比 (单行并排对齐，绝不错行) */}
      <HStack spacing={6} alignment="center">
        <ProgressBar value={data.progressPct} color={pColor} height={4.5} />
        <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={pColor} monospacedDigit>
          {`${Math.round(data.progressPct)}%`}
        </Text>
      </HStack>

      <Spacer minLength={7} />

      {/* 中间统计行 */}
      <HStack spacing={6} alignment="center">
        {isWorkBuddy ? (
          <>
            <HStack spacing={3} alignment="center">
              <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>已签</Text>
              <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={THEME.green} monospacedDigit lineLimit={1}>
                {data.subValue1}
              </Text>
            </HStack>
            <Spacer />
            <HStack spacing={3} alignment="center">
              <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>已用</Text>
              <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={THEME.orange} monospacedDigit lineLimit={1}>
                {data.subValue2}
              </Text>
            </HStack>
          </>
        ) : isDeepSeek ? (
          <HStack spacing={0} alignment="center" frame={{ maxWidth: "infinity" }}>
            <HStack spacing={3} alignment="center">
              <Text font={HIG_FONT.subhead} foregroundStyle={THEME.dim} lineLimit={1}>
                {data.subLabel1 || "状态"}
              </Text>
              <Text font={HIG_FONT.caption} fontWeight="medium" foregroundStyle={THEME.green} lineLimit={1}>
                {data.subValue1 || "正常"}
              </Text>
            </HStack>
            <Spacer />
            <HStack spacing={3} alignment="center">
              <Text font={HIG_FONT.subhead} foregroundStyle={THEME.dim} lineLimit={1}>
                {data.subLabel2 || "近7日消费"}
              </Text>
              <Text
                font={HIG_FONT.caption}
                fontWeight="semibold"
                foregroundStyle={THEME.text}
                monospacedDigit
                lineLimit={1}
                minScaleFactor={0.75}
              >
                {data.subValue2}
              </Text>
            </HStack>
          </HStack>
        ) : (
          <>
            <HStack spacing={3} alignment="center">
              <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>成功</Text>
              <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
                {data.subValue1 || "893"}
              </Text>
            </HStack>
            <Spacer />
            <HStack spacing={3} alignment="center">
              <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>失败</Text>
              <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={THEME.red} monospacedDigit lineLimit={1}>
                {data.subValue2 || "63"}
              </Text>
            </HStack>
          </>
        )}
      </HStack>

      <Spacer minLength={0} />

      {/* 底栏 */}
      <HStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
        <Text
          font={HIG_FONT.caption}
          fontWeight={isDeepSeek ? "medium" : "regular"}
          foregroundStyle={isDeepSeek ? THEME.green : THEME.dim}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          {data.footerLeft}
        </Text>
        <Spacer minLength={4} />
        <Text
          font={HIG_FONT.caption}
          foregroundStyle={THEME.dim}
          monospacedDigit
          lineLimit={1}
          minScaleFactor={0.8}
        >
          {`更新于 ${formatTime(data.updatedAt)}`}
        </Text>
      </HStack>
    </VStack>
  )
}

// ═════════════════════════════════════════════════════════════════
// 3. 小号双周期配额卡片：Codex / Antigravity 风格（彻底根治小字错行）
// ═════════════════════════════════════════════════════════════════
export function DualQuotaCard({ data }: { data: DualQuotaData }) {
  const c1 = remainColor(data.item1.pct)
  const c2 = remainColor(data.item2.pct)
  const isAntigravity = data.serviceId === "antigravity"

  // Antigravity 统计项颜色
  const val1Num = parseInt(data.stat1.value) || 0
  const val2Num = parseInt(data.stat2.value) || 0
  const cStat1 = val1Num > 0 ? THEME.green : THEME.red
  const cStat2 = val2Num > 0 ? THEME.green : THEME.red

  // 最紧百分比颜色
  const tightNum = parseInt(data.footerStatus.replace(/[^0-9]/g, "")) || 0
  const cTight = tightNum > 0 ? THEME.green : THEME.red

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 14, bottom: 12, leading: 14, trailing: 14 }}
      widgetBackground={THEME.bg}
    >
      {/* 顶栏：图标 + 标题 + 纯轻量刷新图标 */}
      <HStack spacing={6} alignment="center" frame={{ height: 18 }}>
        <BrandHeaderIcon
          iconName={data.iconName}
          iconColor={data.iconColor}
          iconImage={data.iconImage}
          svgCode={data.svgCode}
          size={16}
        />
        <Text font={HIG_FONT.smallTitle} fontWeight="bold" foregroundStyle={THEME.text}>
          {data.brandTitle}
        </Text>
        <Spacer />
        <RefreshButton />
      </HStack>

      <Spacer minLength={6} />

      {/* 第 1 段额度：上行纯文字标签+倒计时靠右对齐，下行进度条+百分比 */}
      <VStack alignment="leading" spacing={3}>
        <HStack spacing={5} alignment="center">
          <Text font={HIG_FONT.subhead} fontWeight="medium" foregroundStyle={THEME.dim} lineLimit={1}>
            {data.item1.label}
          </Text>
          <Spacer />
          <Text font={HIG_FONT.subhead} foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
            {data.item1.timer.replace(/后?刷新$/, "").trim()}
          </Text>
        </HStack>
        <HStack spacing={6} alignment="center">
          <ProgressBar value={data.item1.pct} color={c1} height={4.5} />
          <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={c1} monospacedDigit lineLimit={1}>
            {`${Math.round(data.item1.pct)}%`}
          </Text>
        </HStack>
      </VStack>

      <Spacer minLength={6} />

      {/* 第 2 段额度：上行纯文字标签+倒计时靠右对齐，下行进度条+百分比 */}
      <VStack alignment="leading" spacing={3}>
        <HStack spacing={5} alignment="center">
          <Text font={HIG_FONT.subhead} fontWeight="medium" foregroundStyle={THEME.dim} lineLimit={1}>
            {data.item2.label}
          </Text>
          <Spacer />
          <Text font={HIG_FONT.subhead} foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
            {data.item2.timer.replace(/后?刷新$/, "").trim()}
          </Text>
        </HStack>
        <HStack spacing={6} alignment="center">
          <ProgressBar value={data.item2.pct} color={c2} height={4.5} />
          <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={c2} monospacedDigit lineLimit={1}>
            {`${Math.round(data.item2.pct)}%`}
          </Text>
        </HStack>
      </VStack>

      <Spacer minLength={6} />

      {/* 底部指标项：Antigravity 与 Codex 精确分流 */}
      {isAntigravity ? (
        <HStack alignment="center" frame={{ maxWidth: "infinity" }}>
          {/* 左侧：Gem 周 % */}
          <HStack spacing={4} alignment="center">
            <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.8}>
              {data.stat1.label}
            </Text>
            <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={cStat1} monospacedDigit lineLimit={1}>
              {data.stat1.value}
            </Text>
          </HStack>
          <Spacer />
          {/* 右侧：C/G 周 % */}
          <HStack spacing={4} alignment="center">
            <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.8}>
              {data.stat2.label}
            </Text>
            <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={cStat2} monospacedDigit lineLimit={1}>
              {data.stat2.value}
            </Text>
          </HStack>
        </HStack>
      ) : (
        <HStack spacing={3} alignment="center">
          <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>
            {data.stat1.label}
          </Text>
          <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.stat1.value.replace(/[^0-9]/g, "") || data.stat1.value}
          </Text>
          <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>
            次
          </Text>
          <Spacer />
        </HStack>
      )}

      <Spacer minLength={0} />

      {/* 底栏 */}
      <HStack spacing={4} alignment="center">
        {isAntigravity ? (
          <HStack spacing={3} alignment="center">
            <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>最紧</Text>
            <Text font={HIG_FONT.caption} fontWeight="bold" foregroundStyle={cTight} monospacedDigit lineLimit={1}>
              {data.footerStatus.replace(/最紧|最低/g, "").trim() || "0%"}
            </Text>
          </HStack>
        ) : (
          <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>
            {data.footerStatus}
          </Text>
        )}
        <Spacer />
        <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
          {`更新于 ${formatTime(data.updatedAt)}`}
        </Text>
      </HStack>
    </VStack>
  )
}

// ═════════════════════════════════════════════════════════════════
// 4. 小号网络与出口看板：VPN 节点风格（复刻原图右下角）
// ═════════════════════════════════════════════════════════════════
export function VpnNodeCard({ data }: { data: VpnNodeData }) {
  const cGreen = { light: "#10B981", dark: "#34D399" } as any
  const cIp = { light: "#1D4ED8", dark: "#60A5FA" } as any

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 14, bottom: 12, leading: 14, trailing: 14 }}
      widgetBackground={THEME.bg}
    >
      {/* 顶栏：广播图标 + 状态标题 + 刷新 */}
      <HStack spacing={6} alignment="center" frame={{ height: 18 }}>
        <Image
          systemName="antenna.radiowaves.left.and.right"
          font={{ name: "system", size: HIG_FONT.title }}
          foregroundStyle={cGreen}
        />
        <Text font={HIG_FONT.smallTitle} fontWeight="bold" foregroundStyle={cGreen}>
          {data.statusTitle}
        </Text>
        <Spacer />
        <RefreshButton />
      </HStack>

      <Spacer minLength={8} />

      {/* 主 IP 地址 */}
      <Text
        font={HIG_FONT.statLarge}
        fontWeight="bold"
        foregroundStyle={cIp}
        monospacedDigit
        lineLimit={1}
        allowsTightening={true}
        minScaleFactor={0.6}
      >
        {data.ip}
      </Text>

      <Spacer minLength={6} />

      {/* 归属地与 ISP 服务商 */}
      <VStack alignment="leading" spacing={2}>
        <Text font={HIG_FONT.body} fontWeight="semibold" foregroundStyle={THEME.text} lineLimit={1}>
          {data.location}
        </Text>
        <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1}>
          {data.isp}
        </Text>
      </VStack>

      <Spacer minLength={6} />

      {/* 风险条 */}
      <HStack spacing={6} alignment="center">
        <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim}>
          风险
        </Text>
        <ProgressBar value={data.riskPct} color={THEME.orange} height={4.5} />
        <Text font={HIG_FONT.subhead} fontWeight="bold" foregroundStyle={THEME.orange} monospacedDigit>
          {`${Math.round(data.riskPct)}%`}
        </Text>
      </HStack>

      <Spacer minLength={0} />

      {/* 底栏 */}
      <HStack spacing={8} alignment="center">
        <Text font={HIG_FONT.subhead} fontWeight="medium" foregroundStyle={cGreen} lineLimit={1}>
          {data.tag1}
        </Text>
        <Text font={HIG_FONT.subhead} foregroundStyle={THEME.dim} lineLimit={1}>
          {data.tag2}
        </Text>
        <Spacer />
        <Text font={HIG_FONT.subhead} foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
          {`更新于 ${formatTime(data.updatedAt)}`}
        </Text>
      </HStack>
    </VStack>
  )
}

// ============================================================
// 7. 今日油价小组件（小号：白底 Shell 贝壳高光小组件，1:1 精确复刻）
// ============================================================
export function FuelPriceSmallCard({ data }: { data: FuelCardData }) {
  // 只使用累积的真实价格历史。历史不足 2 天时**不画线**：
  // 单点连成的是水平直线，会被误读成「油价一直没变」。
  const history = Array.isArray(data.priceHistory)
    ? data.priceHistory.filter((h: any) => h && Number.isFinite(Number(h.value)))
    : []
  const current = Number(data.focusPrice) || 0
  const hasTrend = history.length >= 2

  const last = hasTrend ? history[history.length - 1] : null
  const prev = hasTrend ? history[history.length - 2] : null
  const close = last ? Number(last.value) : current
  const dif = prev ? close - Number(prev.value) : 0
  const rate = prev && Number(prev.value) !== 0 ? (dif / Number(prev.value)) * 100 : 0

  let changeText = String(data.changeText || "").trim()
  let rateText = String(data.changeRateText || "").trim()

  if (!changeText && prev) {
    changeText = signedText(dif)
  }
  if (!rateText) {
    if (prev && Number(prev.value) !== 0) {
      rateText = signedText(rate, 2, "%")
    } else if (changeText && current > 0) {
      const numChange = parseFloat(changeText.replace("+", ""))
      if (Number.isFinite(numChange)) {
        const calcRate = (numChange / current) * 100
        const sign = calcRate > 0 ? "+" : ""
        rateText = `${sign}${calcRate.toFixed(2)}%`
      }
    }
  }

  const trendText = String(data.smallTrend || "")
  const isDown =
    data.trendType === "down" ||
    (data.trendLabel && data.trendLabel.includes("下调")) ||
    changeText.startsWith("-") ||
    trendText.includes("跌") ||
    trendText.includes("下调")
  const isUp = !isDown

  return (
    <TrendSmallTemplate
      title={data.oilName || "92# 汽油"}
      subtitle={data.subTitle || `${data.province || ""}实时油价`}
      data={hasTrend ? history : []}
      priceText={close.toFixed(2)}
      changeText={changeText || "--"}
      rateText={rateText || "--"}
      isUp={isUp}
      tagText={data.cleanDateText || "近期调价"}
    />
  )
}

export function FuelPriceMediumCard({ data }: { data: FuelCardData }) {
  const items = [
    { name: "92 号", price: data.prices?.oil92 || "--", textColor: "#E5933A", tagBg: "rgba(229, 147, 58, 0.18)" },
    { name: "95 号", price: data.prices?.oil95 || "--", textColor: "#E6674E", tagBg: "rgba(230, 103, 78, 0.18)" },
    { name: "98 号", price: data.prices?.oil98 || "--", textColor: "#E05268", tagBg: "rgba(224, 82, 104, 0.18)" },
    { name: "柴油", price: data.prices?.oil0 || "--", textColor: "#34C759", tagBg: "rgba(52, 199, 89, 0.18)" },
  ]

  // 真实累积历史；数据不足时模板自动降级为说明文案
  const history = Array.isArray(data.priceHistory) ? data.priceHistory : []
  const trendText = String(data.smallTrend || "")
  const isDown = trendText.includes("跌") || trendText.includes("下调")
  const color = isDown
    ? ({ light: "#00B368", dark: "#30D158" } as any)
    : ({ light: "#FF3B30", dark: "#FF453A" } as any)

  /**
   * 顶部徽章文案：把「方向 + 涨跌幅 + 每升涨跌额」一次说清。
   *
   * 例如「上调 +1.52% (+0.12元/升)」。
   * 拿不到真实变动时退化为「上调 幅度待公布」，而不是显示没有信息量的
   * 「上调 0.00%」——后者会被误读成「确定不涨不跌」。
   */
  const trendLabel = data.trendLabel || (isDown ? "下调" : "上调")
  const rateText = String(data.changeRateText || "").trim()
  const changeText = String(data.changeText || "").trim()
  const magnitude = [rateText, changeText ? `${changeText}元/升` : ""]
    .filter(Boolean)
    .join(" ")
  const badgeText = magnitude
    ? `${trendLabel} ${magnitude}`
    : `${trendLabel} 幅度待公布`

  return (
    <MarketMediumTemplate
      iconName="fuelpump.fill"
      iconColor="#F59E0B"
      title={`${data.province || ""}实时油价`}
      badgeText={badgeText}
      badgeColor={color}
      badgeBg={isDown ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)"}
      items={items}
      trendData={history}
      lineColor={color}
      updatedAt={data.updatedAt}
    />
  )
}

// 统一根据尺寸自适应的 FuelPriceCard
export function FuelPriceCard({ data, family }: { data: FuelCardData; family?: string }) {
  if (family === "systemMedium" || family === "systemLarge") {
    return <FuelPriceMediumCard data={data} />
  }
  return <FuelPriceSmallCard data={data} />
}

// ═════════════════════════════════════════════════════════════════
// 3.5 黄金行情卡片：参考油价排版设计 + 上金所真实日K折线图
// ═════════════════════════════════════════════════════════════════

/** 小号黄金组件：参考油价 Shell 贝壳高光排版，背景金色徽标水印，右上刷新与更新时间，右侧超大金价数值与涨跌，底部上金所平滑面积折线图 */
export function GoldPriceSmallCard({ data }: { data: GoldMarketData }) {
  // 走势序列：优先真实 30 日行情，缺失时用内置兜底序列
  const marks = data.history30d?.length > 0 ? data.history30d : [
    { label: "10-01", value: 895 },
    { label: "10-05", value: 898 },
    { label: "10-08", value: 892 },
    { label: "10-09", value: 904.48 },
  ]
  const close = Number(data.focusPrice) || marks[marks.length - 1]?.value || 0
  const prev = marks[marks.length - 2]?.value ?? close
  const dif = close - prev
  const rate = prev !== 0 ? (dif / prev) * 100 : 0
  const isUp = data.isUp

  return (
    <TrendSmallTemplate
      title={data.sourceName || "Au9999"}
      subtitle={data.subTitle || "上金所实时价"}
      data={marks}
      priceText={close.toFixed(2)}
      changeText={signedText(dif)}
      rateText={signedText(rate, 2, "%")}
      isUp={isUp}
    />
  )
}

/** 中号黄金组件：参考今日油价 4 联卡片设计（Au9999 / 黄金T+D / 周大福 / 招行/浙商金价） + 底部上金所折线图 */
export function GoldPriceMediumCard({ data }: { data: GoldMarketData }) {
  const items = [
    { name: "Au9999", price: data.prices?.au9999 || "904.48", textColor: "#E5933A", tagBg: "rgba(229, 147, 58, 0.18)" },
    { name: "黄金T+D", price: data.prices?.autd || "904.20", textColor: "#E6674E", tagBg: "rgba(230, 103, 78, 0.18)" },
    { name: "周大福", price: data.prices?.chowTaiFook || "1045", textColor: "#E05268", tagBg: "rgba(224, 82, 104, 0.18)" },
    { name: "招行/浙商", price: data.prices?.cmbBuy || data.prices?.zsPrice || "905.97", textColor: "#34C759", tagBg: "rgba(52, 199, 89, 0.18)" },
  ]
  const marks = data.history30d?.length > 0 ? data.history30d : [
    { label: "10-01", value: 895 },
    { label: "10-05", value: 898 },
    { label: "10-08", value: 892 },
    { label: "10-09", value: 904.48 },
  ]
  const color = data.isUp
    ? ({ light: "#FF3B30", dark: "#FF453A" } as any)
    : ({ light: "#00B368", dark: "#30D158" } as any)

  return (
    <MarketMediumTemplate
      iconName="centsign.circle.fill"
      iconColor="#F59E0B"
      title={data.sourceName || "上海黄金交易所"}
      badgeText={`${data.changeValue} (${data.changeRate})`}
      badgeColor={color}
      badgeBg={data.isUp ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)"}
      items={items}
      trendData={marks}
      lineColor={color}
      updatedAt={data.updatedAt}
    />
  )
}

export function GoldPriceCard({ data, family }: { data: GoldMarketData; family?: string }) {
  if (family === "systemMedium" || family === "systemLarge") {
    return <GoldPriceMediumCard data={data} />
  }
  return <GoldPriceSmallCard data={data} />
}
// ═════════════════════════════════════════════════════════════════
// 5. 小型组件（统一由 templates.tsx 的 AiSmallTemplate 渲染）
//    WorkBuddy / DeepSeek / Codex / Antigravity / CPA-Manager-Plus
// ═════════════════════════════════════════════════════════════════

export function WorkBuddySmallCard({ data }: { data: MetricBalanceData }) {
  const iconColor = { light: "#6366F1", dark: "#818CF8" } as any
  const validDays = String(data.validDays ?? "").trim()
  // WorkBuddy 已合并为单一数据源；副指标标签由数据层给出（缺省「账号」）
  const thirdLabel = data.subLabel1 || "账号"
  return (
    <AiSmallTemplate
      brand="WorkBuddy"
      iconImage={data.iconImage || brandIcon("workbuddy")}
      cells={[
        { icon: "circle.grid.3x3.fill", iconColor, label: "积分剩余", value: data.mainValue || "0" },
        { icon: "doc.plaintext", iconColor, label: "已用", value: data.subValue2 || "--" },
        { icon: "checkmark.circle", iconColor, label: thirdLabel, value: data.subValue1 || "--" },
        {
          icon: "calendar",
          iconColor,
          label: "有效期",
          value: validDays ? (validDays.replace(/[^0-9]/g, "") || "--") : "--",
          suffix: validDays ? "天" : undefined,
        },
      ]}
      progressPct={Math.max(0, Math.min(100, data.progressPct || 0))}
    />
  )
}

export function DeepSeekSmallCard({ data }: { data: MetricBalanceData }) {
  const currency = (data.prefix || "¥").trim()
  const raw = String(data.subValue2 ?? "").trim()
  const weekCost = !raw || raw === "--" ? `${currency} --` : (raw.startsWith("¥") || raw.startsWith("$") ? raw : `${currency} ${raw}`)
  const iconColor = { light: "#1E60FF", dark: "#3B82F6" } as any

  return (
    <AiSmallTemplate
      brand="deepseek"
      svgCode={DEEPSEEK_WHALE_SVG}
      titleColor={{ light: "#4D6BFE", dark: "#7C93FF" }}
      primary={{
        icon: "circle.grid.3x3.fill",
        iconColor,
        label: "账户余额",
        value: data.mainValue || "0.00",
      }}
      cells={[
        { icon: "checkmark.seal.fill", iconColor: THEME.green, label: "状态", value: data.statusText || "正常", valueColor: THEME.green },
        { icon: "chart.line.uptrend.xyaxis", iconColor, label: "近7日消费", value: weekCost },
      ]}
      footerLeft="官方直连"
      footerRight={`更新于 ${formatTime(data.updatedAt)}`}
    />
  )
}

export function CodexSmallCard({ data }: { data: DualQuotaData }) {
  const iconColor = { light: "#6366F1", dark: "#818CF8" } as any
  const fiveHourPct = Number(data.item1?.pct ?? 0)
  const weekPct = Number(data.item2?.pct ?? 0)
  const resetCount = (data.stat1?.value || "0").replace(/[^0-9]/g, "") || "0"

  // 多账号时百分比是各账号之和，可能超过 100：
  // 进度槽必须钳制，否则渲染溢出；数值本身仍按求和显示。
  const barPct = Math.max(0, Math.min(100, fiveHourPct))
  // 多账号标注（如「2 账号 · 最低 41.0%」）优先展示
  const multiNote = data.footerStatus?.includes("账号") ? data.footerStatus : ""

  return (
    <AiSmallTemplate
      brand="Codex"
      iconImage={data.iconImage || brandIcon("codex")}
      cells={[
        { icon: "clock", iconColor, label: "5小时额度", value: `${formatPct(fiveHourPct)}%` },
        { icon: "calendar.badge.clock", iconColor, label: "周额度", value: `${formatPct(weekPct)}%` },
        { icon: "arrow.clockwise", iconColor, label: "可重置次数", value: resetCount, suffix: "次" },
        { icon: "chart.bar.fill", iconColor, label: "剩余", value: `${formatPct(fiveHourPct)}%` },
      ]}
      progressPct={barPct}
      footerLeft={multiNote || `更新于 ${formatTime(data.updatedAt)}`}
      footerRight={multiNote ? `更新于 ${formatTime(data.updatedAt)}` : "服务在线 ●"}
      footerRightColor={THEME.green}
    />
  )
}

export function AntigravitySmallCard({ data }: { data: DualQuotaData }) {
  const iconColor = { light: "#6366F1", dark: "#818CF8" } as any
  const gemTimer = data.item1?.timer || "--"
  const cgTimer = data.item2?.timer || "--"
  const gemWeek = String(data.stat1?.value || `${formatPct(data.item1?.pct ?? 0)}%`)
  const cgWeek = String(data.stat2?.value || `${formatPct(data.item2?.pct ?? 0)}%`)
  const multiNote = data.footerStatus?.includes("账号") ? data.footerStatus : ""

  return (
    <AiSmallTemplate
      brand="Antigravity"
      iconImage={data.iconImage || brandIcon("antigravity")}
      cells={[
        { icon: "sparkle", iconColor, label: "Gemini", value: gemTimer },
        { icon: "bolt.shield.fill", iconColor, label: "Claude/GPT", value: cgTimer },
        { icon: "chart.pie.fill", iconColor, label: "Gem 周", value: gemWeek },
        { icon: "chart.pie.fill", iconColor, label: "C/G 周", value: cgWeek },
      ]}
      footerLeft={multiNote || "最新"}
      footerRight={`更新于 ${formatTime(data.updatedAt)}`}
    />
  )
}

/** CPA-Manager-Plus 小号：与其他 AI 小号统一版式 */
export function CpampSmallCard({ data }: { data: MetricBalanceData }) {
  const iconColor = { light: "#005CFF", dark: "#3B82F6" } as any
  const success = data.subValue1 || "--"
  const failed = data.subValue2 || "--"
  const cost = data.costStr || "--"

  return (
    <AiSmallTemplate
      brand="CPA-Manager-Plus"
      svgCode={CPAMP_LOGO_SVG}
      titleColor={{ light: "#005CFF", dark: "#3B82F6" }}
      cells={[
        { icon: "bolt.horizontal.circle.fill", iconColor, label: "今日调用", value: data.mainValue || "0" },
        { icon: "checkmark.circle.fill", iconColor: THEME.green, label: "成功", value: success, valueColor: THEME.green },
        { icon: "xmark.circle.fill", iconColor: THEME.red, label: "失败", value: failed, valueColor: THEME.red },
        { icon: "dollarsign.circle.fill", iconColor: THEME.orange, label: "消耗金额", value: cost, valueColor: THEME.orange },
      ]}
      progressPct={data.progressPct || 0}
      footerLeft={data.footerLeft || "已连接"}
      footerRight={`更新于 ${formatTime(data.updatedAt)}`}
    />
  )
}

// ═════════════════════════════════════════════════════════════════
// 6. 中型组件：1:1 复刻 xubai2001 DeepSeek 原版平滑波形图看板架构
// 左侧 112pt 紧凑主数值与明细标签 + 右侧 80pt 通栏平滑贝塞尔面积折线图
// ═════════════════════════════════════════════════════════════════

/** 中号 AI 波形看板：直接复用共享模板，保证五套服务 1:1 一致 */
export function WaveformDashboardMediumCard({ props }: { props: WaveformMediumTemplateProps }) {
  return <WaveformMediumTemplate {...props} />
}

// ═════════════════════════════════════════════════════════════════
// 7. BENTO 大号看板：可自定义模块的弹性微应用栅格
// ═════════════════════════════════════════════════════════════════

export interface BentoModuleDef {
  /** 模块 id，用于 CONFIG.largeModules 配置 */
  id: string
  /** 卡片标题 */
  title: string
  /** SF Symbol 图标 */
  icon: string
  /** 图标与强调色 */
  color: any
  /** 主数值 */
  value: string
  /** 副标题 */
  sub: string
  /** 右上角标签文案（可选） */
  tag?: string
  /** 标签配色方向 */
  tagUp?: boolean
  /** 底部进度槽 0-1（可选） */
  progress?: number
}

/** 单个 Bento 微应用卡片 */
function BentoCard({ mod }: { mod: BentoModuleDef }) {
  // 涨/跌标签：沿用与其它卡片一致的胶囊几何，避免大号看板里出现第三种圆角语言。
  const tagColor = mod.tagUp ? THEME.red : THEME.green

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={11}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{ light: "#F8FAFC", dark: "#1E222B" }}
    >
      {/* 标题行：图标 + 名称 + 涨跌标签 */}
      <HStack spacing={5} alignment="center">
        <Image
          systemName={mod.icon}
          font={{ name: "system", size: HIG_FONT.title }}
          foregroundStyle={mod.color}
        />
        <Text
          font={HIG_FONT.subhead}
          fontWeight="bold"
          foregroundStyle={THEME.text}
          lineLimit={1}
          minScaleFactor={0.7}
        >
          {mod.title}
        </Text>
        <Spacer />
        {mod.tag ? (
          <Text
            font={HIG_FONT.caption}
            fontWeight="semibold"
            foregroundStyle={tagColor}
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.85}
            padding={{ top: 2.5, bottom: 2.5, leading: 6, trailing: 6 }}
            background={softTint(tagColor) as any}
            clipShape="capsule"
          >
            {mod.tag}
          </Text>
        ) : null}
      </HStack>

      <Spacer minLength={5} />

      {/* 主数值 */}
      <Text
        font={HIG_FONT.statLarge}
        fontWeight="bold"
        foregroundStyle={THEME.text}
        monospacedDigit
        lineLimit={1}
        allowsTightening={true}
        minScaleFactor={0.5}
      >
        {mod.value}
      </Text>

      <Spacer minLength={3} />

      {/* 副标题 */}
      <Text
        font={HIG_FONT.subhead}
        foregroundStyle={THEME.dim}
        lineLimit={1}
        minScaleFactor={0.8}
      >
        {mod.sub}
      </Text>

      <Spacer />

      {/* 底部进度槽 */}
      {mod.progress !== undefined ? (
        <ZStack frame={{ maxWidth: "infinity", height: 4 }}>
          <RoundedRectangle
            fill={{ light: "#E2E8F0", dark: "#334155" }}
            cornerRadius={2}
            frame={{ maxWidth: "infinity", height: 4 }}
          />
          {/* 用比例宽度填充，避免写死像素导致不同机型上长度不一致 */}
          <GeometryReader>
            {(p: any) => (
              <RoundedRectangle
                fill={mod.color}
                cornerRadius={2}
                frame={{
                  width: Math.max(
                    4,
                    Math.round(
                      (p?.size?.width || 120) * Math.max(0, Math.min(1, mod.progress || 0))
                    )
                  ),
                  height: 4,
                }}
              />
            )}
          </GeometryReader>
        </ZStack>
      ) : null}
    </VStack>
  )
}

/**
 * BENTO 大号看板：按 `modules` 顺序渲染 2 列栅格。
 * `modules` 为空或全部无效时自动回落到默认四模块，保证永远不出现空白。
 */
export function BentoLargeGridCard({
  gold,
  deepseek,
  fuel,
  fx,
  modules = ["gold", "deepseek", "fx", "oil"],
}: {
  gold: GoldMarketData
  deepseek: MetricBalanceData
  fuel: FuelCardData
  fx?: AuxiliaryMarketData
  modules?: string[]
}) {
  // 汇总所有可用模块（字段严格对应各自数据模型）
  const fxData = fx?.fx
  const registry: Record<string, BentoModuleDef> = {
    gold: {
      id: "gold",
      title: "Au9999 金价",
      icon: "centsign.circle.fill",
      color: { light: "#F59E0B", dark: "#FBBF24" },
      value: `¥${gold.prices?.au9999 || gold.focusPrice || "--"}`,
      sub: `周大福 ¥${gold.prices?.chowTaiFook || "--"}`,
      tag: `${gold.changeValue} (${gold.changeRate})`,
      tagUp: gold.isUp,
      // 进度槽取当前价在 30 日区间中的相对位置（真实数据，非写死值）
      progress: (() => {
        const cur = Number(gold.prices?.au9999 || gold.focusPrice)
        const lo = Number(gold.minPrice)
        const hi = Number(gold.maxPrice)
        if (!Number.isFinite(cur) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return undefined
        return Math.max(0, Math.min(1, (cur - lo) / (hi - lo)))
      })(),
    },
    deepseek: {
      id: "deepseek",
      title: "DeepSeek 余额",
      icon: "sparkles",
      color: { light: "#1E60FF", dark: "#3B82F6" },
      value: `${deepseek.prefix || "¥"}${deepseek.mainValue || "0.00"}`,
      sub: `近7日消费 ${deepseek.subValue2 || "--"}`,
      tag: "官方直连",
      tagUp: false,
      progress: Math.max(0, Math.min(1, (deepseek.progressPct || 0) / 100)),
    },
    fx: {
      id: "fx",
      title: fxData?.pair || "USD / CNY",
      icon: "dollarsign.arrow.circlepath",
      color: { light: "#6366F1", dark: "#818CF8" },
      value: fxData?.rate || "--",
      sub: `较前值 ${fxData?.change || "--"}`,
      tag: fxData?.changeRate || "--",
      tagUp: fxData?.isUp ?? false,
      // 汇率暂无区间数据，不显示进度槽（避免无意义的写死长度）
    },
    stock: {
      id: "stock",
      title: "A 股大盘",
      icon: "chart.line.uptrend.xyaxis",
      color: { light: "#EF4444", dark: "#F87171" },
      value: "--",
      sub: "指数行情未接入",
      tag: undefined,
    },
    oil: {
      id: "oil",
      title: `${fuel.province || "北京"} ${fuel.oilName || "92#"}`,
      icon: "fuelpump.fill",
      color: { light: "#F97316", dark: "#FB923C" },
      value: `¥${fuel.focusPrice || "--"}/L`,
      sub: fuel.smallTrend || fuel.mediumForecast || "下次调价近期",
      tag: fuel.trendType === "down" ? "下调" : fuel.trendType === "up" ? "上调" : "搁浅",
      tagUp: fuel.trendType === "up",
      // 用真实价格历史绘制「当前价在区间中的位置」
      progress: (() => {
        const hist = (fuel.priceHistory || []).map((h) => Number(h?.value)).filter(Number.isFinite)
        const cur = Number(fuel.focusPrice)
        if (!Number.isFinite(cur) || hist.length < 2) return undefined
        const lo = Math.min(...hist)
        const hi = Math.max(...hist)
        if (hi <= lo) return undefined
        return Math.max(0, Math.min(1, (cur - lo) / (hi - lo)))
      })(),
    },
  }

  // 解析模块列表：过滤未知 id；为空时回落默认顺序，避免空白看板
  const resolved = (Array.isArray(modules) ? modules : [])
    .map((m) => String(m || "").trim().toLowerCase())
    .filter((m) => Boolean(registry[m]))
  const list = (resolved.length > 0 ? resolved : ["gold", "deepseek", "fx", "oil"]).slice(0, 4)
  const cards = list.map((id) => registry[id])

  // 每行 2 张，最后一行只有 1 张时用占位撑满，保持栅格对齐
  const rows: BentoModuleDef[][] = []
  for (let i = 0; i < cards.length; i += 2) rows.push(cards.slice(i, i + 2))

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={14}
      widgetBackground={THEME.bg}
    >
      {/* 顶部主控状态栏 */}
      <HStack spacing={6} alignment="center" frame={{ height: 22 }}>
        <Image
          systemName="square.grid.2x2.fill"
          font={{ name: "system", size: HIG_FONT.title }}
          foregroundStyle={THEME.blue}
        />
        <Text
          font={HIG_FONT.smallTitle}
          fontWeight="heavy"
          foregroundStyle={THEME.text}
          lineLimit={1}
          minScaleFactor={0.8}
        >
          BENTO大号看板
        </Text>
        <Spacer />
        <RefreshButton />
        <Spacer minLength={4} />
        <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} monospacedDigit>
          {`更新于 ${formatTime(gold.updatedAt)}`}
        </Text>
      </HStack>

      <Spacer minLength={10} />

      {/* 2 列栅格 */}
      {rows.map((row, ri) => (
        <VStack key={ri} spacing={10} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
          <HStack spacing={10} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
            {row.map((mod) => (
              <BentoCard key={mod.id} mod={mod} />
            ))}
            {/* 奇数个模块时补一个占位，保证最后一行左右等宽 */}
            {row.length === 1 ? <HStack frame={{ maxWidth: "infinity" }} /> : null}
          </HStack>
          {ri < rows.length - 1 ? <Spacer minLength={10} /> : null}
        </VStack>
      ))}
    </VStack>
  )
}

function getGithubContributionColor(level: number): any {
  switch (level) {
    case 1:
      return { light: "#9BE9A8", dark: "#0E4429" }
    case 2:
      return { light: "#40C463", dark: "#006D32" }
    case 3:
      return { light: "#30A14E", dark: "#26A641" }
    case 4:
      return { light: "#216E39", dark: "#39D353" }
    default:
      return { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.08)" }
  }
}

/**
 * GitHub 监控中号小组件 (参考图 1 风格)
 * 左侧展示用户头像、用户名、简介及 Followers、Stars、Forks 三项核心指标及其增量变化
 * 右侧展示按 Stars 降序排列的前 7 个热门仓库
 *
 * 配色：全部走 THEME 语义色（浅色深灰 / 深色纯白），不再写死 #FFFFFF。
 * 排版：三列等宽 + 顶端对齐，标签/数值行固定行高，保证三项标签在同一水平线。
 */
/**
 * 统一轻量胶囊标签。
 *
 * 旧实现在 `HStack` 上用 `widgetBackground` + `cornerRadius`，圆角半径与
 * 实际高度不匹配（高度约 17pt 却用 4pt 圆角），看起来是一个歪斜的色块。
 * 这里统一为「半圆端」胶囊：固定高度、圆角 = 高度一半、内边距对称，
 * 并让底色用低饱和的品牌色，保证浅色/深色下都不刺眼。
 */
export function CompactChip({
  text,
  tint = THEME.blue,
  intent,
  width,
}: {
  text: string
  tint?: any
  intent?: any
  width?: number
}) {
  const content = (
    <Text
      font={HIG_FONT.caption}
      fontWeight="semibold"
      foregroundStyle={tint}
      lineLimit={1}
      allowsTightening={true}
      minScaleFactor={0.8}
      padding={{ leading: 7, trailing: 7, top: 3, bottom: 3 }}
      frame={width ? { width, alignment: "center" } : undefined}
      background={softTint(tint) as any}
      clipShape="capsule"
    >
      {text}
    </Text>
  )

  if (!intent) return content
  return (
    <Button intent={intent} buttonStyle="plain">
      {content}
    </Button>
  )
}

export function GitHubMediumCard({
  data,
  submode,
}: {
  data: GitHubMonitorData
  submode?: string
}) {
  const currentMode =
    submode ||
    (typeof Storage !== "undefined"
      ? Storage.get<string>("dashboard_kit_submode_github", { shared: true }) ||
        Storage.get<string>("dashboard_kit_submode_github") ||
        "repos"
      : "repos")
  const isHeatmap = currentMode === "heatmap"
  const top7 = (Array.isArray(data.topRepos) ? data.topRepos : []).slice(0, 7)
  const formatDelta = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `${d}` : "+0")
  const deltaColor = (d: number) =>
    d > 0 ? THEME.green : d < 0 ? THEME.red : THEME.dim

  // 空状态：未配置账号或首次拉取失败时，不展示内置示例数字
  // （那会让人误以为监控已经在工作），改为提示如何接入数据。
  if (data.configured === false) {
    return (
      <EmptyStateCard
        icon="chevron.left.forwardslash.chevron.right"
        title="GitHub 监控"
        message={data.errorText || "尚未配置 GitHub 账号"}
        hint="在「哑巴面板」设置页填写 GitHub 用户名（可选 Token）后即可显示数据"
      />
    )
  }

  /**
   * 单个指标单元：图标 + 数值 + 增量一行，标签一行。
   *
   * 两个 `frame.height` 是「三个标签同一水平线」的关键：让每列的行高固定，
   * 标签行就不会因为某列数字更长而整体下沉。
   */
  const metric = (
    icon: string,
    iconColor: any,
    value: number,
    delta: number,
    label: string
  ) => (
    <VStack
      alignment="leading"
      spacing={1}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
    >
      <HStack spacing={2} alignment="center" frame={{ maxWidth: "infinity", height: 15 }}>
        <Image systemName={icon} font={HIG_FONT.caption} foregroundStyle={iconColor} />
        <Text
          font={HIG_FONT.body}
          fontWeight="bold"
          foregroundStyle={THEME.text}
          monospacedDigit
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.75}
        >
          {String(value)}
        </Text>
        <Text
          font={HIG_FONT.caption}
          fontWeight="semibold"
          foregroundStyle={deltaColor(delta)}
          monospacedDigit
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.6}
        >
          {formatDelta(delta)}
        </Text>
      </HStack>
      <Text
        font={HIG_FONT.caption}
        foregroundStyle={THEME.dim}
        lineLimit={1}
        allowsTightening={true}
        minScaleFactor={0.6}
        frame={{ maxWidth: "infinity", height: 12, alignment: "leading" }}
      >
        {label}
      </Text>
    </VStack>
  )

  return (
    <HStack
      spacing={12}
      alignment="center"
      padding={{ top: 12, bottom: 12, leading: 14, trailing: 14 }}
      // frame 必须在 widgetBackground 之前：SwiftUI 修饰符是「从内向外」叠加，
      // frame 写在后面会让背景只铺满内容自然尺寸，多出来的区域透出系统底色，
      // 看起来就是「同一条边一侧白、一侧灰」。
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={THEME.cardBg}
    >
      {/* 左侧栏：用户信息与三大指标 */}
      {/*
        间距 10 → 24：用户反馈三大指标紧贴头像，视觉上像「头像的附属物」。
        加大到 24pt 后指标组与头像形成明确的两个信息块，卡片高度仍有余量
        （44 头像 + 24 间隔 + 约 27 指标 = 95pt，中号组件内容区约 146pt）。
      */}
      {/*
        间距调整：使用合理的模块间距 (spacing=14) 替代此前过度拉伸的
        Spacer(minLength=24)，消除头像与三大指标之间尴尬的空洞留白，
        同时与右侧居中对齐保持和谐呼吸感。
      */}
      <VStack alignment="leading" spacing={14} frame={{ width: 146 }}>
        {/* 用户头像与信息 */}
        <HStack spacing={8} alignment="center">
          <Image
            imageUrl={data.avatarUrl || `https://github.com/${data.username}.png`}
            clipShape="circle"
            resizable={true}
            scaleToFit={true}
            frame={{ width: 44, height: 44 }}
          />
          <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity" }}>
            <Text
              font={HIG_FONT.title}
              fontWeight="bold"
              foregroundStyle={THEME.text}
              lineLimit={1}
              minScaleFactor={0.7}
            >
              {data.name || data.username}
            </Text>
            <Text
              font={HIG_FONT.subhead}
              foregroundStyle={THEME.dim}
              lineLimit={1}
              minScaleFactor={0.75}
            >
              @{data.username}
            </Text>
            <Text
              font={HIG_FONT.caption}
              foregroundStyle={THEME.dim}
              lineLimit={1}
              minScaleFactor={0.75}
            >
              {data.bio || "Code · Learn · Build · Share"}
            </Text>
          </VStack>
        </HStack>

        {/* 三大指标：三列等宽 + 顶端对齐，基准线整齐 */}
        <HStack spacing={4} alignment="top">
          {metric("person.2.fill", THEME.blue, data.followers, data.followersDelta, "Followers")}
          {metric("star.fill", THEME.orange, data.stars, data.starsDelta, "Stars")}
          {metric("arrow.triangle.branch", THEME.purple, data.forks, data.forksDelta, "Forks")}
        </HStack>
      </VStack>

      {/* 竖向分隔线 */}
      <RoundedRectangle
        cornerRadius={1}
        fill={THEME.borderSolid as any}
        frame={{ width: 1, maxHeight: "infinity" }}
      />

      {/* 右侧栏：Top 7 热门仓库列表 / 贡献热力图切换 */}
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
        <HStack alignment="center" spacing={4}>
          <Image
            systemName={isHeatmap ? "calendar" : "chevron.left.forwardslash.chevron.right"}
            font={HIG_FONT.subhead}
            foregroundStyle={THEME.blue}
          />
          <Text
            font={HIG_FONT.subhead}
            fontWeight="semibold"
            foregroundStyle={THEME.text}
            lineLimit={1}
            minScaleFactor={0.8}
          >
            {isHeatmap ? "贡献热力图" : "热门仓库"}
          </Text>
          <Spacer />
          <CompactChip
            text={isHeatmap ? "看仓库" : "热力图"}
            tint={THEME.blue}
            intent={SetWidgetSubModeIntent(`github:${isHeatmap ? "repos" : "heatmap"}`)}
          />
          <RefreshButton />
        </HStack>

        {isHeatmap ? (
          <VStack alignment="leading" spacing={5} frame={{ maxWidth: "infinity" }}>
            {/* 12 周 × 7 天网格 */}
            <HStack spacing={2} alignment="center">
              {(() => {
                const rawWeeks =
                  Array.isArray(data.contributions?.weeks) && data.contributions!.weeks.length > 0
                    ? data.contributions!.weeks.slice(-12)
                    : []
                const weeks =
                  rawWeeks.length > 0
                    ? rawWeeks
                    : Array.from({ length: 12 }, () => ({
                        days: Array.from({ length: 7 }, () => ({ level: 0, count: 0, date: "" })),
                      }))
                return weeks.map((week, wIdx) => (
                  <VStack key={`w-${wIdx}`} spacing={2} alignment="center">
                    {(week.days || []).slice(0, 7).map((day, dIdx) => (
                      <RoundedRectangle
                        key={`d-${wIdx}-${dIdx}`}
                        cornerRadius={1.5}
                        fill={getGithubContributionColor(day.level) as any}
                        frame={{ width: 7.5, height: 7.5 }}
                      />
                    ))}
                  </VStack>
                ))
              })()}
            </HStack>

            {/* 底部色块图例与统计 */}
            <HStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.8}>
                {`近 90 天: ${data.contributions?.total || 0} 次`}
              </Text>
              <Spacer />
              <HStack spacing={1.5} alignment="center">
                <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim}>少</Text>
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <RoundedRectangle
                    key={`lvl-${lvl}`}
                    cornerRadius={1}
                    fill={getGithubContributionColor(lvl) as any}
                    frame={{ width: 5.5, height: 5.5 }}
                  />
                ))}
                <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim}>多</Text>
              </HStack>
            </HStack>
          </VStack>
        ) : (
          <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity" }}>
            {top7.map((repo, i) => (
              // 固定行高：7 行仓库的基线完全等距，长仓库名不会把右侧数字挤走。
              <HStack
                key={repo.name || String(i)}
                alignment="center"
                spacing={4}
                frame={{ maxWidth: "infinity", height: 17 }}
              >
                <Text
                  font={HIG_FONT.caption}
                  fontWeight="bold"
                  foregroundStyle={i < 3 ? THEME.orange : THEME.dim}
                  monospacedDigit
                  frame={{ width: 10 }}
                >
                  {String(i + 1)}
                </Text>
                {/*
                  仓库名与右侧统计的字号此前都是 11pt/10pt，但仓库名带
                  layoutPriority 会把可用宽度全部吃掉，SwiftUI 转而压缩
                  两个统计列，读数被压到 8pt 以下 → 用户反馈「仓库名及后续
                  关联信息看不清」。这里给三列都明确的缩放下限，并让仓库名
                  主动省略号截断，保证统计数字始终保持可读字号。
                */}
                <Text
                  font={HIG_FONT.subhead}
                  fontWeight="semibold"
                  foregroundStyle={THEME.text}
                  lineLimit={1}
                  truncationMode="tail"
                  allowsTightening={true}
                  minScaleFactor={0.9}
                  // 仓库名吃剩余宽度并主动省略号截断；不能再给 layoutPriority，
                  // 否则它会抢光宽度，把右侧星标数字压成 0 宽而整块消失。
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                >
                  {repo.name}
                </Text>
                {/* 星标列固定宽度，与 Fork 列对称：两列都不会被仓库名挤没。 */}
                <HStack alignment="center" spacing={2.5} frame={{ width: 42, alignment: "trailing" }}>
                  <Image systemName="star.fill" font={HIG_FONT.caption} foregroundStyle={THEME.orange} />
                  <Text
                    font={HIG_FONT.subhead}
                    fontWeight="medium"
                    foregroundStyle={THEME.muted}
                    monospacedDigit
                    lineLimit={1}
                    allowsTightening={true}
                    minScaleFactor={0.9}
                  >
                    {String(repo.stars)}
                  </Text>
                </HStack>
                {/* 固定宽度让 7 行的 fork 数字右对齐。
                    42pt = 图标 9.5 + 间隔 2.5 + 三位数（11pt 下约 27pt），
                    刚好容纳且不浪费；相比 46pt 把省下的宽度还给仓库名，
                    减少长仓库名被截断的概率。 */}
                <HStack alignment="center" spacing={2.5} frame={{ width: 42, alignment: "trailing" }}>
                  <Image
                    systemName="arrow.triangle.branch"
                    font={HIG_FONT.caption}
                    foregroundStyle={THEME.purple}
                  />
                  <Text
                    font={HIG_FONT.subhead}
                    fontWeight="medium"
                    foregroundStyle={THEME.muted}
                    monospacedDigit
                    lineLimit={1}
                    allowsTightening={true}
                    minScaleFactor={0.9}
                  >
                    {String(repo.forks)}
                  </Text>
                </HStack>
              </HStack>
            ))}
          </VStack>
        )}
      </VStack>
    </HStack>
  )
}

/**
 * Loon 监控中号小组件 (参考图 2 风格)
 * 顶部 Loon 标题与刷新；中部累计下行与累计上行核心大指标（纵向分割线）；
 * 次级策略组数、实时延迟、剩余流量、运行模式四列网格；底部订阅统计与总额信息
 *
 * 配色：正文/数值统一走 THEME.text，标签走 THEME.dim，分割线走 THEME.border，
 * 保证浅色模式下不再出现「白字白底」不可读。
 */
export function LoonMediumCard({ data }: { data: LoonMonitorData }) {
  // 空状态：未配置订阅 / OpenAPI 或首次拉取失败时，不展示内置示例流量
  if (data.configured === false) {
    return (
      <EmptyStateCard
        icon="paperplane.fill"
        iconImage={brandIcon("loon")}
        title="Loon 监控"
        message={data.errorText || "尚未配置 Loon 订阅或 OpenAPI"}
        hint="在「哑巴面板」设置页填入 Loon 订阅链接或 OpenAPI 地址后即可显示流量"
      />
    )
  }

  /**
   * 次级指标单元：图标 + 标签一行，数值一行。
   *
   * `centered` 用于数值长度差异明显的列（如「实时延迟 37 ms」）——
   * 左对齐时该列的短数值会与相邻三列的长数值挤在同一视觉基线上，看起来
   * 参差不齐；居中后四列各自形成稳定的对称块，观感更整齐。
   */
  const stat = (
    icon: string,
    label: string,
    value: string,
    centered = false
  ) => (
    <VStack
      alignment={centered ? "center" : "leading"}
      spacing={3}
      frame={{ maxWidth: "infinity", alignment: centered ? "center" : "leading" }}
    >
      <HStack spacing={3} alignment="center">
        <Image systemName={icon} font={HIG_FONT.caption} foregroundStyle={THEME.blue} />
        <Text
          font={HIG_FONT.caption}
          foregroundStyle={THEME.dim}
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.7}
        >
          {label}
        </Text>
      </HStack>
      <Text
        font={HIG_FONT.statMedium}
        fontWeight="bold"
        foregroundStyle={THEME.text}
        monospacedDigit
        lineLimit={1}
        allowsTightening={true}
        minScaleFactor={0.65}
        frame={centered ? { maxWidth: "infinity", alignment: "center" } : undefined}
      >
        {value}
      </Text>
    </VStack>
  )

  return (
    <VStack
      alignment="leading"
      spacing={7}
      padding={{ top: 12, bottom: 10, leading: 16, trailing: 16 }}
      // frame 必须先于 widgetBackground，否则背景只铺满内容自然尺寸，
      // 边框外侧透出系统底色，表现为「一侧白、两侧灰」。
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* 顶部标题栏 */}
      <HStack alignment="center" spacing={6}>
        {/* Loon 官方图标（内嵌 Base64，与插件 #!icon 同源），
            替换原先的 paperplane.fill 通用符号 */}
        <BrandHeaderIcon
          iconName="paperplane.fill"
          iconColor={THEME.blue}
          iconImage={brandIcon("loon")}
          size={15}
        />
        <Text font={HIG_FONT.smallTitle} fontWeight="bold" foregroundStyle={THEME.text}>
          Loon
        </Text>
        {/* VPN 出口 IP 状态指示 */}
        <HStack spacing={3} alignment="center">
          <Circle
            fill={data.vpnIp && data.vpnIp !== "--" ? THEME.green : (THEME.dim as any)}
            frame={{ width: 5.5, height: 5.5 }}
          />
          <Text
            font={HIG_FONT.caption}
            fontWeight="medium"
            monospacedDigit
            foregroundStyle={THEME.text}
            lineLimit={1}
            minScaleFactor={0.7}
          >
            {data.vpnIp || "--"}
          </Text>
          {data.vpnLocation && data.vpnLocation !== "未连接" ? (
            <Text
              font={HIG_FONT.caption}
              foregroundStyle={THEME.dim}
              lineLimit={1}
              allowsTightening={true}
              minScaleFactor={0.7}
            >
              {data.vpnLocation}
            </Text>
          ) : null}
        </HStack>
        <Spacer />
        <Text font={HIG_FONT.subhead} foregroundStyle={THEME.dim}>
          {`更新 ${formatTime(data.updatedAt)}`}
        </Text>
        <Button intent={RefreshWidgetIntent(undefined)} buttonStyle="plain">
          <Image systemName="arrow.clockwise" font={HIG_FONT.body} foregroundStyle={THEME.blue} />
        </Button>
      </HStack>

      {/* 中部核心流量指标 (双指标 + 纵向分割线) */}
      <HStack alignment="center" spacing={0} frame={{ maxWidth: "infinity" }}>
        {/* 累计下行 */}
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack alignment="center" spacing={4}>
            <Image systemName="arrow.down.circle.fill" font={HIG_FONT.smallTitle} foregroundStyle={THEME.green} />
            <Text font={HIG_FONT.body} foregroundStyle={THEME.muted}>
              累计下行
            </Text>
          </HStack>
          <Text
            font={HIG_FONT.statLarge}
            fontWeight="bold"
            foregroundStyle={THEME.text}
            monospacedDigit
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.65}
          >
            {data.downloadText}
          </Text>
        </VStack>

        {/* 分割线 */}
        <RoundedRectangle
          cornerRadius={1}
          fill={THEME.borderSolid as any}
          frame={{ width: 1, height: 38 }}
        />

        {/* 累计上行 */}
        <VStack
          alignment="leading"
          spacing={3}
          padding={{ leading: 14 }}
          frame={{ maxWidth: "infinity" }}
        >
          <HStack alignment="center" spacing={4}>
            <Image systemName="arrow.up.circle.fill" font={HIG_FONT.smallTitle} foregroundStyle={THEME.orange} />
            <Text font={HIG_FONT.body} foregroundStyle={THEME.muted}>
              累计上行
            </Text>
          </HStack>
          <Text
            font={HIG_FONT.statLarge}
            fontWeight="bold"
            foregroundStyle={THEME.text}
            monospacedDigit
            lineLimit={1}
            allowsTightening={true}
            minScaleFactor={0.65}
          >
            {data.uploadText}
          </Text>
        </VStack>
      </HStack>

      {/* 次级 4 列指标网格 */}
      <HStack alignment="top" spacing={6} frame={{ maxWidth: "infinity" }}>
        {stat("network", "VPN 节点", data.nodeName || data.vpnIp || "当前节点")}
        {stat("bolt.horizontal.fill", "实时延迟", data.delayText, true)}
        {stat("globe", "剩余流量", data.remainingText)}
        {stat("dial.low.fill", "运行模式", data.runningMode)}
      </HStack>

      {/*
        底部状态栏：正常时显示订阅统计；本次刷新失败时**就地替换**为失败原因。

        data.errorText 只在「本次拉取失败」时由数据层写入（成功会清空）。
        此前失败时界面完全无变化，点右上角刷新看起来就是「没反应」。
        这里复用同一行而不是新增一行，避免撑破中号组件的高度预算。
      */}
      {data.errorText ? (
        <Text
          font={HIG_FONT.caption}
          foregroundStyle={THEME.orange}
          lineLimit={1}
          allowsTightening={true}
          minScaleFactor={0.6}
        >
          {data.errorText}
        </Text>
      ) : (
        <HStack alignment="center" spacing={0} frame={{ maxWidth: "infinity" }}>
          <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.75}>
            {`订阅统计 · ${data.resetDaysText}`}
          </Text>
          <Spacer />
          <Text font={HIG_FONT.caption} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.75}>
            {`策略组 ${data.policyGroupCount} · 总额 ${data.totalText}`}
          </Text>
        </HStack>
      )}
    </VStack>
  )
}
