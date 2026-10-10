# 哑巴面板 · 组件模板说明

所有小号 / 中号组件都由 `templates.tsx` 中的四套模板渲染。新增品类时**只需提供数据与配色**，
不要重写布局，以保证字号、间距、对齐在全项目内完全一致。

---

## 一、小号行情走势图 · `TrendSmallTemplate`

> 参考「走势图模版」：顶部涨跌三角 + 标题 + 副标题，中部 30 点走势线，
> 底部左侧超大压缩数字、右侧涨跌额与涨跌幅。线条带**同色投影**，观感突出。

**当前使用方**：黄金行情小号、油价小号

```tsx
<TrendSmallTemplate
  title="Au9999"              // 标题
  subtitle="上金所实时价"      // 副标题
  data={marks}                // { label, value }[]，取末尾 30 点
  priceText="904.48"          // 现价（已格式化）
  changeText="+12.48"         // 涨跌额（含符号）
  rateText="+1.40%"           // 涨跌幅（含符号与 %）
  isUp={true}                 // 决定配色与三角方向
  footnote="10-09 更新"        // 可选
/>
```

**新增品类示例**（美元汇率 / 股市指数 / 期货）：

```tsx
export function FxSmallCard({ data }: { data: FxData }) {
  const marks = data.history30d
  const close = marks[marks.length - 1].value
  const prev = marks[marks.length - 2].value
  const dif = close - prev
  return (
    <TrendSmallTemplate
      title="USD/CNY"
      subtitle="离岸人民币现汇"
      data={marks}
      priceText={close.toFixed(4)}
      changeText={signedText(dif, 4)}
      rateText={signedText((dif / prev) * 100, 2, "%")}
      isUp={dif >= 0}
    />
  )
}
```

---

## 二、小号 AI 用量看板 · `AiSmallTemplate`

> 顶部品牌图标 + 名称，中部指标栅格，底部进度槽或状态行。

**当前使用方**：WorkBuddy、DeepSeek、Codex、Antigravity、CPA-Manager-Plus

```tsx
<AiSmallTemplate
  brand="Codex"
  iconImage={brandIcon("codex")}      // 三选一：内嵌图标
  // svgCode={SOME_SVG}               //        或内联 SVG
  // iconName="sparkles"              //        或 SF Symbol
  titleColor={THEME.text}             // 可选：品牌标题色
  primary={{                          // 可选：跨行主指标
    icon: "circle.grid.3x3.fill", iconColor, label: "账户余额", value: "1.86",
  }}
  cells={[                            // 无 primary → 4 个（2×2）；有 primary → 2 个（单行）
    { icon: "clock", iconColor, label: "5小时额度", value: "83%" },
    { icon: "calendar.badge.clock", iconColor, label: "周额度", value: "0%" },
    { icon: "arrow.clockwise", iconColor, label: "可重置次数", value: "0", suffix: "次" },
    { icon: "chart.bar.fill", iconColor, label: "剩余", value: "83%" },
  ]}
  progressPct={83}                    // 二选一：进度槽
  // footerLeft="更新于 12:31"        // 或：状态行
  // footerRight="服务在线 ●"
  // footerRightColor={THEME.green}
/>
```

**新增品类示例**（新增一个 AI 服务）：

```tsx
export function NewAiSmallCard({ data }: { data: MetricBalanceData }) {
  const iconColor = { light: "#6366F1", dark: "#818CF8" } as any
  return (
    <AiSmallTemplate
      brand="NewAI"
      iconImage={brandIcon("newai")}
      cells={[
        { icon: "bolt.fill", iconColor, label: "剩余额度", value: data.mainValue },
        { icon: "doc.plaintext", iconColor, label: "已用", value: data.subValue2 },
        { icon: "checkmark.circle", iconColor, label: "已签", value: data.subValue1 },
        { icon: "calendar", iconColor, label: "有效期", value: "51", suffix: "天" },
      ]}
      progressPct={data.progressPct}
    />
  )
}
```

---

## 三、中号 AI 波形看板 · `WaveformMediumTemplate`

