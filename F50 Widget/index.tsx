// @ts-nocheck
// F50 Widget 设置界面：直接配置 UFI-TOOLS 地址与密码，支持测试连接与小组件预览
import {
    Script, Navigation, NavigationStack, List, Section, Text, Button,
    TextField, SecureField, HStack, Spacer, Image, Toolbar, ToolbarItem,
    useState,
} from "scripting";
import { readSetting, saveSetting, fetchDeviceInfo } from "./api";
import { Widget } from "scripting";

const DEFAULT_URL = "http://192.168.0.1:2333";

// ===================== 主界面（含设置表单） =====================

function MainView() {
    const [url, setUrl] = useState(readSetting("URL", DEFAULT_URL));
    const [password, setPassword] = useState("");
    const [ztePassword, setZtePassword] = useState("");
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [previewMsg, setPreviewMsg] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const hasPwd = readSetting("password", "") !== "";
    const hasZte = readSetting("zte_password", "") !== "";

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
                setSavedMsg("连接成功 ✓ 设备: " + String(info.model || info.model_name || "?"));
            } else {
                setSavedMsg("连接成功 ✓（返回了数据）");
            }
            setTimeout(() => setSavedMsg(null), 3000);
        } catch (e) {
            setErrorMsg("连接失败: " + String((e as Error)?.message || e));
        }
    }

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
                            <Button title="预览" systemImage="eye" action={() => handlePreview("systemMedium")} />
                        </ToolbarItem>
                    </Toolbar>
                }
            >
                <Section
                    header={<Text>连接状态</Text>}
                    footer={<Text>密码仅保存在本机 Storage，不会上传。</Text>}
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
                    footer={<Text>UFI-TOOLS 反向代理地址（默认 2333 端口）。URL 改后点保存生效。</Text>}
                >
                    <TextField
                        title="URL"
                        value={url}
                        onChanged={setUrl}
                        prompt={DEFAULT_URL}
                    />
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
                    <HStack spacing={8}>
                        <Button title="保存配置" action={handleSave} />
                        <Button title="测试连接" action={handleTest} />
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

async function run() {
    await Navigation.present({
        element: <MainView />,
    });
    Script.exit();
}

run();