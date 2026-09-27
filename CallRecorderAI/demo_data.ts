import type { CallRecord } from "./types";

/**
 * 原图 1:1 像素级复刻范例数据：项目例会录音与 AI 深度纪要
 */
export function getProjectDemoRecord(): CallRecord {
  const timestamp = new Date("2025-04-26T10:00:00").getTime();

  return {
    id: "demo_project_meeting_20250426",
    title: "项目例会录音",
    createdAt: timestamp,
    audioPath: "", // 沙盒中若无实体文件，AVPlayer 自带优雅空转与模拟播放器模式
    audioFileName: "项目例会录音.m4a",
    duration: 3738, // 01:02:18
    fileSizeBytes: 24 * 1024 * 1024,
    dialogues: [
      {
        id: "d0",
        speaker: "发言人1",
        timeSec: 0,
        durationSec: 8,
        text: "大家好，今天我们主要讨论一下项目的最新进展和接下来的计划。"
      },
      {
        id: "d1",
        speaker: "发言人2",
        timeSec: 8,
        durationSec: 7,
        text: "我们先回顾一下上周的项目进展，目前开发部分已经完成了80%，接下来需要重点关注测试环节。",
        highlightText: "开发部分已经完成了80%",
        isKeyPoint: true
      },
      {
        id: "d2",
        speaker: "发言人1",
        timeSec: 15,
        durationSec: 6,
        text: "好的，测试预计这周开始，预计需要3天时间。如果没有问题的话，下周就可以进入上线准备阶段。",
        highlightText: "下周就可以进入上线准备阶段",
        isKeyPoint: true
      },
      {
        id: "d3",
        speaker: "发言人2",
        timeSec: 21,
        durationSec: 11,
        text: "另外，关于用户反馈的几个问题，我们也在同步处理，主要是登录和消息推送的稳定性。"
      },
      {
        id: "d4",
        speaker: "发言人1",
        timeSec: 32,
        durationSec: 16,
        text: "好的，那我们就按照这个计划推进，有问题随时沟通。"
      }
    ],
    chapters: [
      { id: "c0", timeSec: 0, title: "会议开始，项目进展回顾" },
      { id: "c1", timeSec: 8, title: "开发进度完成 80%" },
      { id: "c2", timeSec: 15, title: "测试计划及时间安排" },
      { id: "c3", timeSec: 21, title: "用户反馈问题讨论" },
      { id: "c4", timeSec: 32, title: "后续优化方向" },
      { id: "c5", timeSec: 48, title: "会议总结" }
    ],
    minutes: {
      title: "项目例会·会议纪要",
      dateStr: "2025年4月26日  10:00 - 11:20",
      durationStr: "共 1.3 小时",
      overview:
        "本次会议主要围绕项目最新进展、测试计划及上线准备工作展开。当前开发进度已完成 80%，测试工作将于本周启动，预计下周进入上线准备阶段。会议还讨论了用户反馈的相关问题，并明确了后续的优化方向。",
      keyPoints: [
        "开发进度已完成 80%，当前无重大风险。",
        "测试工作本周启动，预计 3 天完成。",
        "下周进入上线准备阶段。",
        "重点关注登录和消息推送的稳定性。"
      ],
      decisions: [
        "本周启动整体测试，重点覆盖登录与消息推送模块",
        "下周开展上线准备评审"
      ],
      actionItems: [
        {
          id: "act_1",
          task: "完成测试用例编写",
          assignee: "张三",
          dueDate: "4月28日",
          done: true
        },
        {
          id: "act_2",
          task: "修复登录相关问题",
          assignee: "李四",
          dueDate: "4月29日",
          done: true
        },
        {
          id: "act_3",
          task: "准备上线环境",
          assignee: "王五",
          dueDate: "5月1日",
          done: true
        }
      ]
    },
    summary: {
      overview:
        "本次会议主要围绕项目最新进展、测试计划及上线准备工作展开。当前开发进度已完成 80%，测试工作将于本周启动，预计下周进入上线准备阶段。会议还讨论了用户反馈的相关问题，并明确了后续的优化方向。",
      keyPoints: [
        "开发进度已完成 80%，当前无重大风险。",
        "测试工作本周启动，预计 3 天完成。",
        "下周进入上线准备阶段。",
        "重点关注登录和消息推送的稳定性。"
      ],
      actionItems: [
        "完成测试用例编写 (张三 4月28日)",
        "修复登录相关问题 (李四 4月29日)",
        "准备上线环境 (王五 5月1日)"
      ]
    },
    attachedFiles: [
      {
        id: "f_doc1",
        name: "项目需求文档.pdf",
        sizeStr: "2.4 MB",
        type: "pdf"
      }
    ]
  };
}
