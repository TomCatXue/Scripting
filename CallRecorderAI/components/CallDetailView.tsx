import {
  useState,
  Navigation,
  NavigationStack,
  VStack,
  HStack,
  Button,
  ScrollView,
  Divider
} from "scripting";
import type { CallRecord } from "../types";
import { AppleNotesAudioCard } from "./AppleNotesAudioCard";
import { WeChatDialogueList } from "./WeChatDialogueList";
import { SummaryCard } from "./SummaryCard";

export interface CallDetailViewProps {
  record: CallRecord;
}

export function CallDetailView({ record }: CallDetailViewProps) {
  const dismiss = Navigation.useDismiss();
  const [activeTab, setActiveTab] = useState<"dialogue" | "summary">("dialogue");
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isPlayingGlobal, setIsPlayingGlobal] = useState<boolean>(false);

  // 微信语音条点击事件响应
  const handlePlayAtTime = (sec: number) => {
    setSeekTime(sec);
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
        spacing={0}
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

        <Divider />

        {/* 微信式对话与 AI 总结切换 */}
        <HStack
          padding={8}
          spacing={8}
          background="secondarySystemBackground"
        >
          <Button
            title={activeTab === "dialogue" ? "💬 微信式对话流 (已选)" : "💬 微信式对话流"}
            action={() => setActiveTab("dialogue")}
          />
          <Button
            title={activeTab === "summary" ? "📝 AI 智能总结 (已选)" : "📝 AI 智能总结"}
            action={() => setActiveTab("summary")}
          />
        </HStack>

        <Divider />

        {/* 滚动内容区 */}
        <ScrollView>
          {activeTab === "dialogue" ? (
            <WeChatDialogueList
              dialogues={record.dialogues}
              currentPlayTime={currentPlayTime}
              isPlayingGlobal={isPlayingGlobal}
              onPlayAtTime={handlePlayAtTime}
            />
          ) : (
            <SummaryCard
              title={record.title}
              summary={record.summary}
            />
          )}
        </ScrollView>
      </VStack>
    </NavigationStack>
  );
}
