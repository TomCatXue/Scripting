import {
  useState
} from "react";
import {
  VStack,
  HStack,
  Text,
  Button,
  Spacer
} from "scripting";
import { CallSummary } from "../types";

export interface SummaryCardProps {
  title: string;
  summary: CallSummary;
}

export function SummaryCard({ title, summary }: SummaryCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const markdown = `# ${title}

## 📌 通话主旨
${summary.overview}

## 🤝 达成共识与关键议题
${summary.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## 📋 待办事项 (Action Items)
${summary.actionItems.map((a) => `- [ ] ${a}`).join("\n")}
`;

    if (typeof Pasteboard !== "undefined" && typeof Pasteboard.setString === "function") {
      await Pasteboard.setString(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <VStack spacing={16} padding={16} alignment="leading">
      {/* 标题 */}
      <Text font="headline">{title}</Text>

      {/* 1. 核心主旨 */}
      <VStack
        padding={14}
        spacing={8}
        alignment="leading"
        background="secondarySystemBackground"
        cornerRadius={12}
      >
        <Text font="subheadline" foregroundColor="systemIndigo">
          📌 核心主旨概述
        </Text>
        <Text font="body">{summary.overview}</Text>
      </VStack>

      {/* 2. 达成共识 */}
      <VStack
        padding={14}
        spacing={8}
        alignment="leading"
        background="secondarySystemBackground"
        cornerRadius={12}
      >
        <Text font="subheadline" foregroundColor="systemIndigo">
          🤝 达成共识与关键讨论
        </Text>
        {summary.keyPoints.map((kp, idx) => (
          <HStack key={idx} alignment="top" spacing={6}>
            <Text foregroundColor="secondaryLabel">•</Text>
            <Text font="body">{kp}</Text>
          </HStack>
        ))}
      </VStack>

      {/* 3. 待办事项 */}
      <VStack
        padding={14}
        spacing={8}
        alignment="leading"
        background="secondarySystemBackground"
        cornerRadius={12}
      >
        <Text font="subheadline" foregroundColor="systemIndigo">
          📋 待办事项清单 (Action Items)
        </Text>
        {summary.actionItems.map((item, idx) => (
          <HStack key={idx} alignment="top" spacing={6}>
            <Text>☑️</Text>
            <Text font="body">{item}</Text>
          </HStack>
        ))}
      </VStack>

      {/* 拷贝纪要按钮 */}
      <HStack alignment="center">
        <Spacer />
        <Button
          title={copied ? "✅ 已拷贝到剪贴板" : "📋 拷贝完整纪要 (Markdown)"}
          action={handleCopy}
        />
        <Spacer />
      </HStack>
    </VStack>
  );
}
