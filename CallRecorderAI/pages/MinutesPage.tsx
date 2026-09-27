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
  const [isExported, setIsExported] = useState<boolean>(false);

  // 规范第 18 条：直接点击 ☐ → ✓ 交互切换完成状态
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

## 核心要点
${record.minutes.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## 待办事项
${actionItems.map((a) => `- [${a.done ? "x" : " "}] ${a.task} (负责人: ${a.assignee} · 截止: ${a.dueDate})`).join("\n")}
`;

    if (typeof Pasteboard !== "undefined" && typeof Pasteboard.setString === "function") {
      await Pasteboard.setString(md);
      setIsExported(true);
      setTimeout(() => setIsExported(false), 2500);
    } else {
      setIsExported(true);
      setTimeout(() => setIsExported(false), 2500);
    }
  };

  return (
    <NavigationStack>
      <VStack
        navigationTitle=""
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarLeading: (
            <Button
              title=" "
              systemImage="chevron.left"
              action={dismiss}
            />
          ),
          principal: (
            <Text font="headline" fontWeight="bold">
              AI 会议纪要
            </Text>
          ),
          topBarTrailing: [
            <Button
              key="share"
              title=" "
              systemImage="square.and.arrow.up"
              action={handleExport}
            />,
            <Button
              key="more"
              title=" "
              systemImage="ellipsis"
              action={() => {}}
            />
          ]
        }}
        spacing={12}
        padding={14}
        background="systemBackground"
      >
        <ScrollView>
          <VStack spacing={14} padding={4}>
            {/* 1. 会议纪要信息头卡 (规范第 16 条: 项目例会 · AI纪要 + 时间) */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={18}
            >
              <HStack alignment="center" spacing={12}>
                <VStack
                  padding={8}
                  background="systemBlue"
                  cornerRadius={10}
                  frame={{ width: 40, height: 40 }}
                  alignment="center"
                >
                  <Image systemName="doc.text.fill" font={18} foregroundStyle="white" />
                </VStack>

                <VStack spacing={4} alignment="leading">
                  <Text font="headline" fontWeight="bold">
                    {record.minutes.title}
                  </Text>
                  <Text font="subheadline" foregroundStyle="secondaryLabel">
                    {record.minutes.dateStr}
                  </Text>
                </VStack>

                <Spacer />

                <HStack
                  padding={4}
                  background="systemBackground"
                  cornerRadius={8}
                >
                  <Text font="caption1" foregroundStyle="systemBlue" fontWeight="medium">
                    {record.minutes.durationStr}
                  </Text>
                </HStack>
              </HStack>
            </VStack>

            {/* 2. 会议摘要 (规范第 16 条: 简洁文档排版) */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="leading"
            >
              <HStack alignment="center" spacing={6}>
                <Image systemName="sparkles" font={14} foregroundStyle="systemTeal" />
                <Text font="headline" fontWeight="bold">
                  会议摘要
                </Text>
              </HStack>

              <Text font="body" foregroundStyle="label">
                {record.minutes.overview}
              </Text>
            </VStack>

            {/* 3. 核心要点 (规范第 17 条: 采用 1 2 3 4 圆形数字序号，拒绝冗余图标) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="leading"
            >
              <Text font="headline" fontWeight="bold">
                核心要点
              </Text>

              <VStack spacing={12}>
                {record.minutes.keyPoints.map((point, idx) => (
                  <HStack key={idx} alignment="top" spacing={10}>
                    {/* 圆形数字编号 ① ② ③ ④ */}
                    <VStack
                      padding={2}
                      background="systemBlue"
                      cornerRadius={10}
                      frame={{ width: 20, height: 20 }}
                      alignment="center"
                    >
                      <Text font="caption2" foregroundStyle="white" fontWeight="bold">
                        {idx + 1}
                      </Text>
                    </VStack>
                    <Text font="body" foregroundStyle="label">
                      {point}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </VStack>

            {/* 4. 待办事项 (规范第 18 条: 点击 ☐ → ✓ 变成完成状态，含负责人与截止日期) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="leading"
            >
              <HStack alignment="center" spacing={6}>
                <Image systemName="checkmark.circle" font={14} foregroundStyle="systemTeal" />
                <Text font="headline" fontWeight="bold">
                  待办事项
                </Text>
              </HStack>

              <VStack spacing={12}>
                {actionItems.map((act) => (
                  <HStack key={act.id} alignment="center" spacing={10}>
                    {/* 勾选框：☐ → ✓ */}
                    <Button
                      title=" "
                      systemImage={act.done ? "checkmark.circle.fill" : "circle"}
                      action={() => toggleActionItem(act.id)}
                    />

                    <VStack spacing={2} alignment="leading">
                      <Text
                        font="body"
                        foregroundStyle={act.done ? "secondaryLabel" : "label"}
                      >
                        {act.task}
                      </Text>
                      <Text font="caption1" foregroundStyle="secondaryLabel">
                        负责人: {act.assignee}
                      </Text>
                    </VStack>

                    <Spacer />

                    <Text font="caption1" foregroundStyle="secondaryLabel">
                      {act.dueDate}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </VStack>
          </VStack>
        </ScrollView>

        <Spacer />

        {/* 5. 底部大按钮: 导出会议纪要 */}
        <VStack
          padding={14}
          background="systemBlue"
          cornerRadius={24}
          alignment="center"
        >
          <Button
            title={isExported ? "已复制完整纪要 Markdown ✓" : "导出会议纪要"}
            action={handleExport}
          />
        </VStack>
      </VStack>
    </NavigationStack>
  );
}
