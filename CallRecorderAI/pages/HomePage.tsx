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
      console.error("打开二级详情页失败:", e);
    }
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
        navigationTitle="通话录音归档"
        navigationBarTitleDisplayMode="large"
      >
        {/* 顶部存储空间概览 */}
        <Section header={<Text>录音文件存储概览</Text>}>
          <VStack spacing={10} padding={4}>
            <HStack alignment="center">
              <Text font="headline">📁 存储目录</Text>
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
                总占用: {storageSummary.formattedSize}
              </Text>
            </HStack>

            <HStack spacing={10}>
              <Button
                title={isProcessing ? "导入中…" : "📂 从文件 App 导入录音"}
                action={handlePickAudio}
              />
              <Spacer />
              <Button
                title="🔄 刷新列表"
                action={loadData}
              />
            </HStack>
          </VStack>
        </Section>

        {/* 真实录音文件列表 */}
        <Section header={<Text>所有录音文件 ({records.length})</Text>}>
          {records.length === 0 ? (
            <VStack padding={36} alignment="center" spacing={10}>
              <Text font="headline" foregroundStyle="secondaryLabel">
                暂无通话录音
              </Text>
              <Text font="caption1" foregroundStyle="tertiaryLabel">
                在备忘录通话录音中点击「...」选择「共享音频」到 Scripting，即可自动归档在此处。
              </Text>
            </VStack>
          ) : (
            records.map((item) => (
              <VStack
                key={item.id}
                spacing={10}
                padding={6}
              >
                <HStack alignment="center">
                  <Text font="headline">🎙️ {item.title}</Text>
                  <Spacer />
                  <Button
                    title="🗑️"
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
                    title="进入回听 & 微信对话"
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
