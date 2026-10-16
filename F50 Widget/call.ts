// @ts-nocheck
// F50 Widget 通话协议层：AT 指令构造 + AT+CLCC 解析
//
// 设备侧通话由 UFI-TOOLS 完整版（配合面具模块修复音频）提供，
// 客户端只通过 GET /api/AT?command=.. 做 AT 透传，不做音频处理。

export type CallDirection = "mo" | "mt" | "unknown";
export type CallStatus =
    | "idle"
    | "dialing"
    | "alerting"
    | "active"
    | "held"
    | "incoming"
    | "waiting"
    | "unknown";

export interface CallInfo {
    index: number;
    direction: CallDirection;
    status: CallStatus;
    number: string;
    raw: string;
}

/** AT+CLCC 第三字段（call state）→ 内部状态 */
function mapCallState(code: number): CallStatus {
    switch (code) {
        case 0: return "active";
        case 1: return "held";
        case 2: return "dialing";   // MO 拨出中
        case 3: return "alerting";  // MO 对方振铃
        case 4: return "incoming";  // MT 来电振铃
        case 5: return "waiting";   // MT 呼叫等待
        default: return "unknown";
    }
}

/**
 * 构造拨号指令。ATD 只接受可拨号字符，其余（空格、横线、括号）一律剔除。
 * 逗号是 AT 标准的拨号暂停符（如分机号场景），予以保留。
 * 返回 null 表示号码无效，调用方不应发出请求。
 */
export function buildDialCommand(number: string): string | null {
    const cleaned = String(number === undefined || number === null ? "" : number)
        .replace(/[^0-9+*#,]/g, "");
    if (!/[0-9]/.test(cleaned)) return null;
    return "ATD" + cleaned + ";";
}

export function buildAnswerCommand(): string {
    return "ATA";
}

export function buildHangupCommand(): string {
    return "ATH";
}

export function buildStatusCommand(): string {
    return "AT+CLCC";
}

/** 解析 AT+CLCC 输出中的全部通话行；无通话返回空数组 */
export function parseClcc(raw: string): CallInfo[] {
    const calls: CallInfo[] = [];
    const text = String(raw === undefined || raw === null ? "" : raw);
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!/^\+CLCC:/i.test(trimmed)) continue;
        // 例：+CLCC: 1,1,0,0,0,"138****8000",129
        const body = trimmed.replace(/^\+CLCC:\s*/i, "");
        const parts = body.split(",");
        if (parts.length < 3) continue;
        const index = parseInt(parts[0].trim(), 10);
        const dirCode = parseInt(parts[1].trim(), 10);
        const stateCode = parseInt(parts[2].trim(), 10);
        const numberMatch = body.match(/"([^"]*)"/);
        calls.push({
            index: isFinite(index) ? index : 0,
            direction: dirCode === 0 ? "mo" : dirCode === 1 ? "mt" : "unknown",
            status: mapCallState(stateCode),
            number: numberMatch ? numberMatch[1] : "",
            raw: trimmed,
        });
    }
    return calls;
}

/** 汇总当前通话状态：有 active 优先，其次其余任意一条 */
export function summarizeCall(calls: CallInfo[]): CallStatus {
    if (!Array.isArray(calls) || calls.length === 0) return "idle";
    const active = calls.find((c) => c.status === "active");
    if (active) return "active";
    return calls[0].status;
}

/**
 * 判定 AT 指令是否成功。
 * @param allowNoCarrier 挂断场景：`NO CARRIER` 表示通话已结束，视为成功。
 */
export function parseAtsSuccess(raw: string, allowNoCarrier = false): boolean {
    const text = String(raw === undefined || raw === null ? "" : raw);
    if (text.trim() === "") return false;
    if (/\bERROR\b/i.test(text)) return false;
    if (/\bOK\b/i.test(text) || /\bCONNECT\b/i.test(text)) return true;
    if (allowNoCarrier && /\bNO CARRIER\b/i.test(text)) return true;
    return false;
}
