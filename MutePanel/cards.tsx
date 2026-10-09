// @ts-nocheck
/// <reference path="./global.d.ts" />
import {
  Button,
  Chart,
  AreaChart,
  LineChart,
  RuleLineForValueChart,
  ChartPlotStyle,
  Circle,
  GeometryReader,
  HStack,
  Image,
  RoundedRectangle,
  SVG,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "scripting"
import { RefreshWidgetIntent } from "./app_intents"
import { THEME, formatTime, remainColor } from "./theme"
import {
  DualQuotaData,
  FuelCardData,
  GoldMarketData,
  AuxiliaryMarketData,
  MediaNexusData,
  MetricBalanceData,
  VpnNodeData,
  DEEPSEEK_WHALE_SVG,
  DEEPSEEK_LOGO_SVG,
} from "./types"

// ── 品牌图标渲染（支持 SVG、UIImage、本地图片、SF Symbol）──
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
  if (iconPath) {
    const p = typeof iconPath === "string" ? iconPath : iconPath.light
    const resolved = p.startsWith("/") ? p : `${FileManager.documentsDirectory}/scripts/MutePanel/${p}`
    if (FileManager.existsSync(resolved) || FileManager.existsSync(p)) {
      return (
        <Image
          filePath={iconPath}
          resizable={true}
          frame={{ width: size, height: size }}
        />
      )
    }
  }
  if (iconImage) {
    return (
      <Image
        image={iconImage}
        resizable={true}
        frame={{ width: size, height: size }}
      />
    )
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
            <Text font={21} fontWeight="bold" foregroundStyle={cGreen} monospacedDigit lineLimit={1}>
              {`+${data.recent7Days}`}
            </Text>
            <Text font={10.5} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              近7日入库
            </Text>
          </VStack>
          <VStack alignment="center" spacing={3}>
            <Text font={21} fontWeight="bold" foregroundStyle={cGreen} monospacedDigit lineLimit={1}>
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
            <Text font={20} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1}>
              {data.movies.toLocaleString("en-US")}
            </Text>
            <Text font={10.5} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              电影
            </Text>
          </VStack>
          <Spacer />
          <VStack alignment="center" spacing={3}>
            <Text font={20} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1}>
              {data.shows.toLocaleString("en-US")}
            </Text>
            <Text font={10.5} fontWeight="regular" foregroundStyle={cLabel} lineLimit={1}>
              剧集
            </Text>
          </VStack>
          <Spacer />
          <VStack alignment="center" spacing={3}>
            <Text font={20} fontWeight="bold" foregroundStyle={cBlue} monospacedDigit lineLimit={1}>
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
  const logoPath = `${FileManager.documentsDirectory}/scripts/DashBoard-Kit/assets/shell_logo.png`
  const hasLogoFile = FileManager.existsSync(logoPath)

  return (
    <ZStack
      alignment="topLeading"
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{
        light: "#FFFFFF",
        dark: "#161719",
      }}
    >
      {/* 底层左上角贝壳水印：放大并超出边框，更靠左上偏置，清爽淡雅防重叠 */}
      <HStack alignment="top">
        {hasLogoFile ? (
          <Image
            filePath={logoPath}
            resizable={true}
            scaleToFit={true}
            opacity={0.18}
            frame={{ width: 150, height: 150 }}
            offset={{ x: -40, y: -30 }}
          />
        ) : (
          <Image
            systemName="fuelpump.fill"
            font={85}
            opacity={0.09}
            foregroundStyle="#F59E0B"
            offset={{ x: -25, y: -20 }}
          />
        )}
        <Spacer />
      </HStack>

      {/* 前景层：自然靠右，保留合适内边距避免超出边界 */}
      <HStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <Spacer />
        <VStack
          alignment="trailing"
          spacing={0}
          padding={{ top: 12, bottom: 12, trailing: 10 }}
        >
          {/* 顶部标签 + 油品名 */}
          <HStack alignment="center" spacing={3}>
            <HStack
              alignment="center"
              padding={{ top: 1.5, bottom: 1.5, leading: 4, trailing: 4 }}
              background="rgba(245, 158, 11, 0.16)"
              clipShape={{ type: "rect", cornerRadius: 3.5 }}
            >
              <Text
                font="caption2"
                fontWeight="bold"
                foregroundStyle="#D97706"
              >
                OIL
              </Text>
            </HStack>
            <Text
              font="title3"
              fontWeight="heavy"
              foregroundStyle={{
                light: "#000000",
                dark: "#FFFFFF",
              }}
            >
              {data.oilName}
            </Text>
          </HStack>

          {/* 省份油品全称 */}
          <Text
            font="caption2"
            fontWeight="medium"
            foregroundStyle={{
              light: "#8E8E93",
              dark: "rgba(255, 255, 255, 0.55)",
            }}
            padding={{ top: 1.5 }}
          >
            {data.subTitle}
          </Text>

          <Spacer />

          {/* 调价预测 */}
          <Text
            font="footnote"
            fontWeight="bold"
            foregroundStyle={data.trendColor as any}
          >
            {data.smallTrend}
          </Text>

          {/* 现价大字 */}
          <HStack alignment="lastTextBaseline" spacing={1.5} padding={{ top: 1 }}>
            <Text
              font="subheadline"
              fontWeight="bold"
              foregroundStyle={{
                light: "#000000",
                dark: "#FFFFFF",
              }}
            >
              ¥
            </Text>
            <Text
              font="title"
              fontWeight="heavy"
              foregroundStyle={{
                light: "#000000",
                dark: "#FFFFFF",
              }}
            >
              {data.focusPrice}
            </Text>
          </HStack>

          <Spacer />

          {/* 调价日期 */}
          <Text
            font="caption2"
            fontWeight="medium"
            foregroundStyle={{
              light: "#8E8E93",
              dark: "rgba(255, 255, 255, 0.45)",
            }}
          >
            {data.cleanDateText}
          </Text>
        </VStack>
      </HStack>
    </ZStack>
  )
}

