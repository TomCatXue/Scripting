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
import type { CallRecord, ActionItem } from "../types";

export function MinutesPage({
  record
}: {
  record: CallRecord;
}) {
  const dismiss = Navigation.useDismiss();
  const [actionItems, setActionItems] = useState<ActionItem[]>(record.minutes.actionItems);
  const [copied, setCopied] = useState<boolean>(false);

  const toggleActionItem = (id: string) => {
    setActionItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const handleExport = async () => {
    const md = `# ${record.minutes.title}
时间：${record.minutes.dateStr} (${record.minutes.durationStr})

## 📝 会议摘要
${record.minutes.overview}

## 💡 核心要点
${record.minutes.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## 🎯 关键决策
${record.minutes.decisions.map((d, i) => `• ${d}`).join("\n")}

## 📋 待办事项 (Action Items)
${actionItems.map((a) => `- [${a.done ? "x" : " "}] ${a.task} (负责人: ${a.assignee}, 截止: ${a.dueDate})`).join("\n")}
`;

    if (typeof Pasteboard !== "undefined" && typeof Pasteboard.setString === "function") {
      await Pasteboard.setString(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <NavigationStack>
      <VStack
        navigationTitle="AI 会议纪要"
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
            {/* 卡片 1: 会议信息头卡 (设计图第3屏顶部) */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={16}
            >
              <HStack alignment="center" spacing={10}>
                <VStack
                  padding={8}
                  background="systemBlue"
                  cornerRadius={10}
                  frame={{ width: 36, height: 36 }}
                  alignment="center"
                >
                  <Text font="caption1" foregroundStyle="white">📋</Text>
                </VStack>

                <VStack spacing={3} alignment="leading">
                  <Text font="headline">{record.minutes.title}</Text>
                  <Text font="caption2" foregroundStyle="secondaryLabel">
                    {record.minutes.dateStr}
                  </Text>
                </VStack>

                <Spacer />

                {/* 时长徽标 */}
                <HStack padding={4} background="tertiarySystemFill" cornerRadius={6}>
                  <Text font="caption2" foregroundStyle="secondaryLabel">
                    {record.minutes.durationStr}
                  </Text>
                </HStack>
              </HStack>
            </VStack>

            {/* 卡片 2: 会议摘要 (设计图绿色图标卡片) */}
            <VStack
              padding={16}
              spacing={8}
              background="secondarySystemBackground"
              cornerRadius={16}
              alignment="leading"
            >
              <HStack alignment="center" spacing={8}>
                <Text font="headline" foregroundStyle="systemGreen">
                  📝 会议摘要
                </Text>
              </HStack>
              <Text font="body">
                {record.minutes.overview}
              </Text>
            </VStack>

            {/* 卡片 3: 核心要点 (设计图带蓝色序号小圆点) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={16}
              alignment="leading"
            >
              <HStack alignment="center" spacing={8}>
                <Text font="headline" foregroundStyle="systemBlue">
                  💡 核心要点
                </Text>
              </HStack>

              {record.minutes.keyPoints.map((item, idx) => (
                <HStack key={idx} alignment="top" spacing={8}>
                  {/* 蓝色序号圆点 */}
                  <VStack
                    padding={3}
                    background="systemBlue"
                    cornerRadius={11}
                    frame={{ width: 22, height: 22 }}
                    alignment="center"
                  >
                    <Text font="caption2" foregroundStyle="white" fontWeight="bold">
                      {idx + 1}
                    </Text>
                  </VStack>
                  <Text font="body">
                    {item}
                  </Text>
                </HStack>
              ))}
            </VStack>

            {/* 卡片 4: 待办事项 (设计图绿色勾选框 + 负责人 + 截止日期) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={16}
              alignment="leading"
            >
              <HStack alignment="center" spacing={8}>
                <Text font="headline" foregroundStyle="systemGreen">
                  ✅ 待办事项
                </Text>
              </HStack>

              {actionItems.map((act) => (
                <HStack key={act.id} alignment="center" spacing={10}>
                  <Button
                    title={act.done ? "☑️" : "⬜️"}
                    action={() => toggleActionItem(act.id)}
                  />
                  <VStack spacing={2} alignment="leading">
                    <Text
                      font="body"
                      foregroundStyle={act.done ? "secondaryLabel" : "label"}
                    >
                      {act.task}
                    </Text>
                    <Text font="caption2" foregroundStyle="tertiaryLabel">
                      负责人: {act.assignee} · 截止: {act.dueDate}
                    </Text>
                  </VStack>
                  <Spacer />
                  <Text font="caption2" foregroundStyle="tertiaryLabel">
                    {act.dueDate}
                  </Text>
                </HStack>
              ))}
            </VStack>

            {/* 底部醒目大胶囊按钮 (设计图第3屏底部绿色/青色按钮) */}
            <HStack alignment="center" padding={6}>
              <Spacer />
              <Button
                title={copied ? "✅ 已拷贝完整会议纪要 Markdown" : " 📤 导出会议纪要 (复制 Markdown) "}
                action={handleExport}
              />
              <Spacer />
            </HStack>
          </VStack>
        </ScrollView>
      </VStack>
    </NavigationStack>
  );
}
