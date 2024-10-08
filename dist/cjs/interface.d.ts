export declare const PluginName = "[umi-browser-extension]";
export declare const ClearAbsPathKey = "_node_modules_babel_runtime_helpers_";
export declare const F_EXCLUDE_COMPONENTS: string;
export declare const F_EXCLUDE_MODELS: string;
export declare const F_EXCLUDE_UTILS: string;
export type Target = 'chrome' | 'chrome102' | 'firefox';
export type Encoding = "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2" | "base64" | "latin1" | "binary" | "hex";
export interface browserExtensionConfig {
    rootPath: string;
    entryFileName: string;
    configFileName: string;
    encoding: Encoding;
    jsCssOutputDir: string;
    manifestFilePath: string;
    contentScriptsPathName: string;
    backgroundPathName: string;
    optionsPathName: string;
    optionsOpenInTab: boolean;
    optionsTitle: string;
    popupPathName: string;
    popupDefaultTitle: string;
    popupDefaultIcon: {
        [size: string]: string;
    };
    splitChunks: boolean;
    splitChunksPathName: string;
    targets: Target[];
    manifestHandler?: (manifestJson: any, target: Target) => any;
    clearAbsPath: boolean | string;
}
export declare const browserExtensionDefaultConfig: browserExtensionConfig;
export interface browserExtensionEntryConfig {
    name: string;
    path: string;
    file: string;
    entry: string;
    type: 'content_script' | 'options' | 'background' | 'popup';
    world?: '' | 'MAIN';
    title?: string;
    config: {
        [k: string]: any;
    };
}
//# sourceMappingURL=interface.d.ts.map