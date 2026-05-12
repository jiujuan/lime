import React from "react";
import { reportFrontendError } from "@/lib/crashReporting";
import { getRuntimeAppVersion } from "@/lib/appVersion";
import {
  isModuleImportFailureErrorMessage,
  prepareModuleImportAutoReload,
  isReactFastRefreshHookFailureErrorMessage,
  prepareReactFastRefreshHookAutoReload,
} from "./CrashRecoveryPanel.helpers";
import { CrashRecoveryPanel } from "./CrashRecoveryPanel";

interface AppCrashBoundaryProps {
  children: React.ReactNode;
}

interface AppCrashBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  resetToken: number;
}

export class AppCrashBoundary extends React.Component<
  AppCrashBoundaryProps,
  AppCrashBoundaryState
> {
  constructor(props: AppCrashBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: "",
      resetToken: 0,
    };
  }

  static getDerivedStateFromError(
    error: Error,
  ): Partial<AppCrashBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const componentStack = info.componentStack || "";
    this.setState({ componentStack });

    const pageUrl =
      typeof window !== "undefined" ? window.location.href : "unknown";
    const shouldAutoReloadModule =
      typeof window !== "undefined" &&
      isModuleImportFailureErrorMessage(error.message);
    const shouldAutoReloadReactHook =
      typeof window !== "undefined" &&
      import.meta.env.DEV &&
      isReactFastRefreshHookFailureErrorMessage(error.message);
    const autoReloadUrl =
      shouldAutoReloadModule && typeof window !== "undefined"
        ? prepareModuleImportAutoReload(
            window.location.href,
            getRuntimeAppVersion(),
            window.sessionStorage,
          )
        : shouldAutoReloadReactHook && typeof window !== "undefined"
          ? prepareReactFastRefreshHookAutoReload(
              window.location.href,
              getRuntimeAppVersion(),
              window.sessionStorage,
            )
          : null;

    void reportFrontendError(error, {
      source: "app-crash-boundary",
      workflow_step: "root_render",
      component: "AppCrashBoundary",
      component_stack: componentStack,
      page_url: pageUrl,
      auto_resource_reload_triggered: Boolean(autoReloadUrl),
      auto_resource_reload_reason: shouldAutoReloadModule
        ? "module_import"
        : shouldAutoReloadReactHook
          ? "react_fast_refresh_hook_queue"
          : "none",
    });

    if (autoReloadUrl && typeof window !== "undefined") {
      window.location.replace(autoReloadUrl);
    }
  }

  private handleRetry = () => {
    this.setState((previous) => ({
      hasError: false,
      error: null,
      componentStack: "",
      resetToken: previous.resetToken + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <CrashRecoveryPanel
          error={this.state.error}
          componentStack={this.state.componentStack}
          onRetry={this.handleRetry}
        />
      );
    }

    return (
      <React.Fragment key={this.state.resetToken}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
