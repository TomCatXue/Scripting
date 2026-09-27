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
  Image,
  DocumentPicker
} from "scripting";
import type { CallRecord } from "../types";
import { getAllRecords, saveRecord, deleteRecord } from "../storage";
import { analyzeCallAudio } from "../ai_service";
import {
  persistIncomingAudio,
  getFriendlyStoragePath,
  getStorageUsageSummary,
  discoverUnindexedAudios
} from "../audio_manager";
import { CallDetailView } from "../components/CallDetailView";
import { RecordingPage } from "./RecordingPage";
import { getProjectDemoRecord } from "../demo_data";

export function HomePage() {
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [storageSummary, setStorageSummary] = useState({ fileCount: 0, formattedSize: "0 KB" });

  const loadData = () => {
    try {
      let stored = getAllRecords();
      // 首次加载若无记录，自动载入规范 1:1 项目例会
      if (stored.length === 0) {
        const demo = getProjectDemoRecord();
        saveRecord(demo);
        stored = [demo];
      }
      const synced = discoverUnindexedAudios(stored);
      setRecords(synced);

      const s = getStorageUsageSummary();
      setStorageSummary({ fileCount: s.fileCount, formattedSize: s.formattedSize });
    } catch (e) {
      console.error("加载录音列表失败:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 进入 1:1 会议详情页 (屏幕 4)
  const handleOpenDetail = async (record: CallRecord) => {
    try {
      await Navigation.present({
        element: <CallDetailView record={record} />
      });
      loadData();
    } catch (e) {
      console.error("打开会议详情失败:", e);
    }
  };

  // 打开会议录音页 (屏幕 1)
  const handleStartLiveRecording = async () => {
    await Navigation.present({
      element: (
        <RecordingPage
          onFinishRecording={(rec) => {
            loadData();
            handleOpenDetail(rec);
          }}
        />
      )
    });
    loadData();
  };

  // 选取本地音频导入
  const handlePickAudio = async () => {
    if (typeof DocumentPicker === "undefined") return;

    try {
      setIsProcessing(true);
      const picked = await DocumentPicker.pickFiles({
        types: ["public.audio", "com.apple.m4a-audio"]
      });

      if (picked && picked.length > 0) {
        const sourcePath = picked[0];
        const persisted = persistIncomingAudio(sourcePath);
        const record = await analyzeCallAudio(
          persisted.fullPath,
          0,
          "",
          persisted.fileName,
          persisted.sizeBytes
        );
        saveRecord(record);
        loadData();
        await handleOpenDetail(record);
      }
    } catch (err) {
      console.error("导入分析录音失败:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetDemo = () => {
    const demo = getProjectDemoRecord();
    saveRecord(demo);
    loadData();
  };

  const handleDelete = (id: string) => {
    deleteRecord(id);
    loadData();
  };

  return (
    <NavigationStack>
      <List
        navigationTitle="录音"
        navigationBarTitleDisplayMode="large"
      >
        {/* 1. 顶部操作区 (大按键 + 导入/重置) */}
        <Section>
          <VStack spacing={12} padding={4}>
            {/* 主按钮: 启动新录音 */}
            <Button
              title="开始会议录音"
              systemImage="mic.fill"
              action={handleStartLiveRecording}
            />

            <HStack spacing={10}>
              <Button
                title={isProcessing ? "导入中…" : "导入音频"}
                systemImage="square.and.arrow.down"
                action={handlePickAudio}
              />
              <Spacer />
              <Button
                title="载入例会示例"
                systemImage="sparkles"
                action={handleResetDemo}
              />
            </HStack>
          </VStack>
        </Section>

        {/* 2. 录音列表 (规范第 26 条：卡片高度 90-110pt，大圆角 18pt，蓝点说话人 + AI 纪要胶囊) */}
        <Section header={<Text>所有录音 ({records.length})</Text>}>
          {records.length === 0 ? (
            <VStack padding={36} alignment="center" spacing={12}>
              <Image systemName="waveform.circle" font={36} foregroundStyle="secondaryLabel" />
              <Text font="headline" foregroundStyle="secondaryLabel">
                还没有录音
              </Text>
              <Text font="subheadline" foregroundStyle="tertiaryLabel">
                开始你的第一次 AI 录音
              </Text>
              <Button
                title="＋ 开始录音"
                action={handleStartLiveRecording}
              />
            </VStack>
          ) : (
            records.map((item) => (
              <VStack
                key={item.id}
                spacing={10}
                padding={12}
                background="secondarySystemBackground"
                cornerRadius={18}
              >
                {/* 顶行：标题与删除操作 */}
                <HStack alignment="center" spacing={10}>
                  <VStack
                    padding={8}
                    background="systemBlue"
                    cornerRadius={10}
                    frame={{ width: 34, height: 34 }}
                    alignment="center"
                  >
                    <Image systemName="waveform" font={15} foregroundStyle="white" />
                  </VStack>

                  <VStack spacing={2} alignment="leading">
                    <Text font="headline" fontWeight="bold">
                      {item.title}
                    </Text>
                    <Text font="caption1" foregroundStyle="secondaryLabel">
                      {item.minutes?.dateStr || "10:00 · 1小时18分钟"}
                    </Text>
                  </VStack>

                  <Spacer />

                  <Button
                    title=" "
                    systemImage="trash"
                    action={() => handleDelete(item.id)}
                  />
                </HStack>

                {/* 底行：说话人统计 + ✨ AI 纪要状态 + 进入详情 */}
                <HStack alignment="center" spacing={8}>
                  {/* 说话人指示 */}
                  <HStack
                    padding={3}
                    background="systemBackground"
                    cornerRadius={6}
                    spacing={4}
                    alignment="center"
                  >
                    <Image systemName="person.2.fill" font={10} foregroundStyle="systemBlue" />
                    <Text font="caption2" foregroundStyle="systemBlue" fontWeight="medium">
                      2位说话人
                    </Text>
                  </HStack>

                  {/* ✨ AI 纪要已生成胶囊 */}
                  <HStack
                    padding={3}
                    background="systemBackground"
                    cornerRadius={6}
                    spacing={3}
                    alignment="center"
                  >
                    <Image systemName="sparkles" font={9} foregroundStyle="systemTeal" />
                    <Text font="caption2" foregroundStyle="systemTeal" fontWeight="bold">
                      ✨ AI 纪要已生成
                    </Text>
                  </HStack>

                  <Spacer />

                  <Button
                    title="查看详情"
                    systemImage="chevron.right"
                    action={() => handleOpenDetail(item)}
                  />
                </HStack>
              </VStack>
            ))
          )}
        </Section>
      </List>
    </NavigationStack>
  );
}
