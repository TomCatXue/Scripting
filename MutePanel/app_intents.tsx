// @ts-nocheck
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import {
  refreshAntigravityData,
  refreshCodexData,
  refreshCpampData,
  refreshDeepSeekData,
  refreshEmbyData,
  refreshVpnData,
  refreshWorkBuddyData,
} from "./data"

// 统一刷新 Intent
export const RefreshWidgetIntent = AppIntentManager.register({
  name: "RefreshDashboardKitWidget",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    try {
      console.log("[DashBoard-Kit] Widget refresh triggered")
      await Promise.all([
        refreshWorkBuddyData().catch(() => null),
        refreshEmbyData().catch(() => null),
        refreshDeepSeekData().catch(() => null),
        refreshCodexData().catch(() => null),
        refreshAntigravityData().catch(() => null),
        refreshCpampData().catch(() => null),
        refreshVpnData().catch(() => null),
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
