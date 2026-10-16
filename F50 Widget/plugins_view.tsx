// @ts-nocheck
// F50 Widget 插件页
//
// 数据源：设备侧 UFI-TOOLS 的「Web UI 自定义头」插件片段（GET/POST /api/get_custom_head）。
// 插件是注入到设备管理页面的 HTML 片段，不是独立进程，因此没有「运行中/已停止」进程状态；
// 本页只如实展示「已启用 / 已禁用」，不虚构运行状态。
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
    Toolbar,
    ToolbarItem,
    useState,
    useObservable,
    modifiers,
} from "scripting";
import { fetchPluginsText, savePluginsText } from "./api";
import { parsePlugins, serializePlugins, setPluginEnabled, removePlugin, PluginEntry } from "./plugins";
import { SPACING, RADIUS, FONT, THEME, softTint } from "./theme";
import { SectionCard, StatusPill, EmptyState, ErrorState, LoadingState, confirmAction } from "./ui";

/** 依据插件名与内容推断一个稳定的 SF Symbol（仅用于区分卡片，不代表能力） */
export function pluginIcon(entry: PluginEntry): string {
    const text = (entry.name + " " + entry.content).toLowerCase();
    if (/广告|adblock|blockad|reject/.test(text)) return "hand.raised.fill";
    if (/信号|signal|rsrp|band|band|cell|lock/.test(text)) return "antenna.radiowaves.left.and.right";
    if (/温度|temp|风扇|fan|cpu|内存|mem/.test(text)) return "thermometer.medium";
    if (/短信|sms|forward|转发/.test(text)) return "envelope.fill";
    if (/重启|reboot|电源|power/.test(text)) return "power";
    if (/测速|speed|test/.test(text)) return "speedometer";
    if (/主题|theme|样式|style|css/.test(text)) return "paintbrush.fill";
    if (/备份|backup|导出/.test(text)) return "square.and.arrow.up";
    return "puzzlepiece.extension.fill";
}

export function pluginSummary(entry: PluginEntry): string {
    const raw = String(entry.content || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!raw) return "（空插件）";
    return raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
}

let _pluginsLoaded = false;

