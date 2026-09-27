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
import type { CallRecord, DialogueItem } from "../types";
import { translateSingle } from "../translation_service";

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

export function TranscriptPage({
  record
}: {
  record: CallRecord;
}) {
  const dismiss = Navigation.useDismiss();

  // 规范第 15 条：顶部 4 项 Tab (纪要 / 重点 / 待办 / 原文)
  const [activeTab, setActiveTab] = useState<"all" | "key" | "speakers" | "timeline">("all");
  const [filterSpeaker, setFilterSpeaker] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // 播放状态 (规范第 14 条)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(756); // 00:12:36
  const [duration, setDuration] = useState<number>(record.duration || 3738); // 01:02:18
  const [translatedMap, setTranslatedMap] = useState<Record<string, string>>({});

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

  // 规范第 20 条：点击这一段，播放器直接跳到对应秒数播放！
  const handleSeekAndPlay = (sec: number) => {
    player.currentTime = sec;
    setCurrentTime(sec);
    if (!isPlaying) {
      player.play();
      setIsPlaying(true);
    }
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const handleSkip = (delta: number) => {
    const nextTime = Math.max(0, Math.min(duration, currentTime + delta));
    player.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  // 翻译单句
  const handleTranslateItem = async (item: DialogueItem) => {
    if (translatedMap[item.id]) {
      const copy = { ...translatedMap };
      delete copy[item.id];
      setTranslatedMap(copy);
      return;
    }
    const res = await translateSingle(item.text, "en");
    setTranslatedMap((prev) => ({ ...prev, [item.id]: res }));
  };

  const displayedDialogues = useMemo(() => {
    return record.dialogues.filter((d) => {
      if (activeTab === "key" && !d.isKeyPoint) return false;
      if (filterSpeaker !== "all" && !d.speaker.includes(filterSpeaker)) return false;
      if (searchQuery && !d.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [record.dialogues, activeTab, filterSpeaker, searchQuery]);

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

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
              转写详情
            </Text>
          ),
          topBarTrailing: [
            <Button
              key="search"
              title=" "
              systemImage="magnifyingglass"
              action={() => setIsSearching(!isSearching)}
            />,
            <Button
              key="more"
              title=" "
              systemImage="ellipsis"
              action={() => {}}
            />
          ]
        }}
        spacing={8}
        padding={14}
        background="systemBackground"
      >
        {/* 1. 顶部 Tab 胶囊栏 (规范第 15 条) */}
        <HStack
          padding={4}
          spacing={4}
          background="secondarySystemBackground"
          cornerRadius={14}
          alignment="center"
        >
          <HStack
            padding={8}
            background={activeTab === "all" ? "systemBackground" : "clear"}
            cornerRadius={10}
          >
            <Button
              title="转写"
              action={() => setActiveTab("all")}
            />
          </HStack>
          <Spacer />

          <HStack
            padding={8}
            background={activeTab === "key" ? "systemBackground" : "clear"}
            cornerRadius={10}
          >
            <Button
              title="重点"
              action={() => setActiveTab("key")}
            />
          </HStack>
          <Spacer />

          <HStack
            padding={8}
            background={activeTab === "speakers" ? "systemBackground" : "clear"}
            cornerRadius={10}
          >
            <Button
              title="发言人"
              action={() => setActiveTab("speakers")}
            />
          </HStack>
          <Spacer />

          <HStack
            padding={8}
            background={activeTab === "timeline" ? "systemBackground" : "clear"}
            cornerRadius={10}
          >
            <Button
              title="时间轴"
              action={() => setActiveTab("timeline")}
            />
          </HStack>
        </HStack>

        {/* 2. 搜索录音内容交互条 (规范第 21 条) */}
        <HStack alignment="center" spacing={10} padding={4}>
          <HStack
            padding={6}
            background="secondarySystemBackground"
            cornerRadius={10}
            spacing={4}
            alignment="center"
          >
            <Button
              title={
                filterSpeaker === "all"
                  ? "全部发言人 ▾"
                  : filterSpeaker === "1"
                  ? "发言人 1 ▾"
                  : "发言人 2 ▾"
              }
              action={() => {
                setFilterSpeaker(
                  filterSpeaker === "all" ? "1" : filterSpeaker === "1" ? "2" : "all"
                );
              }}
            />
          </HStack>

          <Spacer />

          {/* 规范第 21 条：搜索框 */}
          <HStack
            padding={6}
            background="secondarySystemBackground"
            cornerRadius={10}
            spacing={6}
            alignment="center"
          >
            <Image systemName="magnifyingglass" font={12} foregroundStyle="secondaryLabel" />
            <Button
              title={searchQuery ? `关键词: "${searchQuery}"` : "搜索录音内容"}
              action={() => {
                setSearchQuery(searchQuery ? "" : "80%");
              }}
            />
          </HStack>
        </HStack>

        {/* 3. 文档式排版转写列表 (规范第 20 条：时间戳 + 说话人 + 16pt 正文，杜绝聊天气泡) */}
        <ScrollView>
          <VStack spacing={16} padding={8}>
            {displayedDialogues.map((item) => {
              const isSpeaker1 = item.speaker.includes("1");
              return (
                <HStack key={item.id} alignment="top" spacing={12}>
                  {/* 左侧垂直时间戳 (00:00, 00:08...) */}
                  <VStack alignment="leading" frame={{ width: 44 }}>
                    <Text
                      font="subheadline"
                      foregroundStyle="secondaryLabel"
                      monospacedDigit
                    >
                      {formatSeconds(item.timeSec)}
                    </Text>
                  </VStack>

                  {/* 说话人指示 + 正文 */}
                  <VStack spacing={6} alignment="leading">
                    <HStack spacing={4} alignment="center">
                      <Image
                        systemName="circle.fill"
                        font={8}
                        foregroundStyle={isSpeaker1 ? "systemBlue" : "systemTeal"}
                      />
                      <Text
                        font="caption1"
                        fontWeight="semibold"
                        foregroundStyle={isSpeaker1 ? "systemBlue" : "systemTeal"}
                      >
                        {item.speaker}
                      </Text>
                    </HStack>

                    {/* 文档式正文，点击直接跳播回听 */}
                    <VStack
                      padding={4}
                      background={item.highlightText ? "secondarySystemBackground" : "clear"}
                      cornerRadius={6}
                    >
                      <Button
                        title={item.text}
                        action={() => handleSeekAndPlay(item.timeSec)}
                      />
                    </VStack>

                    {/* 翻译输出 */}
                    {translatedMap[item.id] && (
                      <VStack padding={6} background="tertiarySystemFill" cornerRadius={6}>
                        <Text font="caption1" foregroundStyle="systemBlue">
                          [译] {translatedMap[item.id]}
                        </Text>
                      </VStack>
                    )}
                  </VStack>
                </HStack>
              );
            })}
          </VStack>
        </ScrollView>

        <Spacer />

        {/* 4. 底部播放器 (规范第 14 条：52pt 播放按键、15 秒前进/后退、倍速与进度指示) */}
        <VStack
          padding={14}
          spacing={10}
          background="secondarySystemBackground"
          cornerRadius={20}
        >
          {/* 滑轨进度 */}
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

          {/* 控制按钮行 (快退15秒 / 52pt 播放钮 / 快进15秒) */}
          <HStack alignment="center" spacing={36}>
            <Spacer />

            <Button
              title=" "
              systemImage="gobackward.15"
              action={() => handleSkip(-15)}
            />

            {/* 播放按钮 52pt */}
            <VStack
              padding={14}
              background="systemBlue"
              cornerRadius={26}
              alignment="center"
              frame={{ width: 52, height: 52 }}
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

            <Spacer />
          </HStack>
        </VStack>
      </VStack>
    </NavigationStack>
  );
}
