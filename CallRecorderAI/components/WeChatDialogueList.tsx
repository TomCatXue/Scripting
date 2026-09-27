import {
  VStack,
  HStack,
  Text,
  Button,
  Spacer
} from "scripting";
import type { DialogueItem } from "../types";

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface WeChatDialogueListProps {
  dialogues: DialogueItem[];
  currentPlayTime: number;
  isPlayingGlobal: boolean;
  onPlayAtTime: (timeSec: number) => void;
}

export function WeChatDialogueList({
  dialogues,
  currentPlayTime,
  isPlayingGlobal,
  onPlayAtTime
}: WeChatDialogueListProps) {
  if (!dialogues || dialogues.length === 0) {
    return (
      <VStack padding={30} alignment="center" spacing={8}>
        <Text foregroundStyle="secondaryLabel">暂无对话记录</Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={20} padding={16}>
      {dialogues.map((item) => {
        // 判断角色：我方（靠右） vs 对方（靠左）
        const isMe = item.speaker.includes("A") || item.speaker.includes("我");

        // 判断当前这句是否正在被播放
        const isCurrentActive =
          isPlayingGlobal &&
          currentPlayTime >= item.timeSec &&
          currentPlayTime <= item.timeSec + (item.durationSec || 6);

        // 模拟微信语音条长度根据时长自适应
        const voiceBarWidth = Math.min(200, Math.max(90, 80 + (item.durationSec || 5) * 8));

        return (
          <VStack key={item.id} spacing={6}>
            {/* 时间戳小标 */}
            <HStack alignment="center">
              <Spacer />
              <Text font="caption2" foregroundStyle="tertiaryLabel">
                {item.speaker} · {formatSec(item.timeSec)}
              </Text>
              <Spacer />
            </HStack>

            {/* 微信式聊天记录行 */}
            <HStack
              alignment="top"
              spacing={8}
            >
              {/* 对方头像（靠左） */}
              {!isMe && (
                <VStack
                  padding={8}
                  background="tertiarySystemFill"
                  cornerRadius={18}
                  frame={{ width: 36, height: 36 }}
                  alignment="center"
                >
                  <Text font="caption1">客</Text>
                </VStack>
              )}

              {isMe && <Spacer />}

              {/* 核心气泡复合体：上面是语音条，下面是文字部分 */}
              <VStack
                alignment={isMe ? "trailing" : "leading"}
                spacing={6}
              >
                {/* 1. 上层：微信语音条（点击直接听该句录音） */}
                <Button
                  title={
                    isMe
                      ? (isCurrentActive ? `🔊 播放中 ${item.durationSec || 5}"` : `((( ${item.durationSec || 5}"`)
                      : (isCurrentActive ? `${item.durationSec || 5}" 🔊 播放中` : `${item.durationSec || 5}" )))`)
                  }
                  action={() => onPlayAtTime(item.timeSec)}
                />

                {/* 2. 下层：语音转文字部分（紧随语音条下方） */}
                <VStack
                  padding={10}
                  background={isMe ? "secondarySystemBackground" : "secondarySystemBackground"}
                  cornerRadius={10}
                >
                  <HStack alignment="top" spacing={4}>
                    <Text font="caption2" foregroundStyle="tertiaryLabel">
                      “
                    </Text>
                    <Text font="body">
                      {item.text}
                    </Text>
                  </HStack>
                </VStack>
              </VStack>

              {!isMe && <Spacer />}

              {/* 我方头像（靠右） */}
              {isMe && (
                <VStack
                  padding={8}
                  background="systemIndigo"
                  cornerRadius={18}
                  frame={{ width: 36, height: 36 }}
                  alignment="center"
                >
                  <Text font="caption1" foregroundStyle="white">我</Text>
                </VStack>
              )}
            </HStack>
          </VStack>
        );
      })}
    </VStack>
  );
}
