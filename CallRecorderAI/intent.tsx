import {
  Intent,
  Script,
  Navigation,
  NavigationStack,
  VStack,
  Text
} from "scripting";
import { saveRecord } from "./storage";
import { analyzeCallAudio } from "./ai_service";
import { persistIncomingAudio } from "./audio_manager";
import { CallDetailView } from "./components/CallDetailView";

function EmptyPromptView() {
  return (
    <NavigationStack>
      <VStack padding={24} spacing={16} alignment="center">
        <Text font="headline">未接收到录音数据</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel">
          请在备忘录 App 中打开通话录音卡片，点击右上角更多按钮选择“共享音频”或“共享听写文本”。
        </Text>
      </VStack>
    </NavigationStack>
  );
}

/**
 * 从不同渠道全面嗅探音频文件路径
 */
function extractAudioPath(): string {
  // 1. 优先从 fileURLsParameter 提取
  if (Intent.fileURLsParameter && Intent.fileURLsParameter.length > 0) {
    return Intent.fileURLsParameter[0];
  }

  // 2. 检查 urlsParameter 中以 file:// 开头的本地文件
  if (Intent.urlsParameter && Intent.urlsParameter.length > 0) {
    const fileUrl = Intent.urlsParameter.find((u) => u.startsWith("file://") || /\.(m4a|wav|mp3|aac)$/i.test(u));
    if (fileUrl) return fileUrl;
  }

  // 3. 检查快捷指令传入参数
  if (Intent.shortcutParameter) {
    const val = Intent.shortcutParameter.value;
    if (typeof val === "string" && (val.startsWith("/") || val.startsWith("file://"))) {
      return val;
    }
  }

  return "";
}

async function run() {
  const incomingAudioPath = extractAudioPath();
  const texts = Intent.textsParameter;

  let rawText = "";
  if (texts && texts.length > 0) {
    rawText = texts.join("\n");
  } else if (Intent.shortcutParameter?.type === "text") {
    rawText = Intent.shortcutParameter.value;
  }

  // 1. 若无文件且无文本输入，友好提示后退出
  if (!incomingAudioPath && !rawText) {
    await Navigation.present({
      element: <EmptyPromptView />
    });
    Script.exit(Intent.text("未收到输入"));
    return;
  }

  let finalAudioPath = "";
  let finalFileName = "recording.m4a";
  let finalSizeBytes = 0;

  // 2. 真实音频文件统一归档至 Documents/CallRecordings/ 专属目录
  if (incomingAudioPath) {
    const persisted = persistIncomingAudio(incomingAudioPath);
    finalAudioPath = persisted.fullPath;
    finalFileName = persisted.fileName;
    finalSizeBytes = persisted.sizeBytes;
  }

  // 3. 执行真实分析与角色切分（无伪造假数据）
  const record = await analyzeCallAudio(
    finalAudioPath,
    0,
    rawText,
    finalFileName,
    finalSizeBytes
  );

  // 4. 保存到共享存储（shared: true），使主 App 首页能实时显示
  saveRecord(record);

  // 5. 唤起全屏播放器与双人对话/总结详情页
  await Navigation.present({
    element: <CallDetailView record={record} />
  });

  // 6. 正常结束 Intent
  Script.exit(Intent.text(record.title));
}

run();
