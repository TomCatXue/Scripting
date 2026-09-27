import {
  useState,
  useEffect,
  useMemo,
  VStack,
  HStack,
  Text,
  Button,
  Spacer,
  Image,
  SharedAudioSession,
  AVPlayer
} from "scripting";

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface AppleNotesAudioCardProps {
  audioPath: string;
  duration: number;
  fileName: string;
  seekTime: number | null;
  onSeekHandled: () => void;
  onCurrentTimeChange?: (current: number, isPlaying: boolean) => void;
}

export function AppleNotesAudioCard({
  audioPath,
  duration: initialDuration,
  fileName,
  seekTime,
  onSeekHandled,
  onCurrentTimeChange
}: AppleNotesAudioCardProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(initialDuration);
  const [rate, setRate] = useState<number>(1.0);

  // 初始化 AVPlayer
  const player = useMemo(() => {
    if (typeof SharedAudioSession !== "undefined") {
      try {
        SharedAudioSession.setCategory("playback", ["defaultToSpeaker"]);
        SharedAudioSession.setActive(true);
      } catch (e) {
        console.warn("SharedAudioSession 配置异常:", e);
      }
    }

    const p = new AVPlayer();
    if (audioPath) {
      const ok = p.setSource(audioPath);
      if (ok) {
        p.onReadyToPlay = () => {
          if (p.duration && p.duration > 0) {
            setDuration(p.duration);
          }
        };
        p.onEnded = () => {
          setIsPlaying(false);
          setCurrentTime(0);
        };
        p.onError = (msg) => {
          console.error("AVPlayer 播放异常:", msg);
          setIsPlaying(false);
        };
      }
    }
    return p;
  }, [audioPath]);

  // 响应外部单句语音条点击跳转播放
  useEffect(() => {
    if (seekTime !== null && seekTime >= 0) {
      player.currentTime = seekTime;
      setCurrentTime(seekTime);
      player.play(rate);
      setIsPlaying(true);
      onSeekHandled();
    }
  }, [seekTime]);

  // 定时刷新播放进度并同步回父级
  useEffect(() => {
    const timer = setInterval(() => {
      if (player && isPlaying) {
        const cur = player.currentTime;
        setCurrentTime(cur);
        onCurrentTimeChange?.(cur, true);
      }
    }, 200);

    return () => {
      clearInterval(timer);
      try {
        player.stop();
        player.dispose();
      } catch {}
    };
  }, [player, isPlaying]);

  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
      onCurrentTimeChange?.(currentTime, false);
    } else {
      player.play(rate);
      setIsPlaying(true);
      onCurrentTimeChange?.(currentTime, true);
    }
  };

  const toggleRate = () => {
    let next = 1.0;
    if (rate === 1.0) next = 1.5;
    else if (rate === 1.5) next = 2.0;
    else next = 1.0;

    setRate(next);
    player.rate = next;
  };

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const waveHeights = [6, 12, 18, 10, 16, 22, 14, 8, 20, 24, 16, 12, 22, 18, 14, 8, 16, 20, 12, 6];

  return (
    <VStack
      padding={14}
      spacing={12}
      background="secondarySystemBackground"
      cornerRadius={16}
    >
      {/* 顶部标题与标签 (SF Symbol) */}
      <HStack alignment="center" spacing={6}>
        <Image systemName="waveform.badge.mic" font={12} foregroundStyle="systemIndigo" />
        <Text font="caption1" fontWeight="bold" foregroundStyle="systemIndigo">
          全程录音
        </Text>
        <Text font="caption2" foregroundStyle="tertiaryLabel">
          · {fileName || "recording.m4a"}
        </Text>
        <Spacer />
        <Button
          title={`${rate.toFixed(1)}x`}
          action={toggleRate}
        />
      </HStack>

      {/* 核心控制行：大播放键 (SF Symbol) + 备忘录波形拟态 + 时间 */}
      <HStack alignment="center" spacing={12}>
        {/* 备忘录圆形原生播放按键 */}
        <Button
          title=" "
          systemImage={isPlaying ? "pause.fill" : "play.fill"}
          action={togglePlay}
        />

        {/* 备忘录声波拟态条 */}
        <HStack alignment="center" spacing={3}>
          {waveHeights.map((h, i) => {
            const barRatio = i / waveHeights.length;
            const isPassed = barRatio <= progressRatio;
            return (
              <VStack
                key={i}
                frame={{ width: 3, height: h }}
                background={isPassed ? "systemIndigo" : "tertiarySystemFill"}
                cornerRadius={2}
              />
            );
          })}
        </HStack>

        <Spacer />

        {/* 时间显示 */}
        <Text font="caption1" foregroundStyle="secondaryLabel" monospacedDigit>
          {formatSeconds(currentTime)} / {formatSeconds(duration || initialDuration)}
        </Text>
      </HStack>
    </VStack>
  );
}
