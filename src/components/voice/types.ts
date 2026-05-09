/**
 * @file 语音组件类型定义
 * @description 供语音组件复用的指令类型与 API 边界
 * @module components/voice/types
 */

export type { VoiceInstruction } from "@/lib/api/asrProvider";

export {
  getVoiceInstructions,
  saveVoiceInstruction,
  deleteVoiceInstruction,
} from "@/lib/api/asrProvider";
