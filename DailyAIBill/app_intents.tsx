// @ts-nocheck
/// <reference path="./global.d.ts" />
// ============================================================
// 点击刷新：AppIntent
//
// Scripting 的真实 API 是 AppIntentManager.register + AppIntentProtocol，
// 不是 AppIntent(...) —— 与 MutePanel/app_intents.tsx 保持一致。
//
// 单次刷新必须有超时兜底：网关不可达时 fetch 会长时间挂起，
// 不设超时用户看到的就是「点了没反应」。
// ============================================================
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { fetchBill, loadSettings, saveCache } from "./widget_data"

const REFRESH_TIMEOUT_MS = 10000

function withTimeout<T>(job: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        resolve(null)
      }
    }, ms)
    job.then(
      (v) => {
        if (!done) {
          done = true
          clearTimeout(timer)
          resolve(v)
        }
      },
      () => {
        if (!done) {
          done = true
          clearTimeout(timer)
          resolve(null)
        }
      }
    )
  })
}

export const RefreshBillIntent = AppIntentManager.register({
  name: "RefreshDailyAIBillWidget",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    try {
      const s = loadSettings()
      if (!s.base) return false
      const r = await withTimeout(fetchBill(s), REFRESH_TIMEOUT_MS)
      if (r && r.state) {
        saveCache(r.state)
        return true
      }
      return false
    } catch (e) {
      console.log("刷新失败:", String(e))
      return false
    } finally {
      // 无论成败都让组件重绘，否则用户会以为按钮坏了
      Widget.reloadAll()
    }
  },
})
