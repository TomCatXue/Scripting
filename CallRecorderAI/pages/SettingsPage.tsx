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
import type { AISettings, TranscriptionMode, TranslationEngine } from "../types";
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

  const handleTranslationEngineChange = (engine: TranslationEngine) => {
    const updated = {
      ...settings,
      translation: {
        ...settings.translation,
        engine
      }
    };
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
              所有从备忘录分享、现场录制或手动导入的录音文件，均被统一集中保存在 App 沙盒 Documents/CallRecordings/ 专属文件夹中。
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
        <Section header={<Text>转写与分析模式</Text>}>
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
                直接调用专用语音识别引擎，将录音音频流转换为分句文本并识别说话人。响应速度快，适合需要快速速记的场景。
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

        {/* 3. 翻译服务选择与模型配置 (用户明确需求) */}
        <Section header={<Text>翻译服务配置</Text>}>
          <VStack spacing={12} padding={4}>
            {/* 引擎 1: Apple 原生翻译 */}
            <VStack spacing={6} alignment="leading">
              <HStack alignment="center">
                <Text font="headline"> Apple 原生翻译 (iOS 18+)</Text>
                <Spacer />
                <Button
                  title={settings.translation.engine === "apple" ? "✅ 当前使用" : "选用"}
                  action={() => handleTranslationEngineChange("apple")}
                />
              </HStack>
              <Text font="caption1" foregroundStyle="secondaryLabel">
                调用系统内置 Translation 框架，无需网络 API Key，在端侧或系统通道内快速执行高质量双语互译。
              </Text>
            </VStack>

            {/* 引擎 2: OpenAI 兼容格式大模型翻译 */}
            <VStack spacing={6} alignment="leading">
              <HStack alignment="center">
                <Text font="headline">🌐 OpenAI 兼容格式大模型翻译</Text>
                <Spacer />
                <Button
                  title={settings.translation.engine === "openai" ? "✅ 当前使用" : "选用"}
                  action={() => handleTranslationEngineChange("openai")}
                />
              </HStack>
              <Text font="caption1" foregroundStyle="secondaryLabel">
                支持连接 DeepSeek、ChatGPT、通义千问等模型（当前配置模型: {settings.translation.openaiModel}），具备更强的专业术语与语境润色能力。
              </Text>
            </VStack>
          </VStack>
        </Section>

        {/* 4. 6 大核心页面功能说明 */}
        <Section header={<Text>6 大核心页面功能指南</Text>}>
          <VStack spacing={8} padding={4}>
            <Text font="subheadline">1. 🔴 录音中</Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              动态青蓝波形 + 巨大等宽计时 + 双角色实时文字流 + 底部标记与暂停。
            </Text>

            <Text font="subheadline">2. 💬 转写详情</Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              Speaker 1 / Speaker 2 分角色药丸标签，支持重点筛选与中英即时互译。
            </Text>

            <Text font="subheadline">3. ⏱️ 录音详情</Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              原生波形播放卡片 + 纵向时间线章节，点击章节直接跳跃回听。
            </Text>

            <Text font="subheadline">4. 💡 AI 摘要</Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              概要 / 重点 / 结论三段式精炼提取，支持一键双语翻译。
            </Text>

            <Text font="subheadline">5. 📋 会议纪要</Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              议题讨论 / 核心决策 / 待办事项清单（含责任人与截止期），一键导出 Markdown。
            </Text>

            <Text font="subheadline">6. 🔊 回听联动</Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              在转写对白流中，点击任意一句话文字，原声播放器直接跳转到对应秒数播放！
            </Text>
          </VStack>
        </Section>
      </List>
    </NavigationStack>
  );
}
