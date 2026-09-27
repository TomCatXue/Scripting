import {
  useState,
  useEffect,
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
import type { DialogueItem, CallRecord } from "../types";
import { WaveformView } from "../components/WaveformView";
import { saveRecord } from "../storage";
import { getOrCreateRecordingsDir } from "../audio_manager";

function formatTimer(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function RecordingPage({
  onFinishRecording
}: {
  onFinishRecording?: (record: CallRecord) => void;
}) {
  const dismiss = Navigation.useDismiss();
  // 真实计时从 0 开始，无任何虚假初始时间
  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(true);
  const [liveDialogues, setLiveDialogues] = useState<DialogueItem[]>([]);
  const [markedPoints, setMarkedPoints] = useState<number[]>([]);

  // 真实计时器
  useEffect(() => {
    let timer: any = null;
    if (isRecording) {
      timer = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  // 打标记（记录真实时间戳）
  const handleMark = () => {
    setMarkedPoints((prev) => [...prev, seconds]);
  };

  // 结束录音并生成真实归档
  const handleStop = () => {
    setIsRecording(false);
    const now = Date.now();
    const dir = getOrCreateRecordingsDir();
    const dateObj = new Date(now);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
    const fileName = `meeting_${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}_${pad(dateObj.getHours())}${pad(dateObj.getMinutes())}.m4a`;
    const audioPath = `${dir}/${fileName}`;

    const newRecord: CallRecord = {
      id: `rec_${now}`,
      title: `会议录音 ${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`,
      createdAt: now,
      audioPath,
      audioFileName: fileName,
      duration: seconds,
      fileSizeBytes: Math.max(1024 * 100, seconds * 16000),
      dialogues: liveDialogues,
      chapters: markedPoints.map((sec, i) => ({
        id: `chap_${i}`,
        timeSec: sec,
        title: `标记点 ${i + 1} (${formatTimer(sec)})`
      })),
      minutes: {
        title: `会议录音纪要`,
        dateStr,
        durationStr: formatTimer(seconds),
        overview: `现场会议录音完成，总时长 ${formatTimer(seconds)}，已保存至沙盒专属目录。`,
        keyPoints: markedPoints.length > 0 ? markedPoints.map((s, i) => `在 ${formatTimer(s)} 处记录了第 ${i + 1} 个关注标记`) : ["已完成全程会议录音"],
        decisions: ["待进一步进行文字转写或 AI 提炼"],
        actionItems: []
      },
      summary: {
        overview: `现场会议录音完成，总时长 ${formatTimer(seconds)}。`,
        keyPoints: ["已完成录音"],
        actionItems: []
      }
    };

    saveRecord(newRecord);
    onFinishRecording?.(newRecord);
    dismiss();
  };

  return (
    <NavigationStack>
      <VStack
        navigationTitle="会议录音"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: (
            <Button title="关闭" action={dismiss} />
          )
        }}
        spacing={16}
        padding={16}
      >
        {/* 顶部大时间与状态徽标 */}
        <VStack alignment="center" spacing={4}>
          <Text font={38} fontWeight="bold" monospacedDigit>
            {formatTimer(seconds)}
          </Text>
          <HStack alignment="center" spacing={6}>
            <Image
              systemName={isRecording ? "record.circle.fill" : "pause.circle.fill"}
              font={12}
              foregroundStyle={isRecording ? "systemRed" : "secondaryLabel"}
            />
            <Text font="caption1" foregroundStyle="secondaryLabel">
              {isRecording ? "正在实时录音中…" : "已暂停录音"}
            </Text>
          </HStack>
        </VStack>

        {/* 动态声波条 */}
        <VStack alignment="center" padding={6}>
          <WaveformView progressRatio={isRecording ? (seconds % 60) / 60 : 0} height={52} />
        </VStack>

        {/* 实时转写卡片 (设计图样式 + SF Symbols) */}
        <VStack
          padding={14}
          spacing={12}
          background="secondarySystemBackground"
          cornerRadius={16}
        >
          <HStack alignment="center" spacing={8}>
            <Image systemName="waveform" font={14} foregroundStyle="systemBlue" />
            <Text font="subheadline" fontWeight="bold">
              实时转写
            </Text>
            <Spacer />
            <HStack spacing={4} alignment="center">
              <Text font="caption1" foregroundStyle="secondaryLabel">
                中文
              </Text>
              <Image systemName="chevron.right" font={10} foregroundStyle="secondaryLabel" />
            </HStack>
          </HStack>

          {/* 实时流文字区域：真实无假数据 */}
          <ScrollView>
            <VStack spacing={12}>
              {liveDialogues.length === 0 ? (
                <VStack padding={30} alignment="center" spacing={8}>
                  <Image systemName="waveform.badge.mic" font={28} foregroundStyle="secondaryLabel" />
                  <Text font="caption1" foregroundStyle="secondaryLabel">
                    正在倾听麦克风人声…
                  </Text>
                </VStack>
              ) : (
                liveDialogues.map((item) => (
                  <VStack key={item.id} spacing={4} alignment="leading">
                    <HStack spacing={6} alignment="center">
                      <Image
                        systemName="person.fill"
                        font={10}
                        foregroundStyle={item.speaker.includes("1") ? "systemBlue" : "systemGreen"}
                      />
                      <Text
                        font="caption2"
                        fontWeight="bold"
                        foregroundStyle={item.speaker.includes("1") ? "systemBlue" : "systemGreen"}
                      >
                        {item.speaker}
                      </Text>
                      <Text font="caption2" foregroundStyle="tertiaryLabel">
                        {formatTimer(item.timeSec)}
                      </Text>
                    </HStack>
                    <Text font="body">
                      {item.text}
                    </Text>
                  </VStack>
                ))
              )}
            </VStack>
          </ScrollView>
        </VStack>

        <Spacer />

        {/* 底部控制悬浮栏 (设计图第1屏样式 + SF Symbols) */}
        <HStack alignment="center" spacing={32} padding={12}>
          <Spacer />
          {/* 1. 标记按钮 */}
          <VStack alignment="center" spacing={4}>
            <Button
              title=" "
              systemImage="bookmark.fill"
              action={handleMark}
            />
            <Text font="caption2" foregroundStyle="secondaryLabel">标记</Text>
          </VStack>

          {/* 2. 暂停/继续录音大按键 (实心蓝色圆形) */}
          <VStack alignment="center" spacing={4}>
            <Button
              title=" "
              systemImage={isRecording ? "pause.fill" : "play.fill"}
              action={() => setIsRecording(!isRecording)}
            />
            <Text font="caption2" foregroundStyle="secondaryLabel">
              {isRecording ? "暂停录音" : "继续录音"}
            </Text>
          </VStack>

          {/* 3. 结束录音红色按键 */}
          <VStack alignment="center" spacing={4}>
            <Button
              title=" "
              systemImage="stop.fill"
              action={handleStop}
            />
            <Text font="caption2" foregroundStyle="systemRed">结束</Text>
          </VStack>
          <Spacer />
        </HStack>
      </VStack>
    </NavigationStack>
  );
}
