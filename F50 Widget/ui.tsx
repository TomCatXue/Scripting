// @ts-nocheck
// F50 Widget 共享 UI 组件：卡片 / 数据行 / 指标块 / 状态标签 / 空-错-载态 / 二次确认
// 全部使用 Scripting 官方组件的已验证用法（对照 llms.txt：Gauge / ProgressView / Dialog / Shapes）。
import {
    HStack,
    VStack,
    ZStack,
    Text,
    Spacer,
    Image,
    Button,
    ProgressView,
    Circle,
    RoundedRectangle,
    modifiers,
} from "scripting";
import { SPACING, RADIUS, FONT, THEME, softTint } from "./theme";

/** 卡片描边：与 MutePanel 一致用不透明描边，避免半透明环在不同底色上显色不均 */
function cardStroke() {
    return { shapeStyle: THEME.border, strokeStyle: { lineWidth: 0.8 } };
}

/** 卡片容器：分组圆角 + 细描边，替代散落的 List 行 */
export function SectionCard({ title, children, footer }: any) {
    return (
        <VStack
            spacing={SPACING.sm}
            alignment="leading"
            padding={SPACING.md}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
            modifiers={modifiers()
                .background(THEME.card)
                .clipShape({ type: "rect", cornerRadius: RADIUS.card })}
            overlay={
                <RoundedRectangle cornerRadius={RADIUS.card} stroke={cardStroke()} />
            }
        >
            {title ? (
                <Text font={FONT.footnote} fontWeight="semibold" foregroundStyle="secondaryLabel">
                    {title}
                </Text>
            ) : null}
            {children}
            {footer ? (
                <Text font={FONT.caption} foregroundStyle="tertiaryLabel" lineLimit={3}>
                    {footer}
                </Text>
            ) : null}
        </VStack>
    );
}

/** 标准数据行：图标 + 标题 + 右侧值；缺失值统一显示「暂不支持」 */
export function DataRow({ icon, iconColor = "secondaryLabel", title, value, valueColor = "label", monospaced = true, unavailable = false }: any) {
    return (
        <HStack spacing={SPACING.sm} alignment="center" frame={{ maxWidth: "infinity" }}>
            {icon ? (
                <Image
                    systemName={icon}
                    font={FONT.footnote}
                    frame={{ width: 18, height: 18 }}
                    modifiers={modifiers().foregroundStyle(iconColor)}
                />
            ) : null}
            <Text font={FONT.body}>{title}</Text>
            <Spacer />
            <Text
                font={FONT.body}
                fontWeight="semibold"
                monospacedDigit={monospaced}
                foregroundStyle={unavailable ? "tertiaryLabel" : valueColor}
            >
                {unavailable ? "暂不支持" : value}
            </Text>
        </HStack>
    );
}

/** 小指标块：数值 + 单位 + 说明，用于 2×2 / 2×3 网格 */
export function MetricTile({ label, value, unit, tint = "label", caption }: any) {
    return (
        <VStack
            spacing={2}
            alignment="leading"
            padding={SPACING.sm}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
            modifiers={modifiers()
                .background(THEME.card)
                .clipShape({ type: "rect", cornerRadius: RADIUS.chip })}
        >
            <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                {label}
            </Text>
            <HStack spacing={2} alignment="firstTextBaseline">
                <Text font={FONT.title2} fontWeight="bold" monospacedDigit foregroundStyle={tint}>
                    {value}
                </Text>
                {unit ? (
                    <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                        {unit}
                    </Text>
                ) : null}
            </HStack>
            {caption ? (
                <Text font={FONT.caption} foregroundStyle="tertiaryLabel" lineLimit={1}>
                    {caption}
                </Text>
            ) : null}
        </VStack>
    );
}

