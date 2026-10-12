// @ts-nocheck
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import {
  withTimeout,
  refreshAntigravityData,
  refreshCodexData,
  refreshCpampData,
  refreshDeepSeekData,
  refreshEmbyData,
  refreshFuelData,
  refreshGitHubData,
  refreshGoldData,
  refreshLoonData,
  refreshVpnData,
  refreshWbDirectData,
} from "./data"

/**
 * 刷新 Intent 的单项超时（毫秒）。
 *
 * 任一数据源不可达时（典型场景：Loon 未运行、http://loon.box 无响应），
 * 它的 fetch 会长时间挂起。此前用裸 Promise.all 等全部完成，导致 finally
 * 里的 Widget.reloadAll() 迟迟不执行，用户看到的现象就是「点刷新没反应」。
 * 现在每个任务单独套超时，无论成功还是超时都会在限定时间内落到 reloadAll。
 */
const INTENT_REFRESH_TIMEOUT_MS = 10000

/** 给单个刷新任务套超时；超时或失败都返回 null，绝不阻塞整体流程 */
function guard<T>(job: Promise<T>): Promise<T | null> {
  return withTimeout(job, INTENT_REFRESH_TIMEOUT_MS)
}

// 统一刷新 Intent
export const RefreshWidgetIntent = AppIntentManager.register({
  name: "RefreshDashboardKitWidget",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    try {
      console.log("[DashBoard-Kit] Widget refresh triggered")
      await Promise.all([
        guard(refreshWbDirectData()),
        guard(refreshEmbyData()),
        guard(refreshDeepSeekData()),
        guard(refreshCodexData()),
        guard(refreshAntigravityData()),
        guard(refreshCpampData()),
        guard(refreshVpnData()),
        guard(refreshGitHubData()),
        guard(refreshLoonData()),
        guard(refreshGoldData()),
        guard(refreshFuelData()),
      ])
    } finally {
      Widget.reloadAll()
    }
  },
})

// 组件子模式切换 Intent (如 Antigravity gemini/claude, DeepSeek balance/cost)
export const SetWidgetSubModeIntent = AppIntentManager.register({
  name: "SetWidgetSubMode",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (payload: string) => {
    try {
      if (typeof payload === "string" && payload.includes(":")) {
        const [service, mode] = payload.split(":")
        if (service && mode) {
          const key = "dashboard_kit_submode_" + service
          Storage.set(key, mode, { shared: true })
          Storage.set(key, mode)
        }
      }
    } catch (e) {
      console.log("切换子模式失败:", e)
    } finally {
      Widget.reloadAll()
    }
  },
})
