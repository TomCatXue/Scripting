import type { CallRecord } from "./types";

export const AUDIO_FOLDER_NAME = "CallRecordings";

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 获取或创建唯一的音频存储目录物理绝对路径
 */
export function getOrCreateRecordingsDir(): string {
  if (typeof FileManager === "undefined") {
    return "";
  }

  const rootDir = FileManager.documentsDirectory;
  const recordingsDir = `${rootDir}/${AUDIO_FOLDER_NAME}`;

  try {
    if (!FileManager.existsSync(recordingsDir)) {
      FileManager.createDirectorySync(recordingsDir, true);
    }
  } catch (err) {
    console.error("创建统一录音存储目录失败:", err);
  }

  return recordingsDir;
}

/**
 * 获取用户可见的友好存储路径文本
 */
export function getFriendlyStoragePath(): string {
  return `Documents/${AUDIO_FOLDER_NAME}/`;
}

/**
 * 获取录音专属目录的占用空间与文件数量统计
 */
export function getStorageUsageSummary(): { fileCount: number; totalSizeBytes: number; formattedSize: string } {
  if (typeof FileManager === "undefined") {
    return { fileCount: 0, totalSizeBytes: 0, formattedSize: "0 KB" };
  }

  try {
    const dir = getOrCreateRecordingsDir();
    if (!FileManager.existsSync(dir)) {
      return { fileCount: 0, totalSizeBytes: 0, formattedSize: "0 KB" };
    }

    const files = FileManager.readDirectorySync(dir);
    let totalBytes = 0;
    let count = 0;

    for (const f of files) {
      const fullPath = `${dir}/${f}`;
      if (FileManager.isFileSync(fullPath)) {
        count++;
        const stat = FileManager.statSync(fullPath);
        totalBytes += stat.size || 0;
      }
    }

    return {
      fileCount: count,
      totalSizeBytes: totalBytes,
      formattedSize: formatBytes(totalBytes)
    };
  } catch (err) {
    console.warn("读取存储目录状态失败:", err);
    return { fileCount: 0, totalSizeBytes: 0, formattedSize: "0 KB" };
  }
}

/**
 * 将外部传入（分享或选取）的音频文件，统一规整存入专属目录
 * @param sourcePath 外部来源路径
 * @returns 包含绝对路径、纯文件名、文件大小的结果对象
 */
export function persistIncomingAudio(sourcePath: string): { fullPath: string; fileName: string; sizeBytes: number } {
  if (!sourcePath) {
    return { fullPath: "", fileName: "", sizeBytes: 0 };
  }

  // 去除可能的 file:// 前缀
  const cleanedSource = sourcePath.replace(/^file:\/\//, "");

  if (typeof FileManager === "undefined") {
    return { fullPath: cleanedSource, fileName: "recording.m4a", sizeBytes: 0 };
  }

  try {
    const targetDir = getOrCreateRecordingsDir();
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    // 尽量保留原始文件名中的有效描述
    const rawName = cleanedSource.split("/").pop() || "recording.m4a";
    const ext = rawName.includes(".") ? rawName.split(".").pop() : "m4a";
    const safeName = rawName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5.-]/g, "_");
    const fileName = `call_${dateStr}_${safeName}`;
    const destinationPath = `${targetDir}/${fileName}`;

    FileManager.copyFileSync(cleanedSource, destinationPath);

    let size = 0;
    try {
      const st = FileManager.statSync(destinationPath);
      size = st.size || 0;
    } catch {}

    return {
      fullPath: destinationPath,
      fileName,
      sizeBytes: size
    };
  } catch (err) {
    console.warn("转存音频至统一目录失败，降级使用来源路径:", err);
    return { fullPath: cleanedSource, fileName: "recording.m4a", sizeBytes: 0 };
  }
}

/**
 * 物理文件双向扫描：发现磁盘目录中有新文件但未被 Storage 索引时，自动补全生成真实记录
 */
export function discoverUnindexedAudios(existingRecords: CallRecord[]): CallRecord[] {
  if (typeof FileManager === "undefined") {
    return existingRecords;
  }

  try {
    const dir = getOrCreateRecordingsDir();
    if (!FileManager.existsSync(dir)) return existingRecords;

    const files = FileManager.readDirectorySync(dir);
    const indexedPaths = new Set(existingRecords.map((r) => r.audioPath));
    const results = [...existingRecords];

    for (const f of files) {
      if (!f.endsWith(".m4a") && !f.endsWith(".wav") && !f.endsWith(".mp3") && !f.endsWith(".aac")) {
        continue;
      }

      const fullPath = `${dir}/${f}`;
      if (FileManager.isFileSync(fullPath) && !indexedPaths.has(fullPath)) {
        const stat = FileManager.statSync(fullPath);
        const title = f.replace(/^call_\d+_/, "").replace(/\.[^.]+$/, "") || "通话录音";
        results.push({
          id: `disc_${stat.modificationDate || Date.now()}_${Math.floor(Math.random() * 1000)}`,
          title: `录音: ${title}`,
          createdAt: stat.modificationDate || Date.now(),
          audioPath: fullPath,
          audioFileName: f,
          duration: 0,
          fileSizeBytes: stat.size || 0,
          dialogues: [
            {
              id: "d0",
              speaker: "通话录音",
              timeSec: 0,
              durationSec: 10,
              text: "已从本地专属文件夹识别真实音频文件，点击上方原声卡片即可全程回听。"
            }
          ],
          summary: {
            overview: `音频文件 ${f} 已保存在 ${getFriendlyStoragePath()}，大小 ${formatBytes(stat.size || 0)}。`,
            keyPoints: ["真实音频文件已成功归档入沙盒专属目录", "点击上方备忘录原生音频卡片可听完整原声"],
            actionItems: ["可根据需要进行语音转写或 AI 提炼"]
          }
        });
      }
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.warn("扫描物理目录音频异常:", err);
    return existingRecords;
  }
}

/**
 * 安全清理指定的音频文件
 */
export function safelyDeleteAudio(audioPath: string): void {
  if (!audioPath || typeof FileManager === "undefined") return;

  try {
    const cleaned = audioPath.replace(/^file:\/\//, "");
    if (FileManager.existsSync(cleaned)) {
      FileManager.removeSync(cleaned);
    }
  } catch (err) {
    console.warn("清理音频文件失败:", err);
  }
}
