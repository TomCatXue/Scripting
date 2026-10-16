// @ts-nocheck
// F50 Widget 状态页：设备 / SIM / 实时速率与曲线 / 流量 / 硬件 / Wi-Fi 客户端 / 快捷操作
import {
    NavigationStack,
    List,
    Section,
    Text,
    Button,
    HStack,
    VStack,
    Spacer,
    Image,
    Rectangle,
    Toolbar,
    ToolbarItem,
    useState,
    ForEach,
    Chart,
    LineChart,
    AreaChart,
    ChartPlotStyle,
    modifiers,
    Widget,
} from "scripting";
import { fetchWidgetSnapshot, WidgetState, WifiClient, readWidgetCache, saveWidgetCache, appendSpeedSample, readSpeedHistory, toChartSeries } from "./widget_data";
import { SPACING, RADIUS, FONT, THEME, softTint } from "./theme";
import { SectionCard, DataRow, MetricTile, RingGauge, StatusPill, EmptyState, ErrorState, LoadingState, confirmAction } from "./ui";
import { rebootDevice } from "./api";

let _statusLoaded = false;
let _chartHistory: Array<{ id: string; value: number }> = [];
let _chartHistoryUl: Array<{ id: string; value: number }> = [];

/** 温度/内存等指标 → 语义色（数值 + 文字双通道，不依赖颜色单独表达状态） */
function tempTint(v: string): string {
    const n = parseFloat(String(v));
    if (!isFinite(n)) return "secondaryLabel";
    if (n < 50) return THEME.color.success.light;
    if (n < 70) return THEME.color.warning.light;
    return THEME.color.danger.light;
}

function tempLabel(v: string): string {
    const n = parseFloat(String(v));
    if (!isFinite(n)) return "暂不支持";
    if (n < 50) return "正常";
    if (n < 70) return "偏高";
    return "过热";
}

function memTint(text: string): string {
    const n = parseFloat(String(text));
    if (!isFinite(n)) return "secondaryLabel";
    if (n < 70) return THEME.color.success.light;
    if (n < 88) return THEME.color.warning.light;
    return THEME.color.danger.light;
}

function signalTint(bars: string): string {
    const n = parseInt(String(bars), 10);
    if (!isFinite(n)) return "secondaryLabel";
    if (n >= 4) return THEME.color.success.light;
    if (n === 3) return THEME.color.info.light;
    if (n === 2) return THEME.color.warning.light;
    return THEME.color.danger.light;
}

function signalLabel(bars: string): string {
    const n = parseInt(String(bars), 10);
    if (!isFinite(n)) return "暂不支持";
    if (n >= 4) return "强";
    if (n === 3) return "良好";
    if (n === 2) return "一般";
    return "弱";
}

function signalBarsFill(bars: string): number {
    const n = parseInt(String(bars), 10);
    if (!isFinite(n)) return 0;
    if (n >= 4) return 1;
    if (n === 3) return 0.75;
    if (n === 2) return 0.5;
    if (n === 1) return 0.25;
    return 0.05;
}