// ============================================================
// 8. 今日油价中号小组件（风格一：4联卡片极简行情，双尺寸自适应）
// ============================================================
export function FuelPriceMediumCard({ data }: { data: FuelCardData }) {
  const cardItems = [
    {
      name: "92 号",
      price: data.prices?.oil92 || "--",
      textColor: "#E5933A",
      tagBg: "rgba(229, 147, 58, 0.18)",
    },
    {
      name: "95 号",
      price: data.prices?.oil95 || "--",
      textColor: "#E6674E",
      tagBg: "rgba(230, 103, 78, 0.18)",
    },
    {
      name: "98 号",
      price: data.prices?.oil98 || "--",
      textColor: "#E05268",
      tagBg: "rgba(224, 82, 104, 0.18)",
    },
    {
      name: "柴油",
      price: data.prices?.oil0 || "--",
      textColor: "#34C759",
      tagBg: "rgba(52, 199, 89, 0.18)",
    },
  ]

  const mediumForecast = data.mediumForecast || `${data.cleanDateText} ${data.smallTrend}`

  return (
    <VStack
      alignment="leading"
      padding={{ top: 12, bottom: 10, leading: 6, trailing: 6 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{
        light: "#FFFFFF",
        dark: "#161719",
      }}
    >
      {/* 顶部 Header：左侧省份靠最左，右侧时间靠最右 */}
      <HStack alignment="center" padding={{ leading: 4, trailing: 4 }}>
        <HStack alignment="center" spacing={4}>
          <Image
            systemName="fuelpump.fill"
            font="caption"
            foregroundStyle="#F59E0B"
          />
          <Text
            font="caption"
            fontWeight="bold"
            foregroundStyle={{
              light: "#1C1C1E",
              dark: "#FFFFFF",
            }}
          >
            {data.province}实时油价
          </Text>
        </HStack>
        <Spacer />
        <Text
          font="caption2"
          fontWeight="medium"
          foregroundStyle={{
            light: "rgba(60, 60, 67, 0.85)",
            dark: "rgba(255, 255, 255, 0.85)",
          }}
        >
          {mediumForecast}
        </Text>
      </HStack>

      <Spacer />

      {/* 中部 4 联卡片 */}
      <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
        {cardItems.map((item) => (
          <VStack
            key={item.name}
            alignment="center"
            spacing={6}
            frame={{ maxWidth: "infinity" }}
          >
            {/* 上层：油号色块 */}
            <HStack
              alignment="center"
              padding={{ top: 2.5, bottom: 2.5, leading: 7, trailing: 7 }}
              background={item.tagBg as any}
              clipShape={{ type: "rect", cornerRadius: 5 }}
            >
              <Text
                font="caption2"
                fontWeight="bold"
                foregroundStyle={item.textColor as any}
                lineLimit={1}
                allowsTightening={true}
              >
                {item.name}
              </Text>
            </HStack>

            {/* 下层：价格底块 */}
            <HStack
              alignment="center"
              padding={{ top: 6, bottom: 6, leading: 4, trailing: 4 }}
              background={{
                light: "rgba(0, 0, 0, 0.05)",
                dark: "rgba(255, 255, 255, 0.09)",
              }}
              clipShape={{ type: "rect", cornerRadius: 8 }}
              frame={{ maxWidth: "infinity" }}
            >
              <Spacer />
              <Text
                font="headline"
                fontWeight="bold"
                foregroundStyle={{
                  light: "#000000",
                  dark: "#FFFFFF",
                }}
                lineLimit={1}
                allowsTightening={true}
                minScaleFactor={0.8}
              >
                {item.price}
              </Text>
              <Spacer />
            </HStack>
          </VStack>
        ))}
      </HStack>

      <Spacer />

      {/* 底部 Footer */}
      <HStack alignment="center" padding={{ leading: 4, trailing: 4 }}>
        <Text
          font="caption2"
          fontWeight="regular"
          foregroundStyle={{
            light: "rgba(60, 60, 67, 0.45)",
            dark: "rgba(255, 255, 255, 0.45)",
          }}
        >
          {formatTime(data.updatedAt)} 更新
        </Text>
        <Spacer />
        <Text
          font="caption2"
          fontWeight="regular"
          foregroundStyle={{
            light: "rgba(60, 60, 67, 0.45)",
            dark: "rgba(255, 255, 255, 0.45)",
          }}
        >
          元/升
        </Text>
      </HStack>
    </VStack>
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
  const marks = data.history30d?.length > 0 ? data.history30d : [
    { label: "10-01", value: 895 },
    { label: "10-05", value: 898 },
    { label: "10-08", value: 892 },
    { label: "10-09", value: 904.48 },
  ]
  const minY = data.minPrice || Math.min(...marks.map(m => m.value))
  const maxY = data.maxPrice || Math.max(...marks.map(m => m.value))
  const color = data.isUp ? THEME.red : THEME.green

  return (
    <ZStack
      alignment="topLeading"
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{
        light: "#FFFFFF",
        dark: "#161719",
      }}
    >
      {/* 底层左上角金色徽标水印：参考油价贝壳高光质感 */}
      <HStack alignment="top">
        <Image
          systemName="centsign.circle.fill"
          font={90}
          opacity={0.08}
          foregroundStyle="#F59E0B"
          offset={{ x: -25, y: -20 }}
        />
        <Spacer />
      </HStack>

      {/* 前景层 */}
      <VStack
        alignment="leading"
        spacing={0}
        padding={{ top: 12, bottom: 10, leading: 13, trailing: 13 }}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      >
        {/* 顶部 Header：左侧数据源标签 + 右侧刷新按钮与时间 */}
        <HStack alignment="center" frame={{ height: 18 }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="sparkles"
              font={{ name: "system", size: 12 }}
              foregroundStyle="#F59E0B"
            />
            <Text font={12.5} fontWeight="bold" foregroundStyle={THEME.text}>
              {data.sourceName || "上金所金价"}
            </Text>
          </HStack>
          <Spacer />
          <RefreshButton />
        </HStack>

        <Spacer minLength={4} />

        {/* 主数值与涨跌区：参考油价右对齐大字 */}
        <HStack alignment="lastTextBaseline">
          <VStack alignment="leading" spacing={1}>
            <Text font={9.5} foregroundStyle={THEME.dim}>
              {data.subTitle || "实时基准价"}
            </Text>
            <HStack spacing={3} alignment="center">
              <Text font={11} fontWeight="bold" foregroundStyle={color}>
                {data.changeValue}
              </Text>
              <Text font={11} fontWeight="bold" foregroundStyle={color}>
                ({data.changeRate})
              </Text>
            </HStack>
          </VStack>
          <Spacer />
          <HStack alignment="lastTextBaseline" spacing={2}>
            <Text font={16} fontWeight="heavy" foregroundStyle="#F59E0B">
              ¥
            </Text>
            <Text
              font={28}
              fontWeight="heavy"
              foregroundStyle={THEME.text}
              monospacedDigit
              lineLimit={1}
            >
              {data.focusPrice || "904.48"}
            </Text>
          </HStack>
        </HStack>

        <Spacer minLength={4} />

        {/* 底部折线走势图：真实上金所 30 日走势折线图 */}
        <VStack spacing={0} frame={{ maxWidth: "infinity", height: 42 }}>
          <Chart chartXAxis="hidden" chartYAxis="hidden" frame={{ height: 42 }}>
            <AreaChart
              marks={marks.map((m) => ({
                label: m.label,
                value: m.value - minY + (minY * 0.05),
                interpolationMethod: "catmullRom",
                foregroundStyle: [color, "rgba(0, 0, 0, 0)"],
                opacity: 0.35,
              }))}
            />
            <LineChart
              marks={marks.map((m) => ({
                label: m.label,
                value: m.value - minY + (minY * 0.05),
                interpolationMethod: "catmullRom",
                foregroundStyle: color,
                lineStyle: { lineWidth: 2, lineCap: "round", lineJoin: "round" },
              }))}
            />
            <RuleLineForValueChart
              marks={[
                {
                  value: (maxY + minY) / 2 - minY + (minY * 0.05),
                  lineStyle: { dash: [3, 2] },
                  foregroundStyle: color,
                  opacity: 0.35,
                },
              ]}
            />
          </Chart>
        </VStack>
      </VStack>
    </ZStack>
  )
}

/** 中号黄金组件：参考今日油价 4 联卡片设计（Au9999 / 黄金T+D / 周大福 / 招行/浙商金价） + 底部上金所折线图 */
export function GoldPriceMediumCard({ data }: { data: GoldMarketData }) {
  const cardItems = [
    {
      name: "Au9999",
      price: data.prices?.au9999 || "904.48",
      textColor: "#E5933A",
      tagBg: "rgba(229, 147, 58, 0.18)",
    },
    {
      name: "黄金T+D",
      price: data.prices?.autd || "904.20",
      textColor: "#E6674E",
      tagBg: "rgba(230, 103, 78, 0.18)",
    },
    {
      name: "周大福",
      price: data.prices?.chowTaiFook || "1045",
      textColor: "#E05268",
      tagBg: "rgba(224, 82, 104, 0.18)",
    },
    {
      name: "招行/浙商",
      price: data.prices?.cmbBuy || data.prices?.zsPrice || "905.97",
      textColor: "#34C759",
      tagBg: "rgba(52, 199, 89, 0.18)",
    },
  ]

  const marks = data.history30d?.length > 0 ? data.history30d : [
    { label: "10-01", value: 895 },
    { label: "10-05", value: 898 },
    { label: "10-08", value: 892 },
    { label: "10-09", value: 904.48 },
  ]
  const minY = data.minPrice || Math.min(...marks.map(m => m.value))
  const maxY = data.maxPrice || Math.max(...marks.map(m => m.value))
  const color = data.isUp ? THEME.red : THEME.green

  return (
    <VStack
      alignment="leading"
      padding={{ top: 12, bottom: 10, leading: 10, trailing: 10 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={{
        light: "#FFFFFF",
        dark: "#161719",
      }}
    >
      {/* 顶部 Header：左侧数据源标签 + 右侧涨跌与时间 */}
      <HStack alignment="center" padding={{ leading: 4, trailing: 4 }}>
        <HStack alignment="center" spacing={4}>
          <Image
            systemName="centsign.circle.fill"
            font={{ name: "system", size: 14 }}
            foregroundStyle="#F59E0B"
          />
          <Text font={14} fontWeight="bold" foregroundStyle={THEME.text}>
            {data.sourceName || "上海黄金交易所"}
          </Text>
          <HStack
            padding={{ top: 1, bottom: 1, leading: 5, trailing: 5 }}
            widgetBackground={data.isUp ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)"}
          >
            <Text font={9.5} fontWeight="bold" foregroundStyle={color}>
              {`${data.changeValue} (${data.changeRate})`}
            </Text>
          </HStack>
        </HStack>
        <Spacer />
        <RefreshButton />
        <Spacer minLength={4} />
        <Text font={10} foregroundStyle={THEME.dim} monospacedDigit>
          {`更新于 ${formatTime(data.updatedAt)}`}
        </Text>
      </HStack>

      <Spacer minLength={6} />

      {/* 4 联卡片设计：完全复刻油价中号卡片结构 */}
      <HStack spacing={6}>
        {cardItems.map((item, idx) => (
          <VStack
            key={idx}
            alignment="leading"
            spacing={2}
            padding={{ top: 6, bottom: 6, leading: 8, trailing: 8 }}
            frame={{ maxWidth: "infinity" }}
            widgetBackground={{
              light: "#F8FAFC",
              dark: "#1E222B",
            }}
          >
            <HStack alignment="center">
              <Text
                font={10}
                fontWeight="bold"
                foregroundStyle={item.textColor}
                padding={{ top: 1, bottom: 1, leading: 4, trailing: 4 }}
                widgetBackground={item.tagBg}
              >
                {item.name}
              </Text>
              <Spacer />
            </HStack>
            <HStack alignment="lastTextBaseline" spacing={1}>
              <Text font={9} fontWeight="bold" foregroundStyle={item.textColor}>
                ¥
              </Text>
              <Text
                font={15}
                fontWeight="heavy"
                foregroundStyle={THEME.text}
                monospacedDigit
                lineLimit={1}
              >
                {item.price}
              </Text>
            </HStack>
          </VStack>
        ))}
      </HStack>

      <Spacer minLength={5} />

      {/* 底部折线图：真实上金所 30 日走势平滑面积折线图 */}
      <VStack spacing={0} frame={{ maxWidth: "infinity", height: 40 }} padding={{ leading: 4, trailing: 4 }}>
        <Chart chartXAxis="hidden" chartYAxis="hidden" frame={{ height: 40 }}>
          <AreaChart
            marks={marks.map((m) => ({
              label: m.label,
              value: m.value - minY + (minY * 0.05),
              interpolationMethod: "catmullRom",
              foregroundStyle: [color, "rgba(0, 0, 0, 0)"],
              opacity: 0.25,
            }))}
          />
          <LineChart
            marks={marks.map((m) => ({
              label: m.label,
              value: m.value - minY + (minY * 0.05),
              interpolationMethod: "catmullRom",
              foregroundStyle: color,
              lineStyle: { lineWidth: 1.8, lineCap: "round", lineJoin: "round" },
            }))}
          />
        </Chart>
      </VStack>
    </VStack>
  )
}

export function GoldPriceCard({ data, family }: { data: GoldMarketData; family?: string }) {
  if (family === "systemMedium" || family === "systemLarge") {
    return <GoldPriceMediumCard data={data} />
  }
  return <GoldPriceSmallCard data={data} />
}
// ═════════════════════════════════════════════════════════════════
// 4. 10 段独立圆角药丸分段胶囊进度条 (Segmented Pill Bar)
// ═════════════════════════════════════════════════════════════════
export function SegmentedSquareBar({
  total = 10,
  filled = 8,
  pct,
  activeColor,
  size = 10,
}: {
  total?: number
  filled?: number
  pct?: number
  activeColor?: any
  size?: number
}) {
  const currentPct = pct !== undefined ? pct : Math.round((filled / total) * 100)
  const squareColor = activeColor || remainColor(currentPct)
  const effectiveFilled = pct !== undefined ? Math.max(0, Math.min(total, Math.round((pct / 100) * total))) : filled
  const inactiveBorder = { light: "rgba(0,0,0,0.06)", dark: "rgba(255,255,255,0.10)" }

  return (
    <HStack spacing={4} alignment="center" frame={{ maxWidth: "infinity", height: size }}>
      {Array.from({ length: total }).map((_, i) => (
        <ZStack key={i} frame={{ width: size, height: size }}>
          {i < effectiveFilled ? (
            <RoundedRectangle
              fill={squareColor}
              cornerRadius={2}
              frame={{ width: size, height: size }}
            />
          ) : (
            <RoundedRectangle
              fill={inactiveBorder}
              cornerRadius={2}
              frame={{ width: size, height: size }}
            />
          )}
        </ZStack>
      ))}
      <Spacer />
    </HStack>
  )
}

// ═════════════════════════════════════════════════════════════════
// 5. 小型组件 4 套像素级精细化卡片 (WorkBuddy / DeepSeek / Codex / Antigravity)
// 严格 1:1 对齐参考设计图 (88290ba2-4e0f-4de1-8db1-04c40bd29d51.jpg)
// ═════════════════════════════════════════════════════════════════

export function WorkBuddySmallCard({ data }: { data: MetricBalanceData }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 13, bottom: 12, leading: 14, trailing: 14 }}
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* 顶部 Header: Logo + WORKBUDDY. */}
      <HStack spacing={7} alignment="center" frame={{ height: 20 }}>
        <BrandHeaderIcon
          iconPath={{ light: "assets/workbuddy-icon-light.png", dark: "assets/workbuddy-icon-dark.png" }}
          size={19}
        />
        <Text font={14} fontWeight="heavy" foregroundStyle={THEME.text}>
          WORKBUDDY.
        </Text>
        <Spacer />
      </HStack>

      <Spacer minLength={10} />

      {/* 第 1 行双列：左【积分剩余 12,164】、右【已用 7,796】 */}
      <HStack alignment="top" spacing={10}>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="circle.grid.3x3.fill"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>积分剩余</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.mainValue || "12,164"}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="doc.plaintext"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>已用</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.subValue2 || "7,796"}
          </Text>
        </VStack>
      </HStack>

      <Spacer minLength={10} />

      {/* 第 2 行双列：左【已签 0/4】、右【有效期 51天】 */}
      <HStack alignment="top" spacing={10}>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="checkmark.circle"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>已签</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.subValue1 || "0/4"}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="calendar"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>有效期</Text>
          </HStack>
          <HStack alignment="lastTextBaseline" spacing={2}>
            <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
              {(data.footerLeft || "51 天").replace(/[^0-9]/g, "") || "51"}
            </Text>
            <Text font={13} fontWeight="bold" foregroundStyle={THEME.text}>
              天
            </Text>
          </HStack>
        </VStack>
      </HStack>

      <Spacer minLength={10} />

      {/* 底部：10 个独立小正方形，随额度使用平滑变色 */}
      <SegmentedSquareBar total={10} pct={data.progressPct || 65} size={10} />
    </VStack>
  )
}

