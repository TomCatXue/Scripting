import {
  useState
} from "react";
import {
  Navigation,
  NavigationStack,
  VStack,
  HStack,
  Button,
  ScrollView,
  Divider
} from "scripting";
import { CallRecord } from "../types";
import { PlayerBar } from "./PlayerBar";
import { DialogueList } from "./DialogueList";
import { SummaryCard } from "./SummaryCard";

export interface CallDetailViewProps {
  record: CallRecord;
}

export function CallDetailView({ record }: CallDetailViewProps) {
  const dismiss = Navigation.useDismiss();
  const [activeTab, setActiveTab] = useState<"dialogue" | "summary">("dialogue");
  const [seekTime, setSeekTime] = useState<number | null>(null);

  // 点击单句时的跳转播放响应
  const handlePlayAtTime = (sec: number) => {
    setSeekTime(sec);
  };

  return (
    <NavigationStack>
      <VStack
        navigationTitle="通话记录与 AI 纪要"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          cancellationAction: (
            <Button title="关闭" action={dismiss} />
          )
        }}
        spacing={0}
      >
        {/* 顶部音频播放器卡片 */}
        <VStack padding={12} background="systemBackground">
          <PlayerBar
            audioPath={record.audioPath}
            duration={record.duration}
            seekTime={seekTime}
            onSeekHandled={() => setSeekTime(null)}
          />
        </VStack>

        <Divider />

        {/* 标签栏切换 */}
        <HStack
          padding={8}
          spacing={8}
          background="secondarySystemBackground"
        >
          <Button
            title={activeTab === "dialogue" ? "💬 两人逐字对话 (已选)" : "💬 两人逐字对话"}
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
            <DialogueList
              dialogues={record.dialogues}
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
