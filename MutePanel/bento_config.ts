// @ts-nocheck
/// <reference path="./global.d.ts" />
// ============================================================
// BENTO 大号看板的模块配置（App 设置页与 Widget 共用）
// ------------------------------------------------------------
// 为什么单独成模块：
//   index.tsx（App 设置页）需要读写这份配置。如果直接从 widget.tsx 导入，
//   等于把「Widget 入口文件」当成普通模块求值——其中的 Widget.present 在
//   App 宿主里并未实现，会抛 "not implemented method"，并把设置页一起关掉。
//   共享状态一律放在这种普通模块里，入口文件只做宿主适配。
// ============================================================

/** BENTO 模块顺序的存储键（App 内配置 / Widget 读取共享） */
export const LARGE_MODULES_KEY = "mutepanel_large_modules_v1"

/** 可选的 BENTO 模块 id（顺序即默认展示顺序） */
export const LARGE_MODULE_IDS = ["gold", "deepseek", "fx", "oil", "stock"] as const

/** BENTO 默认模块顺序 */
export const DEFAULT_LARGE_MODULES = ["gold", "deepseek", "fx", "oil"]

/** 读取用户自定义的 BENTO 模块顺序，未配置时返回默认四模块 */
export function getLargeModules(): string[] {
  try {
    const saved =
      Storage.get<string[]>(LARGE_MODULES_KEY, { shared: true }) ||
      Storage.get<string[]>(LARGE_MODULES_KEY)
    if (Array.isArray(saved)) {
      const valid = saved
        .map((m) => String(m || "").trim().toLowerCase())
        .filter((m) => (LARGE_MODULE_IDS as readonly string[]).includes(m))
      if (valid.length > 0) return valid.slice(0, 4)
    }
  } catch {}
  return [...DEFAULT_LARGE_MODULES]
}

/** 保存 BENTO 模块顺序 */
export function saveLargeModules(ids: string[]): void {
  try {
    const valid = (Array.isArray(ids) ? ids : [])
      .map((m) => String(m || "").trim().toLowerCase())
      .filter((m) => (LARGE_MODULE_IDS as readonly string[]).includes(m))
    Storage.set(LARGE_MODULES_KEY, valid, { shared: true })
    Storage.set(LARGE_MODULES_KEY, valid)
  } catch {}
}
