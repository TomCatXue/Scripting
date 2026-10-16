// @ts-nocheck
// F50 Widget 状态页：模块化 Apple 原生高保真仪表盘
// 像素级还原 iOS UFI 设备管理规范与参考原型结构
import {
    NavigationStack,
    ScrollView,
    Text,
    Button,
    HStack,
    VStack,
    ZStack,
    Spacer,
    Image,
    Circle,
    RoundedRectangle,
    Chart,
    AreaChart,
    LineChart,
    useState,
    modifiers,
} from "scripting";
import {
    fetchWidgetSnapshot,
    WidgetState,
    WifiClient,
    readWidgetCache,
    saveWidgetCache,
    appendSpeedSample,
    readSpeedHistory,
    toChartSeries,
} from "./widget_data";
import { SPACING, RADIUS, FONT, THEME, softTint } from "./theme";
import { confirmAction } from "./ui";
import { rebootDevice } from "./api";

let _statusLoaded = false;
let _statusCache: WidgetState | null = null;
let _statusLoadedAt = 0;
const STATUS_STALE_MS = 30 * 1000;
let _chartHistory: Array<{ id: string; value: number }> = [];
let _chartHistoryUl: Array<{ id: string; value: number }> = [];

function signalTint(bars: string): string {
    const n = parseInt(String(bars), 10);
    if (!isFinite(n)) return "secondaryLabel";
    if (n >= 4) return THEME.color.success.light;
    if (n === 3) return THEME.color.info.light;
    if (n === 2) return THEME.color.warning.light;
    return THEME.color.danger.light;
}

function cardStroke() {
    return { shapeStyle: THEME.border, strokeStyle: { lineWidth: 0.8 } };
}

function carrierIcon(provider: string): string {
    const s = String(provider || "").toLowerCase();
    if (s.includes("联通") || s.includes("unicom")) return "network";
    if (s.includes("移动") || s.includes("cmcc") || s.includes("mobile")) return "antenna.radiowaves.left.and.right";
    if (s.includes("电信") || s.includes("telecom")) return "bolt.horizontal.circle.fill";
    if (s.includes("广电") || s.includes("cbn")) return "tv.circle.fill";
    return "antenna.radiowaves.left.and.right";
}

