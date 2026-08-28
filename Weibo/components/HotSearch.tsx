import { HStack, Image, Spacer, Text } from 'scripting'
import { Weibo } from '../apis/weibo'

export default function HotSearch({ data }: { data: Weibo.HotSearchItem }) {
  const rank = data.itemid
  const isTop = rank <= 3
  const iconUrl = data.icon || data.pic

  return (
    <HStack frame={{ maxWidth: 'infinity' }} alignment='center' spacing={8}>
      <Text
        fontWeight='bold'
        foregroundStyle={isTop ? '#fe4f67' : '#f5c94c'}
        frame={{ width: 26 }}
      >{rank}</Text>
      <Text>{data.title}</Text>
      {iconUrl ? (
        <Image imageUrl={iconUrl} frame={{ width: 16, height: 16 }} resizable />
      ) : null}
      <Spacer />
    </HStack>
  )
}
