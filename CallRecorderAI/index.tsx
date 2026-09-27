import {
  useState,
  useEffect
} from "react";
import {
  Navigation,
  NavigationStack,
  List,
  Section,
  VStack,
  HStack,
  Text,
  Button,
  Spacer,
  Script,
  DocumentPicker
} from "scripting";
import type { CallRecord } from "./types";
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
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const loadData = () => {
    try {
      setRecords(getAllRecords());
    } catch (e) {
      console.error("加载列表失败:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 进入详情页
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

  // 生成示例数据方便无录音时快速体验
  const handleCreateMock = async () => {
    setIsProcessing(true);
    try {
      const mock = await analyzeCallAudio("mock_call_audio.m4a", 62);
      saveRecord(mock);
      loadData();
      await handleOpenDetail(mock);
    } finally {
      setIsProcessing(false);
    }
  };

  // 从文件 App 中选取录音文件进行分析（双通道备选）
  const handlePickAudioFile = async () => {
    if (typeof DocumentPicker === "undefined") {
      return;
    }

    try {
      setIsProcessing(true);
      const picked = await DocumentPicker.pickFiles({
        types: ["public.audio", "com.apple.m4a-audio"]
      });

      if (picked && picked.length > 0) {
        const sourcePath = picked[0];
        let finalPath = sourcePath;

        // 转存至沙盒 Documents
        if (typeof FileManager !== "undefined") {
          try {
            const rootDir = FileManager.documentsDirectory;
            const targetDir = `${rootDir}/CallRecordings`;
            if (!FileManager.existsSync(targetDir)) {
              FileManager.createDirectorySync(targetDir, true);
            }
            finalPath = `${targetDir}/call_${Date.now()}.m4a`;
            FileManager.copyFileSync(sourcePath, finalPath);
          } catch {
            finalPath = sourcePath;
          }
        }

        const record = await analyzeCallAudio(finalPath, 0);
        saveRecord(record);
        loadData();
        await handleOpenDetail(record);
      }
    } catch (err) {
      console.error("选取文件分析失败:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 删除记录
  const handleDelete = (id: string) => {
    deleteRecord(id);
    loadData();
  };

  return (
    <NavigationStack>
      <List
        navigationTitle="通话录音 AI 分析器"
        navigationBarTitleDisplayMode="large"
      >
        {/* 操作入口卡片 */}
        <Section header={<Text>导入与分析入口</Text>}>
          <VStack spacing={12} padding={4}>
            <Text font="subheadline" foregroundStyle="secondaryLabel">
              支持以下两种方式载入通话录音：
            </Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              ① 在备忘录通话录音中点「...」选择「共享音频」到 Scripting；
            </Text>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              ② 或在备忘录点「保存音频文件」后，点击下方直接选取。
            </Text>

            <HStack spacing={10}>
              <Button
                title={isProcessing ? "处理中…" : "📂 选取本地录音分析"}
                action={handlePickAudioFile}
              />
              <Spacer />
              <Button
                title="✨ 体验示例演示"
                action={handleCreateMock}
              />
            </HStack>
          </VStack>
        </Section>

        {/* 通话历史列表 */}
        <Section header={<Text>已分析通话 ({records.length})</Text>}>
          {records.length === 0 ? (
            <VStack padding={20} alignment="center" spacing={6}>
              <Text font="body" foregroundStyle="secondaryLabel">
                暂无通话记录
              </Text>
              <Text font="caption1" foregroundStyle="tertiaryLabel">
                点击上方按钮选取录音文件或加载演示
              </Text>
            </VStack>
          ) : (
            records.map((item) => (
              <VStack
                key={item.id}
                spacing={8}
                padding={4}
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
                  foregroundStyle="secondaryLabel"
                >
                  {item.summary.overview}
                </Text>

                <HStack alignment="center">
                  <Text font="caption1" foregroundStyle="tertiaryLabel">
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
        </Section>
      </List>
    </NavigationStack>
  );
}

async function run() {
  try {
    await Navigation.present({
      element: <MainListView />
    });
  } catch (err) {
    console.error("启动失败:", err);
  } finally {
    Script.exit();
  }
}

run();
