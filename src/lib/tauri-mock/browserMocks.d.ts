type MockBrowserSessionSync = (session: any, options?: {
    finalize?: boolean;
}) => any;
type BrowserMocksOptions = {
    syncBrowserSessionState?: MockBrowserSessionSync;
};
export declare function configureBrowserMocks(options?: BrowserMocksOptions): void;
export declare function launchMockBrowserSession(request: any): any;
export declare const browserMocks: Record<string, (args?: any) => any>;
export {};
