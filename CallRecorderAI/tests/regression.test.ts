import test from "node:test";
import assert from "node:assert/strict";
import { saveRecord, getAllRecords, getRecordById, deleteRecord, getAISettings, saveAISettings } from "../storage.ts";
import { analyzeCallAudio } from "../ai_service.ts";
import { AUDIO_FOLDER_NAME, discoverUnindexedAudios } from "../audio_manager.ts";
import { translateSingle } from "../translation_service.ts";
import type { CallRecord } from "../types.ts";

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

test("Storage: 能够正确保存、查询、列表与删除通话记录", () => {
  const dummy: CallRecord = {
    id: "test_call_001",
    title: "测试通话",
    createdAt: Date.now(),
    audioPath: "/path/to/test.m4a",
    audioFileName: "test.m4a",
    duration: 45,
    fileSizeBytes: 1024 * 50,
    dialogues: [
      { id: "1", speaker: "说话人 A", timeSec: 0, durationSec: 5, text: "你好" },
      { id: "2", speaker: "说话人 B", timeSec: 5, durationSec: 8, text: "收到" }
    ],
    chapters: [
      { id: "c1", timeSec: 0, title: "开场" }
    ],
    minutes: {
      title: "测试纪要",
      dateStr: "2026-09-28",
      durationStr: "45秒",
      overview: "测试概述",
      keyPoints: ["重点1"],
      decisions: ["决议1"],
      actionItems: [{ id: "a1", task: "待办1", assignee: "小王", dueDate: "明天", done: false }]
    },
    summary: {
      overview: "测试概述",
      keyPoints: ["重点1"],
      actionItems: ["待办1"]
    }
  };

  saveRecord(dummy);

  const found = getRecordById("test_call_001");
  assert.ok(found, "应该能根据 ID 查出记录");
  assert.equal(found.title, "测试通话");
  assert.equal(found.dialogues.length, 2);
  assert.equal(found.minutes.actionItems.length, 1);

  const all = getAllRecords();
  assert.ok(all.some((r) => r.id === dummy.id), "列表中应包含新增记录");

  deleteRecord("test_call_001");
  assert.equal(getRecordById("test_call_001"), null, "删除后应查询不到");
});

test("Translation: 翻译服务在无模拟网络环境下优雅回退原文", async () => {
  const original = "Hello World";
  const res = await translateSingle(original, "zh");
  assert.ok(res.length > 0, "翻译方法应安全返回非空文本");
});

test("AudioManager: 录音统一存储目录名称规范", () => {
  assert.equal(AUDIO_FOLDER_NAME, "CallRecordings");
});

test("AudioManager: 物理文件扫描兜底正常运行", () => {
  const list = discoverUnindexedAudios([]);
  assert.ok(Array.isArray(list), "应当返回数组");
});

test("Storage: AI 配置与翻译配置持久化与读取", () => {
  const initial = getAISettings();
  assert.ok(initial.provider, "应该存在默认 provider");
  assert.ok(initial.translation, "应该存在翻译配置");

  saveAISettings({
    transcriptionMode: "asr_direct",
    provider: "openai",
    apiKey: "sk-test123456",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o",
    translation: {
      engine: "openai",
      openaiEndpoint: "https://api.openai.com/v1",
      openaiApiKey: "sk-trans-key",
      openaiModel: "gpt-4o-mini",
      targetLang: "en"
    }
  });

  const updated = getAISettings();
  assert.equal(updated.translation.engine, "openai");
  assert.equal(updated.translation.openaiModel, "gpt-4o-mini");
});

test("AIService: 无听写文本时实事求是反映未转写真实状态，绝不捏造假对白", async () => {
  const result = await analyzeCallAudio("/var/mobile/recording.m4a", 62, undefined, "recording.m4a", 1024 * 100);

  assert.ok(result.id, "必须包含唯一 ID");
  assert.equal(result.duration, 62, "时长应与传入一致");
  assert.equal(result.audioFileName, "recording.m4a");
  assert.equal(result.dialogues.length, 0, "无转写文本时对白列表应为空，严禁伪造假对话");
});

test("AIService: 传入真实听写文本时正确切分双人角色与时间戳单调递增", async () => {
  const realText = "大家早上好，今天讨论新版上线计划。\n测试团队预计明天给出回归报告。";
  const result = await analyzeCallAudio("/var/mobile/recording.m4a", 40, realText, "meeting.m4a", 1024 * 80);

  assert.equal(result.dialogues.length, 2, "两段发言应切为2句对白");
  let lastTime = -1;
  for (const d of result.dialogues) {
    assert.ok(d.speaker, "每句必须有角色名");
    assert.ok(d.text.length > 0, "每句必须有文本");
    assert.ok(d.timeSec >= lastTime, "对话时间戳必须单调递增");
    lastTime = d.timeSec;
  }
});

test("Utils: 音频时间格式化正确", () => {
  assert.equal(formatSeconds(0), "00:00");
  assert.equal(formatSeconds(9), "00:09");
  assert.equal(formatSeconds(62), "01:02");
  assert.equal(formatSeconds(365), "06:05");
});
