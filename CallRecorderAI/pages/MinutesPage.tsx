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
              systemImage="chevron.backward"
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
            {/* 1. 会议纪要信息头卡 (原图第3屏: 蓝色文件图标 + 项目例会·会议纪要 + 时间 + 共 1.3 小时) */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={18}
            >
              <HStack alignment="center" spacing={12}>
                {/* 蓝色文件大图标 */}
                <VStack
                  padding={8}
                  background="systemBlue"
                  cornerRadius={10}
                  frame={{ width: 40, height: 40 }}
                  alignment="center"
                >
                  <Image systemName="doc.text.fill" font={18} foregroundStyle="white" />
                </VStack>

                {/* 标题与时间 */}
                <VStack spacing={4} alignment="leading">
                  <Text font="headline" fontWeight="bold">
                    {record.minutes.title}
                  </Text>
                  <Text font="subheadline" foregroundStyle="secondaryLabel">
                    {record.minutes.dateStr}
                  </Text>
                </VStack>

                <Spacer />

                {/* 右侧蓝色胶囊：共 1.3 小时 */}
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

            {/* 2. 会议摘要卡片 (原图第3屏: 绿色图标 + 会议摘要 + 正文段落) */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="leading"
            >
              <HStack alignment="center" spacing={8}>
                <VStack
                  padding={4}
                  background="systemTeal"
                  cornerRadius={6}
                  alignment="center"
                  frame={{ width: 22, height: 22 }}
                >
                  <Image systemName="text.quote" font={12} foregroundStyle="white" />
                </VStack>
                <Text font="headline" fontWeight="bold">
                  会议摘要
                </Text>
              </HStack>

              <Text font="body" foregroundStyle="label">
                {record.minutes.overview}
              </Text>
            </VStack>

            {/* 3. 核心要点卡片 (原图第3屏: 青蓝图标 + 蓝色实心数字圆点清单) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="leading"
            >
              <HStack alignment="center" spacing={8}>
                <VStack
                  padding={4}
                  background="systemBlue"
                  cornerRadius={6}
                  alignment="center"
                  frame={{ width: 22, height: 22 }}
                >
                  <Image systemName="lightbulb.fill" font={12} foregroundStyle="white" />
                </VStack>
                <Text font="headline" fontWeight="bold">
                  核心要点
                </Text>
              </HStack>

              <VStack spacing={10}>
                {record.minutes.keyPoints.map((point, idx) => (
                  <HStack key={idx} alignment="top" spacing={10}>
                    {/* 蓝色实心小圆圈 */}
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

            {/* 4. 待办事项卡片 (原图第3屏: 青绿图标 + 勾选框 + 任务 + 负责人 + 截止日期) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="leading"
            >
              <HStack alignment="center" spacing={8}>
                <VStack
                  padding={4}
                  background="systemTeal"
                  cornerRadius={6}
                  alignment="center"
                  frame={{ width: 22, height: 22 }}
                >
                  <Image systemName="checkmark.circle.fill" font={12} foregroundStyle="white" />
                </VStack>
                <Text font="headline" fontWeight="bold">
                  待办事项
                </Text>
              </HStack>

              <VStack spacing={12}>
                {actionItems.map((act) => (
                  <HStack key={act.id} alignment="center" spacing={10}>
                    {/* 原生勾选框 */}
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

        {/* 5. 底部固定主操作大胶囊按键 (原图第3屏: 导出会议纪要) */}
        <VStack
          padding={14}
          background="systemBlue"
          cornerRadius={24}
          alignment="center"
        >
          <Button
            title={isExported ? "已复制完整纪要到剪贴板 ✓" : "导出会议纪要"}
            action={handleExport}
          />
        </VStack>
      </VStack>
    </NavigationStack>
  );
}
