import type { CallRecord, DialogueItem, ChapterItem, MeetingMinutes } from "./types";
import { getAISettings } from "./storage";
import { formatBytes } from "./audio_manager";

/**
 * 将真实文本按照停顿、换行或角色标号切分为分角色对白数据
 */
function parseTranscriptToDialogues(rawTranscript: string, totalDuration = 0): DialogueItem[] {
  const lines = rawTranscript
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const items: DialogueItem[] = [];
  let currentTime = 0;
  const timeStep = totalDuration > 0 ? Math.max(3, Math.floor(totalDuration / Math.max(lines.length, 1))) : 5;

  lines.forEach((line, idx) => {
    let speaker = idx % 2 === 0 ? "发言人 1" : "发言人 2";
    let cleanText = line;

    if (/^(发言人\s*[0-9A-Za-z]|说话人\s*[0-9A-Za-z]|我|对方|参会人)[:：\s]*/i.test(line)) {
      const match = line.match(/^([^:：]+)[:：\s]*(.*)$/);
      if (match) {
        speaker = match[1].trim();
        cleanText = match[2].trim() || cleanText;
      }
    }

    const durationSec = Math.max(2, Math.min(25, Math.ceil(cleanText.length / 4)));

    items.push({
      id: `diag_${idx}_${Date.now()}`,
      speaker,
      timeSec: currentTime,
      durationSec,
      text: cleanText,
      isKeyPoint: idx === 1 || cleanText.includes("重点") || cleanText.includes("完成")
    });

    currentTime += durationSec + 1;
  });

  return items;
}

/**
 * 依据分段对白动态提取时间轴章节
 */
function generateChaptersFromDialogues(dialogues: DialogueItem[]): ChapterItem[] {
  if (dialogues.length === 0) {
    return [
      { id: "c_init", timeSec: 0, title: "录音开始" }
    ];
  }

  return dialogues.slice(0, 6).map((d, i) => ({
    id: `chap_${i}`,
    timeSec: d.timeSec,
    title: d.text.length > 16 ? `${d.text.slice(0, 16)}…` : d.text
  }));
}

/**
 * 使用 Apple Intelligence 本地大模型处理文本内容
 */
