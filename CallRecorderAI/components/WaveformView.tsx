import {
  HStack,
  VStack
} from "scripting";

export interface WaveformViewProps {
  progressRatio?: number; // 0 ~ 1 进度
  height?: number;
  mode?: "recording" | "playback";
}

export function WaveformView({
  progressRatio = 0,
  height = 48,
  mode = "playback"
}: WaveformViewProps) {
  // 精心拟合原图中的 36 根波浪柱起伏高度曲线 (两端渐收，中间呈现两到三个优雅波峰)
  const pattern = [
    6, 10, 16, 24, 18, 30, 42, 28, 36, 48,
    38, 26, 44, 52, 34, 46, 28, 38, 50, 42,
    32, 46, 38, 24, 34, 44, 28, 20, 32, 22,
    16, 26, 18, 12, 14, 6
  ];

  return (
    <HStack
      alignment="center"
      spacing={3}
      frame={{ height }}
    >
      {pattern.map((h, idx) => {
        const barRatio = idx / pattern.length;
        const isPassed = barRatio <= progressRatio;
        const normalizedHeight = Math.max(4, Math.min(height, (h / 52) * height));

        // 颜色映射完全对齐原图：
        // 录音状态：全青绿 (#20D5B0)
        // 播放状态：已播深青蓝 (#0084FF)，未播浅青绿 (#8EE3D5)
        let barColor = "systemTeal";
        if (mode === "playback") {
          barColor = isPassed ? "systemBlue" : "systemTeal";
        }

        return (
          <VStack
            key={idx}
            frame={{ width: 3, height: normalizedHeight }}
            background={barColor}
            cornerRadius={2}
          />
        );
      })}
    </HStack>
  );
}
