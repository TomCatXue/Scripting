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
import { RefreshWidgetIntent } from "./app_intents"
import { THEME, formatTime, remainColor } from "./theme"
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
          fill={{ light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.08)" } as any}
        />
        <Circle
          stroke={{
            shapeStyle: { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.12)" } as any,
            strokeStyle: { lineWidth: 0.8 },
          }}
        />
        <Image
          systemName="arrow.triangle.2.circlepath"
          font={{ name: "system", size: 10.5 }}
          foregroundStyle={{ light: "#64748B", dark: "#94A3B8" } as any}
        />
      </ZStack>
    </Button>
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
  const cDim = { light: "#94A3B8", dark: "#64748B" } as any
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
        <Text font={18} fontWeight="bold" foregroundStyle={cTitle}>
          {data.title}
        </Text>
        <Circle fill={cGreen} frame={{ width: 7, height: 7 }} />
        <Spacer />
        <Text font={11.5} fontWeight="regular" foregroundStyle={cLabel}>
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
            <Text font={21} fontWeight="bold" foregroundStyle={cGreen} monospacedDigit lineLimit={1} minScaleFactor={0.7}>
              {`+${data.recent7Days}`}
            </Text>
            <Text font={10.5} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              近7日入库
            </Text>
          </VStack>
          <VStack alignment="center" spacing={3}>
            <Text font={21} fontWeight="bold" foregroundStyle={cGreen} monospacedDigit lineLimit={1} minScaleFactor={0.7}>
              {`+${data.todayAdded}`}
            </Text>
            <Text font={10.5} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
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
            <Text font={20} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1} minScaleFactor={0.7}>
              {data.movies.toLocaleString("en-US")}
            </Text>
            <Text font={10.5} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              电影
            </Text>
          </VStack>
          <Spacer />
          <VStack alignment="center" spacing={3}>
            <Text font={20} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1} minScaleFactor={0.7}>
              {data.shows.toLocaleString("en-US")}
            </Text>
            <Text font={10.5} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              剧集
            </Text>
          </VStack>
          <Spacer />
          <VStack alignment="center" spacing={3}>
            <Text font={20} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1} minScaleFactor={0.7}>
              {data.episodes.toLocaleString("en-US")}
            </Text>
            <Text font={10.5} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              分集
            </Text>
          </VStack>
        </HStack>
      </HStack>

      <Spacer minLength={10} />

      {/* 3. 最近入库板块 */}
      <VStack alignment="leading" spacing={5}>
        <Text font={11} fontWeight="medium" foregroundStyle={cLabel}>
          最近入库
        </Text>
        {data.recentItems.slice(0, 2).map((item) => (
          <HStack key={item.id} spacing={6} alignment="center">
            <Text font={10.5} fontWeight="medium" foregroundStyle={cDim} monospacedDigit>
              {item.id}
            </Text>
            <Image
              systemName="film"
              font={{ name: "system", size: 10 }}
              foregroundStyle={cFilm}
            />
            <Text
              font={11}
              fontWeight="regular"
              foregroundStyle={cText}
              lineLimit={1}
            >
              {item.title}
            </Text>
            <Spacer />
            <Text font={10.5} fontWeight="regular" foregroundStyle={cDim} monospacedDigit>
              {item.year}
            </Text>
          </HStack>
        ))}
      </VStack>

      <Spacer minLength={8} />

      {/* 4. 底栏：左侧版本/Slogan · 右侧更新时间 */}
      <HStack spacing={6} alignment="center">
        <Text font={10} fontWeight="regular" foregroundStyle={cDim} lineLimit={1}>
          {data.footerTag}
        </Text>
        <Spacer />
        <Text font={10} fontWeight="regular" foregroundStyle={cDim} monospacedDigit>
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
                font={13.5}
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
      <Text font={10.5} fontWeight="medium" foregroundStyle={THEME.dim}>
        {data.mainLabel}
      </Text>

      {/* 主大数值 */}
      <HStack alignment="lastTextBaseline" spacing={2}>
        {data.prefix ? (
          <Text font={19} fontWeight="bold" foregroundStyle={mainNumColor}>
            {data.prefix}
          </Text>
        ) : null}
        <Text
          font={27}
          fontWeight="bold"
          foregroundStyle={mainNumColor}
          monospacedDigit
          lineLimit={1}
          minScaleFactor={0.6}
        >
          {data.mainValue}
        </Text>
        {isCpamp && (
          <Text
            font={14}
            fontWeight="bold"
            foregroundStyle={THEME.orange}
            monospacedDigit
          >
            {` ${data.costStr || "$85.06"}`}
          </Text>
        )}
      </HStack>

      <Spacer minLength={7} />

      {/* 进度条 + 右侧百分比 (单行并排对齐，绝不错行) */}
      <HStack spacing={6} alignment="center">
        <ProgressBar value={data.progressPct} color={pColor} height={4.5} />
        <Text font={10.5} fontWeight="bold" foregroundStyle={pColor} monospacedDigit>
          {`${Math.round(data.progressPct)}%`}
        </Text>
      </HStack>

      <Spacer minLength={7} />

      {/* 中间统计行 */}
      <HStack spacing={6} alignment="center">
        {isWorkBuddy ? (
          <>
            <HStack spacing={3} alignment="center">
              <Text font={10} foregroundStyle={THEME.dim} lineLimit={1}>已签</Text>
              <Text font={10.5} fontWeight="bold" foregroundStyle={THEME.green} monospacedDigit lineLimit={1}>
                {data.subValue1}
              </Text>
            </HStack>
            <Spacer />
            <HStack spacing={3} alignment="center">
              <Text font={10} foregroundStyle={THEME.dim} lineLimit={1}>已用</Text>
              <Text font={10.5} fontWeight="bold" foregroundStyle={THEME.orange} monospacedDigit lineLimit={1}>
                {data.subValue2}
              </Text>
            </HStack>
          </>
        ) : isDeepSeek ? (
          <HStack spacing={0} alignment="center" frame={{ maxWidth: "infinity" }}>
            <HStack spacing={3} alignment="center">
              <Text font={9.5} foregroundStyle={THEME.dim} lineLimit={1}>
                {data.subLabel1 || "状态"}
              </Text>
              <Text font={10} fontWeight="medium" foregroundStyle={THEME.green} lineLimit={1}>
                {data.subValue1 || "正常"}
              </Text>
            </HStack>
            <Spacer />
            <HStack spacing={3} alignment="center">
              <Text font={9.5} foregroundStyle={THEME.dim} lineLimit={1}>
                {data.subLabel2 || "近7日消费"}
              </Text>
              <Text
                font={10}
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
              <Text font={10} foregroundStyle={THEME.dim} lineLimit={1}>成功</Text>
              <Text font={10.5} fontWeight="bold" foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
                {data.subValue1 || "893"}
              </Text>
            </HStack>
            <Spacer />
            <HStack spacing={3} alignment="center">
              <Text font={10} foregroundStyle={THEME.dim} lineLimit={1}>失败</Text>
              <Text font={10.5} fontWeight="bold" foregroundStyle={THEME.red} monospacedDigit lineLimit={1}>
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
          font={8.5}
          fontWeight={isDeepSeek ? "medium" : "regular"}
          foregroundStyle={isDeepSeek ? THEME.green : THEME.dim}
          lineLimit={1}
          minScaleFactor={0.75}
        >
          {data.footerLeft}
        </Text>
        <Spacer minLength={4} />
        <Text
          font={8.5}
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
        <Text font={13.5} fontWeight="bold" foregroundStyle={THEME.text}>
          {data.brandTitle}
        </Text>
        <Spacer />
        <RefreshButton />
      </HStack>

      <Spacer minLength={6} />

      {/* 第 1 段额度：上行纯文字标签+倒计时靠右对齐，下行进度条+百分比 */}
      <VStack alignment="leading" spacing={3}>
        <HStack spacing={5} alignment="center">
          <Text font={10.5} fontWeight="medium" foregroundStyle={THEME.dim} lineLimit={1}>
            {data.item1.label}
          </Text>
          <Spacer />
          <Text font={9.5} foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
            {data.item1.timer.replace(/后?刷新$/, "").trim()}
          </Text>
        </HStack>
        <HStack spacing={6} alignment="center">
          <ProgressBar value={data.item1.pct} color={c1} height={4.5} />
          <Text font={10.5} fontWeight="bold" foregroundStyle={c1} monospacedDigit lineLimit={1}>
            {`${Math.round(data.item1.pct)}%`}
          </Text>
        </HStack>
      </VStack>

      <Spacer minLength={6} />

      {/* 第 2 段额度：上行纯文字标签+倒计时靠右对齐，下行进度条+百分比 */}
      <VStack alignment="leading" spacing={3}>
        <HStack spacing={5} alignment="center">
          <Text font={10.5} fontWeight="medium" foregroundStyle={THEME.dim} lineLimit={1}>
            {data.item2.label}
          </Text>
          <Spacer />
          <Text font={9.5} foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
            {data.item2.timer.replace(/后?刷新$/, "").trim()}
          </Text>
        </HStack>
        <HStack spacing={6} alignment="center">
          <ProgressBar value={data.item2.pct} color={c2} height={4.5} />
          <Text font={10.5} fontWeight="bold" foregroundStyle={c2} monospacedDigit lineLimit={1}>
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
            <Text font={9} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.8}>
              {data.stat1.label}
            </Text>
            <Text font={9.5} fontWeight="bold" foregroundStyle={cStat1} monospacedDigit lineLimit={1}>
              {data.stat1.value}
            </Text>
          </HStack>
          <Spacer />
          {/* 右侧：C/G 周 % */}
          <HStack spacing={4} alignment="center">
            <Text font={9} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.8}>
              {data.stat2.label}
            </Text>
            <Text font={9.5} fontWeight="bold" foregroundStyle={cStat2} monospacedDigit lineLimit={1}>
              {data.stat2.value}
            </Text>
          </HStack>
        </HStack>
      ) : (
        <HStack spacing={3} alignment="center">
          <Text font={9} foregroundStyle={THEME.dim} lineLimit={1}>
            {data.stat1.label}
          </Text>
          <Text font={9.5} fontWeight="bold" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.stat1.value.replace(/[^0-9]/g, "") || data.stat1.value}
          </Text>
          <Text font={9} foregroundStyle={THEME.dim} lineLimit={1}>
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
            <Text font={9} foregroundStyle={THEME.dim} lineLimit={1}>最紧</Text>
            <Text font={9} fontWeight="bold" foregroundStyle={cTight} monospacedDigit lineLimit={1}>
              {data.footerStatus.replace(/最紧|最低/g, "").trim() || "0%"}
            </Text>
          </HStack>
        ) : (
          <Text font={9} foregroundStyle={THEME.dim} lineLimit={1}>
            {data.footerStatus}
          </Text>
        )}
        <Spacer />
        <Text font={9} foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
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
          font={{ name: "system", size: 14 }}
          foregroundStyle={cGreen}
        />
        <Text font={13.5} fontWeight="bold" foregroundStyle={cGreen}>
          {data.statusTitle}
        </Text>
        <Spacer />
        <RefreshButton />
      </HStack>

      <Spacer minLength={8} />

      {/* 主 IP 地址 */}
      <Text
        font={19}
        fontWeight="bold"
        foregroundStyle={cIp}
        monospacedDigit
        lineLimit={1}
      >
        {data.ip}
      </Text>

      <Spacer minLength={6} />

      {/* 归属地与 ISP 服务商 */}
      <VStack alignment="leading" spacing={2}>
        <Text font={12} fontWeight="bold" foregroundStyle={THEME.text} lineLimit={1}>
          {data.location}
        </Text>
        <Text font={10} foregroundStyle={THEME.dim} lineLimit={1}>
          {data.isp}
        </Text>
      </VStack>

      <Spacer minLength={6} />

      {/* 风险条 */}
      <HStack spacing={6} alignment="center">
        <Text font={10} foregroundStyle={THEME.dim}>
          风险
        </Text>
        <ProgressBar value={data.riskPct} color={THEME.orange} height={4.5} />
        <Text font={10.5} fontWeight="bold" foregroundStyle={THEME.orange} monospacedDigit>
          {`${Math.round(data.riskPct)}%`}
        </Text>
      </HStack>

      <Spacer minLength={0} />

      {/* 底栏 */}
      <HStack spacing={8} alignment="center">
        <Text font={9.5} fontWeight="medium" foregroundStyle={cGreen} lineLimit={1}>
          {data.tag1}
        </Text>
        <Text font={9.5} foregroundStyle={THEME.dim} lineLimit={1}>
          {data.tag2}
        </Text>
        <Spacer />
        <Text font={9.5} foregroundStyle={THEME.dim} monospacedDigit lineLimit={1}>
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
  // 油价暂无逐日历史序列，用「上期 → 本期」两点构造走势；
  // 若后续接入真实历史，只需替换 history 即可复用同一模板。
  const current = Number(data.focusPrice) || 0
  const trend = String(data.smallTrend || "")
  const isDown = trend.includes("跌") || trend.includes("下调") || trend.includes("-")
  const delta = Math.abs(current * 0.012)
  const prev = isDown ? current + delta : current - delta
  const history = [
    { label: "上期", value: Number(prev.toFixed(2)) },
    { label: "本期", value: current },
  ]
  const dif = current - prev
  const rate = prev !== 0 ? (dif / prev) * 100 : 0

  return (
    <TrendSmallTemplate
      title={data.oilName || "92# 汽油"}
      subtitle={data.subTitle || `${data.province || ""}实时油价`}
      data={history}
      priceText={current.toFixed(2)}
      changeText={signedText(dif)}
      rateText={signedText(rate, 2, "%")}
      isUp={!isDown}
      footnote={data.cleanDateText || undefined}
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
  // 油价暂无逐日历史，用 92# 上期→本期两点构造走势；接入真实历史后替换即可
  const current = Number(data.focusPrice) || 0
  const trendText = String(data.smallTrend || "")
  const isDown = trendText.includes("跌") || trendText.includes("下调") || trendText.includes("-")
  const delta = Math.abs(current * 0.012)
  const prev = isDown ? current + delta : current - delta
  const marks = [
    { label: "上期", value: Number(prev.toFixed(2)) },
    { label: "本期", value: current },
  ]
  const color = isDown
    ? ({ light: "#00B368", dark: "#30D158" } as any)
    : ({ light: "#FF3B30", dark: "#FF453A" } as any)

  return (
    <MarketMediumTemplate
      iconName="fuelpump.fill"
      iconColor="#F59E0B"
      title={`${data.province || ""}实时油价`}
      badgeText={data.smallTrend || "--"}
      badgeColor={color}
      badgeBg={isDown ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)"}
      items={items}
      trendData={marks}
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
  return (
    <AiSmallTemplate
      brand="WorkBuddy"
      iconImage={data.iconImage || brandIcon("workbuddy")}
      cells={[
        { icon: "circle.grid.3x3.fill", iconColor, label: "积分剩余", value: data.mainValue || "0" },
        { icon: "doc.plaintext", iconColor, label: "已用", value: data.subValue2 || "--" },
        { icon: "checkmark.circle", iconColor, label: "已签", value: data.subValue1 || "--" },
        {
          icon: "calendar",
          iconColor,
          label: "有效期",
          value: validDays ? (validDays.replace(/[^0-9]/g, "") || "--") : "--",
          suffix: validDays ? "天" : undefined,
        },
      ]}
      progressPct={data.progressPct || 0}
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
  const fiveHourPct = Math.round(data.item1?.pct ?? 0)
  const weekPct = Math.round(data.item2?.pct ?? 0)
  const resetCount = (data.stat1?.value || "0").replace(/[^0-9]/g, "") || "0"

  return (
    <AiSmallTemplate
      brand="Codex"
      iconImage={data.iconImage || brandIcon("codex")}
      cells={[
        { icon: "clock", iconColor, label: "5小时额度", value: `${fiveHourPct}%` },
        { icon: "calendar.badge.clock", iconColor, label: "周额度", value: `${weekPct}%` },
        { icon: "arrow.clockwise", iconColor, label: "可重置次数", value: resetCount, suffix: "次" },
        { icon: "chart.bar.fill", iconColor, label: "剩余", value: `${fiveHourPct}%` },
      ]}
      progressPct={fiveHourPct}
      footerLeft={`更新于 ${formatTime(data.updatedAt)}`}
      footerRight="服务在线 ●"
      footerRightColor={THEME.green}
    />
  )
}

export function AntigravitySmallCard({ data }: { data: DualQuotaData }) {
  const iconColor = { light: "#6366F1", dark: "#818CF8" } as any
  const gemTimer = data.item1?.timer || "--"
  const cgTimer = data.item2?.timer || "--"
  const gemWeek = String(data.stat1?.value || `${Math.round(data.item1?.pct ?? 0)}%`)
  const cgWeek = String(data.stat2?.value || `${Math.round(data.item2?.pct ?? 0)}%`)
  const tightest = `${Math.min(Math.round(data.item1?.pct ?? 0), Math.round(data.item2?.pct ?? 0))}%`

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
      footerLeft="最新"
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

function BentoCard({
  iconName,
  iconColor,
  title,
  mainValue,
  subLabel,
  tagText,
  isUp,
  progress = 0.6,
}: {
  iconName: string
  iconColor: any
  title: string
  mainValue: string
  subLabel: string
  tagText: string
  isUp?: boolean
  progress?: number
}) {
  const tagBg = isUp ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)"
  const tagColor = isUp ? THEME.red : THEME.green

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={10}
      frame={{ maxWidth: "infinity" }}
      widgetBackground={{ light: "#F8FAFC", dark: "#1E222B" }}
    >
      {/* 顶部标题行 */}
      <HStack spacing={4} alignment="center">
        <Image systemName={iconName} font={{ name: "system", size: 15 }} foregroundStyle={iconColor} />
        <Text font={11} fontWeight="bold" foregroundStyle={THEME.text}>{title}</Text>
        <Spacer />
        {tagText && (
          <HStack padding={{ top: 1, bottom: 1, leading: 4, trailing: 4 }} widgetBackground={tagBg}>
            <Text font={9} fontWeight="bold" foregroundStyle={tagColor}>{tagText}</Text>
          </HStack>
        )}
      </HStack>

      <Spacer minLength={4} />

      {/* 主大字 */}
      <Text font={18} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1} minScaleFactor={0.65}>
        {mainValue}
      </Text>

      <Spacer minLength={2} />

      {/* 底部副标题 */}
      <Text font={9.5} foregroundStyle={THEME.dim} lineLimit={1}>
        {subLabel}
      </Text>

      <Spacer minLength={6} />

      {/* 卡片底部微型胶囊进度条 */}
      <ZStack frame={{ maxWidth: "infinity", height: 3.5 }}>
        <RoundedRectangle
          fill={{ light: "#E2E8F0", dark: "#334155" }}
          cornerRadius={2}
          frame={{ maxWidth: "infinity", height: 3.5 }}
        />
        <HStack>
          <RoundedRectangle
            fill={iconColor}
            cornerRadius={2}
            frame={{ width: Math.round(110 * progress), height: 3.5 }}
          />
          <Spacer />
        </HStack>
      </ZStack>
    </VStack>
  )
}

