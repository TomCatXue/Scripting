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
  const [activeTab, setActiveTab] = useState<"transcript" | "key" | "speakers" | "timeline">("transcript");
  const [filterSpeaker, setFilterSpeaker] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // 播放状态：对齐原图第2屏进度 00:12:36 与总时长 01:02:18
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

  // 点字回听联动
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

  // 计算播放进度比
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
              systemImage="chevron.backward"
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
        {/* 1. 顶部 Tab 胶囊切换栏 (原图第2屏: 转写 / 重点 / 发言人 / 时间轴) */}
        <HStack
          padding={4}
          spacing={4}
          background="secondarySystemBackground"
          cornerRadius={14}
          alignment="center"
        >
          {/* 转写 Tab */}
          <HStack
            padding={8}
            background={activeTab === "transcript" ? "systemBackground" : "clear"}
            cornerRadius={10}
          >
            <Button
              title="转写"
              action={() => setActiveTab("transcript")}
            />
          </HStack>
          <Spacer />

          {/* 重点 Tab */}
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

          {/* 发言人 Tab */}
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

          {/* 时间轴 Tab */}
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

        {/* 2. 筛选过滤与搜索栏 (原图第2屏: 全部发言人 ▾ 与 🔍 搜索内容) */}
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
                  ? "发言人1 ▾"
                  : "发言人2 ▾"
              }
              action={() => {
                setFilterSpeaker(
                  filterSpeaker === "all" ? "1" : filterSpeaker === "1" ? "2" : "all"
                );
              }}
            />
          </HStack>

          <Spacer />

          <HStack
            padding={6}
            background="secondarySystemBackground"
            cornerRadius={10}
            spacing={6}
            alignment="center"
          >
            <Image systemName="magnifyingglass" font={12} foregroundStyle="secondaryLabel" />
            <Button
              title={searchQuery ? `"${searchQuery}"` : "搜索内容"}
              action={() => {
                setSearchQuery(searchQuery ? "" : "80%");
              }}
            />
          </HStack>
        </HStack>

        {/* 3. 逐句转写列表 (原图左侧时间戳 + 右侧发言人及带重点高亮的内容) */}
        <ScrollView>
          <VStack spacing={16} padding={8}>
            {displayedDialogues.map((item) => {
              const isSpeaker1 = item.speaker.includes("1");
              const isPlayingThis =
                isPlaying &&
                currentTime >= item.timeSec &&
                currentTime <= item.timeSec + item.durationSec;

              return (
                <HStack key={item.id} alignment="top" spacing={12}>
                  {/* 左侧时间戳 (原图: 00:00, 00:08, 00:15...) */}
                  <VStack alignment="leading" frame={{ width: 44 }}>
                    <Text
                      font="subheadline"
                      foregroundStyle="tertiaryLabel"
                      monospacedDigit
                    >
                      {formatSeconds(item.timeSec)}
                    </Text>
                  </VStack>

                  {/* 右侧发言人徽标 + 文字内容 */}
                  <VStack spacing={6} alignment="leading">
                    {/* 发言人胶囊 */}
                    <HStack spacing={4} alignment="center">
                      <Image
                        systemName={isSpeaker1 ? "person.crop.circle.fill" : "person.crop.circle"}
                        font={12}
                        foregroundStyle={isSpeaker1 ? "systemBlue" : "systemGreen"}
                      />
                      <Text
                        font="caption1"
                        fontWeight="bold"
                        foregroundStyle={isSpeaker1 ? "systemBlue" : "systemGreen"}
                      >
                        {item.speaker}
                      </Text>
                    </HStack>

                    {/* 正文气泡文本（支持浅蓝高亮标记） */}
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

                    {/* 双语翻译输出 */}
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

        {/* 4. 底部固定音频控制条 (原图第2屏: 细滑轨进度 + 15s快退 + 蓝色播放圆钮 + 15s快进) */}
        <VStack
          padding={14}
          spacing={10}
          background="secondarySystemBackground"
          cornerRadius={20}
        >
          {/* 进度条指示 */}
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

          {/* 播放控制按钮行 */}
          <HStack alignment="center" spacing={36}>
            <Spacer />

            {/* 快退 15 秒 */}
            <Button
              title=" "
              systemImage="gobackward.15"
              action={() => handleSkip(-15)}
            />

            {/* 大蓝色播放/暂停主按键 */}
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

            {/* 快进 15 秒 */}
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
