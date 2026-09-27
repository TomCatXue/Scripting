import {
  useState,
  Navigation,
  NavigationStack,
  VStack,
  HStack,
  Text,
  Button,
  ScrollView,
  Spacer
} from "scripting";
import type { CallRecord } from "../types";
import { translateSingle } from "../translation_service";

export function SummaryPage({
  record
}: {
  record: CallRecord;
}) {
  const dismiss = Navigation.useDismiss();
  const [translatedOverview, setTranslatedOverview] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // 一键翻译整个摘要
  const handleTranslateSummary = async () => {
    if (translatedOverview) {
      setTranslatedOverview("");
      return;
    }
    setIsTranslating(true);
    try {
      const res = await translateSingle(record.minutes.overview, "en");
      setTranslatedOverview(res);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = async () => {
    const md = `# ${record.minutes.title} · AI 摘要

## 📌 会议概要
${record.minutes.overview}

## 💡 核心重点
${record.minutes.keyPoints.map((k, i) => `${i + 1}. ${k}`).join("\n")}

## 🎯 决议与结论
${record.minutes.decisions.map((d, i) => `• ${d}`).join("\n")}
`;
    if (typeof Pasteboard !== "undefined" && typeof Pasteboard.setString === "function") {
      await Pasteboard.setString(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <NavigationStack>
      <VStack
        navigationTitle="AI 摘要与核心重点"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: (
            <Button title="返回" action={dismiss} />
          )
        }}
        spacing={12}
      >
        <ScrollView>
          <VStack spacing={14} padding={16} alignment="leading">
            {/* 顶栏控制：翻译 & 拷贝 */}
            <HStack alignment="center">
              <Button
                title={translatedOverview ? "隐藏英文翻译" : (isTranslating ? "翻译中…" : "🌐 双语翻译 (Apple/AI)")}
                action={handleTranslateSummary}
              />
              <Spacer />
              <Button
                title={copied ? "✅ 已复制" : "📋 复制摘要"}
                action={handleCopy}
              />
            </HStack>

            {/* 1. 会议概要卡片 */}
            <VStack
              padding={16}
              spacing={8}
              background="secondarySystemBackground"
              cornerRadius={16}
              alignment="leading"
            >
              <HStack alignment="center" spacing={6}>
                <Text font="headline" foregroundStyle="systemGreen">
                  📌 会议概要
                </Text>
              </HStack>
              <Text font="body">
                {record.minutes.overview}
              </Text>

              {/* 译文 */}
              {translatedOverview && (
                <VStack padding={10} background="tertiarySystemFill" cornerRadius={10}>
                  <Text font="caption1" foregroundStyle="systemBlue">
                    [English Summary] {translatedOverview}
                  </Text>
                </VStack>
              )}
            </VStack>

            {/* 2. 核心重点卡片 (编号标点) */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={16}
              alignment="leading"
            >
              <Text font="headline" foregroundStyle="systemBlue">
                💡 核心重点
              </Text>
              {record.minutes.keyPoints.map((kp, idx) => (
                <HStack key={idx} alignment="top" spacing={8}>
                  <VStack
                    padding={4}
                    background="systemBlue"
                    cornerRadius={12}
                    frame={{ width: 22, height: 22 }}
                    alignment="center"
                  >
                    <Text font="caption2" foregroundStyle="white" fontWeight="bold">
                      {idx + 1}
                    </Text>
                  </VStack>
                  <Text font="body">{kp}</Text>
                </HStack>
              ))}
            </VStack>

            {/* 3. 会议结论与决议 */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={16}
              alignment="leading"
            >
              <Text font="headline" foregroundStyle="systemIndigo">
                🎯 结论与决议
              </Text>
              {record.minutes.decisions.map((dec, idx) => (
                <HStack key={idx} alignment="top" spacing={6}>
                  <Text foregroundStyle="systemIndigo">•</Text>
                  <Text font="body">{dec}</Text>
                </HStack>
              ))}
            </VStack>
          </VStack>
        </ScrollView>
      </VStack>
    </NavigationStack>
  );
}