export function StatusView({ onOpenPlugins, onOpenSms, onOpenPhone }: any = {}) {
    const [state, setState] = useState<WidgetState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [clientListOpen, setClientListOpen] = useState(false);

    async function refresh(): Promise<void> {
        setLoading(true);
        setError(null);
        try {
            const { state: next, error: err } = await fetchWidgetSnapshot();
            setState(next);
            if (err) setError(err);
            saveWidgetCache(next);
            // 采样实时速率，累积成曲线（设备只给瞬时值）
            const samples = appendSpeedSample({ t: Date.now(), dl: next.dl_bps, ul: next.ul_bps });
            _chartHistory = toChartSeries(samples, "dl");
            _chartHistoryUl = toChartSeries(samples, "ul");
        } catch (e) {
            setError(String((e as Error)?.message || e));
            const cached = readWidgetCache();
            if (cached) setState(cached);
        } finally {
            setLoading(false);
        }
    }

    if (!state && !_statusLoaded) {
        _statusLoaded = true;
        (async () => {
            const cached = readWidgetCache();
            if (cached) setState(cached);
            const samples = readSpeedHistory();
            if (samples.length > 0) {
                _chartHistory = toChartSeries(samples, "dl");
                _chartHistoryUl = toChartSeries(samples, "ul");
            }
            await refresh();
        })();
    }

    function flash(message: string): void {
        setNotice(message);
        setTimeout(() => setNotice(null), 2200);
    }

    async function handleReboot(): Promise<void> {
        const ok = await confirmAction({
            title: "重启设备",
            message: "设备将立即重启，网络会中断约 1 分钟。是否继续？",
            confirmLabel: "重启",
        });
        if (!ok) return;
        try {
            const sent = await rebootDevice();
            if (sent) flash("已发送重启指令，设备即将断开");
            else setError("重启失败：设备未接受指令（可能未配置 ZTE 后台密码）");
        } catch (e) {
            setError("重启失败：" + String((e as Error)?.message || e));
        }
    }

    function copyText(text: string, what: string): void {
        try {
            Pasteboard.setString(text);
            flash(what + " 已复制");
        } catch (_) {
            setError("复制失败");
        }
    }

    if (!state) {
        return (
            <NavigationStack navigationTitle="状态" navigationBarTitleDisplayMode="large">
                <List listStyle="insetGrouped">
                    <Section>
                        <LoadingState message="正在读取设备状态…" />
                    </Section>
                </List>
            </NavigationStack>
        );
    }

    const online = state.model_name !== "--";
    const speedText = state.dl_speed === "--" && state.ul_speed === "--";
    const hasChart = _chartHistory.length >= 2;

    // Wi-Fi 客户端列表页
    if (clientListOpen) {
        return (
            <NavigationStack>
                <List
                    listStyle="insetGrouped"
                    navigationTitle="已连接设备"
                    navigationBarTitleDisplayMode="inline"
                    toolbar={{
                        topBarLeading: <Button title="返回" systemImage="chevron.left" action={() => setClientListOpen(false)} />,
                    }}
                >
                    {state.wifi_clients.length === 0 ? (
                        <Section>
                            <EmptyState
                                icon="wifi.slash"
                                title="没有客户端信息"
                                message="该固件未提供客户端列表，或当前没有设备连接。"
                            />
                        </Section>
                    ) : (
                        <Section
                            header={<Text>共 {state.wifi_clients.length} 台</Text>}
                            footer={<Text font={FONT.caption}>MAC 地址已部分遮蔽；完整地址请在设备管理页面查看。</Text>}
                        >
                            {state.wifi_clients.map((client: WifiClient, index: number) => (
                                <HStack key={`client-${index}`} spacing={SPACING.sm} alignment="center">
                                    <Image
                                        systemName="laptopcomputer"
                                        font={FONT.body}
                                        frame={{ width: 20, height: 20 }}
                                        modifiers={modifiers().foregroundStyle("secondaryLabel")}
                                    />
                                    <VStack spacing={2} alignment="leading">
                                        <Text font={FONT.body} fontWeight="semibold" lineLimit={1}>{client.name}</Text>
                                        <Text font={FONT.caption} foregroundStyle="secondaryLabel" monospacedDigit>
                                            {client.ip} · {client.mac}
                                        </Text>
                                    </VStack>
                                    <Spacer />
                                </HStack>
                            ))}
                        </Section>
                    )}
                </List>
            </NavigationStack>
        );
    }

    return (
        <NavigationStack navigationTitle={online ? state.model_name : "状态"} navigationBarTitleDisplayMode="large">
            <List listStyle="insetGrouped" refreshable={refresh}>
                <Toolbar>
                    <ToolbarItem placement="topBarTrailing">
                        <Button title="刷新" systemImage="arrow.clockwise" action={refresh} />
                    </ToolbarItem>
                </Toolbar>

                {/* 设备概览 */}
                <Section>
                    <SectionCard>
                        <HStack spacing={SPACING.md} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Image
                                systemName="wifi.router.fill"
                                font={30}
                                frame={{ width: 36, height: 36 }}
                                modifiers={modifiers().foregroundStyle(online ? THEME.color.accent.light : "tertiaryLabel")}
                            />
                            <VStack spacing={3} alignment="leading">
                                <Text font={FONT.title} fontWeight="bold" lineLimit={1}>
                                    {online ? state.model_name : "未连接设备"}
                                </Text>
                                <HStack spacing={SPACING.sm}>
                                    <StatusPill
                                        text={online ? "在线" : "离线"}
                                        tint={online ? THEME.color.success.light : THEME.color.danger.light}
                                    />
                                    {state.ufi_ver !== "--" ? (
                                        <Text font={FONT.caption} foregroundStyle="secondaryLabel">UFI v{state.ufi_ver}</Text>
                                    ) : null}
                                </HStack>
                            </VStack>
                            <Spacer />
                            <Image
                                systemName="cellularbars"
                                variableValue={signalBarsFill(state.signalbar)}
                                font={22}
                                frame={{ width: 28, height: 28 }}
                                modifiers={modifiers().foregroundStyle(signalTint(state.signalbar))}
                            />
                        </HStack>
                        <Text font={FONT.caption} foregroundStyle="tertiaryLabel" monospacedDigit>
                            更新于 {state.update_time}
                        </Text>
                    </SectionCard>
                </Section>

                {error ? (
                    <Section>
                        <ErrorState message={error} onRetry={refresh} />
                    </Section>
                ) : null}

                {/* SIM 卡 */}
                <Section header={<Text>SIM 卡</Text>}>
                    <SectionCard>
                        <DataRow icon="simcard.fill" iconColor={THEME.color.accent.light} title="运营商" value={state.net_summary} />
                        <DataRow icon="antenna.radiowaves.left.and.right" iconColor={THEME.color.info.light} title="信号质量" value={signalLabel(state.signalbar) + "（" + state.signalbar + " 格）"} />
                        <DataRow icon="gauge.with.dots.needle.bottom.50percent" iconColor={THEME.color.info.light} title="RSRP" value={state.rsrp_text} />
                        <DataRow icon="gauge.medium" iconColor={THEME.color.info.light} title="RSRQ" value={state.rsrq_text} />
                        <DataRow icon="gauge.high" iconColor={THEME.color.info.light} title="SNR" value={state.snr_text} />
                        <DataRow
                            icon="creditcard"
                            iconColor="secondaryLabel"
                            title="ICCID"
                            value={state.iccid_text}
                            unavailable={state.iccid_text === "--"}
                        />
                        <DataRow
                            icon="phone"
                            iconColor="secondaryLabel"
                            title="SIM 号码"
                            value={state.msisdn_text}
                            unavailable={state.msisdn_text === "--"}
                        />
                        <DataRow
                            icon="lock.shield"
                            iconColor="secondaryLabel"
                            title="PIN 锁"
                            value={state.sim_pin_text}
                            unavailable={state.sim_pin_text === "--"}
                        />
                        {state.iccid_text !== "--" ? (
                            <Button
                                title="复制 ICCID"
                                systemImage="doc.on.doc"
                                action={() => copyText(state.iccid_text, "ICCID")}
                            />
                        ) : null}
                    </SectionCard>
                </Section>

                {/* 实时速率与曲线 */}
                <Section header={<Text>实时速率</Text>}>
                    <SectionCard
                        footer={
                            speedText
                                ? "设备未上报实时速率（该固件可能不提供此字段）。"
                                : "曲线为应用采样记录，非设备端历史数据。"
                        }
                    >
                        <HStack spacing={SPACING.sm}>
                            <VStack spacing={2} alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                                <HStack spacing={4} alignment="center">
                                    <Image
                                        systemName="arrow.down.circle.fill"
                                        font={FONT.footnote}
                                        frame={{ width: 16, height: 16 }}
                                        modifiers={modifiers().foregroundStyle(THEME.color.accent.light)}
                                    />
                                    <Text font={FONT.caption} foregroundStyle="secondaryLabel">下行</Text>
                                </HStack>
                                <Text font={FONT.metric} fontWeight="bold" monospacedDigit contentTransition="numericText">
                                    {state.dl_speed}
                                </Text>
                            </VStack>
                            <Rectangle fill="separator" frame={{ width: 1, height: 40 }} />
                            <VStack spacing={2} alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                                <HStack spacing={4} alignment="center">
                                    <Image
                                        systemName="arrow.up.circle.fill"
                                        font={FONT.footnote}
                                        frame={{ width: 16, height: 16 }}
                                        modifiers={modifiers().foregroundStyle(THEME.color.info.light)}
                                    />
                                    <Text font={FONT.caption} foregroundStyle="secondaryLabel">上行</Text>
                                </HStack>
                                <Text font={FONT.metric} fontWeight="bold" monospacedDigit contentTransition="numericText">
                                    {state.ul_speed}
                                </Text>
                            </VStack>
                        </HStack>

                        {hasChart ? (
                            <Chart
                                frame={{ maxWidth: "infinity", height: 96 }}
                                chartXAxis="hidden"
                                chartYAxis="hidden"
                                chartYScale={{ from: 0, to: Math.max(0.1, Math.max(..._chartHistory.map((p) => p.value), ..._chartHistoryUl.map((p) => p.value)) * 1.15) }}
                            >
                                <AreaChart
                                    marks={_chartHistoryUl.map((p) => ({
                                        ...p,
                                        interpolationMethod: "catmullRom",
                                        foregroundStyle: softTint(THEME.color.info.light, 0.25),
                                    }))}
                                />
                                <AreaChart
                                    marks={_chartHistory.map((p) => ({
                                        ...p,
                                        interpolationMethod: "catmullRom",
                                        foregroundStyle: softTint(THEME.color.accent.light, 0.28),
                                    }))}
                                />
                                <LineChart
                                    marks={_chartHistoryUl.map((p) => ({
                                        ...p,
                                        interpolationMethod: "catmullRom",
                                        foregroundStyle: THEME.color.info.light,
                                        lineStyle: { lineWidth: 1.6, lineCap: "round", lineJoin: "round" },
                                    }))}
                                />
                                <LineChart
                                    marks={_chartHistory.map((p) => ({
                                        ...p,
                                        interpolationMethod: "catmullRom",
                                        foregroundStyle: THEME.color.accent.light,
                                        lineStyle: { lineWidth: 2, lineCap: "round", lineJoin: "round" },
                                    }))}
                                />
                                <ChartPlotStyle>{(plot: any) => plot.clipShape("rect")}</ChartPlotStyle>
                            </Chart>
                        ) : (
                            <EmptyState
                                icon="chart.xyaxis.line"
                                title="暂无曲线数据"
                                message="保持本页打开片刻即可累积采样（每分钟一个点）。"
                            />
                        )}
                        <HStack spacing={SPACING.md}>
                            <HStack spacing={4} alignment="center">
                                <Rectangle fill={THEME.color.accent.light} frame={{ width: 10, height: 3 }} />
                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">下行</Text>
                            </HStack>
                            <HStack spacing={4} alignment="center">
                                <Rectangle fill={THEME.color.info.light} frame={{ width: 10, height: 3 }} />
                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">上行</Text>
                            </HStack>
                        </HStack>
                    </SectionCard>
                </Section>

                {/* 流量统计 */}
                <Section header={<Text>流量统计</Text>}>
                    <SectionCard>
                        <HStack spacing={SPACING.sm}>
                            <MetricTile
                                label="今日流量"
                                value={state.daily_data_value}
                                unit={state.daily_data_unit}
                                tint={THEME.color.warning.light}
                            />
                            <MetricTile
                                label="本月流量"
                                value={state.monthly_data_value}
                                unit={state.monthly_data_unit}
                                tint={THEME.color.accent.light}
                            />
                        </HStack>
                        {state.traffic_limit_value !== "--" ? (
                            <>
                                <DataRow
                                    icon="chart.bar.fill"
                                    iconColor={state.traffic_color}
                                    title="套餐用量"
                                    value={`${state.traffic_used_value}${state.traffic_used_unit} / ${state.traffic_limit_value}${state.traffic_limit_unit}`}
                                    valueColor={state.traffic_color}
                                />
                                <HStack spacing={SPACING.sm} alignment="center">
                                    <RingGauge
                                        value={Math.round(state.traffic_ratio * 100)}
                                        max={100}
                                        valueText={Math.round(state.traffic_ratio * 100) + "%"}
                                        label="已用"
                                        tint={state.traffic_color}
                                        size={70}
                                    />
                                    <VStack spacing={4} alignment="leading">
                                        <Text font={FONT.footnote} fontWeight="semibold">套餐进度</Text>
                                        {state.reset_days ? (
                                            <Text font={FONT.caption} foregroundStyle="secondaryLabel">{state.reset_days}</Text>
                                        ) : (
                                            <Text font={FONT.caption} foregroundStyle="tertiaryLabel">重置日未知</Text>
                                        )}
                                        <Text font={FONT.caption} foregroundStyle="tertiaryLabel">
                                            套餐速率与实时测速为不同口径
                                        </Text>
                                    </VStack>
                                </HStack>
                            </>
                        ) : (
                            <DataRow icon="chart.bar" title="套餐用量" value="" unavailable />
                        )}
                    </SectionCard>
                </Section>

                {/* 硬件指标 */}
                <Section header={<Text>设备运行状态</Text>}>
                    <SectionCard>
                        <HStack spacing={SPACING.sm}>
                            <VStack
                                spacing={SPACING.sm}
                                alignment="center"
                                padding={SPACING.sm}
                                frame={{ maxWidth: "infinity" }}
                                modifiers={modifiers()
                                    .background(THEME.card)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.chip })}
                            >
                                <RingGauge
                                    value={parseFloat(state.cputemp) || 0}
                                    max={100}
                                    valueText={state.cputemp === "--" ? "--" : state.cputemp + "°"}
                                    label="芯片温度"
                                    tint={tempTint(state.cputemp)}
                                    size={68}
                                />
                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">{tempLabel(state.cputemp)}</Text>
                            </VStack>
                            <VStack
                                spacing={SPACING.sm}
                                alignment="center"
                                padding={SPACING.sm}
                                frame={{ maxWidth: "infinity" }}
                                modifiers={modifiers()
                                    .background(THEME.card)
                                    .clipShape({ type: "rect", cornerRadius: RADIUS.chip })}
                            >
                                <RingGauge
                                    value={parseFloat(state.mem_text) || 0}
                                    max={100}
                                    valueText={state.mem_text}
                                    label="内存"
                                    tint={memTint(state.mem_text)}
                                    size={68}
                                />
                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                    {state.mem_text === "--" ? "暂不支持" : "占用率"}
                                </Text>
                            </VStack>
                        </HStack>
                        <DataRow
                            icon="cpu.fill"
                            iconColor={THEME.color.accent.light}
                            title="CPU 使用率"
                            value={state.cpuusage === "--" ? "" : state.cpuusage + "%"}
                            unavailable={state.cpuusage === "--"}
                        />
                        <DataRow
                            icon="point.3.connected.trianglepath.dotted"
                            iconColor={THEME.color.info.light}
                            title="网络制式"
                            value={state.net_summary}
                        />
                        <DataRow
                            icon="cube.fill"
                            iconColor="secondaryLabel"
                            title="频段"
                            value={state.band_text}
                            unavailable={state.band_text === "—"}
                        />
                        <DataRow
                            icon="battery.100percent"
                            iconColor={state.battery_icon_color}
                            title="电量"
                            value={state.battery === "--" ? "" : state.battery + "%"}
                            unavailable={state.battery === "--"}
                        />
                        <DataRow
                            icon="key.fill"
                            iconColor={state.zreq_used ? THEME.color.success.light : "secondaryLabel"}
                            title="ZTE 登录"
                            value={state.zreq_used ? "已登录" : "匿名读取"}
                        />
                    </SectionCard>
                </Section>

                {/* Wi-Fi */}
                <Section header={<Text>Wi-Fi</Text>}>
                    <SectionCard
                        footer={
                            state.wifi_clients.length === 0
                                ? "该固件未提供客户端列表，仅显示连接数量。"
                                : null
                        }
                    >
                        <DataRow icon="wifi" iconColor={THEME.color.info.light} title="名称" value={state.wifi_ssid} />
                        <DataRow icon="dot.radiowaves.left.and.right" iconColor={THEME.color.info.light} title="频段" value={state.wifi_band_text} />
                        <DataRow
                            icon="laptopcomputer.and.iphone"
                            iconColor={THEME.color.accent.light}
                            title="已连接"
                            value={state.wifi_device_count + " 台"}
                        />
                        <Button
                            title="查看已连接设备"
                            systemImage="list.bullet"
                            action={() => setClientListOpen(true)}
                        />
                    </SectionCard>
                </Section>

                {/* 快捷操作 */}
                <Section header={<Text>快捷操作</Text>}>
                    <VStack spacing={SPACING.sm} frame={{ maxWidth: "infinity" }}>
                        <HStack spacing={SPACING.sm}>
                            <Button
                                title="刷新状态"
                                systemImage="arrow.clockwise"
                                action={refresh}
                                modifiers={modifiers().frame({ maxWidth: "infinity" })}
                            />
                            <Button
                                title="发送短信"
                                systemImage="message"
                                action={() => onOpenSms && onOpenSms()}
                                modifiers={modifiers().frame({ maxWidth: "infinity" })}
                            />
                        </HStack>
                        <HStack spacing={SPACING.sm}>
                            <Button
                                title="打电话"
                                systemImage="phone"
                                action={() => onOpenPhone && onOpenPhone()}
                                modifiers={modifiers().frame({ maxWidth: "infinity" })}
                            />
                            <Button
                                title="插件中心"
                                systemImage="puzzlepiece.extension"
                                action={() => onOpenPlugins && onOpenPlugins()}
                                modifiers={modifiers().frame({ maxWidth: "infinity" })}
                            />
                        </HStack>
                        <Button
                            title="重启设备"
                            systemImage="power"
                            role="destructive"
                            action={handleReboot}
                            modifiers={modifiers().frame({ maxWidth: "infinity" })}
                        />
                    </VStack>
                </Section>

                {notice ? (
                    <Section>
                        <HStack spacing={6}>
                            <Image
                                systemName="checkmark.circle.fill"
                                font={FONT.footnote}
                                frame={{ width: 16, height: 16 }}
                                modifiers={modifiers().foregroundStyle(THEME.color.success.light)}
                            />
                            <Text font={FONT.footnote}>{notice}</Text>
                        </HStack>
                    </Section>
                ) : null}
            </List>
        </NavigationStack>
    );
}
