/**
 * 集中管理所有通话录音音频文件，杜绝文件散落
 */

// 统一固定存储子目录名称
export const AUDIO_FOLDER_NAME = "CallRecordings";

/**
 * 获取或创建唯一的音频存储目录
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
 * 将外部传入（分享或选取）的音频文件，统一规整存入专属目录
 * @param sourcePath 外部来源路径
 * @returns 规整后的绝对路径
 */
export function persistIncomingAudio(sourcePath: string): string {
  if (!sourcePath) return "";
  if (typeof FileManager === "undefined") return sourcePath;

  try {
    const targetDir = getOrCreateRecordingsDir();
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    
    // 保持音频扩展名规范
    const isM4A = sourcePath.toLowerCase().endsWith(".m4a");
    const ext = isM4A ? "m4a" : "audio";
    const fileName = `call_${dateStr}_${Math.floor(Math.random() * 1000)}.${ext}`;
    const destinationPath = `${targetDir}/${fileName}`;

    FileManager.copyFileSync(sourcePath, destinationPath);
    return destinationPath;
  } catch (err) {
    console.warn("转存音频至统一目录失败，降级使用来源路径:", err);
    return sourcePath;
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
