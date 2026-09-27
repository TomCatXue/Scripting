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
  Image,
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
  const [duration, setDuration] = useState<number>(record.duration || 60);
  const [rate, setRate] = useState<number>(1.0);
  const [activeSegment, setActiveSegment] = useState<"timeline" | "raw">("timeline");

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
        navigationTitle="录音与章节详情"
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
            {/* 1. 顶部会议录音信息卡片 (设计图第4屏样式 + SF Symbols) */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={16}
            >
              <HStack alignment="center" spacing={10}>
                <VStack
                  padding={8}
                  background="systemBlue"
                  cornerRadius={10}
                  frame={{ width: 38, height: 38 }}
                  alignment="center"
                >
                  <Image systemName="doc.fill" font={18} foregroundStyle="white" />
                </VStack>

                <VStack spacing={3} alignment="leading">
                  <Text font="headline">{record.title}</Text>
                  <Text font="caption2" foregroundStyle="secondaryLabel">
                    {record.minutes.dateStr} · {record.minutes.durationStr}
                  </Text>
                </VStack>

                <Spacer />

                <HStack padding={5} background="systemGreen" cornerRadius={6} spacing={4} alignment="center">
                  <Image systemName="checkmark.shield.fill" font={10} foregroundStyle="white" />
                  <Text font="caption2" foregroundStyle="white" fontWeight="bold">
                    已归档
                  </Text>
                </HStack>
              </HStack>
            </VStack>

            {/* 2. 原生声波播放器大卡片 (设计图第4屏双色声波 + SF Symbols) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={16}
            >
              {/* 渐变声波波形 */}
              <HStack alignment="center">
                <Spacer />
                <WaveformView progressRatio={progressRatio} height={46} />
                <Spacer />
              </HStack>

              {/* 播放控制与进度条 */}
              <HStack alignment="center" spacing={12}>
                <Button
                  title=" "
                  systemImage={isPlaying ? "pause.circle.fill" : "play.circle.fill"}
                  action={handleTogglePlay}
                />

                <Text font="caption1" foregroundStyle="secondaryLabel" monospacedDigit>
                  {formatSeconds(currentTime)} / {formatSeconds(duration)}
                </Text>

                <Spacer />

                <Button
                  title={`${rate.toFixed(1)}x`}
                  action={toggleRate}
                />
              </HStack>
            </VStack>

            {/* 3. 分段切换栏 */}
            <HStack padding={6} spacing={8} background="secondarySystemBackground" cornerRadius={10}>
              <Button
                title={activeSegment === "timeline" ? "• 章节时间轴 •" : "章节时间轴"}
                action={() => setActiveSegment("timeline")}
              />
              <Spacer />
              <Button
                title={activeSegment === "raw" ? "• 对话原文 •" : "对话原文"}
                action={() => setActiveSegment("raw")}
              />
            </HStack>

            {/* 4. 时间轴 / 章节列表 (设计图纵向时间线 + 点击联动) */}
            {activeSegment === "timeline" && (
              <VStack
                padding={16}
                spacing={14}
                background="secondarySystemBackground"
                cornerRadius={16}
              >
                <HStack alignment="center" spacing={6}>
                  <Image systemName="clock.arrow.circlepath" font={14} foregroundStyle="systemBlue" />
                  <Text font="headline">章节时间轴 (点击跳转回听)</Text>
                </HStack>

                <VStack spacing={14}>
                  {record.chapters.map((chap) => {
                    const isCurrent = currentTime >= chap.timeSec && currentTime < chap.timeSec + 15;
                    return (
                      <HStack key={chap.id} alignment="center" spacing={10}>
                        <Text
                          font="caption1"
                          fontWeight="bold"
                          monospacedDigit
                          foregroundStyle={isCurrent ? "systemBlue" : "secondaryLabel"}
                        >
                          {formatSeconds(chap.timeSec)}
                        </Text>

                        <Image
                          systemName="circle.fill"
                          font={8}
                          foregroundStyle={isCurrent ? "systemBlue" : "tertiaryLabel"}
                        />

                        <Button
                          title={chap.title}
                          action={() => handleSeek(chap.timeSec)}
                        />

                        <Spacer />

                        <Button
                          title=" "
                          systemImage="speaker.wave.2.fill"
                          action={() => handleSeek(chap.timeSec)}
                        />
                      </HStack>
                    );
                  })}
                </VStack>
              </VStack>
            )}

            {/* 5. 原文纯文本分段 */}
            {activeSegment === "raw" && (
              <VStack
                padding={16}
                spacing={10}
                background="secondarySystemBackground"
                cornerRadius={16}
              >
                <Text font="headline">录音转写原文</Text>
                {record.dialogues.length === 0 ? (
                  <Text font="caption1" foregroundStyle="secondaryLabel">暂无分段原文</Text>
                ) : (
                  record.dialogues.map((d) => (
                    <VStack key={d.id} spacing={3} alignment="leading">
                      <Text font="caption2" foregroundStyle="systemBlue" fontWeight="bold">
                        {d.speaker} · {formatSeconds(d.timeSec)}
                      </Text>
                      <Text font="body">{d.text}</Text>
                    </VStack>
                  ))
                )}
              </VStack>
            )}
          </VStack>
        </ScrollView>
      </VStack>
    </NavigationStack>
  );
}