export function DeepSeekSmallCard({ data }: { data: MetricBalanceData }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 13, bottom: 12, leading: 14, trailing: 14 }}
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* 顶部 Header: Logo + deepseek */}
      <HStack spacing={7} alignment="center" frame={{ height: 20 }}>
        <SVG
          code={DEEPSEEK_WHALE_SVG}
          resizable={true}
          frame={{ width: 20, height: 20 }}
        />
        <Text font={15} fontWeight="heavy" foregroundStyle={THEME.text}>
          deepseek
        </Text>
        <Spacer />
      </HStack>

      <Spacer minLength={8} />

      {/* 中部大字：标签【账户余额】+ 超大数值【¥ 1.86】 */}
      <HStack spacing={4} alignment="center">
        <Image
          systemName="circle.grid.3x3.fill"
          font={{ name: "system", size: 10 }}
          foregroundStyle={{ light: "#1E60FF", dark: "#3B82F6" }}
        />
        <Text font={11} foregroundStyle={THEME.dim}>账户余额</Text>
      </HStack>
      <Spacer minLength={2} />
      <HStack alignment="lastTextBaseline" spacing={3}>
        <Text font={19} fontWeight="heavy" foregroundStyle={THEME.text}>
          ¥
        </Text>
        <Text font={30} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
          {data.mainValue || "1.86"}
        </Text>
      </HStack>

      <Spacer minLength={8} />

      {/* 第 2 行双列：左【状态 / 正常(绿色)】、右【近7日消费 / ¥ 5.39】 */}
      <HStack alignment="top" spacing={10}>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="doc.text"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#1E60FF", dark: "#3B82F6" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>状态</Text>
          </HStack>
          <Text font={17} fontWeight="heavy" foregroundStyle={THEME.green}>
            {data.statusText || "正常"}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="chart.line.uptrend.xyaxis"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#1E60FF", dark: "#3B82F6" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>近7日消费</Text>
          </HStack>
          <Text font={17} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.subValue2?.startsWith("¥") ? data.subValue2 : ("¥ " + (data.subValue2 || "5.39"))}
          </Text>
        </VStack>
      </HStack>

      <Spacer minLength={10} />

      {/* 底部：左侧【官方直连】、右侧【更新于 12:31】（高呼吸感） */}
      <HStack alignment="center">
        <Text font={10.5} foregroundStyle={THEME.dim}>官方直连</Text>
        <Spacer />
        <Text font={10.5} foregroundStyle={THEME.dim} monospacedDigit>
          {`更新于 ${formatTime(data.updatedAt)}`}
        </Text>
      </HStack>
    </VStack>
  )
}

