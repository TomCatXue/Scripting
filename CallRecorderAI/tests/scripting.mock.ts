export const Navigation = {
  present: async () => {},
  useDismiss: () => () => {}
};

export const Script = {
  exit: (result?: any) => result
};

export const Intent = {
  shortcutParameter: null,
  fileURLsParameter: ["/mock/test_audio.m4a"],
  textsParameter: [],
  text: (val: string) => ({ type: "text", value: val }),
  json: (val: any) => ({ type: "json", value: val })
};

export class AVPlayer {
  currentTime = 0;
  duration = 60;
  rate = 1.0;
  onReadyToPlay?: () => void;
  onEnded?: () => void;
  onError?: (msg: string) => void;

  setSource(src: string): boolean {
    return true;
  }
  play(rate?: number): boolean {
    return true;
  }
  pause(): void {}
  stop(): void {}
  dispose(): void {}
}

export const SharedAudioSession = {
  setActive: async () => {},
  setCategory: async () => {}
};

export const Path = {
  join: (...parts: string[]) => parts.join("/")
};

// 基础 UI 占位
export const NavigationStack = (props: any) => props;
export const VStack = (props: any) => props;
export const HStack = (props: any) => props;
export const Text = (props: any) => props;
export const Button = (props: any) => props;
export const ScrollView = (props: any) => props;
export const Spacer = (props: any) => props;
export const Divider = (props: any) => props;