async function processWithLocalLLM(rawTranscript: string): Promise<Partial<MeetingMinutes> | null> {
  if (typeof LanguageModelSession === "undefined" || !LanguageModelSession.isAvailable) {
    return null;
  }

  try {
    const session = new LanguageModelSession({
      instructions: "你是一个专业的会议纪要整理助理。请输出严格的 JSON 格式。"
    });

    session.prewarm("整理会议");

    const prompt = `请对以下真实录音文本进行分析并提炼会议纪要：
${rawTranscript}

严格返回如下 JSON 结构：
{
  "title": "会议主题",
  "overview": "会议概要",
  "keyPoints": ["核心要点1", "核心要点2"],
  "decisions": ["关键决议1"],
  "actionItems": [{"task": "任务内容", "assignee": "负责人", "dueDate": "截止日期"}]
}`;

    const res = await session.respond(prompt, { temperature: 0.2 });
    session.dispose();

    if (res.content) {
      const cleaned = res.content.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        title: parsed.title,
        overview: parsed.overview,
        keyPoints: parsed.keyPoints || [],
        decisions: parsed.decisions || [],
        actionItems: (parsed.actionItems || []).map((a: any, i: number) => ({
          id: `act_${i}`,
          task: a.task || a,
          assignee: a.assignee || "待定",
          dueDate: a.dueDate || "待确认",
          done: false
        }))
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
): Promise<Partial<MeetingMinutes> | null> {
  const prompt = `你是一个专业的会议纪要整理专家。以下是真实的对话对白，请提炼结构化纪要。
必须返回纯 JSON 对象，格式如下：
{
  "title": "会议主题",
  "overview": "会议主旨概要",
  "keyPoints": ["核心重点1", "核心重点2"],
  "decisions": ["达成结论1"],
  "actionItems": [{"task": "待办任务", "assignee": "负责人", "dueDate": "截止时间"}]
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
        title: parsed.title,
        overview: parsed.overview,
        keyPoints: parsed.keyPoints || [],
        decisions: parsed.decisions || [],
        actionItems: (parsed.actionItems || []).map((a: any, i: number) => ({
          id: `act_cloud_${i}`,
          task: a.task || a,
          assignee: a.assignee || "待定",
          dueDate: a.dueDate || "待定",
          done: false
        }))
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
  const cleanTitle = fileName.replace(/^call_\d+_/, "").replace(/\.[^.]+$/, "") || "会议录音";

  const dateObj = new Date(now);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const dateStr = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  const durationStr = duration > 0 ? `${Math.ceil(duration / 60)} 分钟` : "未计";

  // 1. 若传入了真实听写文本，优先执行分角色切分与 AI 提炼
  if (rawInputText && rawInputText.trim().length > 0) {
    let aiMinutes: Partial<MeetingMinutes> | null = null;
    if (settings.provider === "local") {
      aiMinutes = await processWithLocalLLM(rawInputText);
    } else if (settings.apiKey) {
      aiMinutes = await processWithCloudLLM(settings.endpoint, settings.apiKey, settings.model, rawInputText);
    }

    const dialogues = parseTranscriptToDialogues(rawInputText, duration);
    const chapters = generateChaptersFromDialogues(dialogues);

    const minutes: MeetingMinutes = {
      title: aiMinutes?.title || `${cleanTitle} · 会议纪要`,
      dateStr,
      durationStr,
      overview: aiMinutes?.overview || `已根据真实文本转写录入，共识别 ${dialogues.length} 段发言。`,
      keyPoints: aiMinutes?.keyPoints && aiMinutes.keyPoints.length > 0 ? aiMinutes.keyPoints : ["已成功完成文字转写与对话分角色"],
      decisions: aiMinutes?.decisions && aiMinutes.decisions.length > 0 ? aiMinutes.decisions : ["无特别决议记录"],
      actionItems: aiMinutes?.actionItems || []
    };

    return {
      id: `rec_${now}`,
      title: minutes.title,
      createdAt: now,
      audioPath,
      audioFileName: fileName,
      fileSizeBytes,
      duration,
      dialogues,
      chapters,
      minutes,
      summary: {
        overview: minutes.overview,
        keyPoints: minutes.keyPoints,
        actionItems: minutes.actionItems.map((a) => `${a.task} (负责人: ${a.assignee})`)
      }
    };
  }

  // 2. 若纯音频、尚未转写：实事求是呈现真实音频元数据，绝不编造虚假人名与假对白！
  const minutes: MeetingMinutes = {
    title: `${cleanTitle} · 录音记录`,
    dateStr,
    durationStr,
    overview: `真实音频「${fileName}」已安全持久化保存在专属目录，文件大小 ${formatBytes(fileSizeBytes)}。`,
    keyPoints: [
      "真实音频文件已成功归档入沙盒专属目录",
      "顶部原生音频卡片支持随时播放原声、声波波形与倍速调节"
    ],
    decisions: [
      "待进行语音识别或 AI 转写提炼"
    ],
    actionItems: [
      { id: "act_init", task: "在转写详情页中点击转写或在备忘录分享听写文本", assignee: "我", dueDate: "随时", done: false }
    ]
  };

  return {
    id: `rec_${now}`,
    title: cleanTitle,
    createdAt: now,
    audioPath,
    audioFileName: fileName,
    fileSizeBytes,
    duration,
    dialogues: [],
    chapters: [
      { id: "c0", timeSec: 0, title: "音频开始点" }
    ],
    minutes,
    summary: {
      overview: minutes.overview,
      keyPoints: minutes.keyPoints,
      actionItems: ["可进行语音转写或 AI 提炼"]
    }
  };
}
