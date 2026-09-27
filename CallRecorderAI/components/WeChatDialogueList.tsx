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
      <VStack padding={36} alignment="center" spacing={10}>
        <Text font="body" foregroundStyle="secondaryLabel">
          暂无对话流记录
        </Text>
        <Text font="caption1" foregroundStyle="tertiaryLabel">
          点击上方录音卡片可听完整原声录音
        </Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={22} padding={16}>
      {dialogues.map((item) => {
        // 判定角色：我方（右侧） vs 对方（左侧）
        const isMe = item.speaker.includes("A") || item.speaker.includes("我");

        // 判定当前语音是否正在播放
        const isCurrentActive =
          isPlayingGlobal &&
          currentPlayTime >= item.timeSec &&
          currentPlayTime <= item.timeSec + (item.durationSec || 6);

        // 模仿微信语音条长度根据秒数弹性延伸 (80px ~ 210px)
        const durationDisplay = item.durationSec || 5;

        return (
          <VStack key={item.id} spacing={6}>
            {/* 时间标签 */}
            <HStack alignment="center">
              <Spacer />
              <Text font="caption2" foregroundStyle="tertiaryLabel">
                {item.speaker} · {formatSec(item.timeSec)}
              </Text>
              <Spacer />
            </HStack>

            {/* 微信式聊天记录行 */}
            <HStack alignment="top" spacing={10}>
              {/* 对方头像（靠左） */}
              {!isMe && (
                <VStack
                  padding={8}
                  background="secondarySystemFill"
                  cornerRadius={18}
                  frame={{ width: 38, height: 38 }}
                  alignment="center"
                >
                  <Text font="caption1" fontWeight="bold" foregroundStyle="secondaryLabel">
                    客
                  </Text>
                </VStack>
              )}

              {isMe && <Spacer />}

              {/* 核心气泡复合体：微信语音条 + 紧随其下的转文字部分 */}
              <VStack
                alignment={isMe ? "trailing" : "leading"}
                spacing={4}
              >
                {/* 1. 微信绿色/浅灰语音条 */}
                <Button
                  title={
                    isMe
                      ? (isCurrentActive ? `🔊 播放中 ${durationDisplay}"` : `((( ${durationDisplay}"`)
                      : (isCurrentActive ? `${durationDisplay}" 🔊 播放中` : `${durationDisplay}" )))`)
                  }
                  action={() => onPlayAtTime(item.timeSec)}
                />

                {/* 2. 仿微信「语音转文字」卡片：紧贴在语音条正下方 */}
                <VStack
                  padding={12}
                  background="secondarySystemBackground"
                  cornerRadius={10}
                >
                  <HStack alignment="top" spacing={6}>
                    <Text font="caption2" foregroundStyle="tertiaryLabel">
                      转文字:
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
                  frame={{ width: 38, height: 38 }}
                  alignment="center"
                >
                  <Text font="caption1" fontWeight="bold" foregroundStyle="white">
                    我
                  </Text>
                </VStack>
              )}
            </HStack>
          </VStack>
        );
      })}
    </VStack>
  );
}
