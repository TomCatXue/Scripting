import { fetch } from 'scripting'

export namespace Weibo {
  export interface HotSearchItem {
    /** 排名（从 1 开始） */
    itemid: number
    /** 热搜标题 */
    title: string
    /** 搜索词（通常包含 # 话题符） */
    word: string
    /** 热度值 */
    number: number
    /** 类型：topic 等 */
    type: string
    /** 角标图片（如 热/新/沸），可能为空字符串 */
    icon: string
    /** 通用热点图标（所有条目相同） */
    pic: string
    /** 旧版角标 id，现已废弃（为空字符串） */
    pic_id: string
    /** 跳转 scheme，如 weibointernational://search?keyword=... */
    scheme: string
    /** 分类标签，如 综艺/剧集，可能为空 */
    subject_label: string
  }
}

/**
 * 获取微博热搜列表。
 * 注意：旧接口 ct=feed&a=search_topic 现已返回空 data，
 * 实时数据已迁移至 a=search_hot。
 */
export async function fetchHotSearch(): Promise<Weibo.HotSearchItem[]> {
  const url = 'https://weibointl.api.weibo.cn/portal.php?ct=feed&a=search_hot'
  try {
    const { data } = await fetch(url).then((resp) => resp.json())
    if (Array.isArray(data)) {
      return data as Weibo.HotSearchItem[]
    }
    return []
  } catch (error) {
    console.error('fetchHotSearch failed:', error)
    return []
  }
}
