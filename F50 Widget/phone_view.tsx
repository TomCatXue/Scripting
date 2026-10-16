// @ts-nocheck
// F50 Widget 电话页
//
// 能力边界（重要）：
//   - 通话由设备侧 UFI-TOOLS 完整版 + 面具模块（Magisk）提供，音频路由由模块修复；
//   - 本页只通过 GET /api/AT 做 AT 透传（ATD / ATA / ATH / AT+CLCC），不做音频编解码；
//   - 设备未安装完整版或未启用 VoLTE 时，页面如实展示「未提供通话接口」，绝不做假通话。
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
    useState,
    modifiers,
} from "scripting";
import { fetchAT, fetchVolteState } from "./api";
import {
    buildDialCommand,
    buildAnswerCommand,
    buildHangupCommand,
    buildStatusCommand,
    parseClcc,
    summarizeCall,
    parseAtsSuccess,
    CallInfo,
    CallStatus,
} from "./call";
import { SPACING, RADIUS, FONT, THEME, softTint } from "./theme";
import { SectionCard, StatusPill, EmptyState, ErrorState, LoadingState, confirmAction } from "./ui";

const KEYCALL_LOG = "F50.callLog";
const CLCC_INTERVAL_MS = 3000;

// 探测结果缓存到模块级：标签切走会卸载组件、state 归零，只存 state 会导致再次进入时永远停在「检测中」
let _probeResult: boolean | null = null;
// 进行中的探测：复用同一个 Promise，避免重复探测，也避免第二次进入时直接跳过
let _probePromise: Promise<void> | null = null;
// 通话中状态轮询句柄（模块级：重渲染不会产生第二个定时器）
let _clccTimer: any = null;
// 通话开始时间（模块级：定时器回调里读 state 会拿到创建时的旧值，计时将永远停在 0）
let _callStartedAt: number | null = null;

// ===================== 通话记录（本地存储，设备接口未提供） =====================

export interface CallLogEntry {
    number: string;
    kind: "incoming" | "outgoing" | "missed";
    at: number;
    durationSec: number;
}

export function readCallLog(): CallLogEntry[] {
    try {
        const raw = Storage.get(KEYCALL_LOG);
        if (!raw) return [];
        const list = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(list) ? list : [];
    } catch (_) {
        return [];
    }
}

export function appendCallLog(entry: CallLogEntry): void {
    try {
        const list = readCallLog();
        list.unshift(entry);
        Storage.set(KEYCALL_LOG, JSON.stringify(list.slice(0, 200)));
    } catch (_) {
        // 存储不可用时只影响历史记录，不阻塞通话
    }
}

/** 通话记录 → 展示文案；kind 决定图标与颜色 */
export function callLogMeta(kind: CallLogEntry["kind"]): { icon: string; color: string; label: string } {
    if (kind === "missed") return { icon: "phone.down.fill", color: THEME.color.danger.light, label: "未接" };
    if (kind === "outgoing") return { icon: "phone.arrow.up.right.fill", color: THEME.color.success.light, label: "呼出" };
    return { icon: "phone.arrow.down.left.fill", color: THEME.color.accent.light, label: "呼入" };
}

export function formatDuration(sec: number): string {
    const total = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m <= 0) return `${s} 秒`;
    return `${m} 分 ${s} 秒`;
}

