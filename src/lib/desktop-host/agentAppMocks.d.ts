import type { AppManifest, InstalledAgentAppState } from "@/features/agent-app/types";
export declare const agentAppMocks: {
    agent_app_inspect_local_package: (args: any) => Promise<{
        sourceKind: string;
        sourceUri: string;
        appDir: string;
        appMarkdown: string;
        manifest: AppManifest;
        manifestHash: string;
        packageHash: string;
        inspectedAt: string;
    }>;
    agent_app_fetch_cloud_package: (args: any) => Promise<import("@/features/agent-app/install/packageCache").AgentAppPackageCacheEntry>;
    agent_app_save_installed_state: (args: any) => Promise<InstalledAgentAppState>;
    agent_app_list_installed: () => Promise<import("@/features/agent-app/install/installedAppState").InstalledAgentAppStateListResult>;
    agent_app_set_disabled: (args: any) => Promise<import("@/features/agent-app/install/installedAppState").InstalledAgentAppStateListResult>;
    agent_app_uninstall_rehearsal: (args: any) => Promise<{
        appId: string;
        packageHash: string;
        mode: string;
        generatedAt: string;
        deletedTargetCount: number;
        retainedTargetCount: number;
        targets: {
            kind: string;
            value: string;
            safeToDelete: boolean;
            action: string;
            reason: string;
        }[];
        warnings: string[];
    }>;
    agent_app_uninstall: (args: any) => Promise<{
        status: string;
        rehearsal: {
            appId: string;
            packageHash: string;
            mode: string;
            generatedAt: string;
            deletedTargetCount: number;
            retainedTargetCount: number;
            targets: {
                kind: string;
                value: string;
                safeToDelete: boolean;
                action: string;
                reason: string;
            }[];
            warnings: string[];
        };
        list: import("@/features/agent-app/install/installedAppState").InstalledAgentAppStateListResult;
        removedTargetCount: number;
        missingTargetCount: number;
        blockerCodes: string[];
        deleteEvidence: {
            status: string;
            generatedAt: string;
            dataRoot: string;
            removedTargets: Array<Record<string, unknown>>;
            missingTargets: Array<Record<string, unknown>>;
            retainedTargets: Array<Record<string, unknown>>;
            blockedTargets: Array<Record<string, unknown>>;
            failedTarget: Record<string, unknown> | null;
            blockerCodes: string[];
            postDeleteResidualAudit?: {
                status: string;
                checkedAt: string;
                checkedTargetCount: number;
                remainingTargetCount: number;
                remainingTargets: Array<Record<string, unknown>>;
                failedTarget: Record<string, unknown> | null;
            };
        } | null;
    }>;
    agent_app_start_ui_runtime: (args: any) => Promise<{
        appId: string;
        status: string;
        baseUrl: string;
        entryUrl: string;
        port: number;
        pid: number;
        entryKey: string;
        route: string;
    }>;
    agent_app_get_ui_runtime_status: (args: any) => Promise<{
        appId: string;
        status: string;
        baseUrl: string;
        entryUrl: string;
        port: number;
        pid: number;
        entryKey: string;
        route: string;
    }>;
    agent_app_stop_ui_runtime: (args: any) => Promise<{
        appId: string;
        status: string;
        message: string;
    }>;
    agent_app_select_directory: () => Promise<{
        path: null;
        cancelled: boolean;
        message: string;
    }>;
    agent_app_launch_shell: (args: any) => Promise<{
        appId: string;
        status: string;
        installMode: string;
        shellKind: string;
        descriptorVersion: any;
        devShell: boolean;
        blockerCodes: string[];
        message: string;
        launchedAt: string;
        packageMount?: undefined;
        runtimeStatus?: undefined;
        shellWindow?: undefined;
    } | {
        appId: string;
        status: string;
        installMode: string;
        shellKind: string;
        descriptorVersion: any;
        devShell: boolean;
        blockerCodes: string[];
        message: string;
        packageMount: {
            kind: string;
            path: string;
            readOnly: boolean;
            packageHash: string;
            manifestHash: string;
        };
        runtimeStatus: {
            appId: string;
            status: string;
            baseUrl: string;
            entryUrl: string;
            port: number;
            pid: number;
            entryKey: string;
            route: string;
        };
        shellWindow: {
            label: string;
            title: string;
            url: string;
            reused: boolean;
            chrome: {
                deepLinkScheme: string;
                openEntryKey: string;
                trayEnabled: boolean;
                closePolicy: string;
                menuItemIds: string[];
                multiAppManagement: boolean;
                runtimeBypass: boolean;
            };
        };
        launchedAt: string;
    }>;
    agent_app_runtime_start_task: (args: any) => Promise<{
        appId: string;
        entryKey: any;
        taskId: string;
        traceId: string;
        taskKind: string;
        sessionId: string;
        turnId: string;
        eventName: string;
        status: string;
        submittedAt: string;
    }>;
    agent_app_runtime_cancel_task: (args: any) => Promise<{
        appId: string;
        taskId: string;
        sessionId: string;
        cancelled: boolean;
        status: string;
    }>;
    agent_app_runtime_get_task: (args: any) => Promise<{
        appId: string;
        taskId: string;
        sessionId: string;
        status: string;
        taskStatus: string;
        taskEvents: {
            id: string;
            eventType: string;
            status: string;
            message: string;
            occurredAt: string;
            payload: {
                source: string;
            };
        }[];
        threadRead: {
            session_id: string;
            status: string;
            source: string;
        };
    }>;
    agent_app_runtime_submit_host_response: (args: any) => Promise<{
        appId: string;
        taskId: string;
        status: string;
    }>;
};
