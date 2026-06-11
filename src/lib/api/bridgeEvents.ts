/**
 * Bridge event listener 包装（从 dev-bridge 直接引用迁移到 lib/api 统一入口）
 *
 * 业务代码应通过此模块监听 Electron IPC 事件，而非直接 import @/lib/dev-bridge。
 * 详见 internal/refactor/progressive-refactor-plan.md R-40。
 */

export {
  safeListen,
  safeEmit,
  hasDevBridgeEventListenerCapability,
} from "@/lib/dev-bridge";
export { hasNativeDesktopHostEventSupport } from "@/lib/dev-bridge/safeInvoke";
