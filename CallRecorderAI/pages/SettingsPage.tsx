import {
  useState,
  useEffect,
  NavigationStack,
  List,
  Section,
  VStack,
  HStack,
  Text,
  Button,
  Spacer
} from "scripting";
import type { AISettings, TranscriptionMode } from "../types";
import { getAISettings, saveAISettings } from "../storage";
import { getFriendlyStoragePath, getStorageUsageSummary } from "../audio_manager";

export function SettingsPage() {
  const [settings, setSettings] = useState<AISettings>(getAISettings());
  const [storageInfo, setStorageInfo] = useState({ fileCount: 0, formattedSize: "0 KB" });

  useEffect(() => {
    setSettings(getAISettings());
    const info = getStorageUsageSummary();
    setStorageInfo({ fileCount: info.fileCount, formattedSize: info.formattedSize });
  }, []);

  const handleModeChange = (mode: TranscriptionMode) => {
    const updated = { ...settings, transcriptionMode: mode };
    setSettings(updated);
    saveAISettings(updated);
  };

  const handleProviderChange = (provider: "local" | "openai") => {
    const updated = { ...settings, provider };
    setSettings(updated);
    saveAISettings(updated);
  };

  return (
    <NavigationStack>
      <List
        navigationTitle="设置与说明"
        navigationBarTitleDisplayMode="large"
      >
        {/* 1. 录音存储位置与空间 */}
        <Section header={<Text>录音文件存储位置</Text>}>
          <VStack spacing={8} padding={4}>
            <HStack alignment="center">
              <Text font="headline">📁 专属存储目录</Text>
              <Spacer />
              <Text font="subheadline" foregroundStyle="systemIndigo">
                {getFriendlyStoragePath()}
              </Text>
            </HStack>

            <Text font="caption1" foregroundStyle="secondaryLabel">
              所有从备忘录分享或手动导入的录音文件，均被统一集中保存在 App 沙盒 Documents/CallRecordings/ 专属文件夹中，杜绝散落，长期有效。
            </Text>

            <HStack alignment="center">
              <Text font="caption1" foregroundStyle="tertiaryLabel">
                已归档录音: {storageInfo.fileCount} 个
              </Text>
              <Spacer />
              <Text font="caption1" foregroundStyle="tertiaryLabel">
                空间占用: {storageInfo.formattedSize}
              </Text>
            </HStack>
          </VStack>
        </Section>

        {/* 2. 转写模式选择与说明 */}
        <Section header={<Text>转写与提取模式</Text>}>
          <VStack spacing={14} padding={4}>
            {/* 模式 A */}
            <VStack spacing={6} alignment="leading">
              <HStack alignment="center">
                <Text font="headline">🎙️ 音频直接转文字 (ASR 引擎模式)</Text>
                <Spacer />
                <Button
                  title={settings.transcriptionMode === "asr_direct" ? "✅ 当前使用" : "切换"}
                  action={() => handleModeChange("asr_direct")}
                />
              </HStack>
              <Text font="caption1" foregroundStyle="secondaryLabel">
                直接调用专用语音识别引擎，将录音音频流转换为分句文本并识别说话人。响应速度快，适合网络受限或单纯需要快速速记的场景。
              </Text>
            </VStack>

            {/* 模式 B */}
            <VStack spacing={6} alignment="leading">
              <HStack alignment="center">
                <Text font="headline">🤖 AI 多模态大模型转写 (智能纪要模式)</Text>
                <Spacer />
                <Button
                  title={settings.transcriptionMode === "ai_multimodal" ? "✅ 当前使用" : "切换"}
                  action={() => handleModeChange("ai_multimodal")}
                />
              </HStack>
              <Text font="caption1" foregroundStyle="secondaryLabel">
                结合 Apple Intelligence 端侧模型或云端多模态大模型，深度理解声学与上下文语境，不仅分离双方角色对白，更自动提炼核心议题、关键结论与待办清单。
              </Text>
            </VStack>
          </VStack>
        </Section>

        {/* 3. AI 服务商设置 */}
        <Section header={<Text>AI 模型引擎选择</Text>}>
          <VStack spacing={10} padding={4}>
            <HStack alignment="center">
              <Text font="body">优先使用端侧 Apple Intelligence</Text>
              <Spacer />
              <Button
                title={settings.provider === "local" ? "✅ 已启用" : "启用"}
                action={() => handleProviderChange("local")}
              />
            </HStack>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              iOS 18+ 原生本地大模型，完全离线运行，零费用且严密保护通话隐私。
            </Text>

            <HStack alignment="center">
              <Text font="body">云端大模型 API (DeepSeek / 通义)</Text>
              <Spacer />
              <Button
                title={settings.provider === "openai" ? "✅ 已启用" : "启用"}
                action={() => handleProviderChange("openai")}
              />
            </HStack>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              通过自定义 API Key 连接云端强力大模型，具备更深入的商务逻辑推理能力。
            </Text>
          </VStack>
        </Section>

        {/* 4. 使用指引 */}
        <Section header={<Text>使用指南</Text>}>
          <VStack spacing={8} padding={4}>
            <Text font="subheadline">📌 如何分享与归档录音？</Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              1. 电话挂断后，在系统备忘录「通话录音」文件夹中打开该条录音卡片；
            </Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              2. 点击录音卡片右上角「...」选择「共享音频」，在系统分享面板中选取 Scripting；
            </Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              3. 录音即刻自动转存入 Documents/CallRecordings/ 并自动解析呈现！
            </Text>

            <Text font="subheadline">💬 仿微信对话条如何听原声？</Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              二级详情页中，每条微信语音条均带有单句时长（如 6"），点击语音条即可单独听取这句对话的原声，下方紧随逐字记录。
            </Text>
          </VStack>
        </Section>
      </List>
    </NavigationStack>
  );
}
