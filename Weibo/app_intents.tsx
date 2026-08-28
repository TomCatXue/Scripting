import { AppIntentManager, AppIntentProtocol, Widget } from 'scripting'

// 无参 AppIntent 用 register<void> + perform: async (_: void) => {}，
// 否则 AppIntentFactory 工厂函数要求传 1 个参数。

function getClient(): string {
  // Storage 是全局 API；AppIntent 运行在 widget 扩展进程，
  // 脚本私有域可能不可读，用 try/catch 兜底避免 perform 抛错。
  try {
    const settings = Storage.get<any>('settings')
    return settings?.client || 'international'
  } catch (e) {
    console.log('getClient error', e)
    return 'international'
  }
}

// 热搜条目点击：按设置选择深链，失败兜底 H5 网页
// 参数用字符串 word（不用对象），最稳的 AppIntent 参数类型
export const IntentOpenSearch = AppIntentManager.register({
  name: 'IntentOpenSearch',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (word: string) => {
    try {
      const keyword = word || ''
      const h5Url = `https://m.weibo.cn/search?containerid=${encodeURIComponent('100103type=1&t=10&q=' + keyword)}`

      const isH5 = getClient() === 'h5'
      const url = isH5
        ? h5Url
        : `weibointernational://searchall?q=${encodeURIComponent(keyword)}`

      const opened = await Safari.openURL(url)
      if (!opened) {
        // 国际版 App 未安装等场景：scheme 无法处理，回退 Safari 打开网页版
        console.log('scheme not handled, fallback to h5:', url)
        await Safari.openURL(h5Url)
      }
    } catch (e) {
      console.log('IntentOpenSearch error', e)
      const keyword = word || ''
      await Safari.openURL(`https://m.weibo.cn/search?containerid=${encodeURIComponent('100103type=1&t=10&q=' + keyword)}`)
    } finally {
      Widget.reloadAll()
    }
  }
})

// Logo 点击：打开热搜总榜
export const IntentOpenHotSearch = AppIntentManager.register({
  name: 'IntentOpenHotSearch',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: void) => {
    try {
      // 注意：filter_type=realtimehot 参数会导致 404，已去掉
      const h5Url = `https://m.weibo.cn/p/index?containerid=106003`

      const isH5 = getClient() === 'h5'
      const url = isH5 ? h5Url : 'weibointernational://hotsearch'

      const opened = await Safari.openURL(url)
      if (!opened) {
        console.log('scheme not handled, fallback to h5:', url)
        await Safari.openURL(h5Url)
      }
    } catch (e) {
      console.log('IntentOpenHotSearch error', e)
      await Safari.openURL(`https://m.weibo.cn/p/index?containerid=106003`)
    } finally {
      Widget.reloadAll()
    }
  }
})
