// Scripting App 全局运行时类型补全与环境声明

// 覆写 DOM Storage 接口，支持 Scripting 原生全局 Storage 静态调用
interface Storage {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null;
  set(key: string, value: any, options?: { shared?: boolean }): void;
  remove(key: string, options?: { shared?: boolean }): void;
}

declare namespace Storage {
  function get<T = any>(key: string, options?: { shared?: boolean }): T | null;
  function set(key: string, value: any, options?: { shared?: boolean }): void;
  function remove(key: string, options?: { shared?: boolean }): void;
}

declare namespace FileManager {
  const documentsDirectory: string;
  const appGroupDocumentsDirectory: string;
  function existsSync(path: string): boolean;
  function readAsStringSync(path: string): string;
  function writeAsStringSync(path: string, content: string): void;
  function removeSync(path: string): void;
}

declare const Storage: {
  get<T = any>(key: string, options?: { shared?: boolean }): T | null;
  set(key: string, value: any, options?: { shared?: boolean }): void;
  remove(key: string, options?: { shared?: boolean }): void;
};

declare const FileManager: {
  readonly documentsDirectory: string;
  readonly appGroupDocumentsDirectory: string;
  existsSync(path: string): boolean;
  readAsStringSync(path: string): string;
  writeAsStringSync(path: string, content: string): void;
  removeSync(path: string): void;
};

// 系统剪贴板（读取粘贴的凭据）。需要 Full Access 权限。
declare const Pasteboard: {
  getString(): Promise<string | null>;
  setString(value: string | null): Promise<void>;
  hasStrings: Promise<boolean>;
};

// 系统文件选择器（读取 plugin-auth.json）。需要 Full Access 权限。
declare const DocumentPicker: {
  pickFiles(options?: {
    initialDirectory?: string;
    types?: string[];
    shouldShowFileExtensions?: boolean;
    allowsMultipleSelection?: boolean;
  }): Promise<string[]>;
  stopAcessingSecurityScopedResources(): void;
};

declare global {
  function prompt(message: string): Promise<string | null>;
  function prompt(options: {
    title: string;
    message?: string;
    defaultValue?: string;
    obscureText?: boolean;
    selectAll?: boolean;
    placeholder?: string;
    cancelLabel?: string;
    confirmLabel?: string;
    keyboardType?: unknown;
  }): Promise<string | null>;
  function alert(message: string): Promise<void>;
  function confirm(message: string): Promise<boolean>;
}

export {};