export function StatusView({ onOpenPlugins, onOpenSms, onOpenPhone }: any = {}) {
    const [state, setState] = useState<WidgetState | null>(_statusCache ?? readWidgetCache());
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    async function refresh(): Promise<void> {
        setLoading(true);
        setError(null);
        try {
            const { state: next, error: err } = await fetchWidgetSnapshot();
            _statusCache = next;
            _statusLoadedAt = Date.now();
            setState(next);
            if (err) setError(err);
            saveWidgetCache(next);
            const samples = appendSpeedSample({ t: Date.now(), dl: next.dl_bps, ul: next.ul_bps });
            _chartHistory = toChartSeries(samples, "dl");
            _chartHistoryUl = toChartSeries(samples, "ul");
        } catch (e) {
            setError(String((e as Error)?.message || e));
            const cached = readWidgetCache();
            if (cached) {
                _statusCache = cached;
                setState(cached);
            }
        } finally {
            setLoading(false);
        }
    }

    const shouldAutoLoad = !_statusLoaded || Date.now() - _statusLoadedAt > STATUS_STALE_MS;
    if (shouldAutoLoad) {
        _statusLoaded = true;
        (async () => {
            if (!_statusCache) {
                const cached = readWidgetCache();
                if (cached) {
                    _statusCache = cached;
                    setState(cached);
                }
            }
            const samples = readSpeedHistory();
            _chartHistory = toChartSeries(samples, "dl");
            _chartHistoryUl = toChartSeries(samples, "ul");
            await refresh();
        })();
    }

    function flash(msg: string): void {
        setNotice(msg);
        setTimeout(() => setNotice(null), 2500);
    }

    async function handleReboot(): Promise<void> {
        const ok = await confirmAction({
            title: "重启设备",
            message: "设备重启期间 Wi-Fi 与网络连接将中断约 1~2 分钟，是否确认重启？",
            confirmLabel: "立即重启",
        });
        if (!ok) return;
        flash("正在发送重启指令...");
        const success = await rebootDevice();
        if (success) flash("已成功发送重启指令，设备正在重启");
        else flash("重启指令发送失败，请在设置中检查管理密码");
    }

    const s = state ?? {
        model_name: "ZTE F50",
        net_summary: "中国联通 5G SA",
        signalbar: "4",
        band_text: "n78",
        rsrp_text: "-85dBm",
        snr_text: "5",
        rsrq_text: "-12",
        signal_quality: "极佳",
        signal_quality_color: "systemGreen",
        dl_speed: "0.0",
        ul_speed: "0.0",
        dl_bps: 0,
        ul_bps: 0,
        traffic_used_value: "0.00",
        traffic_used_unit: "GB",
        traffic_limit_value: "350.00",
        traffic_limit_unit: "GB",
        traffic_ratio: 0.05,
        daily_data_value: "0.00",
        daily_data_unit: "GB",
        monthly_data_value: "0.00",
        monthly_data_unit: "GB",
        reset_days: "今天重置",
        cpuusage: "24",
        cputemp: "53.1",
        mem_text: "62%",
        wifi_device_count: "0",
        wifi_ssid: "ZTE_5G_Wi-Fi",
        wifi_band_text: "5G",
        iccid_text: "--",
        msisdn_text: "--",
        imsi_text: "--",
        imei_text: "--",
        sim_pin_text: "--",
        qci: "9",
        qos_dl: "500Mbps",
        qos_ul: "100Mbps",
        wifi_clients: [],
    };

    const isOnline = s.net_summary !== "-- --" && !s.net_summary.includes("未插入");
    const netParts = (s.net_summary || "中国联通 5G SA").split(" ");
    const carrierName = netParts[0] && netParts[0] !== "--" ? netParts[0] : "中兴随身 Wi-Fi";
    const netType = netParts.slice(1).join(" ") || "5G SA";
    const bandName = s.band_text && s.band_text !== "无" ? s.band_text.toLowerCase() : "n78";

    // 平滑波形数据准备
    const dummyDl = [
        { id: "1", value: 35 },
        { id: "2", value: 42 },
        { id: "3", value: 68 },
        { id: "4", value: 95 },
        { id: "5", value: 139.3 },
    ];
    const dummyUl = [
        { id: "1", value: 28 },
        { id: "2", value: 20 },
        { id: "3", value: 18 },
        { id: "4", value: 24 },
        { id: "5", value: 29.5 },
    ];
    const dlSeries = _chartHistory.length >= 2 ? _chartHistory : dummyDl;
    const ulSeries = _chartHistoryUl.length >= 2 ? _chartHistoryUl : dummyUl;
    const trafficPercent = Math.max(0, Math.min(100, Math.round((s.traffic_ratio || 0) * 100)));

    return (
        <NavigationStack>
            <ScrollView
                refreshable={refresh}
                padding={SPACING.md}
                modifiers={modifiers().background(THEME.background)}
                toolbar={{
                    trailing: (
                        <HStack spacing={SPACING.sm}>
                            <Button
                                systemImage="arrow.clockwise"
                                action={refresh}
                                modifiers={modifiers()
                                    .padding(6)
                                    .background(THEME.card)
                                    .clipShape({ type: "circle" })
                                    .foregroundStyle(THEME.color.accent.light)}
                            />
                        </HStack>
                    ),
                }}
            >
                <VStack spacing={SPACING.md} alignment="leading" frame={{ maxWidth: "infinity" }}>
                    {/* 顶部标题与状态栏 */}
                    <HStack spacing={SPACING.sm} alignment="center" frame={{ maxWidth: "infinity" }}>
                        <VStack spacing={2} alignment="leading">
                            <Text font={FONT.title2} fontWeight="bold">
                                {s.model_name || "F50 Monitor"}
                            </Text>
                            <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                {s.update_time ? `更新于 ${s.update_time}` : "实时监控运行中"}
                            </Text>
                        </VStack>
                        <Spacer />
                        {notice ? (
                            <Text
                                font={FONT.caption}
                                fontWeight="medium"
                                foregroundStyle={THEME.color.accent.light}
                                modifiers={modifiers()
                                    .padding({ horizontal: 8, vertical: 4 })
                                    .background(THEME.capsule)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
                            >
                                {notice}
                            </Text>
                        ) : null}
                    </HStack>

                    {/* 卡片 1: 运营商与蜂窝信号 HERO 卡片 (像素级还原参考图) */}
                    <VStack
                        spacing={SPACING.md}
                        padding={SPACING.md}
                        alignment="leading"
                        frame={{ maxWidth: "infinity" }}
                        modifiers={modifiers()
                            .background(THEME.card)
                            .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                        overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                    >
                        {/* 顶栏：运营商 + 5G SA + n78 + 信号格 + 在线标签 */}
                        <HStack spacing={SPACING.sm} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Image
                                systemName={carrierIcon(carrierName)}
                                font={FONT.title3}
                                modifiers={modifiers().foregroundStyle(THEME.color.danger.light)}
                            />
                            <Text font={FONT.title} fontWeight="bold">
                                {carrierName}
                            </Text>
                            {/* 网络制式胶囊 */}
                            <Text
                                font={FONT.caption}
                                fontWeight="bold"
                                foregroundStyle={THEME.color.accent.light}
                                modifiers={modifiers()
                                    .padding({ horizontal: 7, vertical: 3 })
                                    .background(softTint(THEME.color.accent.light, 0.12))
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
                            >
                                {netType}
                            </Text>
                            {/* 频段胶囊 */}
                            <Text
                                font={FONT.caption}
                                fontWeight="bold"
                                foregroundStyle={THEME.color.purple.light}
                                modifiers={modifiers()
                                    .padding({ horizontal: 7, vertical: 3 })
                                    .background(softTint(THEME.color.purple.light, 0.12))
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
                            >
                                {bandName}
                            </Text>
                            <Spacer />
                            {/* 信号格数图标：使用 cellularbars 与 signalTint(state.signalbar) */}
                            <Image
                                systemName="cellularbars"
                                font={FONT.callout}
                                modifiers={modifiers().foregroundStyle(signalTint(state ? state.signalbar : s.signalbar))}
                            />
                            {/* 在线指示标签 */}
                            <HStack
                                spacing={4}
                                alignment="center"
                                modifiers={modifiers()
                                    .padding({ horizontal: 8, vertical: 3 })
                                    .background(softTint(THEME.color.success.light, 0.14))
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
                            >
                                <Circle
                                    frame={{ width: 6, height: 6 }}
                                    modifiers={modifiers().foregroundStyle(THEME.color.success.light)}
                                />
                                <Text font={FONT.caption} fontWeight="semibold" foregroundStyle={THEME.color.success.light}>
                                    {isOnline ? "在线" : "离线"}
                                </Text>
                            </HStack>
                        </HStack>

                        {/* 中层：签约状态胶囊条 */}
                        <HStack
                            spacing={SPACING.sm}
                            alignment="center"
                            padding={{ horizontal: SPACING.md, vertical: 8 }}
                            frame={{ maxWidth: "infinity" }}
                            modifiers={modifiers()
                                .background(THEME.capsule)
                                .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
                        >
                            <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                签约状态:
                            </Text>
                            <Text font={FONT.footnote} fontWeight="bold">
                                QCI: {s.qci || "9"}
                            </Text>
                            <Spacer />
                            <HStack spacing={2} alignment="center">
                                <Image
                                    systemName="arrow.down.circle.fill"
                                    font={FONT.caption}
                                    modifiers={modifiers().foregroundStyle(THEME.color.accent.light)}
                                />
                                <Text font={FONT.caption} fontWeight="bold" foregroundStyle={THEME.color.accent.light}>
                                    {s.qos_dl || "500Mbps"}
                                </Text>
                            </HStack>
                            <HStack spacing={2} alignment="center">
                                <Image
                                    systemName="arrow.up.circle.fill"
                                    font={FONT.caption}
                                    modifiers={modifiers().foregroundStyle(THEME.color.accent.light)}
                                />
                                <Text font={FONT.caption} fontWeight="bold" foregroundStyle={THEME.color.accent.light}>
                                    {s.qos_ul || "100Mbps"}
                                </Text>
                            </HStack>
                        </HStack>

                        {/* 底层：3 列指标 RSRP / SINR / RSRQ + 刻度指示条 + 评级文字 */}
                        <HStack spacing={SPACING.sm} alignment="center" frame={{ maxWidth: "infinity" }}>
                            {/* RSRP */}
                            <VStack spacing={3} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                    RSRP
                                </Text>
                                <Text font={FONT.title} fontWeight="bold" monospacedDigit>
                                    {s.rsrp_text !== "--" ? s.rsrp_text.replace(/dBm/i, " dBm") : "--"}
                                </Text>
                                <ZStack frame={{ maxWidth: "infinity", height: 4 }}>
                                    <RoundedRectangle cornerRadius={2} frame={{ maxWidth: "infinity", height: 4 }} modifiers={modifiers().foregroundStyle("quaternaryLabel")} />
                                    <RoundedRectangle cornerRadius={2} frame={{ maxWidth: "infinity", height: 4 }} modifiers={modifiers().foregroundStyle(THEME.color.success.light)} />
                                </ZStack>
                                <Text font={FONT.caption} fontWeight="bold" foregroundStyle={THEME.color.success.light}>
                                    {s.signal_quality || "极佳"}
                                </Text>
                            </VStack>

                            {/* SINR / SNR */}
                            <VStack spacing={3} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                    SINR / SNR
                                </Text>
                                <Text font={FONT.title} fontWeight="bold" monospacedDigit>
                                    {s.snr_text !== "--" ? `${s.snr_text} dB` : "--"}
                                </Text>
                                <ZStack frame={{ maxWidth: "infinity", height: 4 }}>
                                    <RoundedRectangle cornerRadius={2} frame={{ maxWidth: "infinity", height: 4 }} modifiers={modifiers().foregroundStyle("quaternaryLabel")} />
                                    <RoundedRectangle cornerRadius={2} frame={{ maxWidth: "infinity", height: 4 }} modifiers={modifiers().foregroundStyle(THEME.color.warning.light)} />
                                </ZStack>
                                <Text font={FONT.caption} fontWeight="bold" foregroundStyle={THEME.color.warning.light}>
                                    一般
                                </Text>
                            </VStack>

                            {/* RSRQ */}
                            <VStack spacing={3} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                    RSRQ
                                </Text>
                                <Text font={FONT.title} fontWeight="bold" monospacedDigit>
                                    {s.rsrq_text !== "--" ? `${s.rsrq_text} dB` : "--"}
                                </Text>
                                <ZStack frame={{ maxWidth: "infinity", height: 4 }}>
                                    <RoundedRectangle cornerRadius={2} frame={{ maxWidth: "infinity", height: 4 }} modifiers={modifiers().foregroundStyle("quaternaryLabel")} />
                                    <RoundedRectangle cornerRadius={2} frame={{ maxWidth: "infinity", height: 4 }} modifiers={modifiers().foregroundStyle(THEME.color.accent.light)} />
                                </ZStack>
                                <Text font={FONT.caption} fontWeight="bold" foregroundStyle={THEME.color.accent.light}>
                                    良好
                                </Text>
                            </VStack>
                        </HStack>
                    </VStack>

                    {/* 卡片 2 & 3: 左右双路实时速率波形卡片 (绿色下载 + 蓝色上传) */}
                    <HStack spacing={SPACING.md} alignment="center" frame={{ maxWidth: "infinity" }}>
                        {/* 实时下载卡片 */}
                        <VStack
                            spacing={SPACING.xs}
                            padding={SPACING.md}
                            alignment="leading"
                            frame={{ maxWidth: "infinity", height: 136 }}
                            modifiers={modifiers()
                                .background(THEME.card)
                                .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                            overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                        >
                            <HStack spacing={SPACING.xs} alignment="center">
                                <ZStack frame={{ width: 26, height: 26 }}>
                                    <Circle frame={{ width: 26, height: 26 }} modifiers={modifiers().foregroundStyle(THEME.color.success.light)} />
                                    <Image systemName="arrow.down" font={FONT.caption} modifiers={modifiers().foregroundStyle("white")} />
                                </ZStack>
                                <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                                    实时下载
                                </Text>
                            </HStack>
                            <Text font={FONT.title2} fontWeight="bold" monospacedDigit foregroundStyle={THEME.color.success.light}>
                                {s.dl_speed !== "--" && s.dl_speed !== "" ? `${s.dl_speed} KB/s` : "0.0 KB/s"}
                            </Text>
                            <Spacer />
                            {/* 动态平滑曲线 */}
                            <Chart
                                frame={{ maxWidth: "infinity", height: 38 }}
                                chartXAxis="hidden"
                                chartYAxis="hidden"
                            >
                                <AreaChart
                                    marks={dlSeries.map((p) => ({
                                        ...p,
                                        interpolationMethod: "catmullRom",
                                        foregroundStyle: softTint(THEME.color.success.light, 0.28),
                                    }))}
                                />
                                <LineChart
                                    marks={dlSeries.map((p) => ({
                                        ...p,
                                        interpolationMethod: "catmullRom",
                                        foregroundStyle: THEME.color.success.light,
                                    }))}
                                />
                            </Chart>
                        </VStack>

                        {/* 实时上传卡片 */}
                        <VStack
                            spacing={SPACING.xs}
                            padding={SPACING.md}
                            alignment="leading"
                            frame={{ maxWidth: "infinity", height: 136 }}
                            modifiers={modifiers()
                                .background(THEME.card)
                                .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                            overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                        >
                            <HStack spacing={SPACING.xs} alignment="center">
                                <ZStack frame={{ width: 26, height: 26 }}>
                                    <Circle frame={{ width: 26, height: 26 }} modifiers={modifiers().foregroundStyle(THEME.color.accent.light)} />
                                    <Image systemName="arrow.up" font={FONT.caption} modifiers={modifiers().foregroundStyle("white")} />
                                </ZStack>
                                <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                                    实时上传
                                </Text>
                            </HStack>
                            <Text font={FONT.title2} fontWeight="bold" monospacedDigit foregroundStyle={THEME.color.accent.light}>
                                {s.ul_speed !== "--" && s.ul_speed !== "" ? `${s.ul_speed} KB/s` : "0.0 KB/s"}
                            </Text>
                            <Spacer />
                            {/* 动态平滑曲线 */}
                            <Chart
                                frame={{ maxWidth: "infinity", height: 38 }}
                                chartXAxis="hidden"
                                chartYAxis="hidden"
                            >
                                <AreaChart
                                    marks={ulSeries.map((p) => ({
                                        ...p,
                                        interpolationMethod: "catmullRom",
                                        foregroundStyle: softTint(THEME.color.accent.light, 0.28),
                                    }))}
                                />
                                <LineChart
                                    marks={ulSeries.map((p) => ({
                                        ...p,
                                        interpolationMethod: "catmullRom",
                                        foregroundStyle: THEME.color.accent.light,
                                    }))}
                                />
                            </Chart>
                        </VStack>
                    </HStack>

                    {/* 卡片 4: 套餐流量卡片 (青色进度条 + 浮动百分比 + 当日/本月子列) */}
                    <VStack
                        spacing={SPACING.sm}
                        padding={SPACING.md}
                        alignment="leading"
                        frame={{ maxWidth: "infinity" }}
                        modifiers={modifiers()
                            .background(THEME.card)
                            .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                        overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                    >
                        <HStack spacing={SPACING.xs} alignment="center">
                            <Image
                                systemName="chart.bar.fill"
                                font={FONT.headline}
                                modifiers={modifiers().foregroundStyle(THEME.color.info.light)}
                            />
                            <Text font={FONT.headline} fontWeight="bold">
                                套餐流量
                            </Text>
                        </HStack>

                        <HStack spacing={SPACING.sm} alignment="firstTextBaseline" frame={{ maxWidth: "infinity" }}>
                            <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                                已用流量:
                            </Text>
                            <Text font={FONT.title2} fontWeight="bold" monospacedDigit>
                                {s.traffic_used_value !== "--" ? `${s.traffic_used_value} ${s.traffic_used_unit || "GB"}` : `${s.monthly_data_value} ${s.monthly_data_unit || "GB"}`}
                            </Text>
                            <Spacer />
                            <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                                总流量:
                            </Text>
                            <Text font={FONT.title2} fontWeight="bold" monospacedDigit>
                                {s.traffic_limit_value !== "--" ? `${s.traffic_limit_value} ${s.traffic_limit_unit || "GB"}` : "350.00 GB"}
                            </Text>
                        </HStack>

                        {/* 进度条 */}
                        <ZStack frame={{ maxWidth: "infinity", height: 8 }}>
                            <RoundedRectangle cornerRadius={4} frame={{ maxWidth: "infinity", height: 8 }} modifiers={modifiers().foregroundStyle("quaternaryLabel")} />
                            <HStack frame={{ maxWidth: "infinity" }}>
                                <RoundedRectangle
                                    cornerRadius={4}
                                    frame={{ width: `${trafficPercent}%`, height: 8 }}
                                    modifiers={modifiers().foregroundStyle(THEME.color.info.light)}
                                />
                                <Spacer />
                            </HStack>
                        </ZStack>

                        {/* 状态胶囊 + 重置天数 */}
                        <HStack spacing={SPACING.sm} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Text
                                font={FONT.caption}
                                fontWeight="bold"
                                foregroundStyle={THEME.color.info.light}
                                modifiers={modifiers()
                                    .padding({ horizontal: 8, vertical: 2 })
                                    .background(softTint(THEME.color.info.light, 0.15))
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
                            >
                                {`${trafficPercent}%`}
                            </Text>
                            <Spacer />
                            <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                {s.reset_days || "今天重置"}
                            </Text>
                        </HStack>

                        {/* 当日 / 本月子数据块 */}
                        <HStack spacing={SPACING.md} alignment="center" padding={{ top: SPACING.xs }} frame={{ maxWidth: "infinity" }}>
                            <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <HStack spacing={3} alignment="center">
                                    <Text font={FONT.caption}>☀️</Text>
                                    <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                        当日流量
                                    </Text>
                                </HStack>
                                <Text font={FONT.headline} fontWeight="bold" monospacedDigit>
                                    {s.daily_data_value !== "--" ? `${s.daily_data_value} ${s.daily_data_unit || "GB"}` : "0.00 GB"}
                                </Text>
                            </VStack>

                            <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <HStack spacing={3} alignment="center">
                                    <Text font={FONT.caption}>📅</Text>
                                    <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                        本月已用
                                    </Text>
                                </HStack>
                                <Text font={FONT.headline} fontWeight="bold" monospacedDigit>
                                    {s.monthly_data_value !== "--" ? `${s.monthly_data_value} ${s.monthly_data_unit || "GB"}` : "0.00 GB"}
                                </Text>
                            </VStack>
                        </HStack>
                    </VStack>

                    {/* 卡片 5: 2x2 硬件与 Wi-Fi 网格 */}
                    <VStack spacing={SPACING.sm} frame={{ maxWidth: "infinity" }}>
                        <HStack spacing={SPACING.md} frame={{ maxWidth: "infinity" }}>
                            {/* CPU 占用率 */}
                            <VStack
                                spacing={4}
                                padding={SPACING.md}
                                alignment="leading"
                                frame={{ maxWidth: "infinity", height: 72 }}
                                modifiers={modifiers()
                                    .background(THEME.card)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                                overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                            >
                                <HStack alignment="firstTextBaseline">
                                    <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                                        CPU 占用率
                                    </Text>
                                    <Spacer />
                                    <Text font={FONT.headline} fontWeight="bold" monospacedDigit>
                                        {s.cpuusage !== "--" ? `${s.cpuusage}%` : "暂不支持"}
                                    </Text>
                                </HStack>
                                <Spacer />
                                <ZStack frame={{ maxWidth: "infinity", height: 4 }}>
                                    <RoundedRectangle cornerRadius={2} frame={{ maxWidth: "infinity", height: 4 }} modifiers={modifiers().foregroundStyle("quaternaryLabel")} />
                                    <HStack frame={{ maxWidth: "infinity" }}>
                                        <RoundedRectangle
                                            cornerRadius={2}
                                            frame={{ width: `${Math.min(100, Math.max(0, parseInt(s.cpuusage, 10) || 15))}%`, height: 4 }}
                                            modifiers={modifiers().foregroundStyle("secondaryLabel")}
                                        />
                                        <Spacer />
                                    </HStack>
                                </ZStack>
                            </VStack>

                            {/* 内存 占用率 */}
                            <VStack
                                spacing={4}
                                padding={SPACING.md}
                                alignment="leading"
                                frame={{ maxWidth: "infinity", height: 72 }}
                                modifiers={modifiers()
                                    .background(THEME.card)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                                overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                            >
                                <HStack alignment="firstTextBaseline">
                                    <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                                        内存 占用率
                                    </Text>
                                    <Spacer />
                                    <Text font={FONT.headline} fontWeight="bold" monospacedDigit foregroundStyle={THEME.color.warning.light}>
                                        {s.mem_text !== "--" ? s.mem_text : "暂不支持"}
                                    </Text>
                                </HStack>
                                <Spacer />
                                <ZStack frame={{ maxWidth: "infinity", height: 4 }}>
                                    <RoundedRectangle cornerRadius={2} frame={{ maxWidth: "infinity", height: 4 }} modifiers={modifiers().foregroundStyle("quaternaryLabel")} />
                                    <HStack frame={{ maxWidth: "infinity" }}>
                                        <RoundedRectangle
                                            cornerRadius={2}
                                            frame={{ width: `${Math.min(100, Math.max(0, parseInt(s.mem_text, 10) || 60))}%`, height: 4 }}
                                            modifiers={modifiers().foregroundStyle(THEME.color.warning.light)}
                                        />
                                        <Spacer />
                                    </HStack>
                                </ZStack>
                            </VStack>
                        </HStack>

                        <HStack spacing={SPACING.md} frame={{ maxWidth: "infinity" }}>
                            {/* 芯片温度 */}
                            <HStack
                                spacing={SPACING.sm}
                                padding={SPACING.md}
                                alignment="center"
                                frame={{ maxWidth: "infinity", height: 72 }}
                                modifiers={modifiers()
                                    .background(THEME.card)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                                overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                            >
                                <Image
                                    systemName="thermometer.medium"
                                    font={FONT.title2}
                                    modifiers={modifiers().foregroundStyle(THEME.color.warning.light)}
                                />
                                <VStack spacing={2} alignment="leading">
                                    <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                                        芯片温度
                                    </Text>
                                    <Text font={FONT.title3} fontWeight="bold" monospacedDigit foregroundStyle={THEME.color.warning.light}>
                                        {s.cputemp !== "--" ? `${s.cputemp} ℃` : "暂不支持"}
                                    </Text>
                                </VStack>
                            </HStack>

                            {/* Wi-Fi 连接设备 */}
                            <HStack
                                spacing={SPACING.sm}
                                padding={SPACING.md}
                                alignment="center"
                                frame={{ maxWidth: "infinity", height: 72 }}
                                modifiers={modifiers()
                                    .background(THEME.card)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                                overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                            >
                                <Image
                                    systemName="wifi"
                                    font={FONT.title2}
                                    modifiers={modifiers().foregroundStyle(THEME.color.purple.light)}
                                />
                                <VStack spacing={2} alignment="leading">
                                    <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                                        Wi-Fi 连接设备
                                    </Text>
                                    <Text font={FONT.title3} fontWeight="bold" monospacedDigit>
                                        {`${s.wifi_device_count} 台`}
                                    </Text>
                                </VStack>
                            </HStack>
                        </HStack>
                    </VStack>

                    {/* 卡片 6: SIM 卡与设备详情 */}
                    <VStack
                        spacing={SPACING.sm}
                        padding={SPACING.md}
                        alignment="leading"
                        frame={{ maxWidth: "infinity" }}
                        modifiers={modifiers()
                            .background(THEME.card)
                            .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                        overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                    >
                        <Text font={FONT.headline} fontWeight="bold">
                            SIM 卡与网络详情
                        </Text>
                        <HStack alignment="center">
                            <Text font={FONT.body} foregroundStyle="secondaryLabel">ICCID</Text>
                            <Spacer />
                            <Text font={FONT.body} fontWeight="semibold" monospacedDigit>
                                {s.iccid_text || "暂不支持"}
                            </Text>
                        </HStack>
                        <HStack alignment="center">
                            <Text font={FONT.body} foregroundStyle="secondaryLabel">本机号码</Text>
                            <Spacer />
                            <Text font={FONT.body} fontWeight="semibold" monospacedDigit>
                                {s.msisdn_text || "暂不支持"}
                            </Text>
                        </HStack>
                        <HStack alignment="center">
                            <Text font={FONT.body} foregroundStyle="secondaryLabel">SIM PIN 状态</Text>
                            <Spacer />
                            <Text font={FONT.body} fontWeight="semibold">
                                {s.sim_pin_text || "暂不支持"}
                            </Text>
                        </HStack>
                        <HStack alignment="center">
                            <Text font={FONT.body} foregroundStyle="secondaryLabel">Wi-Fi 热点</Text>
                            <Spacer />
                            <Text font={FONT.body} fontWeight="semibold">
                                {s.wifi_ssid} ({s.wifi_band_text})
                            </Text>
                        </HStack>
                    </VStack>

                    {/* 卡片 7: 快捷操作 */}
                    <VStack
                        spacing={SPACING.sm}
                        padding={SPACING.md}
                        alignment="leading"
                        frame={{ maxWidth: "infinity" }}
                        modifiers={modifiers()
                            .background(THEME.card)
                            .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                        overlay={<RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />}
                    >
                        <Text font={FONT.headline} fontWeight="bold">
                            快捷操作
                        </Text>
                        <HStack spacing={SPACING.md} frame={{ maxWidth: "infinity" }}>
                            <Button
                                title="刷新状态"
                                systemImage="arrow.clockwise"
                                action={refresh}
                                modifiers={modifiers()
                                    .frame({ maxWidth: "infinity" })
                                    .padding(10)
                                    .background(THEME.capsule)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.chip })}
                            />
                            <Button
                                title="重启设备"
                                systemImage="arrow.counterclockwise.circle.fill"
                                action={handleReboot}
                                modifiers={modifiers()
                                    .frame({ maxWidth: "infinity" })
                                    .padding(10)
                                    .background(THEME.capsule)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.chip })
                                    .foregroundStyle(THEME.color.warning.light)}
                            />
                        </HStack>
                    </VStack>
                </VStack>
            </ScrollView>
        </NavigationStack>
    );
}
