/**
 * 通话录音与 AI 提取核心数据模型
 */

export interface DialogueItem {
  id: string;
  speaker: string;      // 例如 "说话人 A (我)" 或 "说话人 B (对方)"
  timeSec: number;       // 音频对应起始时间（秒），用于点击定位原声播放
  text: string;          // 逐字记录内容
}

export interface CallSummary {
  overview: string;      // 通话背景与核心主旨概述
  keyPoints: string[];   // 关键议题与共识讨论
  actionItems: string[]; // 待办事项清单（含负责人与截止时间）
}

export interface CallRecord {
  id: string;
  title: string;
  createdAt: number;
  audioPath: string;     // 持久化存储在 Documents 目录下的音频物理绝对路径
  duration: number;      // 音频总时长（秒）
  dialogues: DialogueItem[];
  summary: CallSummary;
}

export type AIProvider = "local" | "aliyun" | "gemini" | "openai";

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  endpoint: string;
  model: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "local",
  apiKey: "",
  endpoint: "https://api.deepseek.com/v1",
  model: "deepseek-chat"
};
