export declare const agentAppMocks: {
    agent_app_list_installed: () => Promise<import("@/features/agent-app/install/installedAppState").InstalledAgentAppStateListResult>;
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
};