> 1:1 对齐 xubai2001「DeepSeek 用量」原版：左侧 112pt 固定栏，
> 右侧 7 日平滑面积波形图（CatmullRom + 渐变面积 + 最新点光斑）。

**当前使用方**：WorkBuddy、DeepSeek、Codex、Antigravity、CPA-Manager-Plus

```tsx
<WaveformMediumTemplate
  brand="Codex"
  iconImage={brandIcon("codex")}
  titleColor={THEME.text}
  mainLabel="5小时可用额度"
  mainValue="83"
  symbol="%"                          // 可选
  subTag1="周额度 0%"
  subTag2="可重置 0 次"
  chartTitle="近7日配额占用"
  peakText="峰值 90%"
  trendData={[{ label: "7天前", value: 45 }, /* … */]}
  lineColor="#10A37F"
  gradient={["#6EE7B7", "rgba(110,231,183,0)"]}
  updatedAt={data.updatedAt}
/>
```

**约定**：`gradient` 首色为实色（贴近折线）、末色为全透明（贴近横轴），
这是面积图向下渐隐的标准写法。

---

## 四、中号行情 4 联卡片 · `MarketMediumTemplate`

> 顶部行情来源与涨跌徽章，中部 4 张**等宽等高**卡片，底部 30 日走势图。

**当前使用方**：黄金行情中号、油价中号

```tsx
<MarketMediumTemplate
  iconName="centsign.circle.fill"
  iconColor="#F59E0B"
  title="上海黄金交易所"
  badgeText="+12.48 (+1.40%)"
  badgeColor={color}
  badgeBg="rgba(239,68,68,0.12)"
  items={[
    { name: "Au9999", price: "904.48", textColor: "#E5933A", tagBg: "rgba(229,147,58,0.18)" },
    { name: "黄金T+D", price: "904.20", textColor: "#E6674E", tagBg: "rgba(230,103,78,0.18)" },
    { name: "周大福", price: "1045", textColor: "#E05268", tagBg: "rgba(224,82,104,0.18)" },
    { name: "招行/浙商", price: "905.97", textColor: "#34C759", tagBg: "rgba(52,199,89,0.18)" },
  ]}
  trendData={marks}
  lineColor={color}
  updatedAt={data.updatedAt}
/>
```

---

## 五、通用工具

| 名称 | 用途 |
|---|---|
| `trendColor(isUp)` | 红涨绿跌动态色（深浅色模式各取高饱和值） |
| `trendSymbol(isUp)` | 涨跌三角图标名 |
| `signedText(v, digits, suffix)` | 带正负号格式化，如 `+12.48` / `-3.20` / `+1.40%` |
| `AiProgressBar({ pct })` | 10 段方块进度槽，按剩余额度变色 |
| `brandIcon("workbuddy" \| "codex" \| "antigravity")` | 内嵌品牌图标（Widget 可读） |

**为什么品牌图标要内嵌**：官方文档明确 `FileManager.documentsDirectory`
在 Widget 上下文中不可读，因此文件型 Logo 会静默失败。品牌图标统一内嵌为
Base64（见 `icons.ts`），由 `UIImage.fromBase64String` 解码渲染。

---

## 六、新增一个组件的完整步骤

1. **取数据**：在 `data.ts` 添加 `getXxxData()`，返回统一结构。
2. **选模板**：行情类用 `TrendSmallTemplate` / `MarketMediumTemplate`；
   AI 用量类用 `AiSmallTemplate` / `WaveformMediumTemplate`。
3. **写卡片**：在 `cards.tsx` 加一个薄封装（参考 `GoldPriceSmallCard`），只做数据映射。
4. **注册**：在 `widget.tsx` 的 `systemMedium` / 小号分支里加 `else if`，
   并把 id 加入 `pickDefaultService()` 的候选列表（若是 AI 服务）。
5. **校验**：`TrendSmallTemplate` 高度预算 124.4pt、
   `AiSmallTemplate` 无主指标 125.8pt / 有主指标 127.4pt，均需 ≤ 130pt（小号可用高度）。
