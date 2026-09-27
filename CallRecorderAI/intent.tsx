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

async function run() {
  const filePaths = Intent.fileURLsParameter;
  const texts = Intent.textsParameter;

  let rawText = "";
  if (texts && texts.length > 0) {
    rawText = texts.join("\n");
  }

  // 1. 如果没有收到文件也没有收到文本，给出轻量提示后退出
  if ((!filePaths || filePaths.length === 0) && !rawText) {
    await Navigation.present({
      element: <EmptyPromptView />
    });
    Script.exit(Intent.text("未收到输入"));
    return;
  }

  let finalAudioPath = "";

  // 2. 如果接收到了音频文件，统一规整存入专属目录 Documents/CallRecordings/
  if (filePaths && filePaths.length > 0) {
    const sourcePath = filePaths[0];
    finalAudioPath = persistIncomingAudio(sourcePath);
  }

  // 3. 执行 AI 通话分析与角色提取
  const record = await analyzeCallAudio(finalAudioPath, 0, rawText);

  // 4. 保存到本地历史记录
  saveRecord(record);

  // 5. 唤起全屏播放器与双人对话/总结详情页
  await Navigation.present({
    element: <CallDetailView record={record} />
  });

  // 6. 正常结束 Intent
  Script.exit(Intent.text(record.title));
}

run();
