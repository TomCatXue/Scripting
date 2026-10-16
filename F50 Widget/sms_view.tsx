// @ts-nocheck
// F50 Widget 短信页：会话列表 / 聊天详情 / 写短信
import {
    NavigationStack,
    List,
    Section,
    Text,
    Button,
    TextField,
    HStack,
    VStack,
    Spacer,
    Image,
    Toolbar,
    ToolbarItem,
    useState,
    modifiers,
} from "scripting";
import { fetchSMSMessages, sendSMS, extractVerifyCode, SMSMessage } from "./api";
import { SPACING, RADIUS, FONT, THEME, softTint } from "./theme";
import { StatusPill, EmptyState, ErrorState, LoadingState, confirmAction } from "./ui";

export interface Conversation {
    number: string;
    messages: SMSMessage[];
    unread: number;
    latest: SMSMessage;
    code: string | null;
}

/** 按号码分组并按时间倒序；未读数与验证码在此处一次算好，避免渲染期重复计算 */
export function groupConversations(messages: SMSMessage[]): Conversation[] {
    const map: Record<string, SMSMessage[]> = {};
    const order: string[] = [];
    for (const msg of messages) {
        const num = msg.number || "未知号码";
        if (!map[num]) {
            map[num] = [];
            order.push(num);
        }
        map[num].push(msg);
    }
    return order.map((num) => {
        const list = map[num].slice().sort((a, b) => (a.dateText < b.dateText ? 1 : -1));
        const latest = list[0];
        return {
            number: num,
            messages: list,
            unread: list.filter((m) => m.isUnread).length,
            latest,
            code: latest ? extractVerifyCode(latest.content) : null,
        };
    });
}

let _smsLoaded = false;

