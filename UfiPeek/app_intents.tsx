// @ts-nocheck
// UfiPeek AppIntent：点击小组件时立即刷新数据并重载小组件
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting";
import { fetchWidgetSnapshot, saveWidgetCache } from "./widget_data";

export const RefreshUfiPeekIntent = AppIntentManager.register({
  name: "RefreshUfiPeek",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    try {
      const { state } = await fetchWidgetSnapshot();
      saveWidgetCache(state);
    } catch (e) {
      console.log("UfiPeek 手动刷新失败:", String((e as Error)?.message || e));
    }
    // 重载小组件，以最新状态重新渲染
    Widget.reloadAll();
  },
});