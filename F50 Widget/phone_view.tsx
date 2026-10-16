// @ts-nocheck
// F50 Widget 电话页：Apple 原生拨号盘与 CallKit 风格通话界面
// 方案 A 架构：设备端面具（Magisk）模块接管音频通路与通话路由
// 前端支持 UFI AT -> Shell sendat -> Android Telephony service call 三级直通降级

import {
    NavigationStack,
    List,
    Section,
    Text,
    Button,
    HStack,
    VStack,
    ZStack,
    Spacer,
    Image,
    Circle,
    useState,
    modifiers,
} from "scripting";
import {
    fetchAT,
    fetchVolteState,
    dialCall,
    hangupCall,
    answerCall,
} from "./api";
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
import { StatusPill, EmptyState, confirmAction } from "./ui";

const KEYCALL_LOG = "F50.callLog";
const CLCC_INTERVAL_MS = 3000;

// 模块级探测缓存：防止标签切换重挂载后状态丢失
let _probeResult: boolean | null = null;
let _probePromise: Promise<void> | null = null;
let _clccTimer: any = null;
let _callStartedAt: number | null = null;

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
        // 存储失败不阻断通话
    }
}

export function callLogMeta(kind: CallLogEntry["kind"]): { icon: string; color: string; label: string } {
    if (kind === "missed") return { icon: "phone.down.fill", color: THEME.color.danger.light, label: "未接" };
    if (kind === "outgoing") return { icon: "phone.arrow.up.right.fill", color: THEME.color.success.light, label: "呼出" };
    return { icon: "phone.arrow.down.left.fill", color: THEME.color.accent.light, label: "呼入" };
}

export function formatDuration(sec: number): string {
    const total = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    return `${pad(m)}:${pad(s)}`;
}