export function CodexSmallCard({ data }: { data: DualQuotaData }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 13, bottom: 12, leading: 14, trailing: 14 }}
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* 顶部 Header: Logo + Codex */}
      <HStack spacing={7} alignment="center" frame={{ height: 20 }}>
        <BrandHeaderIcon
          iconPath={{ light: "assets/codex-light.png", dark: "assets/codex-dark.png" }}
          size={19}
        />
        <Text font={15} fontWeight="heavy" foregroundStyle={THEME.text}>Codex</Text>
        <Spacer />
      </HStack>

      <Spacer minLength={10} />

      {/* 第 1 行双列：左【5小时额度 83%】、右【周额度 0%】 */}
      <HStack alignment="top" spacing={10}>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="clock"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>5小时额度</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {`${Math.round(data.item1?.pct ?? 83)}%`}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="clock"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>周额度</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {`${Math.round(data.item2?.pct ?? 0)}%`}
          </Text>
        </VStack>
      </HStack>

      <Spacer minLength={10} />

      {/* 第 2 行双列：左【可重置次数 0次】、右【剩余 83%】 */}
      <HStack alignment="top" spacing={10}>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="arrow.clockwise"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>可重置次数</Text>
          </HStack>
          <HStack alignment="lastTextBaseline" spacing={2}>
            <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
              {(data.stat1?.value || "0 次").replace(/[^0-9]/g, "") || "0"}
            </Text>
            <Text font={13} fontWeight="bold" foregroundStyle={THEME.text}>
              次
            </Text>
          </HStack>
        </VStack>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="chart.bar.fill"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>剩余</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.stat2?.value || "83%"}
          </Text>
        </VStack>
      </HStack>

      <Spacer minLength={10} />

      {/* 底部：10 个独立小正方形（随额度变色） + 状态行 */}
      <SegmentedSquareBar total={10} pct={data.item1?.pct ?? 83} size={10} />
      <Spacer minLength={6} />
      <HStack alignment="center">
        <Text font={10} foregroundStyle={THEME.dim} monospacedDigit>{`更新于 ${formatTime(data.updatedAt)}`}</Text>
        <Spacer />
        <Text font={10} foregroundStyle={THEME.green}>服务在线 ●</Text>
      </HStack>
    </VStack>
  )
}

