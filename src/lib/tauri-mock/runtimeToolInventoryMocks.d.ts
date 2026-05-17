export declare const DEFAULT_MOCK_BROWSER_ACTION_CAPABILITIES: readonly [{
    readonly key: "tabs_context_mcp";
    readonly label: "标签页概览";
    readonly description: "读取当前已附着标签页的上下文摘要。";
    readonly group: "read";
    readonly enabled: true;
}, {
    readonly key: "list_tabs";
    readonly label: "列出标签页";
    readonly description: "列出当前浏览器标签页。";
    readonly group: "read";
    readonly enabled: true;
}, {
    readonly key: "tabs_create_mcp";
    readonly label: "新建标签页";
    readonly description: "创建新的浏览器标签页。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "read_page";
    readonly label: "页面快照";
    readonly description: "抓取当前页面快照。";
    readonly group: "read";
    readonly enabled: true;
}, {
    readonly key: "get_page_text";
    readonly label: "页面文本";
    readonly description: "读取当前页面文本内容。";
    readonly group: "read";
    readonly enabled: true;
}, {
    readonly key: "get_page_info";
    readonly label: "页面信息";
    readonly description: "读取页面标题、URL 与快照信息。";
    readonly group: "read";
    readonly enabled: true;
}, {
    readonly key: "find";
    readonly label: "页面内查找";
    readonly description: "在当前页面中查找文本。";
    readonly group: "read";
    readonly enabled: true;
}, {
    readonly key: "read_console_messages";
    readonly label: "控制台消息";
    readonly description: "读取浏览器控制台消息。";
    readonly group: "read";
    readonly enabled: true;
}, {
    readonly key: "read_network_requests";
    readonly label: "网络请求";
    readonly description: "读取页面网络请求记录。";
    readonly group: "read";
    readonly enabled: true;
}, {
    readonly key: "navigate";
    readonly label: "导航";
    readonly description: "导航到目标地址。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "open_url";
    readonly label: "打开链接";
    readonly description: "直接打开目标链接。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "click";
    readonly label: "点击元素";
    readonly description: "点击页面元素。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "type";
    readonly label: "输入文本";
    readonly description: "向当前页面输入文本。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "form_input";
    readonly label: "表单输入";
    readonly description: "按字段填写页面表单。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "switch_tab";
    readonly label: "切换标签页";
    readonly description: "切换当前操作标签页。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "scroll_page";
    readonly label: "滚动页面";
    readonly description: "滚动当前页面或容器。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "refresh_page";
    readonly label: "刷新页面";
    readonly description: "刷新当前页面。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "go_back";
    readonly label: "返回上一页";
    readonly description: "返回上一页。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "go_forward";
    readonly label: "前进到下一页";
    readonly description: "前进到下一页。";
    readonly group: "write";
    readonly enabled: true;
}, {
    readonly key: "javascript";
    readonly label: "执行脚本";
    readonly description: "在当前页面执行脚本。";
    readonly group: "write";
    readonly enabled: true;
}];
export declare const runtimeToolInventoryMocks: Record<string, (args?: {
    request?: {
        caller?: string;
        workbench?: boolean;
        browserAssist?: boolean;
    };
}) => any>;
