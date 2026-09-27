import {
  useState,
  useEffect,
  useMemo,
  Navigation,
  NavigationStack,
  VStack,
  HStack,
  Text,
  Button,
  ScrollView,
  Spacer,
  SharedAudioSession,
  AVPlayer
} from "scripting";
import type { CallRecord } from "../types";
import { WaveformView } from "../components/WaveformView";

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function AudioDetailPage({
  record
}: {
  record: CallRecord;
}) {
  const dismiss = Navigation.useDismiss();
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(record.duration || 62);
  const [rate, setRate] = useState<number>(1.0);
  const [activeSegment, setActiveSegment] = useState<"minutes" | "key" | "todo" | "raw">("minutes");

  // 初始化 AVPlayer
  const player = useMemo(() => {
    if (typeof SharedAudioSession !== "undefined") {
      try {
        SharedAudioSession.setCategory("playback", ["defaultToSpeaker"]);
        SharedAudioSession.setActive(true);
      } catch {}
    }

    const p = new AVPlayer();
    if (record.audioPath) {
      if (p.setSource(record.audioPath)) {
        p.onReadyToPlay = () => {
          if (p.duration && p.duration > 0) setDuration(p.duration);
        };
        p.onEnded = () => setIsPlaying(false);
      }
    }
    return p;
  }, [record.audioPath]);

  // 定时刷新播放进度
  useEffect(() => {
    const timer = setInterval(() => {
      if (player && isPlaying) {
        setCurrentTime(player.currentTime);
      }
    }, 250);
    return () => {
      clearInterval(timer);
      try {
        player.stop();
        player.dispose();
      } catch {}
    };
  }, [player, isPlaying]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play(rate);
      setIsPlaying(true);
    }
  };

  const handleSeek = (sec: number) => {
    player.currentTime = sec;
    setCurrentTime(sec);
    if (!isPlaying) {
      player.play(rate);
      setIsPlaying(true);
    }
  };

  const toggleRate = () => {
    const next = rate === 1.0 ? 1.5 : rate === 1.5 ? 2.0 : 1.0;
    setRate(next);
    player.rate = next;
  };

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <NavigationStack>
      <VStack
        navigationTitle="会议详情"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: (
            <Button title="返回" action={dismiss} />
          )
        }}
        spacing={12}
      >
        <ScrollView>
          <VStack spacing={14} padding={16}>
            {/* 1. 顶部会议录音信息卡片 (设计图第4屏顶部) */}
            <VStack
              padding={14}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={16}
            >
              <HStack alignment="center" spacing={10}>
                <VStack
                  padding={8}
                  background="systemBlue"
                  cornerRadius={10}
                  frame={{ width: 36, height: 36 }}
                  alignment="center"
                >
                  <Text font="caption1" foregroundStyle="white">📄</Text>
                </VStack>

                <VStack spacing={2} alignment="leading">
                  <Text font="headline">{record.title}</Text>
                  <Text font="caption2" foregroundStyle="secondaryLabel">
                    {record.minutes.dateStr || "2026年4月26日 10:00 - 11:20"} · {record.minutes.durationStr || "共 1.3 小时"}
                  </Text>
                </VStack>

                <Spacer />

                {/* AI 纪要已生成胶囊徽标 */}
                <HStack padding={4} background="systemGreen" cornerRadius={6}>
                  <Text font="caption2" foregroundStyle="white">
                    🔒 AI 纪要已生成
                  </Text>
                </HStack>
              </HStack>
            </VStack>

            {/* 2. 原生声波播放器大卡片 (设计图第4屏双色声波) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={16}
            >
              {/* 声波波形 */}
              <HStack alignment="center">
                <Spacer />
                <WaveformView progressRatio={progressRatio} height={46} />
                <Spacer />
              </HStack>

              {/* 播放控制与进度条 */}
              <HStack alignment="center" spacing={12}>
                <Button
                  title={isPlaying ? " ⏸ " : " ▶️ "}
                  action={handleTogglePlay}
                />

                <Text font="caption1" foregroundStyle="secondaryLabel">
                  {formatSeconds(currentTime)} / {formatSeconds(duration)}
                </Text>

                <Spacer />

                <Button
                  title={`${rate.toFixed(1)}x`}
                  action={toggleRate}
                />
              </HStack>
            </VStack>

            {/* 3. 分段切换栏 (会议纪要 / 重点 / 待办 / 原文) */}
            <HStack padding={6} spacing={8} background="secondarySystemBackground" cornerRadius={10}>
              <Button
                title={activeSegment === "minutes" ? "• 会议纪要 •" : "会议纪要"}
                action={() => setActiveSegment("minutes")}
              />
              <Spacer />
              <Button
                title={activeSegment === "key" ? "• 重点 •" : "重点"}
                action={() => setActiveSegment("key")}
              />
              <Spacer />
              <Button
                title={activeSegment === "todo" ? "• 待办 •" : "待办"}
                action={() => setActiveSegment("todo")}
              />
              <Spacer />
              <Button
                title={activeSegment === "raw" ? "• 原文 •" : "原文"}
                action={() => setActiveSegment("raw")}
              />
            </HStack>

            {/* 4. 时间轴 / 章节章节卡片 (设计图纵向时间线) */}
            <VStack
              padding={14}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={16}
            >
              <Text font="headline">时间轴 (点击跳转原声)</Text>

              <VStack spacing={14}>
                {record.chapters.map((chap) => {
                  const isCurrent = currentTime >= chap.timeSec && currentTime < chap.timeSec + 15;
                  return (
                    <HStack key={chap.id} alignment="center" spacing={10}>
                      {/* 时间戳 */}
                      <Text
                        font="caption1"
                        fontWeight="bold"
                        foregroundStyle={isCurrent ? "systemBlue" : "secondaryLabel"}
                      >
                        {formatSeconds(chap.timeSec)}
                      </Text>

                      {/* 纵向连线圆点 */}
                      <Text foregroundStyle="systemBlue">•</Text>

                      {/* 章节主题 (点触直接联动跳播) */}
                      <Button
                        title={chap.title}
                        action={() => handleSeek(chap.timeSec)}
                      />

                      <Spacer />

                      <Button
                        title="🔊 听"
                        action={() => handleSeek(chap.timeSec)}
                      />
                    </HStack>
                  );
                })}
              </VStack>
            </VStack>

            {/* 5. 相关附件卡片 (设计图底部 PDF 文件) */}
            <VStack
              padding={14}
              spacing={8}
              background="secondarySystemBackground"
              cornerRadius={16}
            >
              <Text font="headline">相关文件</Text>
              <HStack alignment="center" spacing={10}>
                <VStack
                  padding={6}
                  background="systemRed"
                  cornerRadius={6}
                  frame={{ width: 32, height: 32 }}
                  alignment="center"
                >
                  <Text font="caption1" foregroundStyle="white">PDF</Text>
                </VStack>
                <VStack spacing={2} alignment="leading">
                  <Text font="subheadline">项目需求文档.pdf</Text>
                  <Text font="caption2" foregroundStyle="secondaryLabel">2.4 MB</Text>
                </VStack>
                <Spacer />
                <Button title="⬇️ 导出" action={() => {}} />
              </HStack>
            </VStack>
          </VStack>
        </ScrollView>
      </VStack>
    </NavigationStack>
  );
}