export function AntigravitySmallCard({ data }: { data: DualQuotaData }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{ top: 13, bottom: 12, leading: 14, trailing: 14 }}
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* 顶部 Header: Logo + Antigravity */}
      <HStack spacing={7} alignment="center" frame={{ height: 20 }}>
        <BrandHeaderIcon
          iconPath={{ light: "assets/antigravity-light.png", dark: "assets/antigravity-dark.png" }}
          size={19}
        />
        <Text font={15} fontWeight="heavy" foregroundStyle={THEME.text}>Antigravity</Text>
        <Spacer />
      </HStack>

      <Spacer minLength={10} />

      {/* 第 1 行双列：左【Gemini 12m】、右【Claude/GPT 4h59m】 */}
      <HStack alignment="top" spacing={10}>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="sparkle"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>Gemini</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.item1?.timer || "12m"}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="bolt.shield"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>Claude/GPT</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {data.item2?.timer || "4h59m"}
          </Text>
        </VStack>
      </HStack>

      <Spacer minLength={10} />

      {/* 第 2 行双列：左【Gem周 82%】、右【C/G周 100%】 */}
      <HStack alignment="top" spacing={10}>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="globe"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>Gem周</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {`${Math.round(data.item1?.pct ?? 82)}%`}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
          <HStack spacing={4} alignment="center">
            <Image
              systemName="link"
              font={{ name: "system", size: 10 }}
              foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
            />
            <Text font={11} foregroundStyle={THEME.dim}>C/G周</Text>
          </HStack>
          <Text font={21} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit lineLimit={1}>
            {`${Math.round(data.item2?.pct ?? 100)}%`}
          </Text>
        </VStack>
      </HStack>

      <Spacer minLength={12} />

      {/* 底部：左侧【最新 39%(绿色)】、右侧【更新于 12:31】 */}
      <HStack alignment="center">
        <HStack spacing={4} alignment="center">
          <Image
            systemName="doc.plaintext"
            font={{ name: "system", size: 10 }}
            foregroundStyle={{ light: "#6366F1", dark: "#818CF8" }}
          />
          <Text font={11} foregroundStyle={THEME.dim}>最新 </Text>
          <Text font={12} fontWeight="heavy" foregroundStyle={THEME.green}>39%</Text>
        </HStack>
        <Spacer />
        <Text font={10.5} foregroundStyle={THEME.dim} monospacedDigit>{`更新于 ${formatTime(data.updatedAt)}`}</Text>
      </HStack>
    </VStack>
  )
}