export function PluginsView() {
    const [text, setText] = useState<string | null>(null);
    const [list, setList] = useState<PluginEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [selected, setSelected] = useState<PluginEntry | null>(null);

    async function load(): Promise<void> {
        setLoading(true);
        setError(null);
        try {
            const raw = await fetchPluginsText();
            setText(raw);
            setList(parsePlugins(raw));
        } catch (e) {
            setError(String((e as Error)?.message || e));
        } finally {
            setLoading(false);
        }
    }

    if (!_pluginsLoaded) {
        _pluginsLoaded = true;
        (async () => {
            await load();
        })();
    }

    function flash(message: string): void {
        setNotice(message);
        setTimeout(() => setNotice(null), 2200);
    }

    async function persist(nextText: string, successMessage: string): Promise<void> {
        const ok = await savePluginsText(nextText);
        if (!ok) {
            setError("保存失败：设备未接受插件配置（可能容量超出 5MB 或未安装 UFI-TOOLS 完整版）");
            return;
        }
        setText(nextText);
        setList(parsePlugins(nextText));
        setError(null);
        flash(successMessage);
    }

    async function handleToggle(entry: PluginEntry): Promise<void> {
        if (!text) return;
        const next = setPluginEnabled(text, entry.name, !entry.enabled);
        await persist(next, entry.enabled ? `已停用「${entry.name}」` : `已启用「${entry.name}」`);
    }

    async function handleDelete(entry: PluginEntry): Promise<void> {
        if (!text) return;
        const ok = await confirmAction({
            title: "删除插件",
            message: `将删除「${entry.name}」并写入设备，是否继续？`,
            confirmLabel: "删除",
        });
        if (!ok) return;
        const next = removePlugin(text, entry.name);
        setSelected(null);
        await persist(next, `已删除「${entry.name}」`);
    }

    // ---------- 插件详情 ----------
    if (selected) {
        return (
            <NavigationStack>
                <List
                    listStyle="insetGrouped"
                    navigationTitle={selected.name}
                    navigationBarTitleDisplayMode="inline"
                    toolbar={{
                        topBarLeading: <Button title="返回" systemImage="chevron.left" action={() => setSelected(null)} />,
                    }}
                >
                    <Section>
                        <HStack spacing={SPACING.md} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Image
                                systemName={pluginIcon(selected)}
                                font={26}
                                frame={{ width: 32, height: 32 }}
                                modifiers={modifiers().foregroundStyle(THEME.color.accent.light)}
                            />
                            <VStack spacing={2} alignment="leading">
                                <Text font={FONT.headline} fontWeight="semibold">{selected.name}</Text>
                                <StatusPill
                                    text={selected.enabled ? "已启用" : "已禁用"}
                                    tint={selected.enabled ? THEME.color.success.light : "secondaryLabel"}
                                />
                            </VStack>
                            <Spacer />
                        </HStack>
                    </Section>

                    <Section header={<Text>片段内容</Text>}>
                        <Text font={12} monospacedDigit lineLimit={14}>
                            {String(selected.content || "").trim() || "（空插件）"}
                        </Text>
                    </Section>

                    <Section footer={<Text font={FONT.caption}>插件是注入设备管理页面的 HTML 片段，不提供独立日志或进程状态。</Text>}>
                        <Button
                            title={selected.enabled ? "停用插件" : "启用插件"}
                            systemImage={selected.enabled ? "pause.circle" : "play.circle"}
                            action={async () => {
                                const entry = selected;
                                setSelected(null);
                                await handleToggle(entry);
                            }}
                        />
                        <Button
                            title="复制片段"
                            systemImage="doc.on.doc"
                            action={() => {
                                try {
                                    Pasteboard.setString(String(selected.content || ""));
                                    flash("片段已复制");
                                } catch (_) {
                                    setError("复制失败");
                                }
                            }}
                        />
                        <Button
                            title="删除插件"
                            systemImage="trash"
                            role="destructive"
                            action={() => handleDelete(selected)}
                        />
                    </Section>
                </List>
            </NavigationStack>
        );
    }

    // ---------- 插件列表 ----------
    const enabledCount = list.filter((item) => item.enabled).length;
    return (
        <NavigationStack navigationTitle="插件" navigationBarTitleDisplayMode="large">
            <List listStyle="insetGrouped">
                <Toolbar>
                    <ToolbarItem placement="topBarTrailing">
                        <Button title="刷新" systemImage="arrow.clockwise" action={load} />
                    </ToolbarItem>
                </Toolbar>

                {loading && list.length === 0 ? (
                    <Section>
                        <LoadingState message="正在读取设备插件…" />
                    </Section>
                ) : error && list.length === 0 ? (
                    <Section>
                        <ErrorState message={error} onRetry={load} />
                    </Section>
                ) : list.length === 0 ? (
                    <Section>
                        <EmptyState
                            icon="puzzlepiece.extension"
                            title="设备上没有插件"
                            message="插件来自 UFI-TOOLS 的 Web UI 自定义头。可在设备管理页面上传插件文件后回到此处刷新。"
                            actionTitle="刷新"
                            onAction={load}
                        />
                    </Section>
                ) : (
                    <>
                        <Section header={<Text>概览</Text>}>
                            <HStack spacing={SPACING.sm} alignment="center">
                                <Image
                                    systemName="puzzlepiece.extension.fill"
                                    font={FONT.body}
                                    frame={{ width: 20, height: 20 }}
                                    modifiers={modifiers().foregroundStyle(THEME.color.accent.light)}
                                />
                                <Text font={FONT.body}>共 {list.length} 个插件</Text>
                                <Spacer />
                                <StatusPill text={`已启用 ${enabledCount}`} tint={THEME.color.success.light} />
                                {list.length - enabledCount > 0 ? (
                                    <StatusPill text={`已禁用 ${list.length - enabledCount}`} tint="secondaryLabel" />
                                ) : null}
                            </HStack>
                        </Section>

                        <Section header={<Text>已安装插件</Text>}>
                            {list.map((entry) => (
                                <Button
                                    key={entry.name}
                                    buttonStyle="plain"
                                    action={() => setSelected(entry)}
                                    modifiers={modifiers().frame({ maxWidth: "infinity" })}
                                >
                                    <HStack spacing={SPACING.md} alignment="center" padding={{ vertical: 8 }} frame={{ maxWidth: "infinity" }}>
                                        <VStack
                                            alignment="center"
                                            frame={{ width: 38, height: 38 }}
                                            modifiers={modifiers()
                                                .background(softTint(THEME.color.accent.light, 0.14))
                                                .clipShape({ type: "rect", cornerRadius: 10 })}
                                        >
                                            <Image
                                                systemName={pluginIcon(entry)}
                                                font={FONT.headline}
                                                frame={{ width: 22, height: 22 }}
                                                modifiers={modifiers().foregroundStyle(THEME.color.accent.light)}
                                            />
                                        </VStack>
                                        <VStack spacing={3} alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                                            <HStack spacing={SPACING.sm}>
                                                <Text font={FONT.body} fontWeight="semibold" lineLimit={1}>{entry.name}</Text>
                                                <StatusPill
                                                    text={entry.enabled ? "已启用" : "已禁用"}
                                                    tint={entry.enabled ? THEME.color.success.light : "secondaryLabel"}
                                                />
                                                <Spacer />
                                            </HStack>
                                            <Text font={FONT.caption} foregroundStyle="secondaryLabel" lineLimit={2}>
                                                {pluginSummary(entry)}
                                            </Text>
                                        </VStack>
                                        <Image
                                            systemName="chevron.right"
                                            font={FONT.caption}
                                            frame={{ width: 14, height: 14 }}
                                            modifiers={modifiers().foregroundStyle("tertiaryLabel")}
                                        />
                                    </HStack>
                                </Button>
                            ))}
                        </Section>
                    </>
                )}

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

                {error && list.length > 0 ? (
                    <Section>
                        <HStack spacing={SPACING.sm} alignment="center">
                            <Text font={FONT.footnote} foregroundStyle={THEME.color.danger.light} lineLimit={3}>{error}</Text>
                            <Spacer />
                            <Button title="重试" action={load} />
                        </HStack>
                    </Section>
                ) : null}

                <Section footer={<Text font={FONT.caption}>数据来自设备的 UFI-TOOLS 自定义头接口；应用不会在本地缓存或伪造插件列表。</Text>}>
                    <Text font={FONT.caption} foregroundStyle="tertiaryLabel">插件配置保存后立即在设备端生效</Text>
                </Section>
            </List>
        </NavigationStack>
    );
}
