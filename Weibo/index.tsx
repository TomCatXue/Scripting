import {
  Navigation, Script,
  NavigationStack, Button, List, Section, Text,
  useCallback, useEffect, useState,
  NavigationLink,
  Image
} from 'scripting'
import { fetchHotSearch, Weibo } from './apis/weibo'
import HotSearch from './components/HotSearch'
import Settings from './pages/Settings'
import Search from './pages/Search'

function View() {
  const dismiss = Navigation.useDismiss()
  const [searches, setSearches] = useState<Weibo.HotSearchItem[]>([])
  const [loading, setLoading] = useState(true)

  const setSearchesAsync = useCallback(async () => {
    setLoading(true)
    const data = await fetchHotSearch()
    setSearches(data)
    setLoading(false)
  }, [])

  // 构建搜索页 URL：用 title（不带 #），与小组件跳转保持一致——
  // 带 # 话题符的词在微博搜索里会被当作话题处理，结果经常对不上。
  const getItemURL = (item: Weibo.HotSearchItem) => {
    const word = item.title || item.word || ''
    return `https://m.weibo.cn/search?containerid=${encodeURIComponent('100103type=1&t=10&q=' + word)}`
  }

  useEffect(() => {
    setSearchesAsync()
  }, [])

  return (
    <NavigationStack>
      <List
        navigationTitle="微博"
        toolbar={{
          topBarTrailing: [
            <Button title='关闭' action={dismiss} />,
            <NavigationLink destination={<Settings />}>
              <Image systemName='gearshape.fill' />
            </NavigationLink>
          ]
        }}
        refreshable={setSearchesAsync}
      >
        {(searches ?? []).map((item) => (
          <NavigationLink
            key={item.itemid}
            destination={<Search url={getItemURL(item)} />}
          >
            <HotSearch data={item} />
          </NavigationLink>
        ))}

        {loading && (searches ?? []).length === 0 ? (
          <Section>
            <Text>加载中…</Text>
          </Section>
        ) : null}

        {!loading && (searches ?? []).length === 0 ? (
          <Section>
            <Text>暂无热搜数据</Text>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

const run = async () => {
  // 小组件/深链跳转：带 action=open 参数时直接打开目标，不展示 UI
  const params = (Script.queryParameters ?? {}) as Record<string, any>
  if (params.action === 'open') {
    const url = params.url || ''
    const word = params.word || ''
    try {
      // 读取设置；未保存过时默认国际版（与 widget 展示的默认值一致）。
      // 注意：不能依赖 settings 存在，否则为 null 时会跳过深链、误走 h5 网页兜底。
      let client = 'international'
      try {
        const settings = Storage.get<any>('settings')
        if (settings?.client) client = settings.client
      } catch (e) {}

      // 深链候选：先按设置（h5 则不尝试），再补其它微博版本作为备选。
      // 例如设备装的是国内版（sinaweibo://）时，国际版深链会失败，
      // 备选能保证“点到哪条就搜哪条”。
      const q = encodeURIComponent(word)
      const candidates: string[] = []
      if (word) {
        if (client !== 'h5') {
          candidates.push(`weibointernational://searchall?q=${q}`)
          candidates.push(`sinaweibo://searchall?q=${q}`)
          candidates.push(`weibolite://searchall?q=${q}`)
        }
      } else {
        // Logo：热搜总榜（仅国际版有验证过的深链，失败走 https 兜底）
        if (client !== 'h5') {
          candidates.push('weibointernational://hotsearch')
        }
      }
      for (const link of [...new Set(candidates)]) {
        const opened = await Safari.openURL(link)
        if (opened) {
          Script.exit()
          return
        }
      }
    } catch (e) {
      console.log('deep link error', e)
    }
    if (url) {
      await Safari.openURL(url)
    }
    Script.exit()
    return
  }

  await Navigation.present({
    element: <View />,
    modalPresentationStyle: "fullScreen"
  })
  Script.exit()
}

run()