// ═════════════════════════════════════════════════════════════════
// 6. 中型组件：1:1 复刻 xubai2001 DeepSeek 原版平滑波形图看板架构
// 左侧 112pt 紧凑主数值与明细标签 + 右侧 80pt 通栏平滑贝塞尔面积折线图
// ═════════════════════════════════════════════════════════════════

export interface WaveformMediumCardProps {
  title: string
  logoHeader?: any
  iconPath?: { light: string; dark: string } | string
  svgCode?: string
  iconName?: string
  iconColor?: any
  mainLabel: string
  mainValue: string
  symbol?: string
  subTag1: string
  subTag2: string
  chartTitle: string
  peakText: string
  trendData: { label: string; value: number }[]
  lineColor: any
  gradient: [any, any]
  updatedAt: string
}

export function WaveformDashboardMediumCard({ props }: { props: WaveformMediumCardProps }) {
  const marks = props.trendData.length > 0 ? props.trendData : [
    { label: "7天前", value: 1.2 },
    { label: "5天前", value: 0.8 },
    { label: "3天前", value: 1.5 },
    { label: "前天", value: 0.9 },
    { label: "昨日", value: 1.86 },
    { label: "今日", value: 0.42 },
  ]
  const n = marks.length
  const axisValues = [
    marks[0]?.label || "7天前",
    marks[Math.floor((n - 1) / 2)]?.label || "3天前",
    marks[n - 1]?.label || "今日",
  ]

  return (
    <HStack
      padding={12}
      spacing={12}
      alignment="top"
      widgetBackground={{ light: "#FFFFFF", dark: "#161719" }}
    >
      {/* ── 左侧固定栏 (112pt) ─────────────────────────────────── */}
      <VStack spacing={4} alignment="leading" frame={{ width: 112 }}>
        {/* 左上角品牌 Logo */}
        {props.logoHeader ? (
          props.logoHeader
        ) : props.svgCode ? (
          <SVG
            code={props.svgCode}
            scaleToFit
            resizable
            frame={{ height: 22 }}
          />
        ) : (
          <HStack spacing={5} alignment="center" frame={{ height: 22 }}>
            <BrandHeaderIcon
              iconPath={props.iconPath}
              iconName={props.iconName}
              iconColor={props.iconColor}
              size={17}
            />
            <Text font={13} fontWeight="heavy" foregroundStyle={THEME.text}>
              {props.title}
            </Text>
          </HStack>
        )}

        {/* 核心指标标题 */}
        <Text font={11} fontWeight="semibold" foregroundStyle={THEME.dim}>
          {props.mainLabel}
        </Text>

        {/* 大号数值：符号 + 34pt 等宽大数字 */}
        <HStack spacing={2} alignment="lastTextBaseline">
          {props.symbol && (
            <Text font={18} fontWeight="semibold" foregroundStyle={THEME.text}>
              {props.symbol}
            </Text>
          )}
          <Text
            font={34}
            fontWeight="bold"
            foregroundStyle={THEME.text}
            monospacedDigit
            lineLimit={1}
            minScaleFactor={0.6}
          >
            {props.mainValue.replace(/^[¥￥]\s*/, "")}
          </Text>
        </HStack>

        {/* 次级明细信息 1 */}
        <Text font={10} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.7}>
          {props.subTag1}
        </Text>

        {/* 次级明细信息 2 */}
        <Text font={10} foregroundStyle={THEME.dim} lineLimit={1} minScaleFactor={0.7}>
          {props.subTag2}
        </Text>

        {/* 底部更新时间 */}
        <Text font={9.5} foregroundStyle={THEME.dim} monospacedDigit>
          {`更新于 ${formatTime(props.updatedAt)}`}
        </Text>
      </VStack>

      {/* ── 右侧 7 日平滑贝塞尔波形图走势栏 (80pt) ──────────────── */}
      <VStack spacing={3} alignment="leading">
        <Spacer />
        {/* 走势栏顶标 */}
        <HStack alignment="center">
          <Text
            font={10}
            fontWeight="semibold"
            foregroundStyle={THEME.dim}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
          >
            {props.chartTitle}
          </Text>
          <Text font={9.5} fontWeight="bold" foregroundStyle={props.lineColor}>
            {props.peakText}
          </Text>
        </HStack>
        <Spacer />

        {/* 平滑贝塞尔曲线 (CatmullRom) + 实色向下渐隐面积图 */}
        <Chart
          frame={{ height: 80 }}
          chartXAxis={{
            position: "bottom",
            tick: false,
            gridLine: false,
            values: {
              type: "values",
              values: axisValues,
            },
            valueLabel: {
              multiLabelAlignment: "center",
            },
          }}
        >
          <AreaChart
            marks={marks.map((m) => ({
              ...m,
              interpolationMethod: "catmullRom",
              foregroundStyle: props.gradient,
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
          <ChartPlotStyle>
            {(plot: any) => plot.clipShape("rect")}
          </ChartPlotStyle>
        </Chart>
      </VStack>
    </HStack>
  )
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
        <Image systemName={iconName} font={{ name: "system", size: 12 }} foregroundStyle={iconColor} />
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
      <Text font={18} fontWeight="heavy" foregroundStyle={THEME.text} monospacedDigit>
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
        <Text font={13.5} fontWeight="heavy" foregroundStyle={THEME.text}>DashBoard Pro 看板</Text>
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
