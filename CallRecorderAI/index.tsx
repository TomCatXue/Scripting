import {
  TabView,
  Tab,
  useObservable,
  Navigation,
  Script
} from "scripting";
import { HomePage } from "./pages/HomePage";
import { SettingsPage } from "./pages/SettingsPage";

export function RootAppView() {
  const selection = useObservable<number>(0);

  return (
    <TabView selection={selection}>
      <Tab
        title="首页录音"
        systemImage="waveform.and.mic"
        value={0}
      >
        <HomePage />
      </Tab>

      <Tab
        title="设置与说明"
        systemImage="gearshape.fill"
        value={1}
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
