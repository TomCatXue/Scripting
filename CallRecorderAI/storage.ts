import type { CallRecord, AISettings } from "./types";
import { DEFAULT_AI_SETTINGS } from "./types";

const STORAGE_KEY_RECORDS = "call_recorder_ai_records_v1";
const STORAGE_KEY_SETTINGS = "call_recorder_ai_settings_v1";

// 内存后备，确保在 Node.js 单测环境中亦可顺畅运行
const memoryFallback: Record<string, string> = {};

function getStorageItem(key: string): string | null {
  if (typeof Storage !== "undefined" && typeof Storage.getItem === "function") {
    return Storage.getItem(key);
  }
  return memoryFallback[key] ?? null;
}

function setStorageItem(key: string, value: string): void {
  if (typeof Storage !== "undefined" && typeof Storage.setItem === "function") {
    Storage.setItem(key, value);
  } else {
    memoryFallback[key] = value;
  }
}

/**
 * 获取所有已保存的通话记录列表（按时间倒序排列）
 */
export function getAllRecords(): CallRecord[] {
  try {
    const raw = getStorageItem(STORAGE_KEY_RECORDS);
    if (!raw) return [];
    const list: CallRecord[] = JSON.parse(raw);
    return Array.isArray(list) ? list.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch (err) {
    console.error("读取通话记录列表失败:", err);
    return [];
  }
}

/**
 * 根据 ID 获取单条通话记录
 */
export function getRecordById(id: string): CallRecord | null {
  const records = getAllRecords();
  return records.find((item) => item.id === id) || null;
}

/**
 * 保存或更新一条通话记录
 */
export function saveRecord(record: CallRecord): void {
  const records = getAllRecords().filter((r) => r.id !== record.id);
  records.unshift(record);
  setStorageItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
}

/**
 * 删除一条通话记录，并尝试清理对应的音频文件
 */
export function deleteRecord(id: string): void {
  const target = getRecordById(id);
  if (target && target.audioPath) {
    if (typeof FileManager !== "undefined") {
      try {
        if (FileManager.existsSync(target.audioPath)) {
          FileManager.removeSync(target.audioPath);
        }
      } catch (e) {
        console.warn("清理本地音频文件失败:", e);
      }
    }
  }

  const filtered = getAllRecords().filter((r) => r.id !== id);
  setStorageItem(STORAGE_KEY_RECORDS, JSON.stringify(filtered));
}

/**
 * 获取全局 AI 配置
 */
export function getAISettings(): AISettings {
  try {
    const raw = getStorageItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // 降级使用默认设置
  }

  return { ...DEFAULT_AI_SETTINGS };
}

/**
 * 保存全局 AI 配置
 */
export function saveAISettings(settings: AISettings): void {
  setStorageItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
}