export function SMSView() {
    const [messages, setMessages] = useState<SMSMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
    const [composing, setComposing] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    async function loadSMS(): Promise<void> {
        setLoading(true);
        setError(null);
        try {
            setMessages(await fetchSMSMessages());
        } catch (e) {
            setError(String((e as Error)?.message || e));
        } finally {
            setLoading(false);
        }
    }

    if (!_smsLoaded) {
        _smsLoaded = true;
        (async () => {
            await loadSMS();
        })();
    }

    function flash(message: string): void {
        setNotice(message);
        setTimeout(() => setNotice(null), 2000);
    }

    function copy(text: string, what: string): void {
        try {
            Pasteboard.setString(text);
            flash(what + " 已复制");
        } catch (_) {
            setError("复制失败");
        }
    }

    const conversations = groupConversations(messages);

    // ---------- 会话详情 ----------
    if (selectedNumber) {
        const conv = conversations.find((c) => c.number === selectedNumber);
        if (!conv) {
            return (
                <NavigationStack navigationTitle="短信" navigationBarTitleDisplayMode="inline">
                    <List listStyle="insetGrouped">
                        <Section>
                            <EmptyState
                                icon="questionmark.bubble"
                                title="会话不存在"
                                message="该会话可能在刷新后已消失。"
                                actionTitle="返回列表"
                                onAction={() => setSelectedNumber(null)}
                            />
                        </Section>
                    </List>
                </NavigationStack>
            );
        }
        return (
            <NavigationStack>
                <List
                    listStyle="plain"
                    navigationTitle={conv.number}
                    navigationBarTitleDisplayMode="inline"
                    toolbar={{
                        topBarLeading: <Button title="返回" systemImage="chevron.left" action={() => setSelectedNumber(null)} />,
                        topBarTrailing: (
                            <Button
                                title="发送"
                                systemImage="square.and.pencil"
                                action={() => setComposing(true)}
                            />
                        ),
                    }}
                >
                    {conv.messages.map((msg, index) => {
                        const code = extractVerifyCode(msg.content);
                        // 收到的短信靠左，发出的靠右（与 iOS Messages 一致）
                        const outgoing = msg.isOutgoing;
                        return (
                            <VStack
                                key={`msg-${msg.id || index}`}
                                spacing={4}
                                alignment={outgoing ? "trailing" : "leading"}
                                padding={{ vertical: 6, horizontal: SPACING.md }}
                                frame={{ maxWidth: "infinity", alignment: outgoing ? "trailing" : "leading" }}
                            >
                                <VStack
                                    spacing={6}
                                    alignment="leading"
                                    padding={{ horizontal: SPACING.md, vertical: SPACING.sm }}
                                    frame={{ maxWidth: 280, alignment: "leading" }}
                                    modifiers={modifiers()
                                        .background(outgoing ? THEME.color.accent.light : THEME.card)
                                        .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
                                >
                                    <Text
                                        font={FONT.body}
                                        lineSpacing={3}
                                        foregroundStyle={outgoing ? "white" : "label"}
                                    >
                                        {msg.content || "（空短信）"}
                                    </Text>
                                    {code ? (
                                        <Button
                                            action={() => copy(code, "验证码 " + code)}
                                            buttonStyle="plain"
                                        >
                                            <HStack
                                                spacing={4}
                                                padding={{ horizontal: 10, vertical: 5 }}
                                                modifiers={modifiers()
                                                    .background(softTint(THEME.color.warning.light, 0.18))
                                                    .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
                                            >
                                                <Image
                                                    systemName="key.fill"
                                                    font={FONT.caption}
                                                    frame={{ width: 12, height: 12 }}
                                                    modifiers={modifiers().foregroundStyle(THEME.color.warning.light)}
                                                />
                                                <Text font={FONT.caption} fontWeight="bold" monospacedDigit foregroundStyle={THEME.color.warning.light}>
                                                    复制验证码 {code}
                                                </Text>
                                            </HStack>
                                        </Button>
                                    ) : null}
                                </VStack>
                                <HStack spacing={4} alignment="center">
                                    <Text font={FONT.caption} foregroundStyle="tertiaryLabel" monospacedDigit>
                                        {msg.dateText}
                                    </Text>
                                    <StatusPill
                                        text={outgoing ? "已发送" : (msg.isUnread ? "未读" : "已接收")}
                                        tint={outgoing ? THEME.color.accent.light : "secondaryLabel"}
                                    />
                                </HStack>
                            </VStack>
                        );
                    })}
                    {notice ? (
                        <Section>
                            <Text font={FONT.footnote} foregroundStyle={THEME.color.success.light}>{notice}</Text>
                        </Section>
                    ) : null}
                </List>
                {composing ? (
                    <ComposeSheet
                        defaultNumber={conv.number}
                        onClose={() => setComposing(false)}
                        onSent={() => {
                            setComposing(false);
                            loadSMS();
                        }}
                    />
                ) : null}
            </NavigationStack>
        );
    }

    // ---------- 会话列表 ----------
    const unreadTotal = conversations.reduce((sum, c) => sum + c.unread, 0);
    return (
        <NavigationStack navigationTitle="短信" navigationBarTitleDisplayMode="large">
            <List listStyle="insetGrouped" refreshable={loadSMS}>
                <Toolbar>
                    <ToolbarItem placement="topBarTrailing">
                        <Button title="写短信" systemImage="square.and.pencil" action={() => setComposing(true)} />
                    </ToolbarItem>
                </Toolbar>

                {loading && messages.length === 0 ? (
                    <Section>
                        <LoadingState message="正在读取短信…" />
                    </Section>
                ) : error && messages.length === 0 ? (
                    <Section>
                        <ErrorState message={error} onRetry={loadSMS} />
                    </Section>
                ) : conversations.length === 0 ? (
                    <Section>
                        <EmptyState
                            icon="envelope.open"
                            title="暂无短信"
                            message="设备上没有可读取的短信记录。"
                            actionTitle="刷新"
                            onAction={loadSMS}
                        />
                    </Section>
                ) : (
                    <Section header={<Text>{conversations.length} 个会话{unreadTotal > 0 ? ` · ${unreadTotal} 条未读` : ""}</Text>}>
                        {conversations.map((conv) => (
                            <Button
                                key={conv.number}
                                buttonStyle="plain"
                                action={() => setSelectedNumber(conv.number)}
                                modifiers={modifiers().frame({ maxWidth: "infinity" })}
                            >
                                <HStack spacing={SPACING.md} alignment="center" padding={{ vertical: 8 }} frame={{ maxWidth: "infinity" }}>
                                    <VStack
                                        alignment="center"
                                        frame={{ width: 38, height: 38 }}
                                        modifiers={modifiers()
                                            .background(softTint(THEME.color.accent.light, 0.14))
                                            .clipShape({ type: "circle" })}
                                    >
                                        <Image
                                            systemName={conv.unread > 0 ? "message.fill" : "message"}
                                            font={FONT.headline}
                                            frame={{ width: 20, height: 20 }}
                                            modifiers={modifiers().foregroundStyle(THEME.color.accent.light)}
                                        />
                                    </VStack>
                                    <VStack spacing={3} alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                                        <HStack spacing={SPACING.sm} alignment="center">
                                            <Text font={FONT.body} fontWeight={conv.unread > 0 ? "bold" : "semibold"} lineLimit={1}>
                                                {conv.number}
                                            </Text>
                                            {conv.unread > 0 ? <StatusPill text={`${conv.unread} 未读`} tint={THEME.color.accent.light} /> : null}
                                            <Spacer />
                                            <Text font={FONT.caption} foregroundStyle="tertiaryLabel" monospacedDigit>
                                                {conv.latest?.dateText || ""}
                                            </Text>
                                        </HStack>
                                        <HStack spacing={4} alignment="center">
                                            {conv.code ? (
                                                <Text font={FONT.caption} fontWeight="bold" foregroundStyle={THEME.color.warning.light}>
                                                    验证码 {conv.code} ·
                                                </Text>
                                            ) : null}
                                            <Text font={FONT.footnote} foregroundStyle="secondaryLabel" lineLimit={1}>
                                                {conv.latest?.content || "（空短信）"}
                                            </Text>
                                        </HStack>
                                    </VStack>
                                </HStack>
                            </Button>
                        ))}
                    </Section>
                )}

                {error && messages.length > 0 ? (
                    <Section>
                        <HStack spacing={SPACING.sm} alignment="center">
                            <Text font={FONT.footnote} foregroundStyle={THEME.color.danger.light} lineLimit={3}>{error}</Text>
                            <Spacer />
                            <Button title="重试" action={loadSMS} />
                        </HStack>
                    </Section>
                ) : null}

                {notice ? (
                    <Section>
                        <Text font={FONT.footnote} foregroundStyle={THEME.color.success.light}>{notice}</Text>
                    </Section>
                ) : null}
            </List>
            {composing ? (
                <ComposeSheet
                    onClose={() => setComposing(false)}
                    onSent={() => {
                        setComposing(false);
                        loadSMS();
                    }}
                />
            ) : null}
        </NavigationStack>
    );
}

// ===================== 写短信 =====================

export function ComposeSheet({ defaultNumber = "", onClose, onSent }: any) {
    const [number, setNumber] = useState(defaultNumber);
    const [content, setContent] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSend = number.trim().length > 0 && content.trim().length > 0 && !sending;

    async function handleSend(): Promise<void> {
        if (!canSend) return;
        const ok = await confirmAction({
            title: "发送短信",
            message: `将向 ${number} 发送这条短信，是否继续？`,
            confirmLabel: "发送",
        });
        if (!ok) return;
        setSending(true);
        setError(null);
        try {
            const sent = await sendSMS(number.trim(), content.trim());
            if (sent) onSent();
            else setError("短信发送失败：设备未接受指令，请检查 UFI-TOOLS 密码与设备连接");
        } catch (e) {
            setError("短信发送失败：" + String((e as Error)?.message || e));
        } finally {
            setSending(false);
        }
    }

    return (
        <NavigationStack>
            <List
                navigationTitle="写短信"
                navigationBarTitleDisplayMode="inline"
                toolbar={{
                    cancellationAction: <Button title="取消" action={onClose} />,
                    confirmationAction: (
                        <Button
                            title={sending ? "发送中…" : "发送"}
                            action={handleSend}
                            modifiers={modifiers().tint(canSend ? THEME.color.accent.light : "secondaryLabel")}
                        />
                    ),
                }}
            >
                <Section header={<Text>接收号码</Text>}>
                    <TextField
                        title="号码"
                        value={number}
                        onChanged={setNumber}
                        prompt="例如 10086"
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
                        <HStack spacing={6} alignment="center">
                            <Image
                                systemName="exclamationmark.triangle.fill"
                                font={FONT.footnote}
                                frame={{ width: 16, height: 16 }}
                                modifiers={modifiers().foregroundStyle(THEME.color.danger.light)}
                            />
                            <Text font={FONT.footnote} foregroundStyle={THEME.color.danger.light} lineLimit={4}>{error}</Text>
                        </HStack>
                    </Section>
                ) : null}
            </List>
        </NavigationStack>
    );
}