/** 环形进度：温度 / 内存 / 流量占比等 */
export function RingGauge({ value, max = 100, label, valueText, tint = THEME.color.accent.light, size = 76 }: any) {
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    return (
        <ZStack frame={{ width: size, height: size }}>
            <Circle()
                stroke="quaternaryLabel"
                strokeLineWidth={6}
                frame={{ width: size, height: size }}
            />
            <Circle()
                trim={{ from: 0, to: ratio }}
                stroke={tint}
                strokeLineWidth={6}
                frame={{ width: size, height: size }}
            />
            <VStack spacing={0} alignment="center">
                <Text font={FONT.callout} fontWeight="bold" monospacedDigit>
                    {valueText}
                </Text>
                {label ? (
                    <Text font={FONT.caption} foregroundStyle="secondaryLabel">
                        {label}
                    </Text>
                ) : null}
            </VStack>
        </ZStack>
    );
}

/** 状态胶囊标签 */
export function StatusPill({ text, tint = "secondaryLabel", filled = false }: any) {
    const background = filled ? tint : softTint(tint, 0.16);
    return (
        <Text
            font={FONT.caption}
            fontWeight="semibold"
            foregroundStyle={filled ? "white" : tint}
            modifiers={modifiers()
                .padding({ horizontal: 8, vertical: 3 })
                .background(background)
                .clipShape({ type: "rect", cornerRadius: RADIUS.pill })}
        >
            {text}
        </Text>
    );
}

/** 空状态：图标 + 文案 + 可选操作 */
export function EmptyState({ icon = "tray", title, message, actionTitle, onAction }: any) {
    return (
        <VStack spacing={SPACING.sm} alignment="center" padding={SPACING.xl} frame={{ maxWidth: "infinity" }}>
            <Image
                systemName={icon}
                font={34}
                frame={{ width: 40, height: 40 }}
                modifiers={modifiers().foregroundStyle("tertiaryLabel")}
            />
            <Text font={FONT.callout} fontWeight="semibold">
                {title}
            </Text>
            {message ? (
                <Text font={FONT.footnote} foregroundStyle="secondaryLabel" lineLimit={4} frame={{ maxWidth: 280 }}>
                    {message}
                </Text>
            ) : null}
            {actionTitle && onAction ? (
                <Button title={actionTitle} action={onAction} modifiers={modifiers().tint(THEME.color.accent.light)} />
            ) : null}
        </VStack>
    );
}

/** 错误状态：明确原因 + 重试 */
export function ErrorState({ message, onRetry }: any) {
    return (
        <VStack spacing={SPACING.sm} alignment="center" padding={SPACING.xl} frame={{ maxWidth: "infinity" }}>
            <Image
                systemName="exclamationmark.triangle.fill"
                font={30}
                frame={{ width: 36, height: 36 }}
                modifiers={modifiers().foregroundStyle(THEME.color.warning.light)}
            />
            <Text font={FONT.callout} fontWeight="semibold">
                读取失败
            </Text>
            <Text font={FONT.footnote} foregroundStyle="secondaryLabel" lineLimit={4} frame={{ maxWidth: 300 }}>
                {message || "未知错误"}
            </Text>
            {onRetry ? <Button title="重试" systemImage="arrow.clockwise" action={onRetry} /> : null}
        </VStack>
    );
}

/** 加载状态 */
export function LoadingState({ message = "正在读取…" }: any) {
    return (
        <VStack spacing={SPACING.sm} alignment="center" padding={SPACING.xl} frame={{ maxWidth: "infinity" }}>
            <ProgressView />
            <Text font={FONT.footnote} foregroundStyle="secondaryLabel">
                {message}
            </Text>
        </VStack>
    );
}

/** 破坏性 / 有外部副作用的操作统一走系统确认框 */
export async function confirmAction(args: { title?: string; message: string; confirmLabel?: string }): Promise<boolean> {
    // Dialog 是 Scripting 的全局 API（与 Storage / Pasteboard 同级），不从 "scripting" 导入。
    return await Dialog.confirm({
        title: args.title || "请确认",
        message: args.message,
        cancelLabel: "取消",
        confirmLabel: args.confirmLabel || "确认",
    });
}
