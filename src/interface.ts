import Path from "path";

export const PluginName = "[umi-browser-extension]";

// 排除组件文件夹名
export const F_EXCLUDE_COMPONENTS = `${Path.posix.sep}components${Path.posix.sep}`;
export const F_EXCLUDE_MODELS = `${Path.posix.sep}models${Path.posix.sep}`;
export const F_EXCLUDE_UTILS = `${Path.posix.sep}utils${Path.posix.sep}`;

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
    popupDefaultIcon: { [size: string]: string };
    splitChunks: boolean;
    splitChunksPathName: string;
}

export const browserExtensionDefaultConfig: browserExtensionConfig = {
    rootPath: Path.posix.join('src', 'pages'),
    entryFileName: 'index.[jt]s{,x}',
    configFileName: 'index.json',
    encoding: 'utf-8',
    jsCssOutputDir: '',
    manifestFilePath: 'manifest.json',
    contentScriptsPathName: "content_scripts",
    backgroundPathName: "background",
    optionsPathName: "options",
    optionsOpenInTab: true,
    optionsTitle: "",
    popupPathName: "popup",
    popupDefaultTitle: "",
    popupDefaultIcon: {},
    splitChunks: true,
    splitChunksPathName: "chunks",
};

export interface browserExtensionEntryConfig {
    name: string; // umi的mpa的entry名称
    path: string;
    file: string;
    entry: string; // webpack里面的entry名称
    type: 'content_script' | 'options' | 'background' | 'popup';
    world?: '' | 'MAIN';
    title?: string;
    config: { [k: string]: any };
}
