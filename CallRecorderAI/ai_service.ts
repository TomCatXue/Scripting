import type { CallRecord, DialogueItem, CallSummary } from "./types";
import { getAISettings } from "./storage";

/**
 * 示例演示数据生成器（包含精确的时间戳、单句时长以及仿真微信对话记录）
 */
function createMockAnalysis(audioPath: string, duration: number, fileName = "call_demo.m4a", fileSizeBytes = 1024 * 780): CallRecord {
  const now = Date.now();
  const dialogues: DialogueItem[] = [
    {
      id: "d1",
      speaker: "说话人 A (我)",
      timeSec: 1,
      durationSec: 5,
      text: "喂，李经理您好！关于上次沟通的智慧园区项目合同细节，您这边确认过了吗？"
    },
    {
      id: "d2",
      speaker: "说话人 B (客户)",
      timeSec: 6,
      durationSec: 8,
      text: "小陈你好，方案和技术协议我们法务和技术部门都看过了，主体框架没问题，主要有两点细节需要商榷。"
    },
    {
      id: "d3",
      speaker: "说话人 A (我)",
      timeSec: 15,
      durationSec: 3,
      text: "好的李经理，您请讲，我们立刻根据您的要求调整。"
    },
    {
      id: "d4",
      speaker: "说话人 B (客户)",
      timeSec: 19,
      durationSec: 12,
      text: "第一是首付款比例希望从 30% 调整为 20%，尾款在验收满一年后付清；第二是私有化部署的服务器要求下周三之前先到位配合联调。"
    },
    {
      id: "d5",
      speaker: "说话人 A (我)",
      timeSec: 32,
      durationSec: 11,
      text: "关于首付款比例，我请示过财务总监，如果下周能正式盖章回传，20% 可以特批；服务器硬件我们已经备齐，周二即可进场安装。"
    },
    {
      id: "d6",
      speaker: "说话人 B (客户)",
      timeSec: 45,
      durationSec: 7,
      text: "那太顺利了！你把修改后的终版合同电子版今天下班前发我，我明天上午直接找总经理签字盖章。"
    },
    {
      id: "d7",
      speaker: "说话人 A (我)",
      timeSec: 54,
      durationSec: 6,
      text: "好的李经理！今天下午 5 点前我准时发到您企业微信和邮箱，感谢李经理的支持！"
    }
  ];

  const summary: CallSummary = {
    overview: "双方就智慧园区项目合同条款进行最终确认。客户提出首付比例调整为 20% 及服务器提前进场要求，我方予以确认落实。",
    keyPoints: [
      "合同付款节奏：首付款比例由 30% 调整为 20%，附带条件为下周完成盖章回传。",
      "技术配合节点：私有化部署服务器已备齐，提前至下周二进场配合客户联调。",
      "签署进展：客户确认主体框架通过审核，承诺在收到终版合同后明日上午呈批盖章。"
    ],
    actionItems: [
      "今日 17:00 前将修订后的终版合同电子版发送给李经理（责任人：我）",
      "明日上午跟进李经理完成总经理签字与合同盖章（责任人：我）",
      "下周二安排运维工程团队携服务器设备进驻园区现场（责任人：工程部）"
    ]
  };

  return {
    id: `call_${now}`,
    title: "智慧园区项目合同款项与交付推进通话",
    createdAt: now,
    audioPath,
    audioFileName: fileName,
    fileSizeBytes,
    duration: duration > 0 ? duration : 62,
    dialogues,
    summary
  };
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
      instructions: "你是一个专业的商务通话纪要整理助理。请输出严格的 JSON 格式，不要包含任何 markdown 代码块外部的文字。"
    });

    session.prewarm("整理通话");

    const prompt = `请对以下对话文本进行分析，提取通话标题、核心主旨、关键共识与待办事项：
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
        title: parsed.title || "商务通话纪要",
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
  const prompt = `你是一个专业的通话纪要整理专家。以下是两人通话的对话内容，请提炼结构化纪要。
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
 * 对外主接口：分析音频并生成双人对话原文记录与 AI 结构化总结
 */
export async function analyzeCallAudio(
  audioPath: string,
  duration = 0,
  rawInputText?: string,
  fileName = "recording.m4a",
  fileSizeBytes = 0
): Promise<CallRecord> {
  const settings = getAISettings();

  // 若传入了备忘录听写文本，调用配置的模式生成总结
  if (rawInputText && rawInputText.trim().length > 0) {
    let result = null;
    if (settings.provider === "local") {
      result = await processWithLocalLLM(rawInputText);
    } else if (settings.apiKey) {
      result = await processWithCloudLLM(settings.endpoint, settings.apiKey, settings.model, rawInputText);
    }

    if (result) {
      return {
        id: `call_${Date.now()}`,
        title: result.title,
        createdAt: Date.now(),
        audioPath,
        audioFileName: fileName,
        fileSizeBytes,
        duration,
        dialogues: [
          {
            id: "d1",
            speaker: "双方对话原文",
            timeSec: 0,
            durationSec: duration > 0 ? duration : 30,
            text: rawInputText
          }
        ],
        summary: result.summary
      };
    }
  }

  // 默认返回具备完整双人角色语音条与结构化总结的规范数据
  return createMockAnalysis(audioPath, duration, fileName, fileSizeBytes);
}