export function formatCallTime(at: number): string {
    const d = new Date(Number(at) || 0);
    if (isNaN(d.getTime())) return "--";
    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 当前通话状态 → 界面文案 */
export function statusText(status: CallStatus): string {
    switch (status) {
        case "dialing": return "正在拨出…";
        case "alerting": return "对方振铃…";
        case "active": return "通话中";
        case "held": return "已保持";
        case "incoming": return "来电";
        case "waiting": return "呼叫等待";
        default: return "";
    }
}

// ===================== 状态页 =====================

const DIAL_KEYS: Array<{ label: string; value: string; letters?: string }> = [
    { label: "1", value: "1" },
    { label: "2", value: "2", letters: "ABC" },
    { label: "3", value: "3", letters: "DEF" },
    { label: "4", value: "4", letters: "GHI" },
    { label: "5", value: "5", letters: "JKL" },
    { label: "6", value: "6", letters: "MNO" },
    { label: "7", value: "7", letters: "PQRS" },
    { label: "8", value: "8", letters: "TUV" },
    { label: "9", value: "9", letters: "WXYZ" },
    { label: "*", value: "*" },
    { label: "0", value: "0", letters: "+" },
    { label: "#", value: "#" },
];

export function PhoneView() {
    // null = 尚未探测；false = 无通话能力；true = 可用
    const [capability, setCapability] = useState<boolean | null>(_probeResult);
    const [probeError, setProbeError] = useState<string | null>(null);
    const [dialNumber, setDialNumber] = useState("");
    const [calls, setCalls] = useState<CallInfo[]>([]);
    const [callError, setCallError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [logs, setLogs] = useState<CallLogEntry[]>(readCallLog());
    const [tab, setTab] = useState<"keypad" | "recent">("keypad");
    const [elapsed, setElapsed] = useState(0);

    const status = summarizeCall(calls);
    const inCall = status !== "idle";

    async function probe(): Promise<void> {
        setProbeError(null);
        try {
            const enabled = await fetchVolteState(0);
            _probeResult = enabled !== null;
            setCapability(_probeResult);
            if (enabled === null) {
                setProbeError("设备未返回通话接口。请确认已安装 UFI-TOOLS 完整版，且面具模块已启用语音能力。");
            }
        } catch (e) {
            _probeResult = false;
            setCapability(false);
            setProbeError(String((e as Error)?.message || e));
        }
    }

    /** 复用进行中的探测；结束后允许下一次重新探测（重试按钮 / 再次进入） */
    function startProbe(): Promise<void> {
        if (_probePromise === null) {
            _probePromise = probe().finally(() => {
                _probePromise = null;
            });
        }
        return _probePromise;
    }

    if (capability === null) {
        // 用模块级结果回填，兼顾「探测进行中切走再切回」的情况
        const pending = startProbe();
        (async () => {
            await pending;
            if (_probeResult !== null) setCapability(_probeResult);
        })();
    }

    // 通话中才轮询 AT+CLCC；空闲一律停止，避免持续占用设备
    function startPolling(): void {
        stopPolling();
        const id = setInterval(async () => {
            try {
                const raw = await fetchAT(buildStatusCommand());
                const list = parseClcc(raw);
                setCalls(list);
                // 计时在同一次轮询里更新，避免在渲染期做时间计算
                if (_callStartedAt !== null) setElapsed(Math.floor((Date.now() - _callStartedAt) / 1000));
                if (list.length === 0) stopPolling();
            } catch (_) {
                // 轮询失败不打断界面，等待下一次
            }
        }, CLCC_INTERVAL_MS);
        _clccTimer = id;
    }

    function stopPolling(): void {
        if (_clccTimer !== null && _clccTimer !== undefined) {
            clearInterval(_clccTimer);
            _clccTimer = null;
        }
    }

    async function handleDial(): Promise<void> {
        const command = buildDialCommand(dialNumber);
        if (!command) {
            setCallError("请输入有效号码");
            return;
        }
        const ok = await confirmAction({
            title: "拨打电话",
            message: `将使用 ${dialNumber} 通过设备拨出通话，是否继续？`,
            confirmLabel: "拨出",
        });
        if (!ok) return;
        setBusy(true);
        setCallError(null);
        try {
            const raw = await fetchAT(command);
            if (!parseAtsSuccess(raw)) throw new Error(raw || "设备未接受拨号指令");
            _callStartedAt = Date.now();
            setElapsed(0);
            appendCallLog({ number: dialNumber, kind: "outgoing", at: _callStartedAt, durationSec: 0 });
            setLogs(readCallLog());
            await refreshCalls();
            startPolling();
        } catch (e) {
            setCallError(String((e as Error)?.message || e));
        } finally {
            setBusy(false);
        }
    }

    async function refreshCalls(): Promise<void> {
        try {
            const raw = await fetchAT(buildStatusCommand());
            setCalls(parseClcc(raw));
        } catch (_) {
            // 状态读取失败时保留上一次结果
        }
    }

    async function handleAnswer(): Promise<void> {
        setBusy(true);
        setCallError(null);
        try {
            const raw = await fetchAT(buildAnswerCommand());
            if (!parseAtsSuccess(raw)) throw new Error(raw || "接听失败");
            _callStartedAt = Date.now();
            setElapsed(0);
            startPolling();
        } catch (e) {
            setCallError(String((e as Error)?.message || e));
        } finally {
            setBusy(false);
        }
    }

    async function handleHangup(): Promise<void> {
        setBusy(true);
        setCallError(null);
        try {
            const raw = await fetchAT(buildHangupCommand());
            if (!parseAtsSuccess(raw, true)) throw new Error(raw || "挂断失败");
            const startedAt = _callStartedAt;
            const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
            if (startedAt && calls.length > 0) {
                appendCallLog({
                    number: calls[0].number || dialNumber,
                    kind: calls[0].direction === "mt" ? "incoming" : "outgoing",
                    at: startedAt,
                    durationSec: duration,
                });
                setLogs(readCallLog());
            }
            setCalls([]);
            _callStartedAt = null;
            setElapsed(0);
            stopPolling();
        } catch (e) {
            setCallError(String((e as Error)?.message || e));
        } finally {
            setBusy(false);
        }
    }

    // ---------- 能力不可用 ----------
    if (capability === false) {
        return (
            <NavigationStack navigationTitle="电话" navigationBarTitleDisplayMode="large">
                <List listStyle="insetGrouped">
                    <Section>
                        <VStack spacing={SPACING.sm} alignment="center" padding={SPACING.lg} frame={{ maxWidth: "infinity" }}>
                            <Image
                                systemName="phone.down.circle"
                                font={34}
                                frame={{ width: 40, height: 40 }}
                                modifiers={modifiers().foregroundStyle("tertiaryLabel")}
                            />
                            <Text font={FONT.callout} fontWeight="semibold">当前设备未提供通话接口</Text>
                            <Text font={FONT.footnote} foregroundStyle="secondaryLabel" lineLimit={5} frame={{ maxWidth: 300 }}>
                                {probeError || "需要设备侧具备通话能力（UFI-TOOLS 完整版 + 面具模块）后才能在此拨号。"}
                            </Text>
                        </VStack>
                    </Section>
                    <Section footer={<Text font={FONT.caption}>通话的语音链路由设备侧模块负责，应用只做控制与状态显示。</Text>}>
                        <Button title="重新检测" systemImage="arrow.clockwise" action={startProbe} />
                    </Section>
                </List>
            </NavigationStack>
        );
    }

    if (capability === null) {
        return (
            <NavigationStack navigationTitle="电话" navigationBarTitleDisplayMode="large">
                <List listStyle="insetGrouped">
                    <Section>
                        <LoadingState message="正在检测设备通话能力…" />
                    </Section>
                </List>
            </NavigationStack>
        );
    }

    // ---------- 通话中界面 ----------
    if (inCall) {
        const current = calls[0];
        const number = current?.number || dialNumber || "未知号码";
        return (
            <NavigationStack navigationTitle="通话中" navigationBarTitleDisplayMode="inline">
                <List listStyle="insetGrouped">
                    <Section>
                        <VStack spacing={SPACING.sm} alignment="center" padding={SPACING.lg} frame={{ maxWidth: "infinity" }}>
                            <Image
                                systemName="person.crop.circle.fill"
                                font={56}
                                frame={{ width: 64, height: 64 }}
                                modifiers={modifiers().foregroundStyle("tertiaryLabel")}
                            />
                            <Text font={FONT.title2} fontWeight="semibold">{number}</Text>
                            <StatusPill
                                text={statusText(status) || "通话中"}
                                tint={status === "active" ? THEME.color.success.light : THEME.color.warning.light}
                            />
                            {status === "active" ? (
                                <Text font={FONT.footnote} foregroundStyle="secondaryLabel" monospacedDigit>
                                    已通话 {formatDuration(elapsed)}
                                </Text>
                            ) : null}
                        </VStack>
                    </Section>
                    <Section footer={<Text font={FONT.caption}>音频由设备侧面具模块处理；应用内不提供音频路由切换。</Text>}>
                        {status === "incoming" ? (
                            <Button
                                title="接听"
                                systemImage="phone.fill"
                                action={handleAnswer}
                                modifiers={modifiers().tint(THEME.color.success.light)}
                            />
                        ) : null}
                        <Button
                            title="挂断"
                            systemImage="phone.down.fill"
                            role="destructive"
                            action={handleHangup}
                        />
                        <Button title="刷新状态" systemImage="arrow.clockwise" action={refreshCalls} />
                    </Section>
                    {callError ? (
                        <Section>
                            <Text font={FONT.footnote} foregroundStyle={THEME.color.danger.light}>{callError}</Text>
                        </Section>
                    ) : null}
                </List>
            </NavigationStack>
        );
    }

    // ---------- 主页：拨号盘 / 最近通话 ----------
    return (
        <NavigationStack navigationTitle="电话" navigationBarTitleDisplayMode="large">
            <List
                listStyle="insetGrouped"
                toolbar={{
                        topBarTrailing: <Button title="检测" systemImage="antenna.radiowaves.left.and.right" action={startProbe} />,
                }}
            >
                <Section>
                    <HStack spacing={4}>
                        <Button
                            title="拨号盘"
                            action={() => setTab("keypad")}
                            modifiers={modifiers().tint(tab === "keypad" ? THEME.color.accent.light : "secondaryLabel")}
                        />
                        <Button
                            title="最近通话"
                            action={() => setTab("recent")}
                            modifiers={modifiers().tint(tab === "recent" ? THEME.color.accent.light : "secondaryLabel")}
                        />
                    </HStack>
                </Section>

                {callError ? (
                    <Section>
                        <Text font={FONT.footnote} foregroundStyle={THEME.color.danger.light}>{callError}</Text>
                    </Section>
                ) : null}

                {tab === "keypad" ? (
                    <>
                        <Section>
                            <VStack spacing={SPACING.sm} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={FONT.largeTitle} fontWeight="semibold" monospacedDigit lineLimit={1} minScaleFactor={0.5}>
                                    {dialNumber || " "}
                                </Text>
                                <Text font={FONT.caption} foregroundStyle="tertiaryLabel">
                                    {dialNumber ? "将使用设备语音通道拨出" : "输入号码"}
                                </Text>
                            </VStack>
                        </Section>
                        <Section>
                            <VStack spacing={SPACING.sm} frame={{ maxWidth: "infinity" }}>
                                {[0, 1, 2, 3].map((row) => (
                                    <HStack key={`row-${row}`} spacing={SPACING.sm} frame={{ maxWidth: "infinity" }}>
                                        {DIAL_KEYS.slice(row * 3, row * 3 + 3).map((key) => (
                                            <Button
                                                key={key.value}
                                                buttonStyle="plain"
                                                action={() => {
                                                    if (key.value === "0" && dialNumber === "") setDialNumber("+");
                                                    else setDialNumber(dialNumber + key.value);
                                                }}
                                                modifiers={modifiers().frame({ maxWidth: "infinity" })}
                                            >
                                                <VStack
                                                    spacing={1}
                                                    alignment="center"
                                                    frame={{ maxWidth: "infinity" }}
                                                    modifiers={modifiers()
                                                        .padding({ vertical: 10 })
                                                        .background(softTint("secondaryLabel", 0.12))
                                                        .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                                                >
                                                    <Text font={FONT.title3} fontWeight="medium" monospacedDigit>{key.label}</Text>
                                                    {key.letters ? (
                                                        <Text font={9} foregroundStyle="tertiaryLabel">{key.letters}</Text>
                                                    ) : null}
                                                </VStack>
                                            </Button>
                                        ))}
                                    </HStack>
                                ))}
                            </VStack>
                        </Section>
                        <Section>
                            <HStack spacing={SPACING.md} frame={{ maxWidth: "infinity" }}>
                                <Button
                                    title="删除"
                                    systemImage="delete.left"
                                    action={() => setDialNumber(dialNumber.slice(0, -1))}
                                />
                                <Spacer />
                                <Button
                                    title="拨打"
                                    systemImage="phone.fill"
                                    action={handleDial}
                                    modifiers={modifiers().tint(THEME.color.success.light)}
                                />
                            </HStack>
                        </Section>
                    </>
                ) : (
                    <Section header={<Text>最近通话</Text>}>
                        {logs.length === 0 ? (
                            <EmptyState
                                icon="clock"
                                title="暂无通话记录"
                                message="通话记录保存在本机（设备接口未提供通话历史）。"
                            />
                        ) : (
                            <>
                                {logs.map((entry: CallLogEntry, index: number) => {
                                    const meta = callLogMeta(entry.kind);
                                    return (
                                        <HStack key={`log-${index}`} spacing={SPACING.sm} alignment="center">
                                            <Image
                                                systemName={meta.icon}
                                                font={FONT.footnote}
                                                frame={{ width: 20, height: 20 }}
                                                modifiers={modifiers().foregroundStyle(meta.color)}
                                            />
                                            <VStack spacing={2} alignment="leading">
                                                <Text font={FONT.body} fontWeight="semibold">{entry.number || "未知号码"}</Text>
                                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                                                    {meta.label} · {formatCallTime(entry.at)}
                                                    {entry.durationSec > 0 ? ` · ${formatDuration(entry.durationSec)}` : ""}
                                                </Text>
                                            </VStack>
                                            <Spacer />
                                            <Button
                                                title="回拨"
                                                action={() => {
                                                    setDialNumber(entry.number);
                                                    setTab("keypad");
                                                }}
                                            />
                                        </HStack>
                                    );
                                })}
                            </>
                        )}
                    </Section>
                )}

                <Section footer={<Text font={FONT.caption}>需设备安装 UFI-TOOLS 完整版并启用面具模块的语音能力；VoLTE/VoNR 开关在设置页。</Text>}>
                    <Text font={FONT.caption} foregroundStyle="tertiaryLabel">通话能力已就绪</Text>
                </Section>
            </List>
        </NavigationStack>
    );
}
