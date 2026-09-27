import {
  TabView,
  Tab,
  useObservable,
  Navigation,
  Script
} from "scripting";
import { HomePage } from "./pages/HomePage";
import { AllMinutesPage } from "./pages/AllMinutesPage";
import { SettingsPage } from "./pages/SettingsPage";

export function RootAppView() {
  const selection = useObservable<number>(0);

  return (
    <TabView selection={selection}>
      {/* Tab 1: 录音 (主录音列表与即时录音) */}
      <Tab
        title="录音"
        systemImage="waveform"
        value={0}
      >
        <HomePage />
      </Tab>

      {/* Tab 2: 纪要 (AI 会议纪要与待办事项聚合库) */}
      <Tab
        title="纪要"
        systemImage="doc.text"
        value={1}
      >
        <AllMinutesPage />
      </Tab>

      {/* Tab 3: 我的 (AI 大模型、转写引擎、语言与数据管理) */}
      <Tab
        title="我的"
        systemImage="person.crop.circle"
        value={2}
      >
        <SettingsPage />
      </Tab>
    </TabView>
  );
}

async function run() {
  try {
    await Navigation.present({
      element: <RootAppView />
    });
  } catch (err) {
    console.error("启动 CallRecorderAI 失败:", err);
  } finally {
    Script.exit();
  }
}

run();
