import type { CallRecord } from "../types";
import { AudioDetailPage } from "../pages/AudioDetailPage";

export interface CallDetailViewProps {
  record: CallRecord;
}

/**
 * 完整统一渲染 1:1 会议详情页面 (屏幕 4)
 */
export function CallDetailView({ record }: CallDetailViewProps) {
  return <AudioDetailPage record={record} />;
}
