// @ts-nocheck
/// <reference path="./global.d.ts" />
// ============================================================
// App 内：设置页 + 三种尺寸预览
//
// API 形式对齐 F50 Widget / MutePanel：
//   <TextField title value onChanged prompt />  输入即存
//   <Section footer={...}>                      说明放 footer
//   useState 必须从 "scripting" 显式导入，否则输入框只显示不能输入
// ============================================================
import {
  Button,
  HStack,
  List,
  NavigationStack,
  Section,
  SecureField,
  Text,
  TextField,
  Widget,
  useState,
} from "scripting"
import { C } from "./theme"
import { loadSettings, saveSettings, type BillSettings, type Period } from "./widget_data"
import { pingGateway } from "./api"
import { ensureFont } from "./fonts"

const PERIODS: [Period, string][] = [
  ["today", "今天"],
  ["7d", "近 7 天"],
  ["30d", "近 30 天"],
  ["all", "全部"],
]

export default function SettingsView() {
  ensureFont()
  const init = loadSettings()
  const [base, setBase] = useState(init.base)
  const [key, setKey] = useState(init.key)
  const [rate, setRate] = useState(String(init.rate))
  const [budget, setBudget] = useState(String(init.budget))
  const [period, setPeriod] = useState<Period>(init.period)
  const [status, setStatus] = useState("")

  const persist = (patch: Partial<BillSettings>) => {
    const next: BillSettings = {
      base: (patch.base ?? base).trim(),
      key: (patch.key ?? key).trim(),
      rate: Math.max(0.01, Number(patch.rate ?? rate) || 6.67),
      budget: Math.max(0, Number(patch.budget ?? budget) || 0),
      currency: "cny",
      period: (patch.period ?? period) as Period,
    }
    saveSettings(next)
    return next
  }

  const test = async () => {
    persist({})
    setStatus("测试中…")
    const r = await pingGateway(base, key)
    setStatus(r.ok ? "✓ " + r.message : "✗ " + r.message)
  }

  const preview = async (family: any) => {
    persist({})
    await Widget.preview({ family })
  }

  return (
    <NavigationStack>
      <List navigationTitle="每日 AI 账单" navigationBarTitleDisplayMode="large">
        <Section
          header={<Text>magpie 网关</Text>}
          footer={
            <Text>
              电脑上执行 magpie gateway-key add alma-widget --read-only 生成只读 Key。本机可填 127.0.0.1，手机必须填局域网 IP。
            </Text>
          }
        >
          <TextField
            title="网关地址"
            value={base}
            onChanged={(v: string) => {
              setBase(v)
              persist({ base: v })
            }}
            prompt="http://192.168.0.149:3425"
          />
          <SecureField
            title="只读 Key"
            value={key}
            onChanged={(v: string) => {
              setKey(v)
              persist({ key: v })
            }}
            prompt="填 magpie 的只读 gateway key"
          />
          <HStack spacing={10}>
            <Button title="测试连接" action={test} />
            {status ? (
              <Text
                font={12}
                lineLimit={3}
                foregroundStyle={status.indexOf("✓") === 0 ? C.ok : "#C0392B"}
              >
                {status}
              </Text>
            ) : null}
          </HStack>
        </Section>

        <Section
          header={<Text>计价</Text>}
          footer={<Text>magpie 接口只回 USD 数值、不含汇率，需在此填写。6.67 是当前实测值。预算填 0 则不显示进度条。</Text>}
        >
          <TextField
            title="汇率 1 USD = ? CNY"
            value={rate}
            onChanged={(v: string) => {
              setRate(v)
              persist({ rate: v })
            }}
            prompt="6.67"
          />
          <TextField
            title="每日预算（元）"
            value={budget}
            onChanged={(v: string) => {
              setBudget(v)
              persist({ budget: v })
            }}
            prompt="10"
          />
        </Section>

        <Section
          header={<Text>统计周期</Text>}
          footer={<Text>近 7 天以上时，AGENT → 模型 明细只取前 500 条请求，属近似值；今天的数据是精确的。</Text>}
        >
          {PERIODS.map(([v, label]) => (
            <Button
              key={v}
              title={period === v ? "✓ " + label : label}
              buttonStyle={period === v ? "borderedProminent" : "bordered"}
              action={() => {
                setPeriod(v)
                persist({ period: v })
              }}
            />
          ))}
        </Section>

        <Section
          header={<Text>预览</Text>}
          footer={<Text>2×2 要「预算版」：长按桌面组件 → 编辑小组件 → 参数填 budget。</Text>}
        >
          <HStack spacing={8}>
            <Button title="2×2" controlSize="mini" action={() => preview("systemSmall")} />
            <Button title="4×2" controlSize="mini" action={() => preview("systemMedium")} />
            <Button title="4×4" controlSize="mini" action={() => preview("systemLarge")} />
          </HStack>
        </Section>

        <Section>
          <Button
            title="保存并刷新组件"
            buttonStyle="borderedProminent"
            action={async () => {
              persist({})
              await Widget.reloadAll()
              await alert("已刷新全部组件")
            }}
          />
        </Section>
      </List>
    </NavigationStack>
  )
}