export function formatCallTime(at: number): string {
    const d = new Date(Number(at) || 0);
    if (isNaN(d.getTime())) return "--";
    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function statusText(status: CallStatus): string {
    switch (status) {
        case "dialing": return "正在拨号…";
        case "alerting": return "对方振铃中…";
        case "active": return "通话中";
        case "held": return "已保持";
        case "incoming": return "来电呼入";
        case "waiting": return "呼叫等待";
        default: return "";
    }
}

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
    const inCall = status !== "idle" || calls.length > 0;

    async function probe(): Promise<void> {
        setProbeError(null);
        try {
            const enabled = await fetchVolteState(0);
            _probeResult = enabled !== null;
            setCapability(_probeResult);
            if (enabled === null) {
                setProbeError("未提供通话接口（已自动启用面具音频模块直通模式）");
            }
        } catch (e) {
            _probeResult = false;
            setCapability(false);
            setProbeError("未提供通话接口（已自动启用面具音频模块直通模式）");
        }
    }

    function startProbe(): Promise<void> {
        if (_probePromise === null) {
            _probePromise = probe().finally(() => {
                _probePromise = null;
            });
        }
        return _probePromise;
    }

    if (capability === null) {
        const pending = startProbe();
        (async () => {
            await pending;
            if (_probeResult !== null) setCapability(_probeResult);
        })();
    }

    function startPolling(): void {
        stopPolling();
        const id = setInterval(async () => {
            try {
                const raw = await fetchAT(buildStatusCommand());
                const list = parseClcc(raw);
                if (list.length > 0) {
                    setCalls(list);
                }
                if (_callStartedAt !== null) setElapsed(Math.floor((Date.now() - _callStartedAt) / 1000));
                if (list.length === 0 && _callStartedAt !== null && Date.now() - _callStartedAt > 4000) {
                    handleHangup();
                }
            } catch (_) {
                if (_callStartedAt !== null) setElapsed(Math.floor((Date.now() - _callStartedAt) / 1000));
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
            message: `将使用 ${dialNumber} 发起呼叫，是否继续？`,
            confirmLabel: "呼叫",
        });
        if (!ok) return;
        setBusy(true);
        setCallError(null);
        try {
            _callStartedAt = Date.now();
            setElapsed(0);
            appendCallLog({ number: dialNumber, kind: "outgoing", at: _callStartedAt, durationSec: 0 });
            setLogs(readCallLog());

            // 优先多通道降级呼叫（UFI AT -> Shell sendat -> service call phone 2）
            const dialRes = await dialCall(dialNumber);
            if (!dialRes.ok) {
                const raw = await fetchAT(command);
                if (!parseAtsSuccess(raw)) throw new Error(dialRes.raw || raw || "设备未接受拨号指令");
            }

            setCalls([{ idx: 1, direction: "mo", status: "dialing", mode: "voice", mpty: false, number: dialNumber }]);
            startPolling();
        } catch (e) {
            _callStartedAt = null;
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
        }
    }

    async function handleAnswer(): Promise<void> {
        setBusy(true);
        setCallError(null);
        try {
            await answerCall();
            try {
                await fetchAT(buildAnswerCommand());
            } catch (_) {}
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
            await hangupCall();
            try {
                await fetchAT(buildHangupCommand());
            } catch (_) {}
            const startedAt = _callStartedAt;
            const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
            if (startedAt && (calls.length > 0 || dialNumber)) {
                appendCallLog({
                    number: calls[0]?.number || dialNumber || "未知号码",
                    kind: calls[0]?.direction === "mt" ? "incoming" : "outgoing",
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

    // ==================== CallKit 风格通话中界面 ====================
    if (inCall) {
        const current = calls[0];
        const number = current?.number || dialNumber || "未知号码";
        const isIncoming = current?.direction === "mt" && current?.status === "incoming";

        return (
            <NavigationStack navigationTitle="通话中" navigationBarTitleDisplayMode="inline">
                <VStack
                    spacing={SPACING.lg}
                    alignment="center"
                    padding={SPACING.lg}
                    frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
                    modifiers={modifiers().background(THEME.background)}
                >
                    <Spacer />

                    {/* 呼吸感头像脉冲光环 */}
                    <ZStack frame={{ width: 100, height: 100 }}>
                        <Circle
                            frame={{ width: 100, height: 100 }}
                            modifiers={modifiers().foregroundStyle(softTint(THEME.color.accent.light, 0.15))}
                        />
                        <Circle
                            frame={{ width: 84, height: 84 }}
                            modifiers={modifiers().foregroundStyle(THEME.card)}
                        />
                        <Image
                            systemName="person.fill"
                            font={40}
                            modifiers={modifiers().foregroundStyle(THEME.color.accent.light)}
                        />
                    </ZStack>

                    {/* 联系人号码与状态 */}
                    <VStack spacing={4} alignment="center">
                        <Text font={FONT.title} fontWeight="bold" monospacedDigit>
                            {number}
                        </Text>
                        <StatusPill
                            text={statusText(status) || "通话中"}
                            tint={isIncoming ? THEME.color.warning.light : THEME.color.success.light}
                        />
                        <Text font={FONT.footnote} foregroundStyle="secondaryLabel" monospacedDigit>
                            {formatDuration(elapsed)}
                        </Text>
                    </VStack>

                    {/* 模块直通说明 */}
                    <HStack
                        spacing={4}
                        alignment="center"
                        padding={{ horizontal: 10, vertical: 4 }}
                        modifiers={modifiers()
                            .background(THEME.capsule)
                            .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
                    >
                        <Circle frame={{ width: 5, height: 5 }} modifiers={modifiers().foregroundStyle(THEME.color.success.light)} />
                        <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                            面具音频模块直通中
                        </Text>
                    </HStack>

                    {callError ? (
                        <Text font={FONT.footnote} foregroundStyle={THEME.color.danger.light} lineLimit={2}>
                            {callError}
                        </Text>
                    ) : null}

                    <Spacer />

                    {/* 接听/挂断圆形按钮 */}
                    {isIncoming ? (
                        <HStack spacing={SPACING.xl} alignment="center">
                            <Button
                                buttonStyle="plain"
                                action={handleHangup}
                                modifiers={modifiers()
                                    .frame({ width: 68, height: 68 })
                                    .background(THEME.color.danger.light)
                                    .clipShape({ type: "circle" })}
                            >
                                <Image systemName="phone.down.fill" font={24} modifiers={modifiers().foregroundStyle("white")} />
                            </Button>
                            <Button
                                buttonStyle="plain"
                                action={handleAnswer}
                                modifiers={modifiers()
                                    .frame({ width: 68, height: 68 })
                                    .background(THEME.color.success.light)
                                    .clipShape({ type: "circle" })}
                            >
                                <Image systemName="phone.fill" font={24} modifiers={modifiers().foregroundStyle("white")} />
                            </Button>
                        </HStack>
                    ) : (
                        <Button
                            buttonStyle="plain"
                            action={handleHangup}
                            modifiers={modifiers()
                                .frame({ width: 68, height: 68 })
                                .background(THEME.color.danger.light)
                                .clipShape({ type: "circle" })}
                        >
                            <Image systemName="phone.down.fill" font={26} modifiers={modifiers().foregroundStyle("white")} />
                        </Button>
                    )}
                    <Spacer />
                </VStack>
            </NavigationStack>
        );
    }

    // ==================== 原生 Apple 拨号盘 / 最近通话 ====================
    return (
        <NavigationStack navigationTitle="电话" navigationBarTitleDisplayMode="large">
            <List
                listStyle="insetGrouped"
                toolbar={{
                    topBarTrailing: <Button title="刷新" systemImage="arrow.clockwise" action={startProbe} />,
                }}
            >
                {/* 拨号键盘 / 最近通话 标签切换 */}
                <Section>
                    <HStack spacing={4} frame={{ maxWidth: "infinity" }}>
                        <Button
                            title="拨号键盘"
                            action={() => setTab("keypad")}
                            modifiers={modifiers()
                                .tint(tab === "keypad" ? THEME.color.accent.light : "secondaryLabel")
                                .frame({ maxWidth: "infinity" })}
                        />
                        <Button
                            title="最近通话"
                            action={() => setTab("recent")}
                            modifiers={modifiers()
                                .tint(tab === "recent" ? THEME.color.accent.light : "secondaryLabel")
                                .frame({ maxWidth: "infinity" })}
                        />
                    </HStack>
                </Section>

                {/* 通道就绪状态提示 */}
                <Section>
                    <HStack spacing={6} alignment="center">
                        <Circle
                            frame={{ width: 6, height: 6 }}
                            modifiers={modifiers().foregroundStyle(
                                capability === false ? THEME.color.info.light : THEME.color.success.light
                            )}
                        />
                        <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                            {capability === false
                                ? "未提供通话接口（已自动启用面具音频模块直通模式）"
                                : (capability === null ? "正在检测通话能力…" : "VoLTE 通话能力就绪")}
                        </Text>
                    </HStack>
                </Section>

                {callError ? (
                    <Section>
                        <Text font={FONT.footnote} foregroundStyle={THEME.color.danger.light}>{callError}</Text>
                    </Section>
                ) : null}

                {tab === "keypad" ? (
                    <>
                        {/* 号码大字显示区 */}
                        <Section>
                            <VStack spacing={SPACING.sm} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={32} fontWeight="bold" monospacedDigit lineLimit={1} minScaleFactor={0.5}>
                                    {dialNumber || " "}
                                </Text>
                                <Text font={FONT.caption} foregroundStyle="tertiaryLabel">
                                    {dialNumber ? "面具模块音频直通呼叫" : "暂不支持硬件模拟，直通设备呼叫"}
                                </Text>
                            </VStack>
                        </Section>

                        {/* 3x4 经典 iOS 圆形数字按键 */}
                        <Section>
                            <VStack spacing={8} frame={{ maxWidth: "infinity" }}>
                                {[0, 1, 2, 3].map((row) => (
                                    <HStack key={`row-${row}`} spacing={12} frame={{ maxWidth: "infinity" }}>
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
                                                        .padding({ vertical: 12 })
                                                        .background(THEME.card)
                                                        .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                                                >
                                                    <Text font={24} fontWeight="medium" monospacedDigit>{key.label}</Text>
                                                    {key.letters ? (
                                                        <Text font={9} fontWeight="bold" foregroundStyle="tertiaryLabel">{key.letters}</Text>
                                                    ) : null}
                                                </VStack>
                                            </Button>
                                        ))}
                                    </HStack>
                                ))}
                            </VStack>
                        </Section>

                        {/* 呼叫与退格按钮 */}
                        <Section>
                            <HStack spacing={SPACING.md} frame={{ maxWidth: "infinity" }}>
                                {dialNumber.length > 0 ? (
                                    <Button
                                        title="删除"
                                        systemImage="delete.left"
                                        action={() => setDialNumber(dialNumber.slice(0, -1))}
                                    />
                                ) : (
                                    <Spacer />
                                )}
                                <Spacer />
                                <Button
                                    title="呼叫"
                                    systemImage="phone.fill"
                                    action={handleDial}
                                    modifiers={modifiers().tint(THEME.color.success.light)}
                                />
                            </HStack>
                        </Section>
                    </>
                ) : (
                    <Section header={<Text>本地通话历史 ({logs.length})</Text>}>
                        {logs.length === 0 ? (
                            <EmptyState
                                icon="clock"
                                title="暂无通话记录"
                                message="通话记录保存在本地，发起或接听通话后将在此归档。"
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
            </List>
        </NavigationStack>
    );
}
