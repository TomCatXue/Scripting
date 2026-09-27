/**
 * 集中管理所有通话录音音频文件，杜绝文件散落
 */

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

  if (typeof FileManager === "undefined") {
    return { fullPath: sourcePath, fileName: "recording.m4a", sizeBytes: 0 };
  }

  try {
    const targetDir = getOrCreateRecordingsDir();
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const isM4A = sourcePath.toLowerCase().endsWith(".m4a");
    const ext = isM4A ? "m4a" : "audio";
    const fileName = `call_${dateStr}_${Math.floor(Math.random() * 1000)}.${ext}`;
    const destinationPath = `${targetDir}/${fileName}`;

    FileManager.copyFileSync(sourcePath, destinationPath);

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
    return { fullPath: sourcePath, fileName: "recording.m4a", sizeBytes: 0 };
  }
}

/**
 * 安全清理指定的音频文件
 */
export function safelyDeleteAudio(audioPath: string): void {
  if (!audioPath || typeof FileManager === "undefined") return;

  try {
    if (FileManager.existsSync(audioPath)) {
      FileManager.removeSync(audioPath);
    }
  } catch (err) {
    console.warn("清理音频文件失败:", err);
  }
}
