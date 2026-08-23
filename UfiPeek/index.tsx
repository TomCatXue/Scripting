// @ts-nocheck
// UfiPeek 入口：App 内预览小组件（真实数据由 widget.tsx 拉取）
// 配置参数：URL / password / zte_password（脚本参数或 Storage）
// 例如: {"URL":"http://192.168.0.1:2333","password":"...","zte_password":"..."}
import { Script, Widget } from "scripting";

await Widget.preview({ family: "systemMedium" });
Script.exit();