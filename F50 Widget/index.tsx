// @ts-nocheck
// F50 Widget 设置界面：直接配置 UFI-TOOLS 地址与密码，支持测试连接与小组件预览
import {
    Script, Navigation, NavigationStack, List, Section, Text, Button,
    TextField, SecureField, HStack, Spacer, Image, Toolbar, ToolbarItem,
    useState,
} from "scripting";
import { readSetting, saveSetting, setSessionSettings } from "./api";
import { fetchWidgetSnapshot } from "./widget_data";
import { Widget } from "scripting";

const DEFAULT_URL = "http://192.168.0.1:2333";

// ===================== 主界面（含设置表单） =====================

function MainView() {
    const [url, setUrl] = useState(readSetting("URL", DEFAULT_URL));
    const [password, setPassword] = useState(readSetting("password", ""));
    const [ztePassword, setZtePassword] = useState(readSetting("zte_password", ""));
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [previewMsg, setPreviewMsg] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(true);  // 默认明文显示，方便确认已保存的密码

    /** 保存表单配置（Storage 主存储 + Keychain/文件冗余，saveSetting 内部已完成写后验证），返回是否成功 */
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
        const saved = doSave(); // 尽最大努力先持久化
        // 用表单当前值发起测试（会话级覆盖，避免读到旧配置）
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
        // 先持久化当前表单值，确保小组件预览读到的是刚填写的配置
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
                    footer={<Text>右上角「预览」查看小组件效果；测试连接验证地址与密码是否正确。</Text>}
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