export declare function normalizeLegacyRuntimeStatusTitle(title: string): string;
export declare function normalizeLegacyToolSurfaceName(value?: string | null): string | undefined;
export declare function normalizeLegacyThreadItem<T extends {
    type?: unknown;
    text?: unknown;
}>(item: T): T;
export declare function normalizeLegacyThreadItems<T extends {
    type?: unknown;
    text?: unknown;
}>(items: T[]): T[];
