// @ts-nocheck
// F50 Widget 设置页：外观 / 设备与后台 / 凭据 / 通话 / 数据 / 隐私 / 关于
import {
    NavigationStack,
    List,
    Section,
    Text,
    Button,
    TextField,
    SecureField,
    Toggle,
    Picker,
    HStack,
    VStack,
    Spacer,
    Image,
    useState,
    useColorScheme,
    modifiers,
    Widget,
} from "scripting";
import { readSetting, saveSetting, setSessionSettings, fetchDeviceInfo, fetchVolteState, setVolteState, fetchVonrState, setVonrState, resolveEndpoints } from "./api";
import { fetchWidgetSnapshot, WidgetState, readWidgetCache } from "./widget_data";
import {
    THEME,
    SPACING,
    RADIUS,
    FONT,
    ACCENT_PRESETS,
    softTint,
    loadAccent,
    saveAccent,
    loadAppearance,
    saveAppearance,
    loadMotion,
    saveMotion,
} from "./theme";
import { SectionCard, DataRow, StatusPill, EmptyState, confirmAction } from "./ui";

const DEFAULT_URL = "http://192.168.0.1:2333";
const APP_VERSION = "4.0.0";

let _previewLock = false;

export function SettingsView() {
    const scheme = useColorScheme();
    const [url, setUrl] = useState(readSetting("URL", DEFAULT_URL));
    const [password, setPassword] = useState(readSetting("password", ""));
    const [ztePassword, setZtePassword] = useState(readSetting("zte_password", ""));
    const [showPassword, setShowPassword] = useState(false);
    const [accent, setAccent] = useState(loadAccent());
    const [appearance, setAppearance] = useState(loadAppearance());
    const [motion, setMotion] = useState(loadMotion());
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [volte, setVolte] = useState<boolean | null>(null);
    const [vonr, setVonr] = useState<boolean | null>(null);
    const [volteBusy, setVolteBusy] = useState(false);

    function flash(message: string): void {
        setNotice(message);
        setTimeout(() => setNotice(null), 2400);
    }

    function persistConfig(): boolean {
        const okUrl = saveSetting("URL", url.trim());
        const okPwd = saveSetting("password", password.trim());
        const okZte = saveSetting("zte_password", ztePassword.trim());
        return okUrl && okPwd && okZte;
    }

    async function handleTest(): Promise<void> {
        setTesting(true);
        setError(null);
        const saved = persistConfig();
        setSessionSettings({
            url: url.trim(),
            password: password.trim(),
            ztePassword: ztePassword.trim(),
        });
        try {
            const { state } = await fetchWidgetSnapshot();
            if (state.model_name !== "--") {
                flash("连接成功 · 设备 " + state.model_name + (state.error ? "（部分接口异常）" : ""));
            } else if (state.error) {
                setError("连接失败：" + state.error);
            } else {
                setError("连接成功但未返回设备信息，请核对地址与密码");
            }
            if (!saved) setError("配置未能写入存储，请重试");
        } catch (e) {
            setError("连接失败：" + String((e as Error)?.message || e));
        } finally {
            setSessionSettings(null);
            setTesting(false);
        }
    }

    async function loadVoiceSwitches(): Promise<void> {
        const [v, n] = await Promise.all([fetchVolteState(0), fetchVonrState(0)]);
        setVolte(v);
        setVonr(n);
    }

    async function toggleVolte(next: boolean): Promise<void> {
        setVolteBusy(true);
        setError(null);
        try {
            const ok = await setVolteState(next, 0);
            if (ok) {
                setVolte(next);
                flash(next ? "VoLTE 已开启" : "VoLTE 已关闭");
            } else {
                setError("VoLTE 设置失败：设备未接受指令");
            }
        } finally {
            setVolteBusy(false);
        }
    }

    async function toggleVonr(next: boolean): Promise<void> {
        setVolteBusy(true);
        setError(null);
        try {
            const ok = await setVonrState(next, 0);
            if (ok) {
                setVonr(next);
                flash(next ? "VoNR 已开启" : "VoNR 已关闭");
            } else {
                setError("VoNR 设置失败：设备未接受指令");
            }
        } finally {
            setVolteBusy(false);
        }
    }

    async function handlePreview(): Promise<void> {
        if (_previewLock) return;
        _previewLock = true;
        try {
            if (!persistConfig()) {
                setError("预览失败：配置未能保存");
                return;
            }
            await Widget.preview({ family: "systemMedium" as any });
        } catch (e) {
            setError("预览失败：" + String((e as Error)?.message || e));
        } finally {
            _previewLock = false;
        }
    }

    async function handleReset(): Promise<void> {
        const ok = await confirmAction({
            title: "重置应用配置",
            message: "将清除本机保存的地址与密码（设备侧插件与设置不受影响）。是否继续？",
            confirmLabel: "重置",
        });
        if (!ok) return;
        saveSetting("URL", DEFAULT_URL);
        saveSetting("password", "");
        saveSetting("zte_password", "");
        setUrl(DEFAULT_URL);
        setPassword("");
        setZtePassword("");
        flash("已重置本机配置");
    }

    const endpoints = resolveEndpoints(url || DEFAULT_URL);
    const accentColor = scheme === "dark" ? accent || THEME.color.accent.dark : accent || THEME.color.accent.light;

    return (
        <NavigationStack navigationTitle="设置" navigationBarTitleDisplayMode="large">
            <List
                listStyle="insetGrouped"
                toolbar={{
                    topBarTrailing: <Button title="保存" action={() => (persistConfig() ? flash("已保存") : setError("保存失败"))} />,
                }}
            >
                {/* 概览 */}
                <Section>
                    <SectionCard>
                        <HStack spacing={SPACING.md} alignment="center" frame={{ maxWidth: "infinity" }}>
                            <Image
                                systemName="gearshape.fill"
                                font={24}
                                frame={{ width: 30, height: 30 }}
                                modifiers={modifiers().foregroundStyle(accentColor)}
                            />
                            <VStack spacing={3} alignment="leading">
                                <Text font={FONT.headline} fontWeight="semibold">F50 Widget</Text>
                                <Text font={FONT.caption} foregroundStyle="secondaryLabel">版本 {APP_VERSION}</Text>
                            </VStack>
                            <Spacer />
                            <StatusPill text={testing ? "测试中" : "就绪"} tint={accentColor} />
                        </HStack>
                        <DataRow icon="link" iconColor="secondaryLabel" title="ZTE 后台地址" value={endpoints.routerBaseURL} monospaced={false} />
                        <DataRow icon="server.rack" iconColor="secondaryLabel" title="UFI 地址" value={endpoints.ufiBaseURL} monospaced={false} />
                    </SectionCard>
                </Section>

                {/* 外观 */}
                <Section header={<Text>外观</Text>}>
                    <SectionCard footer="强调色影响按钮、选中态与图表；深浅色自动适配。">
                        <HStack spacing={SPACING.sm} alignment="center">
                            <Text font={FONT.body}>模式</Text>
                            <Spacer />
                            <Picker
                                pickerStyle="segmented"
                                value={appearance}
                                onChanged={(v: any) => {
                                    setAppearance(v);
                                    saveAppearance(v);
                                }}
                            >
                                <Text tag="system">跟随系统</Text>
                                <Text tag="light">浅色</Text>
                                <Text tag="dark">深色</Text>
                            </Picker>
                        </HStack>
                        <VStack spacing={SPACING.sm} alignment="leading" frame={{ maxWidth: "infinity" }}>
                            <Text font={FONT.footnote} foregroundStyle="secondaryLabel">强调色</Text>
                            <HStack spacing={SPACING.sm}>
                                {ACCENT_PRESETS.map((preset) => {
                                    const color = scheme === "dark" ? preset.dark : preset.light;
                                    const active = (accent || THEME.color.accent.light).toLowerCase() === preset.light.toLowerCase();
                                    return (
                                        <Button
                                            key={preset.id}
                                            buttonStyle="plain"
                                            action={() => {
                                                const value = active ? "" : preset.light;
                                                setAccent(value);
                                                saveAccent(value);
                                            }}
                                        >
                                            <VStack
                                                spacing={4}
                                                alignment="center"
                                                frame={{ width: 52 }}
                                            >
                                                <VStack
                                                    alignment="center"
                                                    frame={{ width: 30, height: 30 }}
                                                    modifiers={modifiers()
                                                        .background(softTint(color, 0.9))
                                                        .clipShape({ type: "circle" })}
                                                >
                                                    {active ? (
                                                        <Image
                                                            systemName="checkmark"
                                                            font={FONT.footnote}
                                                            frame={{ width: 14, height: 14 }}
                                                            modifiers={modifiers().foregroundStyle("white")}
                                                        />
                                                    ) : null}
                                                </VStack>
                                                <Text font={9} foregroundStyle="secondaryLabel">{preset.name}</Text>
                                            </VStack>
                                        </Button>
                                    );
                                })}
                            </HStack>
                        </VStack>
                        <Toggle
                            title="完整动画"
                            value={motion === "full"}
                            onChanged={(v: boolean) => {
                                const level = v ? "full" : "reduced";
                                setMotion(level);
                                saveMotion(level);
                            }}
                        />
                        <Text font={FONT.caption} foregroundStyle="tertiaryLabel">
                            关闭后减少曲线与数字过渡，优先保证低性能设备流畅。
                        </Text>
                    </SectionCard>
                </Section>

                {/* 设备与后台连接 */}
                <Section
                    header={<Text>设备与后台连接</Text>}
                    footer={<Text font={FONT.caption}>UFI-TOOLS 完整版的地址通常为 http://设备IP:2333；ZTE 后台为同一 IP 的 80 端口。</Text>}
                >
                    <SectionCard>
                        <TextField title="UFI-TOOLS 地址" value={url} onChanged={(v: string) => setUrl(v)} prompt={DEFAULT_URL} />
                        <HStack spacing={SPACING.sm}>
                            <Button
                                title="保存配置"
                                systemImage="square.and.arrow.down"
                                action={() => (persistConfig() ? flash("已保存 ✓") : setError("保存失败"))}
                            />
                            <Button
                                title={testing ? "测试中…" : "测试连接"}
                                systemImage="bolt.horizontal"
                                action={handleTest}
                            />
                        </HStack>
                        <Button title="预览小组件" systemImage="eye" action={handlePreview} />
                    </SectionCard>
                </Section>

                {/* 凭据 */}
                <Section
                    header={
                        <HStack>
                            <Text>凭据</Text>
                            <Spacer />
                            <Button
                                title={showPassword ? "隐藏" : "显示"}
                                systemImage={showPassword ? "eye.slash" : "eye"}
                                action={() => setShowPassword(!showPassword)}
                            />
                        </HStack>
                    }
                    footer={<Text font={FONT.caption}>密码仅保存在本机（Storage / Keychain），不会出现在日志或反馈中。</Text>}
                >
                    <SectionCard>
                        {showPassword ? (
                            <>
                                <TextField
                                    title="UFI-TOOLS 密码"
                                    value={password}
                                    onChanged={(v: string) => {
                                        setPassword(v);
                                        saveSetting("password", v.trim());
                                    }}
                                    prompt="UFI-TOOLS 访问密码"
                                />
                                <TextField
                                    title="ZTE 后台密码"
                                    value={ztePassword}
                                    onChanged={(v: string) => {
                                        setZtePassword(v);
                                        saveSetting("zte_password", v.trim());
                                    }}
                                    prompt="ZTE 路由器后台密码"
                                />
                            </>
                        ) : (
                            <>
                                <SecureField
                                    title="UFI-TOOLS 密码"
                                    value={password}
                                    onChanged={(v: string) => {
                                        setPassword(v);
                                        saveSetting("password", v.trim());
                                    }}
                                    prompt="UFI-TOOLS 访问密码"
                                />
                                <SecureField
                                    title="ZTE 后台密码"
                                    value={ztePassword}
                                    onChanged={(v: string) => {
                                        setZtePassword(v);
                                        saveSetting("zte_password", v.trim());
                                    }}
                                    prompt="ZTE 路由器后台密码"
                                />
                            </>
                        )}
                        <Text font={FONT.caption} foregroundStyle="tertiaryLabel">
                            UFI-TOOLS 密码用于签名接口与 root_shell；ZTE 密码用于短信读取与重启等 goform 操作，两者不可混用。
                        </Text>
                    </SectionCard>
                </Section>

                {/* 通话能力 */}
                <Section header={<Text>通话能力</Text>}>
                    <SectionCard
                        footer={
                            volte === null
                                ? "未检测到通话接口：需要设备侧 UFI-TOOLS 完整版与面具模块。"
                                : "VoLTE / VoNR 由设备基带提供，语音链路由设备侧模块处理。"
                        }
                    >
                        {volte === null ? (
                            <>
                                <EmptyState
                                    icon="phone.down"
                                    title="通话接口不可用"
                                    message="当前设备未返回 /api/volte_status。安装 UFI-TOOLS 完整版后重试。"
                                    actionTitle="重新检测"
                                    onAction={loadVoiceSwitches}
                                />
                            </>
                        ) : (
                            <>
                                <Toggle
                                    title="VoLTE（4G 语音）"
                                    value={volte}
                                    onChanged={(v: boolean) => {
                                        if (!volteBusy) toggleVolte(v);
                                    }}
                                />
                                {vonr !== null ? (
                                    <Toggle
                                        title="VoNR（5G 语音）"
                                        value={vonr}
                                        onChanged={(v: boolean) => {
                                            if (!volteBusy) toggleVonr(v);
                                        }}
                                    />
                                ) : (
                                    <DataRow icon="antenna.radiowaves.left.and.right" title="VoNR" value="" unavailable />
                                )}
                                <Button title="刷新状态" systemImage="arrow.clockwise" action={loadVoiceSwitches} />
                            </>
                        )}
                    </SectionCard>
                </Section>

                {/* 数据与设备 */}
                <Section header={<Text>数据与设备</Text>}>
                    <SectionCard footer="流量统计与速率单位取自设备字段；重置、清除等操作不可撤销。">
                        <Button title="重置应用配置" systemImage="arrow.counterclockwise" role="destructive" action={handleReset} />
                    </SectionCard>
                </Section>

                {/* 隐私与安全 */}
                <Section header={<Text>隐私与安全</Text>}>
                    <SectionCard>
                        <DataRow icon="lock.shield" iconColor={THEME.color.success.light} title="凭据存储" value="本机 Storage / Keychain" monospaced={false} />
                        <DataRow icon="eye.slash" iconColor={THEME.color.success.light} title="敏感信息" value="默认隐藏 / 脱敏显示" monospaced={false} />
                        <DataRow icon="antenna.radiowaves.left.and.right" iconColor={THEME.color.warning.light} title="传输" value="局域网 HTTP" monospaced={false} />
                        <Text font={FONT.caption} foregroundStyle="tertiaryLabel">
                            设备仅支持局域网 HTTP，请勿在不可信网络下使用；应用不会把凭据上传到任何服务器。
                        </Text>
                    </SectionCard>
                </Section>

                {/* 关于 */}
                <Section header={<Text>关于</Text>}>
                    <SectionCard footer="状态 / 短信 / 电话 / 插件 / 设置 —— 为 ZTE F50、U60 等随身 Wi-Fi 设备打造。">
                        <DataRow icon="app.badge" iconColor={accentColor} title="版本" value={APP_VERSION} />
                        <DataRow icon="wifi.router" iconColor="secondaryLabel" title="支持设备" value="ZTE F50 / U60 系列" monospaced={false} />
                        <DataRow icon="puzzlepiece.extension" iconColor="secondaryLabel" title="依赖" value="UFI-TOOLS 完整版" monospaced={false} />
                    </SectionCard>
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
