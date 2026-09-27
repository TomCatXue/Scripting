import test from "node:test";
import assert from "node:assert/strict";
import { saveRecord, getAllRecords, getRecordById, deleteRecord, getAISettings, saveAISettings } from "../storage.ts";
import { analyzeCallAudio } from "../ai_service.ts";
import { AUDIO_FOLDER_NAME, discoverUnindexedAudios } from "../audio_manager.ts";
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

  const all = getAllRecords();
  assert.ok(all.some((r) => r.id === dummy.id), "列表中应包含新增记录");

  deleteRecord("test_call_001");
  assert.equal(getRecordById("test_call_001"), null, "删除后应查询不到");
});

test("AudioManager: 录音统一存储目录名称规范", () => {
  assert.equal(AUDIO_FOLDER_NAME, "CallRecordings");
});

test("AudioManager: 物理文件扫描兜底正常运行", () => {
  const list = discoverUnindexedAudios([]);
  assert.ok(Array.isArray(list), "应当返回数组");
});

test("Storage: AI 配置持久化与读取", () => {
  const initial = getAISettings();
  assert.ok(initial.provider, "应该存在默认 provider");

  saveAISettings({
    transcriptionMode: "asr_direct",
    provider: "openai",
    apiKey: "sk-test123456",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o"
  });

  const updated = getAISettings();
  assert.equal(updated.transcriptionMode, "asr_direct");
  assert.equal(updated.provider, "openai");
  assert.equal(updated.apiKey, "sk-test123456");
  assert.equal(updated.model, "gpt-4o");
});

test("AIService: 音频分析返回格式符合双人对话规范与时间戳单调递增", async () => {
  const result = await analyzeCallAudio("/var/mobile/recording.m4a", 62, undefined, "recording.m4a", 1024 * 100);

  assert.ok(result.id, "必须包含唯一 ID");
  assert.ok(result.title.length > 0, "标题不应为空");
  assert.equal(result.duration, 62, "时长应与传入一致");
  assert.equal(result.audioFileName, "recording.m4a");

  // 验证双人对话
  assert.ok(result.dialogues.length >= 2, "至少包含两位说话人的对话");
  let lastTime = -1;
  for (const d of result.dialogues) {
    assert.ok(d.speaker, "每句必须有角色名");
    assert.ok(d.text.length > 0, "每句必须有文本");
    assert.ok(d.timeSec >= lastTime, "对话时间戳必须单调递增");
    lastTime = d.timeSec;
  }

  // 验证总结与待办
  assert.ok(result.summary.overview.length > 0, "必须有主旨概述");
  assert.ok(result.summary.keyPoints.length > 0, "必须有关键结论");
  assert.ok(result.summary.actionItems.length > 0, "必须有待办事项清单");
});

test("Utils: 音频时间格式化正确", () => {
  assert.equal(formatSeconds(0), "00:00");
  assert.equal(formatSeconds(9), "00:09");
  assert.equal(formatSeconds(62), "01:02");
  assert.equal(formatSeconds(365), "06:05");
});
