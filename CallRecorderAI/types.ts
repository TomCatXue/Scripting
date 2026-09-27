/**
 * 通话/会议录音与 AI 深度分析核心数据模型
 */

export interface DialogueItem {
  id: string;
  speaker: string;      // 例如 "发言人 1" / "发言人 2" / "我" / "对方"
  timeSec: number;       // 音频起始时间（秒），用于点字回听联动
  durationSec: number;   // 单句时长（秒）
  text: string;          // 逐字记录文本
  translatedText?: string; // 翻译后的译文
  isKeyPoint?: boolean;  // 是否标记为关键重点
  highlightText?: string; // 重点高亮关键词句（浅蓝底高亮）
}

export interface ChapterItem {
  id: string;
  timeSec: number;       // 章节开始时间戳
  title: string;         // 章节主题，如 "00:08 开发进度完成 80%"
  summary?: string;      // 简要描述
}

export interface ActionItem {
  id: string;
  task: string;          // 待办任务内容
  assignee: string;      // 负责人 (如 "张三")
  dueDate: string;       // 截止日期 (如 "4月28日")
  done: boolean;         // 完成状态
}

export interface AttachedFile {
  id: string;
  name: string;          // 文件名 (如 "项目需求文档.pdf")
  sizeStr: string;       // 文件大小展示 (如 "2.4 MB")
  type: string;          // 格式 (如 "pdf")
}

export interface MeetingMinutes {
  title: string;         // 会议主题，如 "项目例会 · 会议纪要"
  dateStr: string;       // 会议时间范围，如 "2026年4月26日 10:00 - 11:20"
  durationStr: string;   // 时长标签，如 "共 1.3 小时"
  overview: string;      // 会议摘要概述
  keyPoints: string[];   // 核心要点清单
  decisions: string[];   // 达成决议
  actionItems: ActionItem[]; // 待办事项
}

export interface CallRecord {
  id: string;
  title: string;
  createdAt: number;
  audioPath: string;     // 沙盒绝对路径
  audioFileName: string; // 文件名
  duration: number;      // 总秒数
  fileSizeBytes: number; // 文件大小 (字节)
  dialogues: DialogueItem[];
  chapters: ChapterItem[];
  minutes: MeetingMinutes;
  summary: {
    overview: string;
    keyPoints: string[];
    actionItems: string[];
  };
  attachedFiles?: AttachedFile[];
}

// 翻译引擎类型
export type TranslationEngine = "apple" | "openai";

export interface TranslationConfig {
  engine: TranslationEngine;
  openaiEndpoint: string;
  openaiApiKey: string;
  openaiModel: string;
  targetLang: "zh" | "en" | "ja" | "ko";
}

// 转写模式
export type TranscriptionMode = "asr_direct" | "ai_multimodal";
export type AIProvider = "local" | "aliyun" | "gemini" | "openai";

export interface AISettings {
  transcriptionMode: TranscriptionMode;
  provider: AIProvider;
  apiKey: string;
  endpoint: string;
  model: string;
  translation: TranslationConfig;
}

export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  engine: "apple",
  openaiEndpoint: "https://api.deepseek.com/v1",
  openaiApiKey: "",
  openaiModel: "deepseek-chat",
  targetLang: "en"
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  transcriptionMode: "ai_multimodal",
  provider: "local",
  apiKey: "",
  endpoint: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  translation: DEFAULT_TRANSLATION_CONFIG
};
