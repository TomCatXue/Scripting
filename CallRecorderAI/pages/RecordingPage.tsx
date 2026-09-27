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
  Spacer
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
  const [seconds, setSeconds] = useState(12 * 60 + 36); // 初始模拟 00:12:36 或从 0 开始
  const [isRecording, setIsRecording] = useState(true);
  const [markedPoints, setMarkedPoints] = useState<string[]>(["下周进入上线准备阶段"]);

  // 模拟设计图中的实时转写流
  const [realtimeDialogues, setRealtimeDialogues] = useState<DialogueItem[]>([
    {
      id: "rt_1",
      speaker: "发言人 1",
      timeSec: 8,
      durationSec: 6,
      text: "我们先回顾一下上周的项目进展，目前开发部分已经完成了80%，接下来需要重点关注测试环节。"
    },
    {
      id: "rt_2",
      speaker: "发言人 2",
      timeSec: 15,
      durationSec: 5,
      text: "好的，测试预计这周开始，预计需要3天时间。如果没有问题的话，下周就可以进入上线准备阶段。",
      isKeyPoint: true
    },
    {
      id: "rt_3",
      speaker: "发言人 1",
      timeSec: 21,
      durationSec: 8,
      text: "另外，关于用户反馈的几个问题，我们也在同步处理，主要是登录和消息推送的稳定性。"
    }
  ]);

  // 定时器累加时间
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

  // 打标记
  const handleMark = () => {
    const markText = `标记点于 ${formatTimer(seconds)}`;
    setMarkedPoints((prev) => [...prev, markText]);
  };

  // 结束录音并生成归档
  const handleStop = () => {
    setIsRecording(false);
    const now = Date.now();
    const dir = getOrCreateRecordingsDir();
    const fileName = `meeting_rec_${now}.m4a`;
    const audioPath = `${dir}/${fileName}`;

    const newRecord: CallRecord = {
      id: `rec_${now}`,
      title: "项目例会录音",
      createdAt: now,
      audioPath,
      audioFileName: fileName,
      duration: seconds,
      fileSizeBytes: 1024 * 1024 * 2.4, // 2.4 MB
      dialogues: realtimeDialogues,
      chapters: [
        { id: "c1", timeSec: 0, title: "会议开始，项目进展回顾" },
        { id: "c2", timeSec: 8, title: "开发进度完成 80%" },
        { id: "c3", timeSec: 15, title: "测试计划及时间安排" },
        { id: "c4", timeSec: 21, title: "用户反馈问题讨论" },
        { id: "c5", timeSec: 32, title: "后续优化方向" },
        { id: "c6", timeSec: 48, title: "会议总结" }
      ],
      minutes: {
        title: "项目例会 · 会议纪要",
        dateStr: "2026年4月26日 10:00 - 11:20",
        durationStr: "共 1.3 小时",
        overview: "本次会议主要围绕项目最新进展、测试计划及上线准备工作展开。当前开发进度已完成 80%，测试工作将于本周启动，预计下周进入上线准备阶段。会议还讨论了用户反馈的相关问题，并明确了后续的优化方向。",
        keyPoints: [
          "开发进度已完成 80%，当前无重大风险。",
          "测试工作本周启动，预计 3 天完成。",
          "下周进入上线准备阶段。",
          "重点关注登录和消息推送的稳定性。"
        ],
        decisions: [
          "同意按照既定测试计划推进并在下周组织预上线联调",
          "登录及推送模块修复纳入本周发版最高优先级"
        ],
        actionItems: [
          { id: "a1", task: "完成测试用例编写", assignee: "张三", dueDate: "4月28日", done: false },
          { id: "a2", task: "修复登录相关问题", assignee: "李四", dueDate: "4月29日", done: false },
          { id: "a3", task: "准备上线环境", assignee: "王五", dueDate: "5月1日", done: false }
        ]
      },
      summary: {
        overview: "本次会议主要围绕项目最新进展、测试计划及上线准备工作展开。开发进度已达80%，计划下周进入上线准备阶段。",
        keyPoints: [
          "开发进度已完成 80%，当前无重大风险。",
          "测试工作本周启动，预计 3 天完成。",
          "重点关注登录和消息推送的稳定性。"
        ],
        actionItems: [
          "完成测试用例编写（负责人：张三）",
          "修复登录相关问题（负责人：李四）",
          "准备上线环境（负责人：王五）"
        ]
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
        {/* 顶部大时间与状态 */}
        <VStack alignment="center" spacing={4}>
          <Text font={36} fontWeight="bold">
            {formatTimer(seconds)}
          </Text>
          <Text font="caption1" foregroundStyle="secondaryLabel">
            {isRecording ? "正在录音中..." : "已暂停录音"}
          </Text>
        </VStack>

        {/* 动态声波条 */}
        <VStack alignment="center" padding={6}>
          <WaveformView progressRatio={0.4} height={50} />
        </VStack>

        {/* 实时转写卡片 (设计图样式) */}
        <VStack
          padding={14}
          spacing={12}
          background="secondarySystemBackground"
          cornerRadius={16}
        >
          <HStack alignment="center">
            <Text font="subheadline" fontWeight="bold">
              🎙️ 实时转写
            </Text>
            <Spacer />
            <Text font="caption1" foregroundStyle="secondaryLabel">
              中/英 ▾
            </Text>
          </HStack>

          {/* 实时流文字 */}
          <ScrollView>
            <VStack spacing={12}>
              {realtimeDialogues.map((item) => (
                <VStack key={item.id} spacing={4} alignment="leading">
                  <HStack spacing={6}>
                    <Text
                      font="caption2"
                      fontWeight="bold"
                      foregroundStyle={item.speaker.includes("1") ? "systemBlue" : "systemGreen"}
                    >
                      {item.speaker}
                    </Text>
                    <Text font="caption2" foregroundStyle="tertiaryLabel">
                      00:0{item.timeSec}
                    </Text>
                  </HStack>
                  <Text font="body">
                    {item.text}
                  </Text>
                  {item.isKeyPoint && (
                    <HStack padding={4} background="systemOrange" cornerRadius={6}>
                      <Text font="caption2" foregroundStyle="white">
                        重点 · 下周进入上线准备阶段
                      </Text>
                    </HStack>
                  )}
                </VStack>
              ))}
            </VStack>
          </ScrollView>
        </VStack>

        <Spacer />

        {/* 底部控制悬浮栏：标记 / 暂停 / 结束 (设计图样式) */}
        <HStack alignment="center" spacing={30} padding={12}>
          <Spacer />
          {/* 标记 */}
          <Button
            title="🔖 标记"
            action={handleMark}
          />

          {/* 暂停 / 继续录音大按键 */}
          <Button
            title={isRecording ? " ⏸ 暂停录音 " : " ▶️ 继续录音 "}
            action={() => setIsRecording(!isRecording)}
          />

          {/* 结束录音红色按键 */}
          <Button
            title=" ⏹ 结束 "
            action={handleStop}
          />
          <Spacer />
        </HStack>
      </VStack>
    </NavigationStack>
  );
}
