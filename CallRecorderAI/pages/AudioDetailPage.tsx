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
import { MinutesPage } from "./MinutesPage";
import { TranscriptPage } from "./TranscriptPage";

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function AudioDetailPage({
  record
}: {
  record: CallRecord;
}) {
  const dismiss = Navigation.useDismiss();

  // 播放器状态 (规范第 14 条)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(756); // 00:12:36
  const [duration, setDuration] = useState<number>(record.duration || 3738); // 01:02:18
  const [rate, setRate] = useState<number>(1.0);

  // 规范第 15 条：播放器下 Tab (纪要 / 重点 / 待办 / 原文)
  const [activeTab, setActiveTab] = useState<"minutes" | "key" | "todo" | "raw">("minutes");
  const [isExpandedTimeline, setIsExpandedTimeline] = useState<boolean>(true);

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

  // 播放进度监听
  useEffect(() => {
    const timer = setInterval(() => {
      if (player && isPlaying) {
        if (player.currentTime > 0) {
          setCurrentTime(player.currentTime);
        } else {
          setCurrentTime((prev) => Math.min(duration, prev + 0.25));
        }
      }
    }, 250);
    return () => {
      clearInterval(timer);
      try {
        player.stop();
        player.dispose();
      } catch {}
    };
  }, [player, isPlaying, duration]);

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

  const handleSkip = (delta: number) => {
    const next = Math.max(0, Math.min(duration, currentTime + delta));
    player.currentTime = next;
    setCurrentTime(next);
  };

  const toggleRate = () => {
    const next = rate === 1.0 ? 1.5 : rate === 1.5 ? 2.0 : 1.0;
    setRate(next);
    player.rate = next;
  };

  const handleOpenMinutesPage = async () => {
    await Navigation.present({
      element: <MinutesPage record={record} />
    });
  };

  const handleOpenTranscriptPage = async () => {
    await Navigation.present({
      element: <TranscriptPage record={record} />
    });
  };

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const timelineItems = record.chapters && record.chapters.length > 0 ? record.chapters : [
    { id: "c0", timeSec: 0, title: "会议开始，项目进展回顾" },
    { id: "c1", timeSec: 8, title: "开发进度完成 80%" },
    { id: "c2", timeSec: 15, title: "测试计划及时间安排" },
    { id: "c3", timeSec: 21, title: "用户反馈问题讨论" },
    { id: "c4", timeSec: 32, title: "后续优化方向" },
    { id: "c5", timeSec: 48, title: "会议总结" }
  ];

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
            <Text font="headline" fontWeight="bold">
              录音详情
            </Text>
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
        padding={14}
        background="systemBackground"
      >
        <ScrollView>
          <VStack spacing={14} padding={4}>
            {/* 1. 录音基础信息卡片 (规范第 13 条: 标题、日期、时长、2 位说话人、✨ AI 纪要已生成) */}
            <VStack
              padding={16}
              spacing={8}
              background="secondarySystemBackground"
              cornerRadius={18}
            >
              <HStack alignment="center" spacing={12}>
                <VStack
                  padding={8}
                  background="systemBlue"
                  cornerRadius={10}
                  frame={{ width: 38, height: 38 }}
                  alignment="center"
                >
                  <Text font="headline" foregroundStyle="white" fontWeight="bold">
                    D
                  </Text>
                </VStack>

                <VStack spacing={4} alignment="leading">
                  <Text font="headline" fontWeight="bold">
                    {record.title}
                  </Text>
                  <Text font="subheadline" foregroundStyle="secondaryLabel">
                    {record.minutes.dateStr}
                  </Text>
                  <HStack alignment="center" spacing={8}>
                    <Text font="caption1" foregroundStyle="secondaryLabel">
                      1小时18分钟 · 2位说话人
                    </Text>
                    {/* ✨ AI 纪要状态标签 (规范第 22 条) */}
                    <HStack
                      padding={3}
                      background="systemBackground"
                      cornerRadius={6}
                      spacing={3}
                      alignment="center"
                    >
                      <Image systemName="sparkles" font={9} foregroundStyle="systemTeal" />
                      <Text font="caption2" foregroundStyle="systemTeal" fontWeight="bold">
                        ✨ AI 纪要已生成
                      </Text>
                    </HStack>
                  </HStack>
                </VStack>

                <Spacer />
              </HStack>
            </VStack>

            {/* 2. 播放器卡片 (规范第 14 条: 柱状波形、播放按键、15 秒快退/快进、倍速、时间滑轨) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={18}
            >
              {/* 波形 */}
              <HStack alignment="center">
                <Spacer />
                <WaveformView
                  progressRatio={progressRatio}
                  height={50}
                  mode="playback"
                />
                <Spacer />
              </HStack>

              {/* 进度指示 */}
              <VStack spacing={4}>
                <HStack alignment="center">
                  <VStack
                    frame={{ width: Math.max(8, progressRatio * 260), height: 3 }}
                    background="systemBlue"
                    cornerRadius={2}
                  />
                  <VStack
                    frame={{ width: 8, height: 8 }}
                    background="systemBlue"
                    cornerRadius={4}
                  />
                  <VStack
                    frame={{ height: 3 }}
                    background="tertiarySystemFill"
                    cornerRadius={2}
                  />
                </HStack>

                <HStack alignment="center">
                  <Text font="caption2" foregroundStyle="secondaryLabel" monospacedDigit>
                    {formatHours(currentTime)}
                  </Text>
                  <Spacer />
                  <Text font="caption2" foregroundStyle="secondaryLabel" monospacedDigit>
                    {formatHours(duration)}
                  </Text>
                </HStack>
              </VStack>

              {/* 控制行 */}
              <HStack alignment="center" spacing={24}>
                <Spacer />

                <Button
                  title=" "
                  systemImage="gobackward.15"
                  action={() => handleSkip(-15)}
                />

                <VStack
                  padding={12}
                  background="systemBlue"
                  cornerRadius={24}
                  alignment="center"
                  frame={{ width: 48, height: 48 }}
                >
                  <Button
                    title=" "
                    systemImage={isPlaying ? "pause.fill" : "play.fill"}
                    action={handleTogglePlay}
                  />
                </VStack>

                <Button
                  title=" "
                  systemImage="goforward.15"
                  action={() => handleSkip(15)}
                />

                <HStack
                  padding={4}
                  background="systemBackground"
                  cornerRadius={8}
                >
                  <Button
                    title={`${rate.toFixed(1)}x`}
                    action={toggleRate}
                  />
                </HStack>

                <Spacer />
              </HStack>
            </VStack>

            {/* 3. 播放器下方 Tab (规范第 15 条: 纪要 / 重点 / 待办 / 原文) */}
            <HStack alignment="center" spacing={16} padding={4}>
              <VStack alignment="center" spacing={4}>
                <Button
                  title="纪要"
                  action={() => {
                    setActiveTab("minutes");
                    handleOpenMinutesPage();
                  }}
                />
                {activeTab === "minutes" && (
                  <VStack frame={{ width: 32, height: 2 }} background="systemTeal" cornerRadius={1} />
                )}
              </VStack>

              <VStack alignment="center" spacing={4}>
                <Button
                  title="重点"
                  action={() => setActiveTab("key")}
                />
                {activeTab === "key" && (
                  <VStack frame={{ width: 32, height: 2 }} background="systemTeal" cornerRadius={1} />
                )}
              </VStack>

              <VStack alignment="center" spacing={4}>
                <Button
                  title="待办"
                  action={() => setActiveTab("todo")}
                />
                {activeTab === "todo" && (
                  <VStack frame={{ width: 32, height: 2 }} background="systemTeal" cornerRadius={1} />
                )}
              </VStack>

              <VStack alignment="center" spacing={4}>
                <Button
                  title="原文"
                  action={() => {
                    setActiveTab("raw");
                    handleOpenTranscriptPage();
                  }}
                />
                {activeTab === "raw" && (
                  <VStack frame={{ width: 32, height: 2 }} background="systemTeal" cornerRadius={1} />
                )}
              </VStack>

              <Spacer />
            </HStack>

            {/* 4. 时间轴功能 (规范第 19 条: 竖向连线 + 实心圆点 + 点击跳转回播) */}
            <VStack
              padding={16}
              spacing={12}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="leading"
            >
              <Text font="headline" fontWeight="bold">
                时间轴
              </Text>

              <VStack spacing={12}>
                {timelineItems.slice(0, isExpandedTimeline ? timelineItems.length : 3).map((item) => {
                  const isCurrent = currentTime >= item.timeSec && currentTime < item.timeSec + 15;
                  return (
                    <HStack key={item.id} alignment="center" spacing={8}>
                      {/* 实心圆点 */}
                      <VStack
                        frame={{ width: 8, height: 8 }}
                        background={isCurrent ? "systemBlue" : "systemTeal"}
                        cornerRadius={4}
                      />

                      <Text
                        font="subheadline"
                        foregroundStyle="secondaryLabel"
                        monospacedDigit
                      >
                        {formatSeconds(item.timeSec)}
                      </Text>

                      {/* 点击该节点直接跳播回放 */}
                      <Button
                        title={item.title}
                        action={() => handleSeek(item.timeSec)}
                      />
                    </HStack>
                  );
                })}

                <HStack alignment="center" padding={4}>
                  <Spacer />
                  <Button
                    title={isExpandedTimeline ? "收起时间轴 ⌃" : "展开全部 ⌄"}
                    action={() => setIsExpandedTimeline(!isExpandedTimeline)}
                  />
                  <Spacer />
                </HStack>
              </VStack>
            </VStack>

            {/* 5. 相关文件 */}
            <VStack
              padding={16}
              spacing={10}
              background="secondarySystemBackground"
              cornerRadius={18}
              alignment="leading"
            >
              <Text font="headline" fontWeight="bold">
                相关文件
              </Text>

              <HStack alignment="center" spacing={12}>
                <VStack
                  padding={8}
                  background="systemRed"
                  cornerRadius={10}
                  frame={{ width: 38, height: 38 }}
                  alignment="center"
                >
                  <Image systemName="doc.fill" font={16} foregroundStyle="white" />
                </VStack>

                <VStack spacing={2} alignment="leading">
                  <Text font="subheadline" fontWeight="bold">
                    项目需求文档.pdf
                  </Text>
                  <Text font="caption1" foregroundStyle="secondaryLabel">
                    2.4 MB
                  </Text>
                </VStack>

                <Spacer />

                <Button
                  title=" "
                  systemImage="arrow.down.to.line"
                  action={() => {}}
                />
              </HStack>
            </VStack>
          </VStack>
        </ScrollView>
      </VStack>
    </NavigationStack>
  );
}
