import {
  useState,
  useEffect,
  Navigation,
  NavigationStack,
  List,
  Section,
  VStack,
  HStack,
  Text,
  Button,
  Spacer,
  Image
} from "scripting";
import type { CallRecord } from "../types";
import { getAllRecords } from "../storage";
import { MinutesPage } from "./MinutesPage";
import { getProjectDemoRecord } from "../demo_data";

export function AllMinutesPage() {
  const [records, setRecords] = useState<CallRecord[]>([]);

  const loadData = () => {
    let list = getAllRecords();
    if (list.length === 0) {
      list = [getProjectDemoRecord()];
    }
    setRecords(list);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenMinutes = async (record: CallRecord) => {
    await Navigation.present({
      element: <MinutesPage record={record} />
    });
  };

  return (
    <NavigationStack>
      <List
        navigationTitle="AI 会议纪要"
        navigationBarTitleDisplayMode="large"
      >
        <Section header={<Text>已生成的会议纪要 ({records.length})</Text>}>
          {records.map((item) => (
            <VStack
              key={item.id}
              spacing={10}
              padding={10}
            >
              {/* 卡片头部：蓝色文档图标 + 标题 + 时间 */}
              <HStack alignment="center" spacing={10}>
                <VStack
                  padding={8}
                  background="systemBlue"
                  cornerRadius={10}
                  frame={{ width: 36, height: 36 }}
                  alignment="center"
                >
                  <Image systemName="doc.text.fill" font={16} foregroundStyle="white" />
                </VStack>

                <VStack spacing={2} alignment="leading">
                  <Text font="headline" fontWeight="bold">
                    {item.minutes?.title || item.title}
                  </Text>
                  <Text font="caption1" foregroundStyle="secondaryLabel">
                    {item.minutes?.dateStr || "2025年4月26日 10:00 - 11:20"}
                  </Text>
                </VStack>

                <Spacer />

                <HStack padding={4} background="secondarySystemBackground" cornerRadius={6}>
                  <Text font="caption2" foregroundStyle="systemBlue" fontWeight="medium">
                    {item.minutes?.durationStr || "共 1.3 小时"}
                  </Text>
                </HStack>
              </HStack>

              {/* 纪要核心摘要预览 */}
              <Text
                font="subheadline"
                foregroundStyle="secondaryLabel"
              >
                {item.minutes?.overview || item.summary.overview}
              </Text>

              {/* 核心要点缩略 (展示前 2 条) */}
              <VStack spacing={6}>
                {item.minutes?.keyPoints?.slice(0, 2).map((kp, idx) => (
                  <HStack key={idx} alignment="center" spacing={8}>
                    <VStack
                      padding={2}
                      background="systemBlue"
                      cornerRadius={8}
                      frame={{ width: 16, height: 16 }}
                      alignment="center"
                    >
                      <Text font="caption2" foregroundStyle="white" fontWeight="bold">
                        {idx + 1}
                      </Text>
                    </VStack>
                    <Text font="caption1" foregroundStyle="label">
                      {kp}
                    </Text>
                  </HStack>
                ))}
              </VStack>

              {/* 底部进入完整纪要按钮 */}
              <HStack alignment="center">
                <HStack
                  padding={3}
                  background="secondarySystemBackground"
                  cornerRadius={6}
                  spacing={4}
                  alignment="center"
                >
                  <Image systemName="sparkles" font={9} foregroundStyle="systemTeal" />
                  <Text font="caption2" foregroundStyle="systemTeal" fontWeight="bold">
                    {item.minutes?.actionItems?.length || 0} 个待办事项
                  </Text>
                </HStack>

                <Spacer />

                <Button
                  title="查看完整纪要"
                  systemImage="chevron.right"
                  action={() => handleOpenMinutes(item)}
                />
              </HStack>
            </VStack>
          ))}
        </Section>
      </List>
    </NavigationStack>
  );
}
