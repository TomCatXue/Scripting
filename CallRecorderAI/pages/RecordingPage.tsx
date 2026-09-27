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
import { getProjectDemoRecord } from "../demo_data";

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

  // 对照规范：初始时间为 00:12:36 (756秒)，并随录音自增
  const [seconds, setSeconds] = useState(756);
  const [isRecording, setIsRecording] = useState(true);
  const [markedPoints, setMarkedPoints] = useState<number[]>([756]);
  const [highlightNote, setHighlightNote] = useState<string>("下周进入上线准备阶段");

  // 对照规范第 10 条：文档式排版真实对白流
  const [liveDialogues] = useState<DialogueItem[]>([
    {
      id: "live_1",
      speaker: "发言人 1",
      timeSec: 8,
      durationSec: 7,
      text: "我们先回顾一下上周的项目进展，目前开发已经完成了 80%，接下来需要重点关注测试环节。"
    },
    {
      id: "live_2",
      speaker: "发言人 2",
      timeSec: 15,
      durationSec: 6,
      text: "好的，测试预计这周开始，预计需要 3 天时间。如果没有问题的话，下周就可以进入上线准备阶段。"
    },
    {
      id: "live_3",
      speaker: "发言人 1",
      timeSec: 21,
      durationSec: 11,
      text: "另外，关于用户反馈的几个问题，我们也在同步处理，主要是登录和消息推送的稳定性。"
    }
  ]);

  // 录音秒表定时器
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

  // 打标记（规范第 12 条）
  const handleMark = () => {
    setMarkedPoints((prev) => [...prev, seconds]);
    setHighlightNote(`在 ${formatTimer(seconds)} 记录了关键重点`);
  };

  // 结束录音并生成归档
  const handleStop = () => {
    setIsRecording(false);
    const now = Date.now();
    const dir = getOrCreateRecordingsDir();
    const dateObj = new Date(now);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 10:00 - 11:20`;
    const fileName = `meeting_${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}_${pad(dateObj.getHours())}${pad(dateObj.getMinutes())}.m4a`;
    const audioPath = `${dir}/${fileName}`;

    const demo = getProjectDemoRecord();
    const newRecord: CallRecord = {
      ...demo,
      id: `rec_${now}`,
      title: "项目例会录音",
      createdAt: now,
      audioPath,
      audioFileName: fileName,
      duration: seconds,
      fileSizeBytes: Math.max(1024 * 1024 * 2, seconds * 16000),
      dialogues: liveDialogues.length > 0 ? liveDialogues : demo.dialogues,
      minutes: {
        ...demo.minutes,
        dateStr,
        durationStr: "共 1.3 小时"
      }
    };

    saveRecord(newRecord);
    onFinishRecording?.(newRecord);
    dismiss();
  };

  return (
    <NavigationStack>
      <VStack
        navigationTitle=""
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarLeading: (
            <Button
              title=" "
              systemImage="chevron.left"
              action={dismiss}
            />
          ),
          principal: (
            <HStack alignment="center" spacing={6}>
              <Text font="headline" fontWeight="bold">
                会议录音
              </Text>
              <HStack
                padding={3}
                background="secondarySystemBackground"
                cornerRadius={6}
                spacing={3}
                alignment="center"
              >
                <Image systemName="waveform.badge.mic" font={10} foregroundStyle="systemBlue" />
                <Text font="caption2" foregroundStyle="systemBlue" fontWeight="bold">
                  AI 录音
                </Text>
              </HStack>
            </HStack>
          ),
          topBarTrailing: (
            <Button
              title=" "
              systemImage="ellipsis"
              action={() => {}}
            />
          )
        }}
        spacing={14}
        padding={16}
        background="systemBackground"
      >
        {/* 1. 顶部大时间与副标题 (规范第 8 条：36-40pt，下方 14pt 灰色) */}
        <VStack alignment="center" spacing={4} padding={6}>
          <Text font={38} fontWeight="semibold" monospacedDigit>
            {formatTimer(seconds)}
          </Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {isRecording ? "正在录音中…" : "录音已暂停"}
          </Text>
        </VStack>

        {/* 2. 实时动态柱状 Waveform (规范第 9 条：约 60-70pt 高度，青蓝到薄荷绿起伏) */}
        <VStack alignment="center" padding={6}>
          <WaveformView
            progressRatio={isRecording ? (seconds % 60) / 60 : 0}
            height={62}
            mode="recording"
          />
        </VStack>

        {/* 3. 实时转写区域：彻底采用规范第 10 条的「文档式排版」，杜绝聊天气泡 */}
        <VStack
          padding={16}
          spacing={12}
          background="secondarySystemBackground"
          cornerRadius={20}
        >
          {/* 卡片头部：🟢 实时转写  中/→ */}
          <HStack alignment="center" spacing={8}>
            <Image systemName="circle.fill" font={10} foregroundStyle="systemTeal" />
            <Text font="headline" fontWeight="bold">
              实时转写
            </Text>
            <Spacer />
            <HStack spacing={2} alignment="center">
              <Text font="subheadline" foregroundStyle="secondaryLabel">
                中/
              </Text>
              <Image systemName="chevron.right" font={11} foregroundStyle="secondaryLabel" />
            </HStack>
          </HStack>

          {/* 纯净文档式对白排版 */}
          <ScrollView>
            <VStack spacing={14} padding={4}>
              {liveDialogues.map((item) => {
                const isSpeaker1 = item.speaker.includes("1");
                return (
                  <VStack key={item.id} spacing={6} alignment="leading">
                    {/* 小圆点 + 说话人名字 (蓝/绿) + 时间戳 (规范第 11 条) */}
                    <HStack spacing={6} alignment="center">
                      <Image
                        systemName="circle.fill"
                        font={8}
                        foregroundStyle={isSpeaker1 ? "systemBlue" : "systemTeal"}
                      />
                      <Text
                        font="subheadline"
                        fontWeight="semibold"
                        foregroundStyle={isSpeaker1 ? "systemBlue" : "systemTeal"}
                      >
                        {item.speaker}
                      </Text>
                      <Text font="caption1" foregroundStyle="secondaryLabel" monospacedDigit>
                        {formatTimer(item.timeSec).substring(3)}
                      </Text>
                    </HStack>

                    {/* 文档正文 (规范第 10 条：正文黑色 16pt，无花哨气泡) */}
                    <Text font="body" foregroundStyle="label">
                      {item.text}
                    </Text>
                  </VStack>
                );
              })}

              {/* 重点标记药丸 (规范第 3 条：强调色 Orange #FF9F0A) */}
              {highlightNote && (
                <HStack
                  padding={8}
                  background="systemBackground"
                  cornerRadius={10}
                  spacing={8}
                  alignment="center"
                >
                  <HStack
                    padding={4}
                    background="systemOrange"
                    cornerRadius={6}
                  >
                    <Text font="caption2" foregroundStyle="white" fontWeight="bold">
                      重点
                    </Text>
                  </HStack>
                  <Text font="subheadline" foregroundStyle="systemOrange" fontWeight="medium">
                    {highlightNote}
                  </Text>
                </HStack>
              )}
            </VStack>
          </ScrollView>
        </VStack>

        <Spacer />

        {/* 4. 底部录音控制栏 (规范第 12 条：左 bookmark / 中 68pt 巨大圆形 pause / 右 stop) */}
        <HStack alignment="center" spacing={28} padding={8}>
          <Spacer />

          {/* 4.1 标记按钮 */}
          <VStack alignment="center" spacing={6}>
            <VStack
              padding={14}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="center"
              frame={{ width: 56, height: 56 }}
            >
              <Button
                title=" "
                systemImage="bookmark"
                action={handleMark}
              />
            </VStack>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              标记
            </Text>
          </VStack>

          {/* 4.2 中间巨大圆形按键 (直径 68pt，明显大于左右) */}
          <VStack alignment="center" spacing={6}>
            <VStack
              padding={16}
              background="systemBlue"
              cornerRadius={34}
              alignment="center"
              frame={{ width: 68, height: 68 }}
            >
              <Button
                title=" "
                systemImage={isRecording ? "pause.fill" : "play.fill"}
                action={() => setIsRecording(!isRecording)}
              />
            </VStack>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              {isRecording ? "暂停录音" : "继续录音"}
            </Text>
          </VStack>

          {/* 4.3 结束按钮 */}
          <VStack alignment="center" spacing={6}>
            <VStack
              padding={14}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="center"
              frame={{ width: 56, height: 56 }}
            >
              <Button
                title=" "
                systemImage="stop.fill"
                action={handleStop}
              />
            </VStack>
            <Text font="caption1" foregroundStyle="systemRed">
              结束
            </Text>
          </VStack>

          <Spacer />
        </HStack>
      </VStack>
    </NavigationStack>
  );
}
