# 语音组件

语音输入功能相关的 React 组件。当前语音输入设置主链位于 `src/components/settings-v2/agent/voice/index.tsx`，这里只保留被现役页面直接复用的基础组件。

## 文件索引

| 文件 | 说明 |
| --- | --- |
| `types.ts` | 指令编辑器使用的类型与 API 边界 |
| `InstructionEditor.tsx` | 自定义指令编辑器组件 |
| `MicrophoneTest.tsx` | 麦克风设备选择与测试组件 |
| `VolumeWaveform.tsx` | 录音音量波形组件 |

## 使用方式

现役代码应直接引用具体组件路径，避免恢复目录级 barrel：

```tsx
import { InstructionEditor } from "@/components/voice/InstructionEditor";
import { MicrophoneTest } from "@/components/voice/MicrophoneTest";
import { VolumeWaveform } from "@/components/voice/VolumeWaveform";
```

旧的 ASR 凭证管理 UI 已下线；语音模型与转写任务能力继续收敛到设置页、媒体任务和 `audio_transcription` 合同主链。