export function BentoLargeGridCard({
  gold,
  deepseek,
  fuel,
  modules = ["gold", "deepseek", "fx", "oil"],
}: {
  gold: GoldMarketData
  deepseek: MetricBalanceData
  fuel: FuelCardData
  modules?: string[]
}) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={14}
      widgetBackground={THEME.bg}
    >
      {/* 主控顶部状态栏 */}
      <HStack spacing={6} alignment="center" frame={{ height: 20 }}>
        <Image systemName="square.grid.2x2.fill" font={{ name: "system", size: 14 }} foregroundStyle={THEME.blue} />
        <Text font={13.5} fontWeight="heavy" foregroundStyle={THEME.text}>哑巴面板监控总览</Text>
        <Spacer />
        <RefreshButton />
        <Spacer minLength={4} />
        <Text font={10} foregroundStyle={THEME.dim} monospacedDigit>{`更新于 ${formatTime(gold.updatedAt)}`}</Text>
      </HStack>

      <Spacer minLength={10} />

      {/* 2x2 Bento 栅格网格 */}
      <HStack spacing={10}>
        <BentoCard
          iconName="centsign.circle.fill"
          iconColor={{ light: "#F59E0B", dark: "#FBBF24" }}
          title="Au9999 金价"
          mainValue={`¥${gold.auPrice}`}
          subLabel={`周大福 ¥${gold.chowTaiFook}`}
          tagText={`${gold.auChange} (${gold.auChangeRate})`}
          isUp={gold.isUp}
          progress={0.75}
        />
        <BentoCard
          iconName="sparkles"
          iconColor={{ light: "#1E60FF", dark: "#3B82F6" }}
          title="DeepSeek 余额"
          mainValue={`¥${deepseek.mainValue || "1.86"}`}
          subLabel={`近7日消费 ${deepseek.subValue2 || "¥5.39"}`}
          tagText="官方直连"
          isUp={true}
          progress={0.6}
        />
      </HStack>

      <Spacer minLength={10} />

      <HStack spacing={10}>
        <BentoCard
          iconName="dollarsign.arrow.circlepath"
          iconColor={{ light: "#6366F1", dark: "#818CF8" }}
          title="USD / CNY 汇率"
          mainValue="7.1425"
          subLabel="离岸人民币现汇"
          tagText="-0.17%"
          isUp={false}
          progress={0.45}
        />
        <BentoCard
          iconName="fuelpump.fill"
          iconColor={{ light: "#F97316", dark: "#FB923C" }}
          title={`${fuel.province || "北京"} ${fuel.focusOilKey?.toUpperCase() || "92#"} 汽油`}
          mainValue={`¥${fuel.focusPrice || "7.88"}/L`}
          subLabel={fuel.mediumForecast || fuel.rawForecast || "下次调价近期"}
          tagText="下调预期"
          isUp={false}
          progress={0.65}
        />
      </HStack>
    </VStack>
  )
}
