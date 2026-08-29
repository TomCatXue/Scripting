import {
  HStack,
  Image,
  Button,
  Link,
  Script,
  Spacer,
  Text,
  VStack,
  Widget,
  fetch,
  useCallback,
  useMemo,
} from 'scripting'
import { useSettings } from './store/settings'
import { IntentOpenSearch, IntentOpenHotSearch } from './app_intents'

// 版本标记：桌面上能看到 "v13" 说明加载的是最新代码
const WIDGET_VERSION = 'v13'

function WidgetView({ list }: { list: any[] }) {
  const [settings] = useSettings()
  const { height } = Widget.displaySize
  const paddingY = 12

  const standardItemHeight = settings.fontSize + settings.gap
  const count = Math.floor(
    (height - paddingY * 2 + settings.gap) / standardItemHeight
  )
  const itemHeight = standardItemHeight + (height - paddingY * 2 - standardItemHeight * count) / count
  const logoLines = settings.logoSize
    ? Math.ceil(settings.logoSize / (settings.fontSize + settings.gap))
    : 0
  const iconSize = useMemo(() => {
    const size = (settings.fontSize * 12) / 14
    return { width: size, height: size }
  }, [settings.fontSize])
  // 序号列固定宽度：个位数/两位数宽度不同会导致标题起始位置参差
  const rankWidth = settings.fontSize * 1.8
  const now = new Date()

  // Button + AppIntent 方案：点击在 widget 扩展进程执行 perform，不弹 Scripting 界面
  // 搜索词用 item.title（不带 #）：微博 App 深链 searchall 对带 # 话题词不识别

  return (
    <VStack padding={{ horizontal: 14, vertical: paddingY }} frame={Widget.displaySize} spacing={0} widgetBackground={settings.background}>
      {list.slice(0, count - logoLines).map((item, i) => (
        <HStack alignment='top' frame={{ height: itemHeight }}>
          <Button key={item.itemid} buttonStyle='plain' intent={IntentOpenSearch(item.title || item.word || '')}>
            <HStack
              key={item.itemid}
              frame={{ height: itemHeight }}
              alignment='center'
            >
              <Text
                font={settings.fontSize}
                fontWeight='bold'
                foregroundStyle={item.itemid <= 3 ? '#fe4f67' : '#f5c94c'}
                frame={{ width: rankWidth }}
              >
                {item.itemid}
              </Text>
              <Text
                font={settings.fontSize}
                foregroundStyle={settings.color}
                lineLimit={1}
                truncationMode='tail'
              >
                {item.title}
              </Text>
              <Image
                imageUrl={item.icon || item.pic}
                frame={iconSize}
                widgetAccentedRenderingMode={settings.renderingMode}
                resizable
              />
              <Spacer />
            </HStack>
          </Button>
          {i === 0 ? (
            // 时钟仅作展示 + 版本标记（v12 = 最新代码）
            <HStack spacing={2}>
              <Image
                systemName='clock.arrow.circlepath'
                font={settings.fontSize * 0.7}
                foregroundStyle={settings.timeColor}
              />
              <Text
                font={settings.fontSize * 0.7}
                foregroundStyle={settings.timeColor}
              >
                {`${now.getHours()}`.padStart(2, '0')}:
                {`${now.getMinutes()}`.padStart(2, '0')}
              </Text>
              <Text
                font={settings.fontSize * 0.5}
                foregroundStyle={settings.timeColor}
              >
                {WIDGET_VERSION}
              </Text>
            </HStack>
          ) : null}
        </HStack>
      ))}
      <HStack alignment='bottom'>
        <VStack spacing={0} frame={{ height: itemHeight * logoLines }}>
          {list.slice(count - logoLines, count).map((item, i) => (
            <Button key={item.itemid} buttonStyle='plain' intent={IntentOpenSearch(item.title || item.word || '')}>
              <HStack
                key={item.itemid}
                frame={{ height: itemHeight }}
                alignment='center'
              >
                <Text
                  font={settings.fontSize}
                  fontWeight='bold'
                  foregroundStyle={item.itemid <= 3 ? '#fe4f67' : '#f5c94c'}
                  frame={{ width: rankWidth }}
                >
                  {item.itemid}
                </Text>
                <Text
                  font={settings.fontSize}
                  foregroundStyle={settings.color}
                  lineLimit={1}
                  truncationMode='tail'
                >
                  {item.title}
                </Text>
                <Image
                  imageUrl={item.icon || item.pic}
                  frame={iconSize}
                  widgetAccentedRenderingMode={settings.renderingMode}
                  resizable
                />
                <Spacer />
              </HStack>
            </Button>
          ))}
        </VStack>
        <Button buttonStyle='plain' intent={IntentOpenHotSearch(undefined as any)}>
          <Image
            imageUrl='https://www.sinaimg.cn/blog/developer/wiki/LOGO_64x64.png'
            frame={{ width: settings.logoSize, height: settings.logoSize }}
            widgetAccentedRenderingMode='fullColor'
            resizable
          />
        </Button>
      </HStack>
    </VStack>
  )
}

; (async () => {
  const url = 'https://weibointl.api.weibo.cn/portal.php?ct=feed&a=search_hot'
  const { data } = await fetch(url).then((resp) => resp.json())
  Widget.present(<WidgetView list={Array.isArray(data) ? data : []} />)
})()
