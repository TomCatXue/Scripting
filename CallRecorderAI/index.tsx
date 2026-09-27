import {
  useState,
  useEffect
} from "react";
import {
  Navigation,
  NavigationStack,
  VStack,
  HStack,
  Text,
  Button,
  ScrollView,
  Spacer,
  Script
} from "scripting";
import { CallRecord } from "./types";
import { getAllRecords, saveRecord, deleteRecord } from "./storage";
import { analyzeCallAudio } from "./ai_service";
import { CallDetailView } from "./components/CallDetailView";

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function MainListView() {
  const [records, setRecords] = useState<CallRecord[]>([]);

  const loadData = () => {
    setRecords(getAllRecords());
  };

  useEffect(() => {
    loadData();
  }, []);

  // 进入详情页
  const handleOpenDetail = async (record: CallRecord) => {
    await Navigation.present({
      element: <CallDetailView record={record} />
    });
    loadData();
  };

  // 生成示例数据方便无录音时快速体验
  const handleCreateMock = async () => {
    const mock = await analyzeCallAudio("mock_call_audio.m4a", 62);
    saveRecord(mock);
    loadData();
    await handleOpenDetail(mock);
  };

  // 删除记录
  const handleDelete = (id: string) => {
    deleteRecord(id);
    loadData();
  };

  return (
    <NavigationStack>
      <VStack
        navigationTitle="通话录音 AI 分析器"
        navigationBarTitleDisplayMode="large"
        spacing={0}
      >
        <ScrollView>
          <VStack spacing={16} padding={16}>
            {/* 顶栏操作说明卡片 */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={14}
            >
              <Text font="headline" foregroundColor="systemIndigo">
                🎙️ 使用说明
              </Text>
              <Text font="subheadline" foregroundColor="secondaryLabel">
                1. 备忘录中打开任意通话录音；
              </Text>
              <Text font="subheadline" foregroundColor="secondaryLabel">
                2. 点击录音卡片右上角「...」选择「共享音频」；
              </Text>
              <Text font="subheadline" foregroundColor="secondaryLabel">
                3. 在系统分享面板中选取「Scripting」即可自动唤起分析。
              </Text>

              <HStack alignment="center">
                <Spacer />
                <Button
                  title="✨ 一键加载商务通话演示"
                  action={handleCreateMock}
                />
                <Spacer />
              </HStack>
            </VStack>

            {/* 通话历史列表 */}
            <Text font="title3">已分析通话 ({records.length})</Text>

            {records.length === 0 ? (
              <VStack padding={40} alignment="center" spacing={10}>
                <Text font="body" foregroundColor="secondaryLabel">
                  暂无通话记录
                </Text>
                <Text font="caption1" foregroundColor="tertiaryLabel">
                  请从备忘录分享音频，或点击上方按钮加载演示
                </Text>
              </VStack>
            ) : (
              records.map((item) => (
                <VStack
                  key={item.id}
                  padding={14}
                  spacing={8}
                  background="secondarySystemBackground"
                  cornerRadius={12}
                >
                  <HStack alignment="center">
                    <Text font="headline">{item.title}</Text>
                    <Spacer />
                    <Button
                      title="🗑️"
                      action={() => handleDelete(item.id)}
                    />
                  </HStack>

                  <Text
                    font="subheadline"
                    foregroundColor="secondaryLabel"
                  >
                    {item.summary.overview}
                  </Text>

                  <HStack alignment="center">
                    <Text font="caption1" foregroundColor="tertiaryLabel">
                      📅 {formatDate(item.createdAt)} · ⏱️ {formatSeconds(item.duration)}
                    </Text>
                    <Spacer />
                    <Button
                      title="打开回听 & 查阅"
                      action={() => handleOpenDetail(item)}
                    />
                  </HStack>
                </VStack>
              ))
            )}
          </VStack>
        </ScrollView>
      </VStack>
    </NavigationStack>
  );
}

async function run() {
  await Navigation.present({
    element: <MainListView />
  });
  Script.exit();
}

run();
