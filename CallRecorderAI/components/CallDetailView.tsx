import {
  useState,
  Navigation,
  NavigationStack,
  VStack,
  HStack,
  Button,
  ScrollView,
  Divider,
  Spacer
} from "scripting";
import type { CallRecord } from "../types";
import { AppleNotesAudioCard } from "./AppleNotesAudioCard";
import { WeChatDialogueList } from "./WeChatDialogueList";
import { TranscriptPage } from "../pages/TranscriptPage";
import { MinutesPage } from "../pages/MinutesPage";
import { SummaryPage } from "../pages/SummaryPage";
import { AudioDetailPage } from "../pages/AudioDetailPage";

export interface CallDetailViewProps {
  record: CallRecord;
}

export function CallDetailView({ record }: CallDetailViewProps) {
  const dismiss = Navigation.useDismiss();
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isPlayingGlobal, setIsPlayingGlobal] = useState<boolean>(false);

  // 打开页面 2: 转写详情与回听联动页
  const handleOpenTranscript = async () => {
    await Navigation.present({
      element: <TranscriptPage record={record} />
    });
  };

  // 打开页面 3: 录音详情与章节时间轴
  const handleOpenAudioDetail = async () => {
    await Navigation.present({
      element: <AudioDetailPage record={record} />
    });
  };

  // 打开页面 4: AI 摘要与结论
  const handleOpenSummary = async () => {
    await Navigation.present({
      element: <SummaryPage record={record} />
    });
  };

  // 打开页面 5: 会议纪要与待办清单
  const handleOpenMinutes = async () => {
    await Navigation.present({
      element: <MinutesPage record={record} />
    });
  };

  return (
    <NavigationStack>
      <VStack
        navigationTitle={record.title}
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: (
            <Button title="返回" action={dismiss} />
          )
        }}
        spacing={10}
      >
        {/* 最上面：备忘录风格原生音频卡片 */}
        <VStack padding={12} background="systemBackground">
          <AppleNotesAudioCard
            audioPath={record.audioPath}
            duration={record.duration}
            fileName={record.audioFileName || "call_audio.m4a"}
            seekTime={seekTime}
            onSeekHandled={() => setSeekTime(null)}
            onCurrentTimeChange={(cur, playing) => {
              setCurrentPlayTime(cur);
              setIsPlayingGlobal(playing);
            }}
          />
        </VStack>

        {/* 6 大核心页面快速直达金刚区 (SF Symbols) */}
        <HStack padding={8} spacing={8} background="secondarySystemBackground" cornerRadius={12}>
          <Button
            title="转写详情"
            systemImage="bubble.left.and.bubble.right.fill"
            action={handleOpenTranscript}
          />
          <Spacer />
          <Button
            title="会议纪要"
            systemImage="doc.text.fill"
            action={handleOpenMinutes}
          />
          <Spacer />
          <Button
            title="AI 摘要"
            systemImage="sparkles"
            action={handleOpenSummary}
          />
          <Spacer />
          <Button
            title="时间轴"
            systemImage="clock.arrow.circlepath"
            action={handleOpenAudioDetail}
          />
        </HStack>

        <Divider />

        {/* 仿微信语音聊天流：每个语音条下紧随转文字 */}
        <ScrollView>
          <WeChatDialogueList
            dialogues={record.dialogues}
            currentPlayTime={currentPlayTime}
            isPlayingGlobal={isPlayingGlobal}
            onPlayAtTime={(sec) => setSeekTime(sec)}
          />
        </ScrollView>
      </VStack>
    </NavigationStack>
  );
}
