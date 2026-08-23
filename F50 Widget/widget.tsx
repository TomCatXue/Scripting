// @ts-nocheck
// F50 Widget 小组件 UI：Small / Medium / Large 三种尺寸，支持点击刷新与缓存容错
// 配色统一使用系统语义色（自动适配深色模式）
import { Widget, VStack, HStack, Text, Spacer, Image, Button, Script, modifiers } from "scripting";
import { RefreshF50WidgetIntent } from "./app_intents";
import { WidgetState, ColorName, emptyState, textValue, readWidgetCache, saveWidgetCache, fetchWidgetSnapshot } from "./widget_data";

const RELOAD_MS = 15 * 60 * 1000; // 每 15 分钟自动刷新一次数据

// ===================== 动态字号 =====================

/** 估算文本宽度（font=8 基准：中文 8.5pt/字，ASCII 5.2pt/字） */
function estTextWidth(s: string): number {
  let w = 0;
  for (const ch of String(s)) w += /[\u4e00-\u9fff]/.test(ch) ? 8.5 : 5.2;
  return w;
}

/**
 * 根据一行内状态胶囊的数量与可用宽度反推统一字号（5~10pt 自适应）
 * @param texts 该行所有胶囊文本
 * @param count 该行胶囊个数
 * @param avail 该行可用宽度（pt）
 */
function statusFontSize(texts: string[], count: number, avail = 300): number {
  const per = (avail - count * 25) / count; // 每个胶囊文字可用宽（图标 13 + padding 12）
  let size = 10;
  for (const t of texts) {
    const w = estTextWidth(t);
    if (w <= 0) continue;
    const need = Math.round(((per / w) * 8) * 2) / 2; // 8pt 时宽度为 w，缩放字号
    size = Math.min(size, Math.max(5, Math.min(10, need)));
  }
  return size;
}

// ===================== 语义色工具 =====================

/** 温度动态着色：<50°C 绿 / <70°C 橙 / ≥70°C 红 */
function tempColor(v: string): ColorName {
  const n = parseFloat(String(v));
  if (!isFinite(n)) return "systemGray";
  if (n < 50) return "systemGreen";
  if (n < 70) return "systemOrange";
  return "systemRed";
}

/** 信号强度 → cellularbars 填充比例（0.0~1.0），用于 variableValue */
function signalFill(sig: string): number {
  const n = parseInt(String(sig), 10);
  if (!isFinite(n)) return 0;
  if (n >= 4) return 1;
  if (n === 3) return 0.75;
  if (n === 2) return 0.5;
  if (n === 1) return 0.25;
  return 0.05;
}

/** 信号强度动态着色：4 格绿 / 3 格青 / 2 格橙 / 1 格以下红 */
function signalColor(sig: string): ColorName {
  const n = parseInt(String(sig), 10);
  if (!isFinite(n)) return "secondaryLabel";
  if (n >= 4) return "systemGreen";
  if (n === 3) return "systemTeal";
  if (n === 2) return "systemOrange";
  return "systemRed";
}

/** 透明/模糊模式背景色 */
function widgetBg(): string {
  const isTransparent = Widget.isTransparentBackground || Widget.isTransparentMode || Widget.isBlurMode;
  return isTransparent ? "clear" : "systemBackground";
}

/** 状态胶囊背景：透明模式下用半透明 */
function pillBg(): string {
  const isTransparent = Widget.isTransparentBackground || Widget.isTransparentMode || Widget.isBlurMode;
  let isDark = false;
  try { isDark = Device.colorScheme === "dark"; } catch (_) { }
  return isTransparent ? (isDark ? "rgba(28,28,30,0.5)" : "rgba(242,242,247,0.5)") : "secondarySystemBackground";
}

// ===================== 基础组件 =====================

function Chip({ icon, text, tint = "label", compact = false }: any) {
  return (
    <HStack
      spacing={compact ? 5 : 4}
      padding={compact ? { horizontal: 8, vertical: 3 } : { horizontal: 6, vertical: 3 }}
      alignment="center"
      modifiers={modifiers()
        .background(widgetBg())
        .clipShape({ type: "rect", cornerRadius: compact ? 12 : 10 })
        .frame({ height: compact ? 25 : 22 })}
    >
      <Image systemName={icon} frame={{ width: 13, height: 13 }} modifiers={modifiers().foregroundStyle(tint)} />
      <Text font={compact ? 9 : 10} modifiers={modifiers().foregroundStyle("label").lineLimit(1).minScaleFactor(0.5)}>{text}</Text>
    </HStack>
  );
}

