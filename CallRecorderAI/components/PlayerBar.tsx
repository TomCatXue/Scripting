import {
  useState,
  useEffect,
  useMemo
} from "react";
import {
  VStack,
  HStack,
  Text,
  Button,
  Spacer,
  SharedAudioSession,
  AVPlayer
} from "scripting";

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface PlayerBarProps {
  audioPath: string;
  duration: number;
  seekTime: number | null;
  onSeekHandled: () => void;
}

export function PlayerBar({
  audioPath,
  duration: initialDuration,
  seekTime,
  onSeekHandled
}: PlayerBarProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(initialDuration);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);

  // 初始化 AVPlayer
  const player = useMemo(() => {
    if (typeof SharedAudioSession !== "undefined") {
      try {
        SharedAudioSession.setCategory("playback", ["defaultToSpeaker"]);
        SharedAudioSession.setActive(true);
      } catch (e) {
        console.warn("SharedAudioSession 配置警告:", e);
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

  // 监听外部跳转播放请求（例如用户在对话流中点击了“听这句”）
  useEffect(() => {
    if (seekTime !== null && seekTime >= 0) {
      player.currentTime = seekTime;
      setCurrentTime(seekTime);
      player.play(playbackRate);
      setIsPlaying(true);
      onSeekHandled();
    }
  }, [seekTime]);

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
      } catch {
        // 忽略释放异常
      }
    };
  }, [player, isPlaying]);

  // 播放 / 暂停切换
  const handleTogglePlay = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play(playbackRate);
      setIsPlaying(true);
    }
  };

  // 倍速切换循坏：1.0x -> 1.25x -> 1.5x -> 2.0x -> 1.0x
  const handleToggleRate = () => {
    let next = 1.0;
    if (playbackRate === 1.0) next = 1.25;
    else if (playbackRate === 1.25) next = 1.5;
    else if (playbackRate === 1.5) next = 2.0;
    else next = 1.0;

    setPlaybackRate(next);
    player.rate = next;
  };

  return (
    <VStack
      padding={14}
      spacing={10}
      background="secondarySystemBackground"
      cornerRadius={14}
    >
      <HStack alignment="center" spacing={12}>
        {/* 播放/暂停大按钮 */}
        <Button
          title={isPlaying ? "⏸ 暂停" : "▶️ 播放原声"}
          action={handleTogglePlay}
        />

        {/* 播放时间与总时长 */}
        <Text font="subheadline" foregroundColor="secondaryLabel">
          {formatSeconds(currentTime)} / {formatSeconds(duration || initialDuration)}
        </Text>

        <Spacer />

        {/* 倍速切换 */}
        <Button
          title={`${playbackRate.toFixed(2).replace(/\.00$/, "")}x`}
          action={handleToggleRate}
        />
      </HStack>
    </VStack>
  );
}
