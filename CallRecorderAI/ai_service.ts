import type { CallRecord, DialogueItem, CallSummary } from "./types";
import { getAISettings } from "./storage";
import { formatBytes } from "./audio_manager";

/**
 * 将整段文本根据停顿、换行或角色标号切分为仿微信对白数据
 */
function parseTranscriptToDialogues(rawTranscript: string, totalDuration = 0): DialogueItem[] {
  const lines = rawTranscript
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [
      {
        id: "d_init",
        speaker: "通话原声",
        timeSec: 0,
        durationSec: totalDuration > 0 ? Math.min(totalDuration, 15) : 8,
        text: "真实音频已成功录入，点击上方备忘录音频卡片可听完整原声。"
      }
    ];
  }

  const items: DialogueItem[] = [];
  let currentTime = 0;
  const timeStep = totalDuration > 0 ? Math.max(3, Math.floor(totalDuration / Math.max(lines.length, 1))) : 5;

  lines.forEach((line, idx) => {
    // 自动判定角色 A / 角色 B
    let speaker = idx % 2 === 0 ? "说话人 A (我)" : "说话人 B (对方)";
    let cleanText = line;

    if (/^(说话人\s*[A-Z1-9]|对方|我|客户|经理|参与者)[:：\s]*/i.test(line)) {
      const match = line.match(/^([^:：]+)[:：\s]*(.*)$/);
      if (match) {
        speaker = match[1].trim();
        cleanText = match[2].trim() || cleanText;
      }
    }

    const durationSec = Math.max(3, Math.min(25, Math.ceil(cleanText.length / 4)));

    items.push({
      id: `diag_${idx}_${Date.now()}`,
      speaker,
      timeSec: currentTime,
      durationSec,
      text: cleanText
    });

    currentTime += durationSec + 1;
  });

  return items;
}

/**
 * 使用 Apple Intelligence 本地大模型处理文本内容
 */
async function processWithLocalLLM(rawTranscript: string): Promise<{ summary: CallSummary; title: string } | null> {
  if (typeof LanguageModelSession === "undefined" || !LanguageModelSession.isAvailable) {
    return null;
  }

  try {
    const session = new LanguageModelSession({
      instructions: "你是一个专业的通话纪要整理助理。请输出严格的 JSON 格式，不要包含任何 markdown 代码块外部的文字。"
    });

    session.prewarm("整理通话");

    const prompt = `请对以下真实通话听写文本进行分析，提取通话标题、核心主旨、关键共识与待办事项：
${rawTranscript}

请严格按如下 JSON 结构返回：
{
  "title": "通话标题",
  "overview": "核心主旨概述",
  "keyPoints": ["要点1", "要点2"],
  "actionItems": ["待办事项1", "待办事项2"]
}`;

    const res = await session.respond(prompt, { temperature: 0.2 });
    session.dispose();

    if (res.content) {
      const cleaned = res.content.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        title: parsed.title || "通话纪要",
        summary: {
          overview: parsed.overview || "",
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : []
        }
      };
    }
  } catch (e) {
    console.warn("LanguageModelSession 处理异常:", e);
  }

  return null;
}

/**
 * 使用云端大模型 API 处理
 */
async function processWithCloudLLM(
  endpoint: string,
  apiKey: string,
  model: string,
  rawTranscript: string
): Promise<{ summary: CallSummary; title: string } | null> {
  const prompt = `你是一个专业的通话纪要整理专家。以下是真实的通话对话内容，请提炼结构化纪要。
必须返回纯 JSON 对象，格式如下：
{
  "title": "简明清晰的通话主题",
  "overview": "通话背景与主旨概述（1-2句）",
  "keyPoints": ["核心共识1", "核心讨论点2"],
  "actionItems": ["待办1（责任人/时间）", "待办2"]
}

对话原文：
${rawTranscript}`;

  try {
    const url = endpoint.endsWith("/") ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        title: parsed.title || "通话纪要",
        summary: {
          overview: parsed.overview || "",
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : []
        }
      };
    }
  } catch (err) {
    console.error("云端大模型请求失败:", err);
  }

  return null;
}

/**
 * 对外主接口：分析音频并生成真实对话与总结（无任何虚假伪造数据）
 */
export async function analyzeCallAudio(
  audioPath: string,
  duration = 0,
  rawInputText?: string,
  fileName = "recording.m4a",
  fileSizeBytes = 0
): Promise<CallRecord> {
  const settings = getAISettings();
  const now = Date.now();
  const cleanTitle = fileName.replace(/\.[^.]+$/, "") || "通话录音";

  // 1. 若传入了真实听写文本，优先执行多角色分段与 AI 提取
  if (rawInputText && rawInputText.trim().length > 0) {
    let result = null;
    if (settings.provider === "local") {
      result = await processWithLocalLLM(rawInputText);
    } else if (settings.apiKey) {
      result = await processWithCloudLLM(settings.endpoint, settings.apiKey, settings.model, rawInputText);
    }

    const dialogues = parseTranscriptToDialogues(rawInputText, duration);

    return {
      id: `call_${now}`,
      title: result?.title || cleanTitle,
      createdAt: now,
      audioPath,
      audioFileName: fileName,
      fileSizeBytes,
      duration,
      dialogues,
      summary: result?.summary || {
        overview: `基于真实听写文本提取，共包含 ${dialogues.length} 轮对话。`,
        keyPoints: ["已自动提取对话内容", "点击上方录音卡片可随时听取完整原声"],
        actionItems: ["可根据对话内容进行跟进"]
      }
    };
  }

  // 2. 若当前未传入文本且未配置云端 ASR：实事求是展示真实文件信息，绝对不造假！
  const defaultDialogues: DialogueItem[] = [
    {
      id: "d_real_1",
      speaker: "说话人 A",
      timeSec: 0,
      durationSec: duration > 0 ? Math.min(Math.floor(duration / 2), 10) : 5,
      text: "【真实音频已归档】点击上方备忘录卡片或本语音条可回听原声。"
    },
    {
      id: "d_real_2",
      speaker: "说话人 B",
      timeSec: duration > 0 ? Math.floor(duration / 2) : 6,
      durationSec: duration > 0 ? Math.min(Math.floor(duration / 2), 12) : 6,
      text: "如需生成详细逐字对白与待办清单，可在备忘录中将听写文本一并分享，或在设置中配置云端大模型 API。"
    }
  ];

  return {
    id: `call_${now}`,
    title: `录音: ${cleanTitle}`,
    createdAt: now,
    audioPath,
    audioFileName: fileName,
    fileSizeBytes,
    duration,
    dialogues: defaultDialogues,
    summary: {
      overview: `已成功保存真实录音文件「${fileName}」，大小 ${formatBytes(fileSizeBytes)}，录音存放在沙盒 Documents/CallRecordings/ 专属目录中。`,
      keyPoints: [
        "真实录音文件已持久化保存在专属目录中",
        "顶部原生音频卡片支持随时播放原声、波形进度与倍速调节"
      ],
      actionItems: [
        "在设置页中可配置转写模式与 AI 模型密钥",
        "备忘录支持一键将听写文本共享到本脚本进行精细提取"
      ]
    }
  };
}
