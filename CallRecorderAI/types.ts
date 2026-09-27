/**
 * 通话录音与 AI 提取核心数据模型
 */

export interface DialogueItem {
  id: string;
  speaker: string;      // 例如 "我" / "对方" / "说话人 A" / "说话人 B"
  timeSec: number;       // 音频起始时间（秒），用于点击定位原声播放
  durationSec: number;   // 该单句音频持续时长（秒），用于渲染仿微信语音条长度 (如 8")
  text: string;          // 逐字记录与转写文本
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
  audioPath: string;     // 持久化存储在 Documents/CallRecordings/ 下的绝对路径
  audioFileName: string; // 纯文件名，例如 call_20260927_183000.m4a
  duration: number;      // 音频总时长（秒）
  fileSizeBytes: number; // 文件大小（字节）
  dialogues: DialogueItem[];
  summary: CallSummary;
}

// 转写方式：音频直接转文字 (ASR) vs AI 多模态大模型转写 (LLM)
export type TranscriptionMode = "asr_direct" | "ai_multimodal";

export type AIProvider = "local" | "aliyun" | "gemini" | "openai";

export interface AISettings {
  transcriptionMode: TranscriptionMode; // 核心转写模式
  provider: AIProvider;
  apiKey: string;
  endpoint: string;
  model: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  transcriptionMode: "ai_multimodal",
  provider: "local",
  apiKey: "",
  endpoint: "https://api.deepseek.com/v1",
  model: "deepseek-chat"
};
