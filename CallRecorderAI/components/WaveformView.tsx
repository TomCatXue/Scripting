import {
  HStack,
  VStack
} from "scripting";

export interface WaveformViewProps {
  progressRatio?: number; // 0 ~ 1 进度
  height?: number;
  animated?: boolean;
}

export function WaveformView({
  progressRatio = 0,
  height = 54
}: WaveformViewProps) {
  // 模拟设计图中的对称/起伏声波柱高度 (32根细柱)
  const pattern = [
    8, 14, 22, 16, 28, 38, 26, 44, 34, 48, 40, 52, 36, 46, 28, 40,
    30, 48, 38, 52, 34, 46, 26, 38, 30, 22, 16, 24, 18, 12, 16, 8
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
        // 参照设计图：左侧与前半部分为清爽科技青蓝，后半部分为淡蓝灰
        const barColor = isPassed ? "systemBlue" : (idx < pattern.length / 2 ? "systemTeal" : "secondaryLabel");

        return (
          <VStack
            key={idx}
            frame={{ width: 3, height: Math.min(h, height) }}
            background={barColor}
            cornerRadius={2}
          />
        );
      })}
    </HStack>
  );
}
