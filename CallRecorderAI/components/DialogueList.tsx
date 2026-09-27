import {
  VStack,
  HStack,
  Text,
  Button
} from "scripting";
import type { DialogueItem } from "../types";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface DialogueListProps {
  dialogues: DialogueItem[];
  onPlayAtTime: (timeSec: number) => void;
}

export function DialogueList({ dialogues, onPlayAtTime }: DialogueListProps) {
  if (!dialogues || dialogues.length === 0) {
    return (
      <VStack padding={30} alignment="center" spacing={8}>
        <Text foregroundStyle="secondaryLabel">暂无对话记录</Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={16} padding={16}>
      {dialogues.map((item) => {
        // 判断说话人是 A 还是 B，用于区分左右对齐与气泡颜色
        const isSpeakerA = item.speaker.includes("A") || item.speaker.includes("我");

        return (
          <VStack
            key={item.id}
            alignment={isSpeakerA ? "leading" : "trailing"}
            spacing={6}
          >
            {/* 角色信息与时间戳 */}
            <HStack spacing={8} alignment="center">
              {isSpeakerA && (
                <>
                  <Text font="caption1" foregroundStyle="secondaryLabel">
                    {item.speaker} · {formatTime(item.timeSec)}
                  </Text>
                  <Button
                    title="🔊 听这句"
                    action={() => onPlayAtTime(item.timeSec)}
                  />
                </>
              )}

              {!isSpeakerA && (
                <>
                  <Button
                    title="🔊 听这句"
                    action={() => onPlayAtTime(item.timeSec)}
                  />
                  <Text font="caption1" foregroundStyle="secondaryLabel">
                    {item.speaker} · {formatTime(item.timeSec)}
                  </Text>
                </>
              )}
            </HStack>

            {/* 对话正文气泡 */}
            <VStack
              padding={12}
              background={isSpeakerA ? "systemIndigo" : "tertiarySystemFill"}
              cornerRadius={14}
            >
              <Text
                foregroundStyle={isSpeakerA ? "white" : "label"}
                font="body"
              >
                {item.text}
              </Text>
            </VStack>
          </VStack>
        );
      })}
    </VStack>
  );
}
