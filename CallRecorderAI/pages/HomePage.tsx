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

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function HomePage() {
  const [records, setRecords] = useState<CallRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [storageSummary, setStorageSummary] = useState({ fileCount: 0, formattedSize: "0 KB" });

  const loadData = () => {
    try {
      const stored = getAllRecords();
      // 物理文件双向扫描：自动扫描 Documents/CallRecordings 物理目录，补全未索引录音
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

  // 进入二级详情页
  const handleOpenDetail = async (record: CallRecord) => {
    try {
      await Navigation.present({
        element: <CallDetailView record={record} />
      });
      loadData();
    } catch (e) {
      console.error("打开详情页失败:", e);
    }
  };

  // 打开页面 1: 实时会议录音
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

  // 选取本地录音导入（归档入专属目录并解析）
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

  const handleDelete = (id: string) => {
    deleteRecord(id);
    loadData();
  };

  return (
    <NavigationStack>
      <List
        navigationTitle="AI 会议与录音归档"
        navigationBarTitleDisplayMode="large"
      >
        {/* 1. 核心操作功能区 (SF Symbols) */}
        <Section header={<Text>录音与导入</Text>}>
          <VStack spacing={12} padding={4}>
            {/* 大按钮: 开启现场会议录音 (页面 1) */}
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
                title="刷新列表"
                systemImage="arrow.clockwise"
                action={loadData}
              />
            </HStack>
          </VStack>
        </Section>

        {/* 2. 存储空间概览卡片 (SF Symbols) */}
        <Section header={<Text>录音存储目录概览</Text>}>
          <VStack spacing={8} padding={4}>
            <HStack alignment="center" spacing={6}>
              <Image systemName="folder.fill" font={14} foregroundStyle="systemIndigo" />
              <Text font="headline">存储目录</Text>
              <Spacer />
              <Text font="subheadline" foregroundStyle="systemIndigo">
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

        {/* 3. 真实录音文件列表 */}
        <Section header={<Text>所有录音文件 ({records.length})</Text>}>
          {records.length === 0 ? (
            <VStack padding={36} alignment="center" spacing={10}>
              <Image systemName="waveform.badge.mic" font={32} foregroundStyle="secondaryLabel" />
              <Text font="headline" foregroundStyle="secondaryLabel">
                暂无通话录音
              </Text>
              <Text font="caption1" foregroundStyle="tertiaryLabel">
                点击上方「开始会议录音」或从备忘录分享音频。
              </Text>
            </VStack>
          ) : (
            records.map((item) => (
              <VStack
                key={item.id}
                spacing={10}
                padding={6}
              >
                <HStack alignment="center" spacing={8}>
                  <Image systemName="waveform" font={14} foregroundStyle="systemBlue" />
                  <Text font="headline">{item.title}</Text>
                  <Spacer />
                  <Button
                    title=" "
                    systemImage="trash"
                    action={() => handleDelete(item.id)}
                  />
                </HStack>

                <Text
                  font="subheadline"
                  foregroundStyle="secondaryLabel"
                >
                  {item.summary.overview}
                </Text>

                <HStack alignment="center">
                  <Text font="caption1" foregroundStyle="tertiaryLabel">
                    📅 {formatDate(item.createdAt)} · 📦 {formatBytes(item.fileSizeBytes || 0)}
                  </Text>
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
