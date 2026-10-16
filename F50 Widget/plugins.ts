// @ts-nocheck
// F50 Widget 插件层：解析 / 序列化 UFI-TOOLS 的 Web UI 自定义头插件片段
//
// 设备端格式（UFI-TOOLS 前端 main.js 与 pluginsModule.kt 共同定义）：
//   <!-- [KANO_PLUGIN_START] 名称 -->
//   内容
//   <!-- [KANO_PLUGIN_END] 名称 -->
// 禁用态：内容被 <!-- [kano_disabled] … [kano_disabled] --> 包裹。

export interface PluginEntry {
    name: string;
    content: string;
    enabled: boolean;
}

const START_RE = /<!--\s*\[KANO_PLUGIN_START\]\s*([\s\S]*?)\s*-->/g;
const DISABLED_OPEN = "<!-- [kano_disabled]";
const DISABLED_CLOSE = "[kano_disabled] -->";

/** 去掉禁用包裹标记，返回纯内容 */
function stripDisabled(content: string): string {
    const trimmed = String(content === undefined || content === null ? "" : content).trim();
    if (trimmed.startsWith(DISABLED_OPEN) && trimmed.endsWith(DISABLED_CLOSE)) {
        return trimmed
            .slice(DISABLED_OPEN.length, trimmed.length - DISABLED_CLOSE.length)
            .trim();
    }
    return trimmed;
}

/** 解析全部插件片段；不完整片段（缺 END 标记）会被忽略，不影响其余插件 */
export function parsePlugins(text: string): PluginEntry[] {
    const source = String(text === undefined || text === null ? "" : text);
    const list: PluginEntry[] = [];
    START_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = START_RE.exec(source)) !== null) {
        const name = match[1].trim();
        if (!name) continue;
        const bodyStart = match.index + match[0].length;
        const endMarker = "<!-- [KANO_PLUGIN_END] " + name + " -->";
        const endIndex = source.indexOf(endMarker, bodyStart);
        if (endIndex < 0) {
            // 片段未闭合：跳过，避免把后续插件内容误并入本插件
            continue;
        }
        const rawContent = source.slice(bodyStart, endIndex).trim();
        list.push({
            name,
            content: stripDisabled(rawContent),
            enabled: !rawContent.startsWith(DISABLED_OPEN),
        });
        // 从 END 标记之后继续扫描，避免嵌套误配
        START_RE.lastIndex = endIndex + endMarker.length;
    }
    return list;
}

/** 生成单个插件的完整片段文本 */
export function buildPluginBlock(entry: PluginEntry): string {
    const content = String(entry.content === undefined || entry.content === null ? "" : entry.content).trim();
    const body = entry.enabled ? content : DISABLED_OPEN + "\n" + content + "\n" + DISABLED_CLOSE;
    return [
        "<!-- [KANO_PLUGIN_START] " + entry.name + " -->",
        body,
        "<!-- [KANO_PLUGIN_END] " + entry.name + " -->",
    ].join("\n");
}

/** 序列化插件列表为设备端自定义头文本 */
export function serializePlugins(list: PluginEntry[]): string {
    if (!Array.isArray(list) || list.length === 0) return "";
    return list.map(buildPluginBlock).join("\n\n") + "\n";
}

/** 切换指定插件的启用状态；插件不存在时原样返回 */
export function setPluginEnabled(text: string, name: string, enabled: boolean): string {
    const list = parsePlugins(text);
    let found = false;
    const updated = list.map((entry) => {
        if (entry.name !== name) return entry;
        found = true;
        return { name: entry.name, content: entry.content, enabled: !!enabled };
    });
    if (!found) return String(text === undefined || text === null ? "" : text);
    return serializePlugins(updated);
}

/** 删除指定插件；插件不存在时原样返回 */
export function removePlugin(text: string, name: string): string {
    const list = parsePlugins(text);
    const updated = list.filter((entry) => entry.name !== name);
    if (updated.length === list.length) return String(text === undefined || text === null ? "" : text);
    return serializePlugins(updated);
}

/** 新增（或覆盖同名）插件 */
export function upsertPlugin(text: string, entry: PluginEntry): string {
    const list = parsePlugins(text).filter((item) => item.name !== entry.name);
    list.push({ name: entry.name, content: entry.content, enabled: !!entry.enabled });
    return serializePlugins(list);
}
