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

export function TranscriptPage({
  record
}: {
  record: CallRecord;
}) {
  const dismiss = Navigation.useDismiss();
  const [activeTab, setActiveTab] = useState<"all" | "key" | "speakers" | "timeline">("all");
  const [filterSpeaker, setFilterSpeaker] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 音频播放与回听联动状态
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(record.duration || 60);
  const [translatedMap, setTranslatedMap] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState<string | null>(null);

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

  // 回听联动：点击文字或时间，跳转到对应录音时间播放
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

  // 快退 15 秒 / 快进 15 秒 (SF Symbols)
  const handleSkip = (delta: number) => {
    const nextTime = Math.max(0, Math.min(duration, currentTime + delta));
    player.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  // 单句即时翻译
  const handleTranslateItem = async (item: DialogueItem) => {
    if (translatedMap[item.id]) {
      const copy = { ...translatedMap };
      delete copy[item.id];
      setTranslatedMap(copy);
      return;
    }

    setIsTranslating(item.id);
    try {
      const translated = await translateSingle(item.text, "en");
      setTranslatedMap((prev) => ({ ...prev, [item.id]: translated }));
    } finally {
      setIsTranslating(null);
    }
  };

  const displayedDialogues = useMemo(() => {
    return record.dialogues.filter((d) => {
      if (activeTab === "key" && !d.isKeyPoint) return false;
      if (filterSpeaker !== "all" && !d.speaker.includes(filterSpeaker)) return false;
      if (searchQuery && !d.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [record.dialogues, activeTab, filterSpeaker, searchQuery]);

  return (
    <NavigationStack>
      <VStack
        navigationTitle="转写详情"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: (
            <Button title="返回" action={dismiss} />
          )
        }}
        spacing={10}
      >
        {/* 顶部胶囊分段选项卡 (设计图第2屏) */}
        <HStack padding={8} spacing={8} background="secondarySystemBackground" cornerRadius={12}>
          <Button
            title={activeTab === "all" ? "• 转写 •" : "转写"}
            action={() => setActiveTab("all")}
          />
          <Spacer />
          <Button
            title={activeTab === "key" ? "• 重点 •" : "重点"}
            action={() => setActiveTab("key")}
          />
          <Spacer />
          <Button
            title={activeTab === "speakers" ? "• 发言人 •" : "发言人"}
            action={() => setActiveTab("speakers")}
          />
          <Spacer />
          <Button
            title={activeTab === "timeline" ? "• 时间轴 •" : "时间轴"}
            action={() => setActiveTab("timeline")}
          />
        </HStack>

        {/* 筛选与搜索快捷栏 (SF Symbols) */}
        <HStack padding={6} spacing={8} alignment="center">
          <Button
            title={filterSpeaker === "all" ? "全部发言人 ▾" : `筛选: ${filterSpeaker}`}
            action={() => {
              setFilterSpeaker(filterSpeaker === "all" ? "1" : filterSpeaker === "1" ? "2" : "all");
            }}
          />
          <Spacer />
          <HStack alignment="center" spacing={4}>
            <Image systemName="hand.tap.fill" font={12} foregroundStyle="systemBlue" />
            <Text font="caption1" foregroundStyle="secondaryLabel">
              点击文字直接跳跃回听
            </Text>
          </HStack>
        </HStack>

        {/* 逐句分角色列表 (设计图样式) */}
        <ScrollView>
          <VStack spacing={14} padding={12}>
            {displayedDialogues.length === 0 ? (
              <VStack padding={40} alignment="center" spacing={8}>
                <Image systemName="text.bubble" font={30} foregroundStyle="secondaryLabel" />
                <Text font="body" foregroundStyle="secondaryLabel">
                  暂无分句对白数据
                </Text>
                <Text font="caption1" foregroundStyle="tertiaryLabel">
                  可使用备忘录听写文本或在设置中配置语音模型
                </Text>
              </VStack>
            ) : (
              displayedDialogues.map((item) => {
                const isSpeaker1 = item.speaker.includes("1") || item.speaker.includes("我");
                const isCurrentPlaying =
                  isPlaying &&
                  currentTime >= item.timeSec &&
                  currentTime <= item.timeSec + (item.durationSec || 6);

                return (
                  <VStack
                    key={item.id}
                    spacing={6}
                    padding={12}
                    background={isCurrentPlaying ? "systemIndigo" : "secondarySystemBackground"}
                    cornerRadius={14}
                  >
                    <HStack alignment="center" spacing={8}>
                      {/* 发言人小胶囊 */}
                      <HStack
                        padding={4}
                        background={isCurrentPlaying ? "white" : (isSpeaker1 ? "systemBlue" : "systemGreen")}
                        cornerRadius={6}
                        alignment="center"
                        spacing={3}
                      >
                        <Image
                          systemName="person.fill"
                          font={9}
                          foregroundStyle={isCurrentPlaying ? "systemIndigo" : "white"}
                        />
                        <Text
                          font="caption2"
                          fontWeight="bold"
                          foregroundStyle={isCurrentPlaying ? "systemIndigo" : "white"}
                        >
                          {item.speaker}
                        </Text>
                      </HStack>

                      {/* 时间戳 */}
                      <Text
                        font="caption2"
                        foregroundStyle={isCurrentPlaying ? "white" : "tertiaryLabel"}
                      >
                        {formatSeconds(item.timeSec)}
                      </Text>

                      <Spacer />

                      {/* 单句翻译按钮 (SF Symbol) */}
                      <Button
                        title={translatedMap[item.id] ? "收起" : (isTranslating === item.id ? "…" : "译")}
                        systemImage="translate"
                        action={() => handleTranslateItem(item)}
                      />

                      {/* 回听联动按钮 (SF Symbol) */}
                      <Button
                        title={isCurrentPlaying ? "播放中" : "回听"}
                        systemImage={isCurrentPlaying ? "speaker.wave.2.fill" : "play.fill"}
                        action={() => handleSeekAndPlay(item.timeSec)}
                      />
                    </HStack>

                    {/* 文字内容（点文字直接跳播） */}
                    <Button
                      title={item.text}
                      action={() => handleSeekAndPlay(item.timeSec)}
                    />

                    {/* 双语翻译输出 */}
                    {translatedMap[item.id] && (
                      <VStack padding={8} background="tertiarySystemFill" cornerRadius={8}>
                        <Text font="caption1" foregroundStyle="systemBlue">
                          [译] {translatedMap[item.id]}
                        </Text>
                      </VStack>
                    )}
                  </VStack>
                );
              })
            )}
          </VStack>
        </ScrollView>

        {/* 底部固定播放控制条 (设计图第2屏底部: 15s快退 + 播放 + 15s快进) */}
        <VStack
          padding={12}
          spacing={8}
          background="secondarySystemBackground"
          cornerRadius={16}
        >
          <HStack alignment="center">
            <Text font="caption2" foregroundStyle="secondaryLabel" monospacedDigit>
              {formatSeconds(currentTime)}
            </Text>
            <Spacer />
            <Text font="caption2" foregroundStyle="secondaryLabel" monospacedDigit>
              {formatSeconds(duration)}
            </Text>
          </HStack>

          <HStack alignment="center" spacing={28}>
            <Spacer />
            {/* 快退 15 秒 (SF Symbol) */}
            <Button
              title=" "
              systemImage="gobackward.15"
              action={() => handleSkip(-15)}
            />

            {/* 播放 / 暂停大按键 (SF Symbol) */}
            <Button
              title=" "
              systemImage={isPlaying ? "pause.circle.fill" : "play.circle.fill"}
              action={handleTogglePlay}
            />

            {/* 快进 15 秒 (SF Symbol) */}
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