/** 状态胶囊（状态行用，字号动态计算） */
function StatusPill({ icon, text, tint, font }: any) {
  const iconOffset = icon === "envelope.badge" ? -2 : 0;
  const iconMod = iconOffset !== 0
    ? modifiers().foregroundStyle(tint).offset({ x: 0, y: iconOffset })
    : modifiers().foregroundStyle(tint);
  return (
    <HStack
      spacing={3}
      padding={{ top: 3, bottom: 3, leading: 6, trailing: 6 }}
      background={pillBg()}
      alignment="center"
      modifiers={modifiers().clipShape({ type: "rect", cornerRadius: 11 }).frame({ height: 23, maxWidth: "infinity" })}
    >
      <Image systemName={icon} font={11} frame={{ width: 13, height: 13 }} modifiers={iconMod} />
      <Text font={font} fontWeight="semibold" modifiers={modifiers().foregroundStyle("label").lineLimit(1).minScaleFactor(0.55)}>{text}</Text>
    </HStack>
  );
}

function Traffic({ title, value, unit, compact = false, titleColor = "systemBlue" }: any) {
  return (
    <VStack spacing={1} alignment="center">
      <Text font={compact ? 10 : 11} modifiers={modifiers().foregroundStyle(titleColor).bold()}>{title}</Text>
      <HStack spacing={2} alignment="lastTextBaseline">
        <Text font={compact ? 25 : 31} modifiers={modifiers().foregroundStyle("label").bold().monospacedDigit()}>{value}</Text>
        <Text font={compact ? 12 : 16} modifiers={modifiers().foregroundStyle("label")}>{unit}</Text>
      </HStack>
    </VStack>
  );
}

function Card({ children, compact = false }: any) {
  return (
    <VStack
      spacing={compact ? 7 : 4}
      padding={compact ? 10 : { top: 8, bottom: 7, leading: 12, trailing: 12 }}
      alignment="center"
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      widgetBackground={widgetBg()}
    >
      {children}
    </VStack>
  );
}

