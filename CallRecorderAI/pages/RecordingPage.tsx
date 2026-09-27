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

  // 对照原图第一屏，初始时间设定为 00:12:36 (756秒)，并支持随秒数真实自增
  const [seconds, setSeconds] = useState(756);
  const [isRecording, setIsRecording] = useState(true);
  const [markedPoints, setMarkedPoints] = useState<number[]>([756]);
  const [highlightNote, setHighlightNote] = useState<string>("下周进入上线准备阶段");

  // 原图第 1 屏 1:1 逐字对白流数据
  const [liveDialogues] = useState<DialogueItem[]>([
    {
      id: "live_1",
      speaker: "发言人1",
      timeSec: 8,
      durationSec: 7,
      text: "我们先回顾一下上周的项目进展，目前开发部分已经完成了80%，接下来需要重点关注测试环节。"
    },
    {
      id: "live_2",
      speaker: "发言人2",
      timeSec: 15,
      durationSec: 6,
      text: "好的，测试预计这周开始，预计需要3天时间。如果没有问题的话，下周就可以进入上线准备阶段。"
    },
    {
      id: "live_3",
      speaker: "发言人1",
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

  // 打标记：在当前时间记录关键重点点位
  const handleMark = () => {
    setMarkedPoints((prev) => [...prev, seconds]);
    setHighlightNote(`在 ${formatTimer(seconds)} 记录了关键重点讨论`);
  };

  // 结束录音并保存归档
  const handleStop = () => {
    setIsRecording(false);
    const now = Date.now();
    const dir = getOrCreateRecordingsDir();
    const dateObj = new Date(now);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 10:00 - 11:20`;
    const fileName = `meeting_${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}_${pad(dateObj.getHours())}${pad(dateObj.getMinutes())}.m4a`;
    const audioPath = `${dir}/${fileName}`;

    // 使用规范且完整的会议数据结构
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
      chapters: [
        { id: "c0", timeSec: 0, title: "会议开始，项目进展回顾" },
        { id: "c1", timeSec: 8, title: "开发进度完成 80%" },
        { id: "c2", timeSec: 15, title: "测试计划及时间安排" },
        { id: "c3", timeSec: 21, title: "用户反馈问题讨论" },
        { id: "c4", timeSec: 32, title: "后续优化方向" },
        { id: "c5", timeSec: 48, title: "会议总结" }
      ],
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
              systemImage="chevron.backward"
              action={dismiss}
            />
          ),
          principal: (
            <HStack alignment="center" spacing={6}>
              <Text font="headline" fontWeight="bold">
                会议录音
              </Text>
              {/* 原图右上角蓝色小胶囊：AI 录音 */}
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
        spacing={12}
        padding={16}
        background="systemBackground"
      >
        {/* 1. 顶部大计时器与状态 (原图第1屏: 00:12:36 / 正在录音中...) */}
        <VStack alignment="center" spacing={4} padding={8}>
          <Text font={38} fontWeight="bold" monospacedDigit>
            {formatTimer(seconds)}
          </Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {isRecording ? "正在录音中..." : "录音已暂停"}
          </Text>
        </VStack>

        {/* 2. 原图清爽青绿色动态声波条 */}
        <VStack alignment="center" padding={6}>
          <WaveformView
            progressRatio={isRecording ? (seconds % 60) / 60 : 0}
            height={50}
            mode="recording"
          />
        </VStack>

        {/* 3. 实时转写纯白大卡片 (原图第1屏主视觉) */}
        <VStack
          padding={16}
          spacing={12}
          background="secondarySystemBackground"
          cornerRadius={20}
        >
          {/* 卡片头部：实时转写 + 中/ > */}
          <HStack alignment="center" spacing={8}>
            <VStack
              padding={4}
              background="systemTeal"
              cornerRadius={6}
              alignment="center"
              frame={{ width: 22, height: 22 }}
            >
              <Image systemName="waveform" font={12} foregroundStyle="white" />
            </VStack>
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

          {/* 实时滚动对话气泡流 */}
          <ScrollView>
            <VStack spacing={14} padding={4}>
              {liveDialogues.map((item) => {
                const isSpeaker1 = item.speaker.includes("1");
                return (
                  <VStack key={item.id} spacing={6} alignment="leading">
                    {/* 发言人头像图标 + 角色名 + 时间戳 */}
                    <HStack spacing={6} alignment="center">
                      <Image
                        systemName={isSpeaker1 ? "person.crop.circle.fill" : "person.crop.circle"}
                        font={14}
                        foregroundStyle={isSpeaker1 ? "systemBlue" : "systemGreen"}
                      />
                      <Text
                        font="subheadline"
                        fontWeight="bold"
                        foregroundStyle={isSpeaker1 ? "systemBlue" : "systemGreen"}
                      >
                        {item.speaker}
                      </Text>
                      <Text font="subheadline" foregroundStyle="tertiaryLabel">
                        {formatTimer(item.timeSec).substring(3)}
                      </Text>
                    </HStack>

                    {/* 正文气泡文本 */}
                    <Text font="body" foregroundStyle="label">
                      {item.text}
                    </Text>
                  </VStack>
                );
              })}

              {/* 原图橙黄色重点小卡片：重点 下周进入上线准备阶段 */}
              {highlightNote && (
                <HStack
                  padding={8}
                  background="tertiarySystemFill"
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

        {/* 4. 底部三大控制按钮 (原图第1屏: 标记 + 暂停录音大圆形 + 结束) */}
        <HStack alignment="center" spacing={28} padding={8}>
          <Spacer />

          {/* 4.1 标记按钮 (白底圆角方形) */}
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
                systemImage="bookmark.fill"
                action={handleMark}
              />
            </VStack>
            <Text font="caption1" foregroundStyle="secondaryLabel">
              标记
            </Text>
          </VStack>

          {/* 4.2 暂停/继续录音主按钮 (大青蓝色圆形按键) */}
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

          {/* 4.3 结束录音按钮 (白底圆角方形，红色停止小方块) */}
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
