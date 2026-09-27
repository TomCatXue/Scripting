import type { TranslationConfig } from "./types";
import { getAISettings } from "./storage";

/**
 * 调用 Apple 原生翻译 (iOS 18+)
 */
async function translateWithApple(text: string, target = "en"): Promise<string> {
  if (typeof Translation !== "undefined" && Translation.shared) {
    try {
      const res = await Translation.shared.translate({
        text,
        target
      });
      return res || text;
    } catch (err) {
      console.warn("Apple 原生翻译执行失败，回退原文:", err);
    }
  }
  return text;
}

/**
 * 调用 OpenAI 兼容格式大模型进行翻译
 */
async function translateWithOpenAI(
  text: string,
  config: TranslationConfig,
  target = "en"
): Promise<string> {
  const langName = target === "zh" ? "中文" : target === "ja" ? "日文" : "英文";
  const prompt = `你是一个精准的翻译助手。请将以下文本翻译为${langName}。仅输出翻译结果，不要输出任何附带解释或多余符号。\n\n原文：\n${text}`;

  const endpoint = config.openaiEndpoint.replace(/\/+$/, "");
  const url = `${endpoint}/chat/completions`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: config.openaiModel || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    return content ? content.trim() : text;
  } catch (err) {
    console.error("OpenAI 格式翻译失败:", err);
    return text;
  }
}

/**
 * 统一对外翻译单句文本接口
 */
export async function translateSingle(text: string, targetLang?: string): Promise<string> {
  if (!text || !text.trim()) return "";
  const settings = getAISettings();
  const config = settings.translation;
  const target = targetLang || config.targetLang || "en";

  if (config.engine === "openai" && config.openaiApiKey) {
    return translateWithOpenAI(text, config, target);
  }

  // 默认使用 Apple 原生翻译
  return translateWithApple(text, target);
}

/**
 * 批量翻译多段文本
 */
export async function translateBatch(texts: string[], targetLang?: string): Promise<string[]> {
  if (!texts || texts.length === 0) return [];
  const settings = getAISettings();
  const config = settings.translation;
  const target = targetLang || config.targetLang || "en";

  if (config.engine === "apple" && typeof Translation !== "undefined" && Translation.shared) {
    try {
      const results = await Translation.shared.translateBatch({
        texts,
        target
      });
      if (results && results.length === texts.length) {
        return results;
      }
    } catch {}
  }

  // 逐句并发调用翻译
  const promises = texts.map((t) => translateSingle(t, target));
  return Promise.all(promises);
}
