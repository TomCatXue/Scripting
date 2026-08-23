// @ts-nocheck
// F50 Widget 设置界面：配置 UFI-TOOLS 地址与密码，支持测试连接与小组件预览
import {
    Script, Navigation, NavigationStack, List, Section, Text, Button,
    TextField, SecureField, HStack, Spacer, Image, Toolbar, ToolbarItem,
    useState,
} from "scripting";
import { readSetting, saveSetting, fetchDeviceInfo } from "./api";
import { Widget } from "scripting";

const DEFAULT_URL = "http://192.168.0.1:2333";

// ===================== 设置页 =====================

function SettingsView({ onClose }: { onClose: () => void }) {
    const [url, setUrl] = useState(readSetting("URL", DEFAULT_URL));
    const [password, setPassword] = useState("");
    const [ztePassword, setZtePassword] = useState("");
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    function handleSave() {
        let changed = false;
        if (url.trim() !== "") { saveSetting("URL", url.trim()); changed = true; }
        if (password.trim() !== "") { saveSetting("password", password.trim()); changed = true; }
        if (ztePassword.trim() !== "") { saveSetting("zte_password", ztePassword.trim()); changed = true; }
        setPassword("");
        setZtePassword("");
        setSavedMsg(changed ? "已保存 ✓" : "没有新内容需要保存");
        setErrorMsg(null);
        setTimeout(() => setSavedMsg(null), 2500);
    }

    async function handleTest() {
        setErrorMsg(null);
        setSavedMsg(null);
        try {
            const info = await fetchDeviceInfo();
            if (info && (info.model || info.cpu_temp || info.daily_data)) {
                setSavedMsg("连接成功 ✓ 设备型号: " + String(info.model || info.model_name || "?"));
            } else {
                setSavedMsg("连接成功 ✓（返回了数据）");
            }
            setTimeout(() => setSavedMsg(null), 3000);
        } catch (e) {
            setErrorMsg("连接失败: " + String((e as Error)?.message || e));
        }
    }

    return (
        <NavigationStack>
            <List
                navigationTitle="设置"
                navigationBarTitleDisplayMode="inline"
                toolbar={
                    <Toolbar>
                        <ToolbarItem placement="topBarTrailing">
                            <Button title="完成" action={onClose} />
                        </ToolbarItem>
                    </Toolbar>
                }
            >
                <Section
                    header={<Text>连接</Text>}
                    footer={<Text>UFI-TOOLS 反向代理地址，用于访问 ZTE F50 设备接口。</Text>}
                >
                    <TextField
                        title="URL"
                        value={url}
                        onChanged={setUrl}
                        prompt={DEFAULT_URL}
                    />
                </Section>

                <Section
                    header={
                        <HStack>
                            <Text>密码</Text>
                            <Spacer />
                            <Button
                                title={showPassword ? "隐藏" : "显示"}
                                systemImage={showPassword ? "eye.slash" : "eye"}
                                action={() => setShowPassword(!showPassword)}
                            />
                        </HStack>
                    }
                    footer={<Text>密码仅保存在本机 Storage，不会上传。留空表示保持原值。</Text>}
                >
                    {showPassword ? (
                        <>
                            <TextField
                                title="UFI-TOOLS 密码"
                                value={password}
                                onChanged={setPassword}
                                prompt="用于接口签名"
                            />
                            <TextField
                                title="ZTE 后台密码"
                                value={ztePassword}
                                onChanged={setZtePassword}
                                prompt="用于登录设备管理页"
                            />
                        </>
                    ) : (
                        <>
                            <SecureField
                                title="UFI-TOOLS 密码"
                                value={password}
                                onChanged={setPassword}
                                prompt="用于接口签名"
                            />
                            <SecureField
                                title="ZTE 后台密码"
                                value={ztePassword}
                                onChanged={setZtePassword}
                                prompt="用于登录设备管理页"
                            />
                        </>
                    )}
                </Section>

                <Section>
                    <Button title="保存配置" action={handleSave} />
                    <Button title="测试连接" action={handleTest} />
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
            </List>
        </NavigationStack>
    );
}

// ===================== 主界面 =====================

function MainView() {
    const [showSettings, setShowSettings] = useState(false);
    const [previewMsg, setPreviewMsg] = useState<string | null>(null);
    const url = readSetting("URL", DEFAULT_URL);
    const hasPwd = readSetting("password", "") !== "";
    const hasZte = readSetting("zte_password", "") !== "";

    async function handlePreview(family: string) {
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
                navigationTitle="F50 Widget"
                navigationBarTitleDisplayMode="inline"
                toolbar={
                    <Toolbar>
                        <ToolbarItem placement="topBarTrailing">
                            <Button title="设置" systemImage="gearshape" action={() => setShowSettings(true)} />
                        </ToolbarItem>
                    </Toolbar>
                }
                sheet={{
                    isPresented: showSettings,
                    onChanged: setShowSettings,
                    content: (<SettingsView onClose={() => setShowSettings(false)} />),
                }}
            >
                <Section
                    header={<Text>连接状态</Text>}
                    footer={<Text>在设置页配置 UFI-TOOLS 地址与密码，密码仅保存在本机。</Text>}
                >
                    <HStack>
                        <Text>URL</Text>
                        <Spacer />
                        <Text foregroundStyle="secondaryLabel">{url}</Text>
                    </HStack>
                    <HStack>
                        <Text>UFI-TOOLS 密码</Text>
                        <Spacer />
                        <Text foregroundStyle={hasPwd ? "systemGreen" : "systemRed"}>{hasPwd ? "已设置" : "未设置"}</Text>
                    </HStack>
                    <HStack>
                        <Text>ZTE 后台密码</Text>
                        <Spacer />
                        <Text foregroundStyle={hasZte ? "systemGreen" : "systemRed"}>{hasZte ? "已设置" : "未设置"}</Text>
                    </HStack>
                </Section>

                <Section
                    header={<Text>小组件预览</Text>}
                    footer={<Text>在 App 内预览小组件效果，会真实拉取设备数据。添加到桌面后点击小组件即可手动刷新。</Text>}
                >
                    <HStack spacing={8}>
                        <Button title="预览" action={() => handlePreview("systemMedium")} />
                    </HStack>
                </Section>

                {previewMsg ? (
                    <Section>
                        <Text>{previewMsg}</Text>
                    </Section>
                ) : null}
            </List>
        </NavigationStack>
    );
}

async function run() {
    await Navigation.present({
        element: <MainView />,
    });
    Script.exit();
}

run();