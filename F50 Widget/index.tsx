// @ts-nocheck
// F50 Widget 入口：底部五标签（状态 / 短信 / 电话 / 插件 / 设置）
//
// 页面实现按职责拆到独立文件，入口只负责组装标签栏与主题偏好：
//   status_view.tsx / sms_view.tsx / phone_view.tsx / plugins_view.tsx / settings_view.tsx
import {
    Navigation,
    NavigationStack,
    List,
    Section,
    Text,
    TabView,
    Tab,
    Script,
    useObservable,
} from "scripting";
import { loadAppearance } from "./theme";
import { StatusView } from "./status_view";
import { SMSView } from "./sms_view";
import { PhoneView } from "./phone_view";
import { PluginsView } from "./plugins_view";
import { SettingsView } from "./settings_view";

function RootView() {
    const selection = useObservable<number>(0);
    const appearance = loadAppearance();

    return (
        <TabView selection={selection} preferredColorScheme={appearance === "system" ? undefined : appearance}>
            <Tab title="状态" systemImage="gauge.with.dots.needle.bottom.50percent" value={0}>
                <StatusView
                    onOpenSms={() => selection.setValue(1)}
                    onOpenPhone={() => selection.setValue(2)}
                    onOpenPlugins={() => selection.setValue(3)}
                />
            </Tab>
            <Tab title="短信" systemImage="message.fill" value={1}>
                <SMSView />
            </Tab>
            <Tab title="电话" systemImage="phone.fill" value={2}>
                <PhoneView />
            </Tab>
            <Tab title="插件" systemImage="puzzlepiece.extension.fill" value={3}>
                <PluginsView />
            </Tab>
            <Tab title="设置" systemImage="gearshape.fill" value={4}>
                <SettingsView />
            </Tab>
        </TabView>
    );
}

async function run(): Promise<void> {
    await Navigation.present({
        element: <RootView />,
    });
    Script.exit();
}

run();
