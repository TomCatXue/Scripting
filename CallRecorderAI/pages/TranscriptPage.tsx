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

  // 快退 15 秒 / 快进 15 秒
  const handleSkip = (delta: number) => {
    const nextTime = Math.max(0, Math.min(duration, currentTime + delta));
    player.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  // 单句翻译（调用 Apple 原生翻译或 OpenAI 格式）
  const handleTranslateItem = async (item: DialogueItem) => {
    if (translatedMap[item.id]) {
      // 切换折叠
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

  // 过滤对话列表
  const displayedDialogues = useMemo(() => {
    return record.dialogues.filter((d) => {
      if (activeTab === "key" && !d.isKeyPoint && !d.text.includes("80%")) {
        return false;
      }
      if (filterSpeaker !== "all" && !d.speaker.includes(filterSpeaker)) {
        return false;
      }
      if (searchQuery && !d.text.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
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
        {/* 顶部胶囊分段选项卡 (设计图样式) */}
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

        {/* 筛选与搜索快捷栏 */}
        <HStack padding={6} spacing={8} alignment="center">
          <Button
            title={filterSpeaker === "all" ? "全部发言人 ▾" : `仅看: ${filterSpeaker}`}
            action={() => {
              setFilterSpeaker(filterSpeaker === "all" ? "1" : filterSpeaker === "1" ? "2" : "all");
            }}
          />
          <Spacer />
          <Text font="caption1" foregroundStyle="secondaryLabel">
            点击单句文字联动回听原声 🔊
          </Text>
        </HStack>

        {/* 逐句分角色对话记录列表 (带回听联动高亮与翻译) */}
        <ScrollView>
          <VStack spacing={16} padding={12}>
            {displayedDialogues.map((item) => {
              const isSpeaker1 = item.speaker.includes("1") || item.speaker.includes("我");
              const isCurrentPlaying =
                isPlaying &&
                currentTime >= item.timeSec &&
                currentTime <= item.timeSec + (item.durationSec || 6);

              return (
                <VStack
                  key={item.id}
                  spacing={6}
                  padding={10}
                  background={isCurrentPlaying ? "systemIndigo" : "secondarySystemBackground"}
                  cornerRadius={12}
                >
                  <HStack alignment="center" spacing={8}>
                    {/* 发言人胶囊徽标 (设计图样式: 蓝色/绿色) */}
                    <Text
                      font="caption1"
                      fontWeight="bold"
                      foregroundStyle={isCurrentPlaying ? "white" : (isSpeaker1 ? "systemBlue" : "systemGreen")}
                    >
                      {item.speaker}
                    </Text>

                    {/* 时间戳 */}
                    <Text
                      font="caption2"
                      foregroundStyle={isCurrentPlaying ? "white" : "tertiaryLabel"}
                    >
                      {formatSeconds(item.timeSec)}
                    </Text>

                    <Spacer />

                    {/* 单句即时翻译按钮 */}
                    <Button
                      title={translatedMap[item.id] ? "收起译文" : (isTranslating === item.id ? "翻译中…" : "🌐 翻译")}
                      action={() => handleTranslateItem(item)}
                    />

                    {/* 回听联动按钮 */}
                    <Button
                      title={isCurrentPlaying ? "🔊 正在播放" : "▶️ 听这句"}
                      action={() => handleSeekAndPlay(item.timeSec)}
                    />
                  </HStack>

                  {/* 对白正文 (点击整句直接联动回听) */}
                  <Button
                    title={item.text}
                    action={() => handleSeekAndPlay(item.timeSec)}
                  />

                  {/* 中英译文呈现 (调用翻译服务) */}
                  {translatedMap[item.id] && (
                    <VStack padding={8} background="tertiarySystemFill" cornerRadius={8}>
                      <Text font="caption1" foregroundStyle="systemBlue">
                        [译文] {translatedMap[item.id]}
                      </Text>
                    </VStack>
                  )}
                </VStack>
              );
            })}
          </VStack>
        </ScrollView>

        {/* 底部固定音频控制条 (设计图第 2 屏: 进度条 + 15秒快退 + 播放 + 15秒快进) */}
        <VStack
          padding={12}
          spacing={8}
          background="secondarySystemBackground"
          cornerRadius={16}
        >
          <HStack alignment="center">
            <Text font="caption2" foregroundStyle="secondaryLabel">
              {formatSeconds(currentTime)}
            </Text>
            <Spacer />
            <Text font="caption2" foregroundStyle="secondaryLabel">
              {formatSeconds(duration)}
            </Text>
          </HStack>

          <HStack alignment="center" spacing={24}>
            <Spacer />
            {/* 快退 15 秒 */}
            <Button
              title="⏮ 15s"
              action={() => handleSkip(-15)}
            />

            {/* 播放 / 暂停大圆形按钮 */}
            <Button
              title={isPlaying ? " ⏸ 暂停 " : " ▶️ 播放 "}
              action={handleTogglePlay}
            />

            {/* 快进 15 秒 */}
            <Button
              title="15s ⏭"
              action={() => handleSkip(15)}
            />
            <Spacer />
          </HStack>
        </VStack>
      </VStack>
    </NavigationStack>
  );
}
