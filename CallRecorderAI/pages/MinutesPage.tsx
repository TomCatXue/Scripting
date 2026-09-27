import {
  useState,
  Navigation,
  NavigationStack,
  VStack,
  HStack,
  Text,
  Button,
  ScrollView,
  Spacer,
  Image
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

## 会议摘要
${record.minutes.overview}

## 核心重点
${record.minutes.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## 关键决议
${record.minutes.decisions.map((d, i) => `• ${d}`).join("\n")}

## 待办事项 (Action Items)
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
            {/* 卡片 1: 会议信息头卡 (设计图第3屏顶部 + SF Symbols) */}
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
                  frame={{ width: 38, height: 38 }}
                  alignment="center"
                >
                  <Image systemName="doc.text.fill" font={18} foregroundStyle="white" />
                </VStack>

                <VStack spacing={3} alignment="leading">
                  <Text font="headline">{record.minutes.title}</Text>
                  <HStack spacing={4} alignment="center">
                    <Image systemName="calendar" font={10} foregroundStyle="secondaryLabel" />
                    <Text font="caption2" foregroundStyle="secondaryLabel">
                      {record.minutes.dateStr}
                    </Text>
                  </HStack>
                </VStack>

                <Spacer />

                <HStack padding={4} background="tertiarySystemFill" cornerRadius={6}>
                  <Text font="caption2" foregroundStyle="secondaryLabel">
                    {record.minutes.durationStr}
                  </Text>
                </HStack>
              </HStack>
            </VStack>

            {/* 卡片 2: 会议摘要 (设计图绿色图标卡片 + SF Symbols) */}
            <VStack
              padding={16}
              spacing={8}
              background="secondarySystemBackground"
              cornerRadius={16}
              alignment="leading"
            >
              <HStack alignment="center" spacing={8}>
                <Image systemName="text.quote" font={16} foregroundStyle="systemGreen" />
                <Text font="headline" foregroundStyle="systemGreen">
                  会议摘要
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
                <Image systemName="list.bullet.rectangle.fill" font={16} foregroundStyle="systemBlue" />
                <Text font="headline" foregroundStyle="systemBlue">
                  核心要点
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

            {/* 卡片 4: 待办事项 (设计图绿色勾选框 + 负责人 + 截止日期 + SF Symbols) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={16}
              alignment="leading"
            >
              <HStack alignment="center" spacing={8}>
                <Image systemName="checkmark.circle.fill" font={16} foregroundStyle="systemGreen" />
                <Text font="headline" foregroundStyle="systemGreen">
                  待办事项
                </Text>
              </HStack>

              {actionItems.length === 0 ? (
                <Text font="caption1" foregroundStyle="secondaryLabel">
                  暂无待办事项记录
                </Text>
              ) : (
                actionItems.map((act) => (
                  <HStack key={act.id} alignment="center" spacing={10}>
                    <Button
                      title=" "
                      systemImage={act.done ? "checkmark.square.fill" : "square"}
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
                ))
              )}
            </VStack>

            {/* 底部醒目大胶囊按钮 (设计图第3屏底部样式 + SF Symbols) */}
            <HStack alignment="center" padding={6}>
              <Spacer />
              <Button
                title={copied ? "已复制完整纪要 Markdown" : "导出会议纪要"}
                systemImage="square.and.arrow.up"
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
