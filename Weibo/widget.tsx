import {
  HStack,
  Image,
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

// 版本标记：桌面上能看到 "v11" 说明加载的是最新代码
const WIDGET_VERSION = 'v11'

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

  // 深链方案：点击 → 打开 Scripting 运行本脚本 → index.tsx 主 App 环境 Safari.openURL 跳微博
  // 自动识别话题：优先取 API 的 item.word。微博 API 已按条目区分——
  // 话题类 word 带 #（如 #xxx#），普通词不带 #。
  // 这样“有话题走话题（带#）、没话题不带 #”，搜索词与话题属性一致。
  // 注意：桌面小组件是快照，改动后必须刷新 Widget 才会用新链接。
  const getItemLink = useCallback((item: any) => {
    const word = item.word || item.title || ''
    const url = `https://m.weibo.cn/search?containerid=${encodeURIComponent('100103type=1&t=10&q=' + word)}`
    return Script.createRunURLScheme(Script.name, { action: 'open', url, word })
  }, [])

  // Logo 链接：打开热搜总榜（filter_type=realtimehot 参数会 404，已去掉）
  const hotSearchLink = useMemo(() => {
    const url = `https://m.weibo.cn/p/index?containerid=106003`
    return Script.createRunURLScheme(Script.name, { action: 'open', url })
  }, [])

  return (
    <VStack padding={{ horizontal: 14, vertical: paddingY }} frame={Widget.displaySize} spacing={0} widgetBackground={settings.background}>
      {list.slice(0, count - logoLines).map((item, i) => (
        <HStack alignment='top' frame={{ height: itemHeight }}>
          <Link key={item.itemid} buttonStyle='plain' url={getItemLink(item)}>
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
          </Link>
          {i === 0 ? (
            // 时钟仅作展示 + 版本标记（v11 = 最新代码）
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
            <Link key={item.itemid} buttonStyle='plain' url={getItemLink(item)}>
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
            </Link>
          ))}
        </VStack>
        <Link buttonStyle='plain' url={hotSearchLink}>
          <Image
            imageUrl='https://www.sinaimg.cn/blog/developer/wiki/LOGO_64x64.png'
            frame={{ width: settings.logoSize, height: settings.logoSize }}
            widgetAccentedRenderingMode='fullColor'
            resizable
          />
        </Link>
      </HStack>
    </VStack>
  )
}

; (async () => {
  const url = 'https://weibointl.api.weibo.cn/portal.php?ct=feed&a=search_hot'
  const { data } = await fetch(url).then((resp) => resp.json())
  Widget.present(<WidgetView list={Array.isArray(data) ? data : []} />)
})()
