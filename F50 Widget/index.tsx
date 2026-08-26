// @ts-nocheck
// F50 Widget 设置界面：底部三标签（状态 / 短信 / 设置）
// UI 设计参考 koldllc/f50-monitor 仓库的 iOS 三标签布局
import {
    Script, Navigation, NavigationStack, List, Section, Text, Button,
    TextField, SecureField, HStack, VStack, ZStack, Spacer, Image, Toolbar,
    ToolbarItem, Rectangle, ScrollView, Label, useObservable, TabView, Tab,
    useState, ForEach, modifiers, Pasteboard,
} from "scripting";
import { readSetting, saveSetting, setSessionSettings, fetchSMSMessages, sendSMS, extractVerifyCode, SMSMessage } from "./api";
import { fetchWidgetSnapshot, WidgetState, emptyState, readWidgetCache } from "./widget_data";
import { Widget } from "scripting";

const DEFAULT_URL = "http://192.168.0.1:2333";

// ===================== 标签 1：状态页 =====================

function StatusView() {
    const [state, setState] = useState<WidgetState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function refresh() {
        setLoading(true);
        setError(null);
        try {
            const { state: s } = await fetchWidgetSnapshot();
            setState(s);
        } catch (e) {
            setError(String((e as Error)?.message || e));
            const cached = readWidgetCache();
            if (cached) setState(cached);
        } finally {
            setLoading(false);
        }
    }

    // 首次加载
    if (!state && !loading) {
        setLoading(true);
        (async () => {
            const cached = readWidgetCache();
            if (cached) setState(cached);
            await refresh();
        })();
    }

    if (!state) {
        return (
            <VStack alignment="center" spacing={8} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
                <Image systemName="arrow.2.circlepath" font={28} frame={{ width: 32, height: 32 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
                <Text font={14} foregroundStyle="secondaryLabel">正在读取设备状态…</Text>
            </VStack>
        );
    }

    const hasSpeed = state.dl_speed !== "--" || state.ul_speed !== "--";
    const hasProgress = state.traffic_limit_value !== "--";

    return (
        <NavigationStack>
            <ScrollView>
                <VStack spacing={12} padding={16} frame={{ maxWidth: "infinity" }}>
                    {/* 信号与网络卡片 */}
                    <VStack spacing={8} padding={14} frame={{ maxWidth: "infinity" }}>
                        <HStack spacing={8}>
                            <Image systemName="wifi.router.fill" font={20} frame={{ width: 24, height: 24 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
                            <Text font={17} fontWeight="bold" fontDesign="rounded">{state.model_name === "--" ? "F50 设备" : state.model_name}</Text>
                            <Spacer />
                            <Image systemName="cellularbars" variableValue={state.signalbar === "--" ? 0 : Math.min(1, parseInt(state.signalbar) / 4)} font={18} frame={{ width: 20, height: 20 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
                        </HStack>
                        <HStack spacing={6}>
                            <Text font={12} fontWeight="bold" modifiers={modifiers().padding({ horizontal: 8, vertical: 3 }).background("systemBlue").clipShape({ type: "rect", cornerRadius: 8 }).foregroundStyle("white")}>{state.net_summary}</Text>
                            {state.band_text !== "—" ? <Text font={11} fontWeight="bold" foregroundStyle="systemPurple">{state.band_text}</Text> : <></>}
                            {state.signal_quality !== "--" ? <Text font={11} fontWeight="bold" foregroundStyle={state.signal_quality_color}>{state.signal_quality}</Text> : <></>}
                            <Spacer />
                        </HStack>
                        <Text font={11} foregroundStyle="secondaryLabel">RSRP {state.rsrp_text} · RSRQ {state.rsrq_text} · SNR {state.snr_text}</Text>
                    </VStack>

                    {/* 实时速率卡片 */}
                    {hasSpeed ? (
                        <HStack spacing={0} padding={14} frame={{ maxWidth: "infinity" }}>
                            <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={10} foregroundStyle="secondaryLabel">下行</Text>
                                <Text font={24} fontWeight="bold" monospacedDigit foregroundStyle={state.dl_speed_color}>{state.dl_speed}</Text>
                            </VStack>
                            <Rectangle fill="separator" frame={{ width: 1, height: 36 }} />
                            <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={10} foregroundStyle="secondaryLabel">上行</Text>
                                <Text font={24} fontWeight="bold" monospacedDigit foregroundStyle={state.ul_speed_color}>{state.ul_speed}</Text>
                            </VStack>
                        </HStack>
                    ) : <></>}

                    {/* 流量统计卡片 */}
                    <VStack spacing={8} padding={14} frame={{ maxWidth: "infinity" }}>
                        <HStack>
                            <Image systemName="chart.bar.fill" font={14} modifiers={modifiers().foregroundStyle("systemCyan")} />
                            <Text font={14} fontWeight="bold">流量统计</Text>
                            <Spacer />
                        </HStack>
                        <HStack spacing={0}>
                            <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={10} foregroundStyle="secondaryLabel">今日</Text>
                                <Text font={20} fontWeight="bold" monospacedDigit>{state.daily_data_value}<Text font={12} foregroundStyle="secondaryLabel"> {state.daily_data_unit}</Text></Text>
                            </VStack>
                            <Rectangle fill="separator" frame={{ width: 1, height: 36 }} />
                            <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                                <Text font={10} foregroundStyle="secondaryLabel">本月</Text>
                                <Text font={20} fontWeight="bold" monospacedDigit>{state.monthly_data_value}<Text font={12} foregroundStyle="secondaryLabel"> {state.monthly_data_unit}</Text></Text>
                            </VStack>
                        </HStack>
                        {hasProgress ? (
                            <VStack spacing={4} frame={{ maxWidth: "infinity" }}>
                                <HStack>
                                    <Text font={11} fontWeight="bold">已用 {state.traffic_used_value}{state.traffic_used_unit} / {state.traffic_limit_value}{state.traffic_limit_unit}</Text>
                                    <Spacer />
                                    <Text font={11} fontWeight="bold" foregroundStyle={state.traffic_color}>{Math.round(state.traffic_ratio * 100)}%</Text>
                                </HStack>
                                <ZStack alignment="leading" frame={{ maxWidth: "infinity", height: 8 }}>
                                    <Rectangle fill="secondarySystemFill" cornerRadius={4} frame={{ maxWidth: "infinity", height: 8 }} />
                                    <Rectangle fill={state.traffic_color} cornerRadius={4} frame={{ width: String(Math.max(3, state.traffic_ratio * 100)) + "%", height: 8, maxWidth: "infinity" }} />
                                </ZStack>
                                {state.reset_days ? <Text font={10} foregroundStyle="secondaryLabel">⏳ {state.reset_days}</Text> : <></>}
                            </VStack>
                        ) : <></>}
                    </VStack>

                    {/* 硬件指标卡片 */}
                    <HStack spacing={8} padding={14} frame={{ maxWidth: "infinity" }}>
                        <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Image systemName="thermometer.medium" font={16} modifiers={modifiers().foregroundStyle("systemOrange")} />
                            <Text font={11} foregroundStyle="secondaryLabel">温度</Text>
                            <Text font={16} fontWeight="bold" monospacedDigit>{state.cputemp}℃</Text>
                        </VStack>
                        <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Image systemName="cpu.fill" font={16} modifiers={modifiers().foregroundStyle("systemIndigo")} />
                            <Text font={11} foregroundStyle="secondaryLabel">CPU</Text>
                            <Text font={16} fontWeight="bold" monospacedDigit>{state.cpuusage}%</Text>
                        </VStack>
                        <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Image systemName="memorychip" font={16} modifiers={modifiers().foregroundStyle("systemPurple")} />
                            <Text font={11} foregroundStyle="secondaryLabel">内存</Text>
                            <Text font={16} fontWeight="bold" monospacedDigit>{state.mem_text}</Text>
                        </VStack>
                        <VStack spacing={2} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Image systemName="macbook.and.ipod" font={16} modifiers={modifiers().foregroundStyle("systemPink")} />
                            <Text font={11} foregroundStyle="secondaryLabel">设备</Text>
                            <Text font={16} fontWeight="bold" monospacedDigit>{state.wifi_device_count}台</Text>
                        </VStack>
                    </HStack>

                    {/* 电池卡片 */}
                    <HStack spacing={8} padding={14} frame={{ maxWidth: "infinity" }}>
                        <Image systemName={state.battery_icon} font={20} frame={{ width: 24, height: 24 }} modifiers={modifiers().foregroundStyle(state.battery_icon_color)} />
                        <Text font={16} fontWeight="bold">电池 {state.battery}%</Text>
                        <Spacer />
                        <Text font={11} foregroundStyle="secondaryLabel">{state.zreq_used ? "zreq 已登录" : "zreq 未登录"}</Text>
                    </HStack>

                    {/* QoS 指标 */}
                    {state.qci ? (
                        <HStack spacing={8} padding={14} frame={{ maxWidth: "infinity" }}>
                            <Image systemName="gauge.with.dots.needle.bottom.50percent" font={16} modifiers={modifiers().foregroundStyle("systemIndigo")} />
                            <Text font={13} fontWeight="bold">QCI {state.qci}</Text>
                            {state.qos_dl ? <Text font={12} foregroundStyle="systemBlue">↓ {state.qos_dl}</Text> : <></>}
                            {state.qos_ul ? <Text font={12} foregroundStyle="systemTeal">↑ {state.qos_ul}</Text> : <></>}
                            <Spacer />
                        </HStack>
                    ) : <></>}

                    {error ? (
                        <VStack spacing={4} padding={12} frame={{ maxWidth: "infinity" }}>
                            <Text font={12} foregroundStyle="systemRed">⚠ {error}</Text>
                        </VStack>
                    ) : <></>}

                    <Text font={10} foregroundStyle="secondaryLabel" monospacedDigit>更新于 {state.update_time}</Text>
                </VStack>
            </ScrollView>
            <Toolbar>
                <ToolbarItem placement="topBarTrailing">
                    <Button title="刷新" systemImage="arrow.clockwise" action={refresh} />
                </ToolbarItem>
                <ToolbarItem placement="topBarTrailing">
                    <Button title="预览" systemImage="eye" action={async () => { try { await Widget.preview({ family: "systemMedium" }); } catch (e) { } }} />
                </ToolbarItem>
            </Toolbar>
        </NavigationStack>
    );
}

// ===================== 标签 2：短信页 =====================

function SMSView() {
    const [messages, setMessages] = useState<SMSMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showCompose, setShowCompose] = useState(false);
    const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);

    async function loadSMS() {
        setLoading(true);
        setError(null);
        try {
            const msgs = await fetchSMSMessages();
            setMessages(msgs);
        } catch (e) {
            setError(String((e as Error)?.message || e));
        } finally {
            setLoading(false);
        }
    }

    // 首次加载
    if (!loading && messages.length === 0 && !error) {
        loadSMS();
    }

    // 按号码分组
    const conversations = (() => {
        const grouped: { [key: string]: SMSMessage[] } = {};
        const order: string[] = [];
        for (const msg of messages) {
            const num = msg.number || "未知号码";
            if (!grouped[num]) { grouped[num] = []; order.push(num); }
            grouped[num].push(msg);
        }
        return order.map(num => ({ number: num, messages: grouped[num] }));
    })();

    function copyToClipboard(text: string, notice: string) {
        try { Pasteboard.setString(text); } catch (_) { }
        setCopiedNotice(notice);
        setTimeout(() => setCopiedNotice(null), 2000);
    }

    // 会话详情视图
    if (selectedNumber) {
        const conv = conversations.find(c => c.number === selectedNumber);
        if (!conv) { setSelectedNumber(null); return <></>; }

        return (
            <NavigationStack>
                <List listStyle="plain" navigationTitle={selectedNumber} navigationBarTitleDisplayMode="inline">
                    <Toolbar>
                        <ToolbarItem placement="topBarLeading">
                            <Button title="返回" systemImage="chevron.left" action={() => setSelectedNumber(null)} />
                        </ToolbarItem>
                    </Toolbar>
                    <ForEach items={conv.messages.slice().reverse()}>
                        {(msg: SMSMessage) => {
                            const code = extractVerifyCode(msg.content);
                            return (
                                <VStack alignment="leading" spacing={6} padding={{ vertical: 8, horizontal: 14 }}>
                                    <VStack alignment="leading" spacing={4} padding={{ vertical: 8, horizontal: 14 }} modifiers={modifiers().background("secondarySystemBackground").clipShape({ type: "rect", cornerRadius: 14 })}>
                                        <Text font={14} lineSpacing={2}>{msg.content || "（空短信）"}</Text>
                                        {code ? (
                                            <Button action={() => copyToClipboard(code, "验证码 " + code + " 已复制")} buttonStyle="plain">
                                                <HStack spacing={4} padding={{ horizontal: 10, vertical: 5 }} modifiers={modifiers().background("systemBlue").clipShape({ type: "rect", cornerRadius: 12 })}>
                                                    <Image systemName="doc.on.doc" font={10} frame={{ width: 10, height: 10 }} modifiers={modifiers().foregroundStyle("white")} />
                                                    <Text font={11} fontWeight="bold" monospacedDigit foregroundStyle="white">复制验证码: {code}</Text>
                                                </HStack>
                                            </Button>
                                        ) : <></>}
                                    </VStack>
                                    <Text font={10} foregroundStyle="secondaryLabel" monospacedDigit>{msg.dateText}</Text>
                                </VStack>
                            );
                        }}
                    </ForEach>
                </List>
                {copiedNotice ? (
                    <VStack alignment="center" modifiers={modifiers().padding({ bottom: 20 })}>
                        <Text font={12} foregroundStyle="white" modifiers={modifiers().padding({ horizontal: 14, vertical: 8 }).background("black").clipShape({ type: "rect", cornerRadius: 12 })}>{copiedNotice}</Text>
                    </VStack>
                ) : <></>}
            </NavigationStack>
        );
    }

    // 会话列表
    return (
        <NavigationStack>
            {loading && messages.length === 0 ? (
                <VStack alignment="center" spacing={8} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
                    <Image systemName="arrow.2.circlepath" font={28} frame={{ width: 32, height: 32 }} modifiers={modifiers().foregroundStyle("systemBlue")} />
                    <Text font={14} foregroundStyle="secondaryLabel">正在读取短信…</Text>
                </VStack>
            ) : error && messages.length === 0 ? (
                <VStack alignment="center" spacing={12} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
                    <Image systemName="exclamationmark.triangle.fill" font={32} frame={{ width: 36, height: 36 }} modifiers={modifiers().foregroundStyle("systemOrange")} />
                    <Text font={13} foregroundStyle="secondaryLabel">{error}</Text>
                    <Button title="重试" action={loadSMS} />
                </VStack>
            ) : conversations.length === 0 ? (
                <VStack alignment="center" spacing={12} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
                    <Image systemName="envelope.open" font={38} frame={{ width: 42, height: 42 }} modifiers={modifiers().foregroundStyle("systemGray")} />
                    <Text font={15} foregroundStyle="secondaryLabel">暂无短信记录</Text>
                </VStack>
            ) : (
                <List listStyle="plain" navigationTitle="短信" navigationBarTitleDisplayMode="inline">
                    <Toolbar>
                        <ToolbarItem placement="topBarTrailing">
                            <Button title="刷新" systemImage="arrow.clockwise" action={loadSMS} />
                        </ToolbarItem>
                        <ToolbarItem placement="topBarTrailing">
                            <Button title="写短信" systemImage="square.and.pencil" action={() => setShowCompose(true)} />
                        </ToolbarItem>
                    </Toolbar>
                    <ForEach items={conversations}>
                        {(conv: { number: string, messages: SMSMessage[] }) => {
                            const hasUnread = conv.messages.some(m => m.isUnread);
                            const latest = conv.messages[0];
                            const code = extractVerifyCode(latest.content);
                            return (
                                <Button action={() => setSelectedNumber(conv.number)} buttonStyle="plain">
                                    <HStack spacing={12} padding={{ vertical: 10, horizontal: 16 }}>
                                        <Image systemName={hasUnread ? "message.fill" : "message"} font={16} frame={{ width: 28, height: 28 }} modifiers={modifiers().foregroundStyle(hasUnread ? "systemBlue" : "secondaryLabel")} />
                                        <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
                                            <HStack spacing={5}>
                                                <Text font={15} fontWeight={hasUnread ? "bold" : "semibold"} fontDesign="rounded">{conv.number}</Text>
                                                {hasUnread ? <Text font={10} fontWeight="bold" foregroundStyle="systemBlue">未读</Text> : <></>}
                                                <Spacer />
                                                <Text font={10} foregroundStyle="secondaryLabel" monospacedDigit>{latest.dateText}</Text>
                                            </HStack>
                                            <HStack spacing={4}>
                                                {code ? <Text font={11} fontWeight="bold" foregroundStyle="systemRed">🔑 {code} · </Text> : <></>}
                                                <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>{latest.content || "（空短信）"}</Text>
                                            </HStack>
                                        </VStack>
                                    </HStack>
                                </Button>
                            );
                        }}
                    </ForEach>
                </List>
            )}
            {showCompose ? <ComposeSheet onClose={() => setShowCompose(false)} onSent={() => { setShowCompose(false); loadSMS(); }} /> : <></>}
            {copiedNotice ? (
                <VStack alignment="center" modifiers={modifiers().padding({ bottom: 20 })}>
                    <Text font={12} foregroundStyle="white" modifiers={modifiers().padding({ horizontal: 14, vertical: 8 }).background("black").clipShape({ type: "rect", cornerRadius: 12 })}>{copiedNotice}</Text>
                </VStack>
            ) : <></>}
        </NavigationStack>
    );
}

// ===================== 写短信弹窗 =====================

function ComposeSheet({ onClose, onSent }: { onClose: () => void, onSent: () => void }) {
    const [number, setNumber] = useState("");
    const [content, setContent] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const canSend = number.trim().length > 0 && content.trim().length > 0 && !sending;

    async function handleSend() {
        if (!canSend) return;
        setSending(true);
        setError(null);
        setSuccess(false);
        try {
            const ok = await sendSMS(number.trim(), content.trim());
            if (ok) {
                setSuccess(true);
                setTimeout(() => onSent(), 1000);
            } else {
                setError("短信发送失败，请检查密码和设备连接");
            }
        } catch (e) {
            setError(String((e as Error)?.message || e));
        } finally {
            setSending(false);
        }
    }

    return (
        <NavigationStack>
            <List navigationTitle="写短信" navigationBarTitleDisplayMode="inline">
                <Toolbar>
                    <ToolbarItem placement="cancellationAction">
                        <Button title="取消" action={onClose} />
                    </ToolbarItem>
                    <ToolbarItem placement="confirmationAction">
                        <Button title={sending ? "发送中…" : "发送"} action={handleSend} />
                    </ToolbarItem>
                </Toolbar>
                <Section header={<Text>接收号码</Text>}>
                    <TextField
                        title="号码"
                        value={number}
                        onChanged={setNumber}
                        prompt="例如 10086 或 13800138000"
                    />
                </Section>
                <Section header={<Text>短信内容</Text>}>
                    <TextField
                        title="内容"
                        value={content}
                        onChanged={setContent}
                        prompt="输入短信内容…"
                    />
                </Section>
                {error ? (
                    <Section>
                        <HStack spacing={4}>
                            <Image systemName="exclamationmark.triangle.fill" font={12} frame={{ width: 14, height: 14 }} modifiers={modifiers().foregroundStyle("systemOrange")} />
                            <Text font={12} foregroundStyle="systemOrange">{error}</Text>
                        </HStack>
                    </Section>
                ) : null}
                {success ? (
                    <Section>
                        <HStack spacing={4}>
                            <Image systemName="checkmark.circle.fill" font={12} frame={{ width: 14, height: 14 }} modifiers={modifiers().foregroundStyle("systemGreen")} />
                            <Text font={12} foregroundStyle="systemGreen">短信发送成功 ✓</Text>
                        </HStack>
                    </Section>
                ) : null}
            </List>
        </NavigationStack>
    );
}

// ===================== 标签 3：设置页 =====================

function SettingsView() {
    const [url, setUrl] = useState(readSetting("URL", DEFAULT_URL));
    const [password, setPassword] = useState(readSetting("password", ""));
    const [ztePassword, setZtePassword] = useState(readSetting("zte_password", ""));
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [previewMsg, setPreviewMsg] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(true);

    function doSave(): boolean {
        const urlV = url.trim();
        const pwdV = password.trim();
        const zteV = ztePassword.trim();
        const okUrl = saveSetting("URL", urlV);
        const okPwd = saveSetting("password", pwdV);
        const okZte = saveSetting("zte_password", zteV);
        console.log("[F50] 保存校验:", JSON.stringify({ URL: okUrl, password: okPwd, zte_password: okZte }));
        return okUrl && okPwd && okZte;
    }

    function handleSave() {
        if (doSave()) {
            setSavedMsg("已保存 ✓");
            setErrorMsg(null);
        } else {
            setSavedMsg(null);
            setErrorMsg("保存失败：配置未能写入存储，请重试");
        }
        setTimeout(() => setSavedMsg(null), 2500);
    }

    async function handleTest() {
        setErrorMsg(null);
        setSavedMsg(null);
        const saved = doSave();
        setSessionSettings({
            url: url.trim(),
            password: password.trim(),
            ztePassword: ztePassword.trim(),
        });
        try {
            const { state } = await fetchWidgetSnapshot();
            const warn = saved ? "" : "（配置未保存成功，请先保存配置）";
            if (state.model_name !== "--") {
                setSavedMsg("连接成功 ✓ 设备: " + state.model_name + (state.error ? "（部分接口异常）" : "") + warn);
            } else if (state.error) {
                setErrorMsg("连接失败: " + state.error + warn);
            } else {
                setSavedMsg("连接成功 ✓（返回了数据）" + warn);
            }
            setTimeout(() => setSavedMsg(null), 4000);
        } catch (e) {
            setErrorMsg("连接失败: " + String((e as Error)?.message || e) + (saved ? "" : "（配置未保存成功，请先保存配置）"));
        } finally {
            setSessionSettings(null);
        }
    }

    async function handlePreview(family: string) {
        if (!doSave()) {
            setPreviewMsg("预览失败：配置未能保存，请先确认保存配置成功");
            return;
        }
        try {
            setPreviewMsg("预览中…");
            await Widget.preview({ family: family as any });
            setPreviewMsg(null);
        } catch (e) {
            setPreviewMsg("预览失败: " + String((e as Error)?.message || e));
        }
    }

    return (
        <NavigationStack>
            <List
                navigationTitle="设置"
                navigationBarTitleDisplayMode="inline"
            >
                <Section
                    header={
                        <HStack>
                            <Text>配置</Text>
                            <Spacer />
                            <Button
                                title={showPassword ? "隐藏" : "显示"}
                                systemImage={showPassword ? "eye.slash" : "eye"}
                                action={() => setShowPassword(!showPassword)}
                            />
                        </HStack>
                    }
                    footer={<Text>测试连接验证地址与密码是否正确；预览查看小组件效果。</Text>}
                >
                    <TextField
                        title="URL"
                        value={url}
                        onChanged={(v) => { setUrl(v); saveSetting("URL", v.trim()); }}
                        prompt={DEFAULT_URL}
                    />
                    {showPassword ? (
                        <>
                            <TextField
                                title="UFI-TOOLS 密码"
                                value={password}
                                onChanged={(v) => { setPassword(v); saveSetting("password", v.trim()); }}
                                prompt="UFI-TOOLS 访问密码"
                            />
                            <TextField
                                title="ZTE 后台密码"
                                value={ztePassword}
                                onChanged={(v) => { setZtePassword(v); saveSetting("zte_password", v.trim()); }}
                                prompt="ZTE 路由器后台密码"
                            />
                        </>
                    ) : (
                        <>
                            <SecureField
                                title="UFI-TOOLS 密码"
                                value={password}
                                onChanged={(v) => { setPassword(v); saveSetting("password", v.trim()); }}
                                prompt="UFI-TOOLS 访问密码"
                            />
                            <SecureField
                                title="ZTE 后台密码"
                                value={ztePassword}
                                onChanged={(v) => { setZtePassword(v); saveSetting("zte_password", v.trim()); }}
                                prompt="ZTE 路由器后台密码"
                            />
                        </>
                    )}
                    <HStack spacing={8}>
                        <Button title="保存配置" action={handleSave} />
                        <Button title="测试连接" action={handleTest} />
                    </HStack>
                </Section>

                <Section header={<Text>小组件预览</Text>}>
                    <HStack spacing={8}>
                        <Button title="Small" action={() => handlePreview("systemSmall")} />
                        <Button title="Medium" action={() => handlePreview("systemMedium")} />
                        <Button title="Large" action={() => handlePreview("systemLarge")} />
                    </HStack>
                </Section>

                {savedMsg ? (
                    <Section>
                        <HStack spacing={6}>
                            <Image systemName="checkmark.circle.fill" font={14} frame={{ width: 16, height: 16 }} />
                            <Text>{savedMsg}</Text>
                        </HStack>
                    </Section>
                ) : null}

                {errorMsg ? (
                    <Section>
                        <HStack spacing={6}>
                            <Image systemName="exclamationmark.triangle.fill" font={14} frame={{ width: 16, height: 16 }} />
                            <Text foregroundStyle="systemRed">{errorMsg}</Text>
                        </HStack>
                    </Section>
                ) : null}

                {previewMsg ? (
                    <Section>
                        <Text>{previewMsg}</Text>
                    </Section>
                ) : null}
            </List>
        </NavigationStack>
    );
}

// ===================== 根视图：底部三标签 =====================

function RootView() {
    const selection = useObservable<number>(0);

    return (
        <TabView selection={selection}>
            <Tab title="状态" systemImage="antenna.radiowaves.left.and.right" value={0}>
                <StatusView />
            </Tab>
            <Tab title="短信" systemImage="envelope.fill" value={1}>
                <SMSView />
            </Tab>
            <Tab title="设置" systemImage="gearshape.fill" value={2}>
                <SettingsView />
            </Tab>
        </TabView>
    );
}

async function run() {
    await Navigation.present({
        element: <RootView />,
    });
    Script.exit();
}

run();
