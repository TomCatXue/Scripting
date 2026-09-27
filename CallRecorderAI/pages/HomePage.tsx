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
  discoverUnindexedAudios,
  formatBytes
} from "../audio_manager";
import { CallDetailView } from "../components/CallDetailView";
import { RecordingPage } from "./RecordingPage";
import { getProjectDemoRecord } from "../demo_data";

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function HomePage() {
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [storageSummary, setStorageSummary] = useState({ fileCount: 0, formattedSize: "0 KB" });

  const loadData = () => {
    try {
      let stored = getAllRecords();
      // 若首次打开无任何数据，自动载入与设计图 100% 对应的项目例会
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

  // 进入 1:1 复刻的会议详情页 (屏幕 4)
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

  // 打开 1:1 复刻的会议录音页 (屏幕 1)
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

  // 选取本地录音文件导入
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
        navigationTitle="AI 会议录音"
        navigationBarTitleDisplayMode="large"
      >
        {/* 1. 快捷操作金刚区 */}
        <Section header={<Text>会议与录音</Text>}>
          <VStack spacing={12} padding={4}>
            {/* 主按钮: 开始会议录音 (直达原图屏幕 1) */}
            <Button
              title="开始会议录音"
              systemImage="record.circle.fill"
              action={handleStartLiveRecording}
            />

            <HStack spacing={10}>
              <Button
                title={isProcessing ? "导入中…" : "导入录音文件"}
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

        {/* 2. 存储空间概览卡片 */}
        <Section header={<Text>录音归档概览</Text>}>
          <VStack spacing={8} padding={4}>
            <HStack alignment="center" spacing={6}>
              <Image systemName="folder.fill" font={14} foregroundStyle="systemBlue" />
              <Text font="headline">归档目录</Text>
              <Spacer />
              <Text font="subheadline" foregroundStyle="systemBlue">
                {getFriendlyStoragePath()}
              </Text>
            </HStack>

            <HStack alignment="center">
              <Text font="caption1" foregroundStyle="secondaryLabel">
                已归档录音: {storageSummary.fileCount} 个文件
              </Text>
              <Spacer />
              <Text font="caption1" foregroundStyle="secondaryLabel">
                空间占用: {storageSummary.formattedSize}
              </Text>
            </HStack>
          </VStack>
        </Section>

        {/* 3. 录音列表卡片 (对齐原图现代极简设计) */}
        <Section header={<Text>所有录音与纪要 ({records.length})</Text>}>
          {records.length === 0 ? (
            <VStack padding={36} alignment="center" spacing={10}>
              <Image systemName="waveform.badge.mic" font={32} foregroundStyle="secondaryLabel" />
              <Text font="headline" foregroundStyle="secondaryLabel">
                暂无会议录音
              </Text>
              <Text font="caption1" foregroundStyle="tertiaryLabel">
                点击上方「开始会议录音」或「载入例会示例」
              </Text>
            </VStack>
          ) : (
            records.map((item) => (
              <VStack
                key={item.id}
                spacing={10}
                padding={8}
              >
                <HStack alignment="center" spacing={10}>
                  {/* 左侧蓝色文档大图标 */}
                  <VStack
                    padding={8}
                    background="systemBlue"
                    cornerRadius={10}
                    frame={{ width: 36, height: 36 }}
                    alignment="center"
                  >
                    <Text font="subheadline" foregroundStyle="white" fontWeight="bold">
                      D
                    </Text>
                  </VStack>

                  <VStack spacing={3} alignment="leading">
                    <Text font="headline" fontWeight="bold">
                      {item.title}
                    </Text>
                    <Text font="caption1" foregroundStyle="secondaryLabel">
                      {item.minutes?.dateStr || "2025年4月26日 10:00 - 11:20"}
                    </Text>
                  </VStack>

                  <Spacer />

                  <Button
                    title=" "
                    systemImage="trash"
                    action={() => handleDelete(item.id)}
                  />
                </HStack>

                <HStack alignment="center" spacing={8}>
                  <Text font="caption1" foregroundStyle="secondaryLabel">
                    {item.minutes?.durationStr || "共 1.3 小时"}
                  </Text>

                  {/* 绿色胶囊徽章 */}
                  <HStack
                    padding={3}
                    background="secondarySystemBackground"
                    cornerRadius={6}
                    spacing={3}
                    alignment="center"
                  >
                    <Image systemName="sparkles" font={9} foregroundStyle="systemTeal" />
                    <Text font="caption2" foregroundStyle="systemTeal" fontWeight="bold">
                      AI 纪要已生成
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