function Header({ data, compact = false }: any) {
  return (
    <HStack spacing={compact ? 3 : 5} alignment="center">
      <Image systemName="wifi.router.fill" frame={{ width: compact ? 14 : 16, height: compact ? 14 : 16 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
      <Text font={compact ? 11 : 12} modifiers={modifiers().foregroundStyle("label").bold()}>{textValue(data.model_name)}</Text>
      <Text font={compact ? 10 : 11} modifiers={modifiers().foregroundStyle("label")}>UFI v{textValue(data.ufi_ver)}</Text>
      <Spacer />
      <Image systemName="cellularbars" variableValue={signalFill(textValue(data.signalbar))} frame={{ width: compact ? 13 : 15, height: compact ? 13 : 15 }} modifiers={modifiers().foregroundStyle(signalColor(textValue(data.signalbar)))} />
      <Text font={compact ? 9 : 10} modifiers={modifiers().foregroundStyle("label")}>{textValue(data.signalbar)}</Text>
      <Image systemName={textValue(data.battery_icon)} frame={{ width: compact ? 14 : 16, height: compact ? 14 : 16 }} modifiers={modifiers().foregroundStyle(data.battery_icon_color)} />
      <Text font={compact ? 9 : 10} modifiers={modifiers().foregroundStyle("label")}>{textValue(data.battery)}%</Text>
    </HStack>
  );
}

// ===================== 各尺寸视图 =====================

function MediumDashboard({ data }: any) {
  const row1 = [textValue(data.net_summary), textValue(data.band_text), textValue(data.cpuusage) + "%", textValue(data.cputemp) + "℃"];
  const row2 = [textValue(data.ssid_text), textValue(data.wifi_band_text), textValue(data.mem_text), textValue(data.wifi_device_count), textValue(data.sms_unread_text)];
  const font1 = statusFontSize(row1, 4);
  const font2 = statusFontSize(row2, 5);

  return (
    <Card>
      <HStack spacing={5} alignment="center" modifiers={modifiers().frame({ height: 20 })}>
        <Image systemName="wifi.router.fill" font={14} frame={{ width: 18, height: 18 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
        <Text font={11} modifiers={modifiers().foregroundStyle("label").bold().lineLimit(1).minScaleFactor(0.72).frame({ height: 20 }).baselineOffset(2)}>{textValue(data.model_name)}</Text>
        <Text font={10} modifiers={modifiers().foregroundStyle("label").lineLimit(1).minScaleFactor(0.55).frame({ height: 20 }).baselineOffset(2)}>UFI v{textValue(data.ufi_ver)}</Text>
        <Spacer minLength={2} />
        <Image systemName="cellularbars" variableValue={signalFill(textValue(data.signalbar))} font={14} frame={{ width: 16, height: 16 }} modifiers={modifiers().foregroundStyle(signalColor(textValue(data.signalbar)))} />
        <Text font={11} modifiers={modifiers().foregroundStyle("label").bold().monospacedDigit().lineLimit(1).minScaleFactor(0.7).frame({ height: 20 })}>{textValue(data.signalbar)}</Text>
        <Text font={12} modifiers={modifiers().foregroundStyle("separator").frame({ height: 20 })}>|</Text>
        <Image systemName={textValue(data.battery_icon)} font={16} frame={{ width: 18, height: 18 }} modifiers={modifiers().foregroundStyle(data.battery_icon_color)} />
        <Text font={11} modifiers={modifiers().foregroundStyle("label").bold().monospacedDigit().lineLimit(1).minScaleFactor(0.7).frame({ height: 20 })}>{textValue(data.battery)}%</Text>
      </HStack>
      <HStack spacing={12} alignment="center" modifiers={modifiers().frame({ height: 50 })}>
        <Traffic title="今日流量" value={textValue(data.daily_data_value)} unit={textValue(data.daily_data_unit)} />
        <Text font={34} modifiers={modifiers().foregroundStyle("separator")}>│</Text>
        <Traffic title="本月流量" value={textValue(data.monthly_data_value)} unit={textValue(data.monthly_data_unit)} />
      </HStack>
      <VStack spacing={4} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity" })}>
        <HStack spacing={4} padding={{ horizontal: 4 }} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity", height: 23 })}>
          <StatusPill icon="network" text={row1[0]} tint="systemCyan" font={font1} />
          <StatusPill icon="antenna.radiowaves.left.and.right" text={row1[1]} tint="systemBlue" font={font1} />
          <StatusPill icon="cpu.fill" text={row1[2]} tint="systemIndigo" font={font1} />
          <StatusPill icon="thermometer.medium" text={row1[3]} tint={tempColor(data.cputemp)} font={font1} />
        </HStack>
        <HStack spacing={4} padding={{ horizontal: 4 }} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity", height: 23 })}>
          <StatusPill icon="wifi" text={row2[0]} tint="systemTeal" font={font2} />
          <StatusPill icon="dot.radiowaves.left.and.right" text={row2[1]} tint="systemTeal" font={font2} />
          <StatusPill icon="memorychip" text={row2[2]} tint="systemPurple" font={font2} />
          <StatusPill icon="macbook.and.ipod" text={row2[3]} tint="systemPink" font={font2} />
          <StatusPill icon="envelope.badge" text={row2[4]} tint={Number(data.sms_unread_text) > 0 ? "systemRed" : "systemBlue"} font={font2} />
        </HStack>
      </VStack>
      <HStack spacing={4} alignment="center" modifiers={modifiers().frame({ maxWidth: "infinity", height: 17 })}>
        <HStack spacing={4} alignment="leading" modifiers={modifiers().frame({ maxWidth: "infinity", alignment: "leading" }).padding({ leading: 2 })}>
          <Image systemName="antenna.radiowaves.left.and.right.circle" font={11} frame={{ width: 11, height: 11 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
          <Text font={8} modifiers={modifiers().foregroundStyle("secondaryLabel").monospacedDigit().lineLimit(1).minScaleFactor(0.55)}>RSRP {textValue(data.rsrp_text)} · RSRQ {textValue(data.rsrq_text)} · SNR {textValue(data.snr_text)}</Text>
        </HStack>
        <Spacer minLength={1} />
        <HStack spacing={3} alignment="center">
          <Image systemName="clock.arrow.trianglehead.2.counterclockwise.rotate.90" font={10} frame={{ width: 10, height: 10 }} modifiers={modifiers().foregroundStyle("systemGreen")} />
          <Text font={8} modifiers={modifiers().foregroundStyle("secondaryLabel").monospacedDigit().lineLimit(1).minScaleFactor(0.5)}>{textValue(data.update_time)}{data.error ? " ⚠" : ""}</Text>
        </HStack>
      </HStack>
    </Card>
  );
}

function SmallDashboard({ data }: any) {
  return (
    <Card compact>
      <HStack spacing={8} alignment="center">
        <Image systemName="wifi.router.fill" frame={{ width: 16, height: 16 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
        <Text font={11} modifiers={modifiers().foregroundStyle("label").bold().minScaleFactor(0.75).frame({ height: 20 }).baselineOffset(2)}>{textValue(data.model_name)}</Text>
        <Spacer />
        <Image systemName={textValue(data.battery_icon)} frame={{ width: 16, height: 16 }} modifiers={modifiers().foregroundStyle(data.battery_icon_color)} />
        <Text font={10} modifiers={modifiers().foregroundStyle("label").frame({ height: 20 })}>{textValue(data.battery)}%</Text>
      </HStack>
      <Traffic compact title="今日流量" value={textValue(data.daily_data_value)} unit={textValue(data.daily_data_unit)} />
      <HStack spacing={5} alignment="center">
        <Chip compact icon="antenna.radiowaves.left.and.right" text={textValue(data.rsrp_text)} tint="systemTeal" />
        <Chip compact icon="wifi" text={textValue(data.ssid_text)} tint="systemTeal" />
      </HStack>
      <Text font={8} modifiers={modifiers().foregroundStyle("secondaryLabel").monospacedDigit()}>{textValue(data.update_time)}{data.error ? " ⚠" : ""}</Text>
    </Card>
  );
}

function LargeDashboard({ data }: any) {
  return (
    <Card>
      <Header data={data} />
      <HStack spacing={25}>
        <Traffic title="今日流量" value={textValue(data.daily_data_value)} unit={textValue(data.daily_data_unit)} />
        <Text font={38} modifiers={modifiers().foregroundStyle("separator")}>│</Text>
        <Traffic title="本月流量" value={textValue(data.monthly_data_value)} unit={textValue(data.monthly_data_unit)} />
      </HStack>
      <HStack spacing={5}>
        <Chip icon="thermometer.medium" text={textValue(data.cputemp) + "℃"} tint={tempColor(data.cputemp)} />
        <Chip icon="cpu.fill" text={textValue(data.cpuusage) + "%"} tint="systemIndigo" />
        <Chip icon="globe" text={textValue(data.net_summary)} tint="systemCyan" />
        <Chip icon="antenna.radiowaves.left.and.right" text={textValue(data.rsrp_text)} tint="systemTeal" />
      </HStack>
      <HStack spacing={5}>
        <Chip icon="wifi" text={textValue(data.ssid_text)} tint="systemTeal" />
        <Chip icon="cube.fill" text={textValue(data.band_text)} tint="systemPurple" />
        <Chip icon="memorychip" text={textValue(data.mem_text)} tint="systemPurple" />
        <Chip icon="checkmark.seal.fill" text="就绪" tint="systemGreen" />
      </HStack>
      <HStack spacing={5}>
        <Chip icon="macbook.and.ipod" text={textValue(data.wifi_device_count) + "台"} tint="systemPink" />
        <Chip icon="envelope.badge" text={textValue(data.sms_unread_text) + "未读"} tint={Number(data.sms_unread_text) > 0 ? "systemRed" : "systemBlue"} />
      </HStack>
      <Text font={10} modifiers={modifiers().foregroundStyle("secondaryLabel").monospacedDigit()}>{textValue(data.update_time)}{data.error ? " ⚠" : ""}</Text>
    </Card>
  );
}

// ===================== 视图入口 =====================

/** 导出视图：整体可点击刷新（AppIntent），失败时展示缓存并加 ⚠ 标记 */
export function WidgetView({ data, error, family }: { data: WidgetState; error: string | null; family?: string }) {
  const fam = family ?? Widget.family;
  const inner = fam === "systemSmall"
    ? <SmallDashboard data={data} />
    : fam === "systemLarge"
      ? <LargeDashboard data={data} />
      : <MediumDashboard data={data} />;

  // 无真实数据（无缓存且获取失败）时显示占位
  const isEmpty = !data || !data.update_time || data.update_time === "--";

  return (
    <Button intent={RefreshF50WidgetIntent(undefined as any)} buttonStyle="plain">
      <VStack widgetBackground={widgetBg()} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        {isEmpty
          ? (
            <VStack spacing={6} alignment="center" frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
              <Image systemName="exclamationmark.icloud" frame={{ width: 28, height: 28 }} modifiers={modifiers().foregroundStyle("systemRed")} />
              <Text font={11} fontWeight="semibold" modifiers={modifiers().foregroundStyle("label")}>{error ? "获取失败" : "F50 Widget"}</Text>
              <Text font={10} modifiers={modifiers().foregroundStyle("secondaryLabel")}>点击重试</Text>
            </VStack>
          )
          : inner}
      </VStack>
    </Button>
  );
}

// ===================== 入口 =====================

async function run() {
  const cached = readWidgetCache();
  let data = cached ?? emptyState();
  let error: string | null = null;

  try {
    const { state } = await fetchWidgetSnapshot();
    saveWidgetCache(state);
    data = state;
    error = state.error;
  } catch (e) {
    error = String((e as Error)?.message || e);
    if (!cached) data = Object.assign(emptyState(), { error });
  }

  Widget.present(<WidgetView data={data} error={error} />, {
    reloadPolicy: { policy: "after", date: new Date(Date.now() + RELOAD_MS) },
  });
  Script.exit();
}

run();