import type { CallRecord, AISettings } from "./types";
import { DEFAULT_AI_SETTINGS } from "./types";
import { safelyDeleteAudio } from "./audio_manager";

const STORAGE_KEY_RECORDS = "call_recorder_ai_records_v2";
const STORAGE_KEY_SETTINGS = "call_recorder_ai_settings_v2";

// 内存后备，确保在 Node.js 单测环境中亦可顺畅运行
const memoryFallback: Record<string, any> = {};

/**
 * 跨进程读取：优先读取 shared: true 共享域，若无则回退 private 域
 */
function getStorageItem<T>(key: string): T | null {
  if (typeof Storage !== "undefined" && typeof Storage.get === "function") {
    try {
      // 1. 优先尝试从共享域读取（打通 Share Sheet 扩展与主 App）
      const sharedVal = Storage.get<T>(key, { shared: true });
      if (sharedVal != null) {
        return sharedVal;
      }
      // 2. 回退私有域
      const privVal = Storage.get<T>(key);
      if (privVal != null) {
        return privVal;
      }
    } catch (err) {
      console.warn("Storage 读取异常:", err);
    }
  }
  return memoryFallback[key] ?? null;
}

/**
 * 跨进程写入：同时写入 shared: true 共享域与私有域，双重保险
 */
function setStorageItem<T>(key: string, value: T): void {
  if (typeof Storage !== "undefined" && typeof Storage.set === "function") {
    try {
      // 写入共享域，确保扩展进程与主应用均能读到
      Storage.set(key, value, { shared: true });
    } catch {}
    try {
      // 同时备份私有域
      Storage.set(key, value);
    } catch {}
  }
  memoryFallback[key] = value;
}

/**
 * 获取所有已保存的通话记录列表（按时间倒序排列）
 */
export function getAllRecords(): CallRecord[] {
  try {
    const list = getStorageItem<CallRecord[]>(STORAGE_KEY_RECORDS);
    if (!list) return [];
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
  setStorageItem(STORAGE_KEY_RECORDS, records);
}

/**
 * 删除一条通话记录，并彻底清理专属目录中对应的音频文件
 */
export function deleteRecord(id: string): void {
  const target = getRecordById(id);
  if (target && target.audioPath) {
    safelyDeleteAudio(target.audioPath);
  }

  const filtered = getAllRecords().filter((r) => r.id !== id);
  setStorageItem(STORAGE_KEY_RECORDS, filtered);
}

/**
 * 获取全局 AI 配置
 */
export function getAISettings(): AISettings {
  const settings = getStorageItem<AISettings>(STORAGE_KEY_SETTINGS);
  if (settings && typeof settings === "object") {
    return settings;
  }
  return { ...DEFAULT_AI_SETTINGS };
}

/**
 * 保存全局 AI 配置
 */
export function saveAISettings(settings: AISettings): void {
  setStorageItem(STORAGE_KEY_SETTINGS, settings);
}
