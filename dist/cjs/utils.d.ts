import { browserExtensionConfig, browserExtensionEntryConfig } from "./interface";
import { webpack } from "umi";
export declare function completionWebpackEntryConfig(pagesConfig: {
    [k: string]: browserExtensionEntryConfig;
}, webpackEntryConfig: {
    [k: string]: any;
}): void;
export declare function initPluginConfig(pluginConfig: browserExtensionConfig): browserExtensionConfig;
export declare function findPagesConfig(manifestBaseJson: {
    [k: string]: any;
}, pluginConfig: browserExtensionConfig, umiMpaEntryConfig: {
    [k: string]: any;
}, vendorEntry: string): {
    [path: string]: browserExtensionEntryConfig;
};
export declare function completionManifestPath(pluginConfig: browserExtensionConfig, resultAbsolutePath?: boolean): string;
export declare function loadManifestBaseJson(manifestSourcePath: string, pluginConfig: browserExtensionConfig): {
    [k: string]: any;
};
export declare function completionManifestV3Json(manifestBaseJson: {
    [k: string]: any;
}, pagesConfig: {
    [k: string]: browserExtensionEntryConfig;
}): {
    [x: string]: any;
};
export declare function firstWriteManifestV3Json(stats: webpack.Stats, manifestBaseJson: {
    [k: string]: any;
}, outputPath: string, pagesConfig: {
    [k: string]: browserExtensionEntryConfig;
}, vendorEntry: string): void;
export declare function writeManifestV3Json(manifestBaseJson: {
    [k: string]: any;
}, outputPath: string, pagesConfig: {
    [k: string]: browserExtensionEntryConfig;
}): void;
export declare function removeFileOrDirSync(filePath: string): void;
/**
 * Converts a path string to POSIX format, ensuring it uses forward slashes.
 * @param {string} inputPath - The path string provided by the user.
 * @returns {string} - The POSIX style path.
 */
export declare function toPosixPath(inputPath: string): string;
export declare function splitChunksFilter(backgroundEntry: string | undefined, mainWorldEntryGroup: browserExtensionEntryConfig[], matchMainWorldEntry: boolean): 'all' | ((chunk: webpack.Chunk) => boolean);
//# sourceMappingURL=utils.d.ts.map