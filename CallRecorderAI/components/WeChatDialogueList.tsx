import {
  VStack,
  HStack,
  Text,
  Button,
  Spacer,
  Image
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
        <Image systemName="message" font={28} foregroundStyle="secondaryLabel" />
        <Text font="body" foregroundStyle="secondaryLabel">
          暂无对白记录
        </Text>
        <Text font="caption1" foregroundStyle="tertiaryLabel">
          点击上方录音卡片可听完整原声音频
        </Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={20} padding={16}>
      {dialogues.map((item) => {
        // 判定角色：我方（右侧） vs 对方（左侧）
        const isMe = item.speaker.includes("A") || item.speaker.includes("我") || item.speaker.includes("1");

        // 判定当前语音是否正在被播放
        const isCurrentActive =
          isPlayingGlobal &&
          currentPlayTime >= item.timeSec &&
          currentPlayTime <= item.timeSec + (item.durationSec || 6);

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
              {/* 对方头像（靠左, SF Symbol） */}
              {!isMe && (
                <Image
                  systemName="person.crop.circle.fill"
                  font={34}
                  foregroundStyle="secondaryLabel"
                />
              )}

              {isMe && <Spacer />}

              {/* 核心气泡复合体：微信语音条 + 紧随其下的转文字部分 */}
              <VStack
                alignment={isMe ? "trailing" : "leading"}
                spacing={4}
              >
                {/* 1. 微信绿色/浅灰语音条 (带 SF Symbol 动态声波) */}
                <HStack
                  padding={8}
                  background={isMe ? "systemGreen" : "tertiarySystemFill"}
                  cornerRadius={8}
                  spacing={8}
                  alignment="center"
                >
                  <Button
                    title={
                      isMe
                        ? `${durationDisplay}"`
                        : `${durationDisplay}"`
                    }
                    systemImage={isCurrentActive ? "speaker.wave.2.fill" : "waveform"}
                    action={() => onPlayAtTime(item.timeSec)}
                  />
                </HStack>

                {/* 2. 仿微信「语音转文字」卡片：紧贴在语音条正下方 */}
                <VStack
                  padding={12}
                  background="secondarySystemBackground"
                  cornerRadius={10}
                >
                  <HStack alignment="top" spacing={6}>
                    <Image systemName="text.quote" font={11} foregroundStyle="secondaryLabel" />
                    <Text font="body">
                      {item.text}
                    </Text>
                  </HStack>
                </VStack>
              </VStack>

              {!isMe && <Spacer />}

              {/* 我方头像（靠右, SF Symbol） */}
              {isMe && (
                <Image
                  systemName="person.crop.circle.fill"
                  font={34}
                  foregroundStyle="systemBlue"
                />
              )}
            </HStack>
          </VStack>
        );
      })}
    </VStack>
  );
}
