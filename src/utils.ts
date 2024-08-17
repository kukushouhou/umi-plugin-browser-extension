import {glob, logger} from '@umijs/utils'
import {browserExtensionConfig, browserExtensionDefaultConfig, browserExtensionEntryConfig, F_EXCLUDE_COMPONENTS, F_EXCLUDE_MODELS, F_EXCLUDE_UTILS, PluginName} from "./interface";
import Path from "path";
import Fs from "fs";
import {webpack} from "umi";

export function completionWebpackEntryConfig(pagesConfig: { [k: string]: browserExtensionEntryConfig }, webpackEntryConfig: { [k: string]: any }) {
    for (const page of Object.values(pagesConfig)) {
        const {entry, file, type} = page;
        if (!(entry in webpackEntryConfig) || type === 'content_script' || type === 'background') {
            //如果是content_script,background则需要移除默认入口,直接指向真实file,因为现在umi的mpa模式无法关闭html入口的生成
            webpackEntryConfig[entry] = [Path.join(process.cwd(), file),]
        }
    }
}

export function initPluginConfig(pluginConfig: browserExtensionConfig): browserExtensionConfig {
    const result = {
        ...browserExtensionDefaultConfig,
        ...(pluginConfig),
    };
    result.rootPath = toPosixPath(result.rootPath);
    return result;
}

export function findPagesConfig(manifestBaseJson: { [k: string]: any }, pluginConfig: browserExtensionConfig, umiMpaEntryConfig: { [k: string]: any }, vendorEntry: string): { [path: string]: browserExtensionEntryConfig } {
    const {rootPath, contentScriptsPathName, backgroundPathName, optionsPathName, popupPathName, entryFileName} = pluginConfig;
    const contentScriptsPath = Path.posix.join(rootPath, contentScriptsPathName);
    const backgroundPath = Path.posix.join(rootPath, backgroundPathName);
    const optionsPath = Path.posix.join(rootPath, optionsPathName);
    const popupPath = Path.posix.join(rootPath, popupPathName);
    const result: { [path: string]: browserExtensionEntryConfig } = {};
    for (const entry of findFileGroup(contentScriptsPath, entryFileName)) {
        const config = loadContentScriptsConfig(entry, pluginConfig, umiMpaEntryConfig, vendorEntry);
        if (config) {
            result[entry] = config;
        }
    }
    const backgroundEntry = findFileGroup(backgroundPath, entryFileName);
    if (backgroundEntry.length === 1) {
        const entry = backgroundEntry[0];
        result[entry] = loadBackgroundConfig(entry, pluginConfig, umiMpaEntryConfig);
    } else if (backgroundEntry.length > 1) {
        logger.error(`${PluginName} background entry file must be one, but found ${backgroundEntry.length}`);
    }
    const optionsEntry = findFileGroup(optionsPath, entryFileName);
    if (optionsEntry.length === 1) {
        const entry = optionsEntry[0];
        result[entry] = loadOptionsConfig(manifestBaseJson, entry, pluginConfig, umiMpaEntryConfig);
    } else if (optionsEntry.length > 1) {
        logger.error(`${PluginName} options entry file must be one, but found ${optionsEntry.length}`);
    }
    const popupEntry = findFileGroup(popupPath, entryFileName);
    if (popupEntry.length === 1) {
        const entry = popupEntry[0];
        result[entry] = loadPopupConfig(manifestBaseJson, entry, pluginConfig, umiMpaEntryConfig);
    } else if (popupEntry.length > 1) {
        logger.error(`${PluginName} popup entry file must be one, but found ${popupEntry.length}`);
    }
    return result;
}

function loadContentScriptsConfig(entry: string, pluginConfig: browserExtensionConfig, umiMpaEntryConfig: { [k: string]: any }, vendorEntry: string): browserExtensionEntryConfig | null {
    const {rootPath, configFileName, encoding, jsCssOutputDir} = pluginConfig;
    const path = Path.posix.dirname(entry);
    const mpaName = path.replace(`${rootPath}${Path.posix.sep}`, '');
    const configPath = Path.posix.join(path, configFileName);
    const jsCssOutputPath = Path.posix.join(jsCssOutputDir, mpaName);
    let config: { [key: string]: any } = {};
    let title: string | undefined = undefined;
    if (!Fs.existsSync(configPath)) {
        return null;
    }
    config = JSON.parse(Fs.readFileSync(configPath, {encoding}).toString());
    title = config.title;
    delete config.title;
    if ('js' in config) {
        completionFilePathFromNameList(jsCssOutputPath, config.js);
        if (vendorEntry) {
            config.js.unshift(`${vendorEntry}.js`);
        }
    }
    if ('css' in config) {
        completionFilePathFromNameList(jsCssOutputPath, config.css);
    }
    const entryConfig: browserExtensionEntryConfig = {
        name: mpaName,
        path: path,
        file: entry,
        entry: completionEntry(mpaName, pluginConfig),
        title: title,
        type: 'content_script',
        config: config,
        world: config.world ?? ''
    };
    completionUmiMpaEntryConfig(entryConfig, umiMpaEntryConfig)
    return entryConfig;
}

function loadBackgroundConfig(file: string, pluginConfig: browserExtensionConfig, umiMpaEntryConfig: { [k: string]: any }): browserExtensionEntryConfig {
    const {rootPath} = pluginConfig;
    const path = Path.posix.dirname(file);
    const mpaName = path.replace(`${rootPath}${Path.posix.sep}`, '');
    const entry = completionEntry(mpaName, pluginConfig);
    const entryConfig: browserExtensionEntryConfig = {
        name: mpaName,
        path: path,
        file: file,
        entry: entry,
        title: undefined,
        type: 'background',
        config: {
            service_worker: `${entry}.js`,
        }
    }
    completionUmiMpaEntryConfig(entryConfig, umiMpaEntryConfig);
    return entryConfig;
}

function loadOptionsConfig(manifestBaseJson: { [k: string]: any }, file: string, pluginConfig: browserExtensionConfig, umiMpaEntryConfig: { [k: string]: any }): browserExtensionEntryConfig {
    const {name: extensionName} = manifestBaseJson;
    const {rootPath, optionsOpenInTab, optionsTitle} = pluginConfig;
    const path = Path.posix.dirname(file);
    const mpaName = path.replace(`${rootPath}${Path.posix.sep}`, '');
    const entry = completionEntry(mpaName, pluginConfig);
    const entryConfig: browserExtensionEntryConfig = {
        name: mpaName,
        path: path,
        file: file,
        entry: entry,
        title: optionsTitle || extensionName || 'options',
        type: 'options',
        config: {
            page: `${entry}.html`,
            open_in_tab: optionsOpenInTab,
        }
    }
    completionUmiMpaEntryConfig(entryConfig, umiMpaEntryConfig);
    return entryConfig;
}

function loadPopupConfig(manifestBaseJson: { [k: string]: any }, file: string, pluginConfig: browserExtensionConfig, umiMpaEntryConfig: { [k: string]: any }): browserExtensionEntryConfig {
    const {name: extensionName} = manifestBaseJson;
    const {rootPath, popupDefaultTitle, popupDefaultIcon} = pluginConfig;
    const path = Path.posix.dirname(file);
    const mpaName = path.replace(`${rootPath}${Path.posix.sep}`, '');
    const entry = completionEntry(mpaName, pluginConfig);
    const entryConfig: browserExtensionEntryConfig = {
        name: mpaName,
        path: path,
        file: file,
        entry: entry,
        title: popupDefaultTitle || extensionName || 'popup',
        type: 'popup',
        config: {
            default_icon: popupDefaultIcon,
            default_title: popupDefaultTitle,
            default_popup: `${entry}.html`,
        }
    }
    completionUmiMpaEntryConfig(entryConfig, umiMpaEntryConfig);
    return entryConfig;
}

function completionContentScriptsConfig(statsData: webpack.StatsCompilation, pageConfig: { [k: string]: browserExtensionEntryConfig }, vendorEntry: string) {
    // 如果pageConfig的content_script没有js或css，则从assets中自动补全
    if (statsData.entrypoints && statsData.chunks) {
        for (const {type, entry, config} of Object.values(pageConfig)) {
            if (type === 'content_script') {
                const existJs = 'js' in config && config.js.length > 0;
                const existCss = 'css' in config && config.css.length > 0;
                if (entry in statsData.entrypoints) {
                    const entryPoint = statsData.entrypoints[entry];
                    if (entryPoint.chunks) {
                        let existVendor = false;
                        for (const chunkId of entryPoint.chunks) {
                            const chunk = statsData.chunks.find(c => c.id === chunkId);
                            if (chunk && chunk.files) {
                                for (const file of chunk.files) {
                                    if (file.endsWith('.js')) {
                                        if (!existJs) {
                                            if (!('js' in config)) {
                                                config.js = [];
                                            }
                                            config.js.push(file);
                                        }
                                        if (file.startsWith(`${vendorEntry}.`)) {
                                            existVendor = true;
                                        }
                                    } else if (file.endsWith('.css')) {
                                        if (!existCss) {
                                            if (!('css' in config)) {
                                                config.css = [];
                                            }
                                            config.css.push(file);
                                        }
                                    }
                                }
                            }
                        }
                        if (existJs && vendorEntry && !existVendor) {
                            // 如果用户自行配置了js,且当前启用了代码切割,且实际入口没有生成vendor.js,则从配置中移除vendor.js
                            config.js = config.js.filter((file: string) => !file.startsWith(`${vendorEntry}.`));
                        }
                    }
                }
            }
        }
    }
}

function completionUmiMpaEntryConfig(extensionEntryConfig: browserExtensionEntryConfig, umiMpaEntryConfig: { [k: string]: any }) {
    const {name, entry} = extensionEntryConfig;
    if (name in umiMpaEntryConfig) {
        const umiEntryConfig = umiMpaEntryConfig[name];
        if (umiEntryConfig.title) {
            extensionEntryConfig.title = umiEntryConfig.title;
        }
    }
    if (!name.includes(Path.posix.sep)) {
        // 不包含分隔符的情况下说明是一级目录,需要在umi上完善name信息来使得编译出来的路径默认在文件夹中而不是直接编译到根目录中
        // 如果未来新版本umi支持多级子目录的mpa,则这里就需要将if去掉,都要走下面的逻辑
        if (!(name in umiMpaEntryConfig)) {
            umiMpaEntryConfig[name] = {};
        }
        if (extensionEntryConfig.title && umiMpaEntryConfig[name].title !== extensionEntryConfig.title) {
            umiMpaEntryConfig[name].title = extensionEntryConfig.title;
        }
        if (!umiMpaEntryConfig[name].name) {
            umiMpaEntryConfig[name].name = entry;
        }
    }
}

export function completionManifestPath(pluginConfig: browserExtensionConfig, resultAbsolutePath: boolean = false) {
    const {rootPath, manifestFilePath} = pluginConfig;
    let result = manifestFilePath;
    if (!Fs.existsSync(result)) {
        result = Path.posix.join(rootPath, manifestFilePath);
        if (!Fs.existsSync(result)) {
            logger.error(`[${PluginName}]  manifest file no found:\t${result}`);
            throw Error();
        }
    }
    if (resultAbsolutePath) {
        result = Path.resolve(result);
    }
    return result;
}

export function loadManifestBaseJson(manifestSourcePath: string, pluginConfig: browserExtensionConfig): { [k: string]: any } {
    return JSON.parse(Fs.readFileSync(manifestSourcePath, {encoding: pluginConfig.encoding}).toString());
}

export function completionManifestV3Json(manifestBaseJson: { [k: string]: any }, pagesConfig: { [k: string]: browserExtensionEntryConfig }) {
    const manifestJson = {...manifestBaseJson};
    const contentScriptsConfig: { [k: string]: any }[] = [];
    for (const pageConfig of Object.values(pagesConfig)) {
        const {type, config} = pageConfig;
        switch (type) {
            case 'content_script':
                contentScriptsConfig.push(config);
                break;
            case 'options':
                manifestJson.options_ui = config;
                break;
            case 'popup':
                if (config && Object.keys(config).length > 0) {
                    manifestJson.action = {...config};
                    if (!manifestJson.action.default_icon || Object.keys(manifestJson.action.default_icon).length === 0) {
                        // 如果用户没传递弹窗图标,直接复用扩展图标
                        manifestJson.action.default_icon = manifestJson.icons;
                    }
                    if (!manifestJson.action.default_title) {
                        // 如果用户没传递弹窗标题,直接复用扩展名称
                        manifestJson.action.default_title = manifestJson.name;
                    }
                }
                break;
            case 'background':
                manifestJson.background = config;
                break;
            default:
                logger.error(`[${PluginName}]  unknown page type:\t${type}`);
                throw Error();
        }
    }
    if (contentScriptsConfig.length > 0) {
        manifestJson.content_scripts = contentScriptsConfig;
    }
    return manifestJson;
}

export function firstWriteManifestV3Json(stats: webpack.Stats, manifestBaseJson: { [k: string]: any }, outputPath: string, pagesConfig: { [k: string]: browserExtensionEntryConfig }, vendorEntry: string) {
    const statsData = stats.toJson({all: true});
    if (statsData.chunks) {
        completionContentScriptsConfig(statsData, pagesConfig, vendorEntry);
    }
    writeManifestV3Json(manifestBaseJson, outputPath, pagesConfig);
}

export function writeManifestV3Json(manifestBaseJson: { [k: string]: any }, outputPath: string, pagesConfig: { [k: string]: browserExtensionEntryConfig }) {
    const manifestJson = completionManifestV3Json(manifestBaseJson, pagesConfig);
    Fs.writeFileSync(Path.posix.join(outputPath, 'manifest.json'), JSON.stringify(manifestJson, null, 2));
}


function findFileGroup(pathBefore: string, fileName: string) {
    return (glob.sync(`${pathBefore}/**/${fileName}`)).map(path => Path.posix.normalize(path)).filter(path => !path.includes(F_EXCLUDE_COMPONENTS) && !path.includes(F_EXCLUDE_MODELS) && !path.includes(F_EXCLUDE_UTILS));
}

function completionFilePathFromNameList(path: string, nameList: string[]) {
    if (nameList) {
        for (let i = 0; i < nameList.length; i += 1) {
            const name = nameList[i];
            if (name.indexOf(path) === -1) {
                nameList[i] = Path.posix.join(path, name);
            }
        }
    }
}


function completionEntry(mpaName: string, pluginConfig: browserExtensionConfig) {
    const {jsCssOutputDir} = pluginConfig;
    return Path.posix.join(jsCssOutputDir, mpaName, 'index');
}

export function removeFileOrDirSync(filePath: string) {
    try {
        if (Fs.existsSync(filePath)) {
            const STATUS = Fs.statSync(filePath);
            if (STATUS.isFile()) {
                // 如果原路径是文件
                //删除原文件
                Fs.unlinkSync(filePath);
            } else if (STATUS.isDirectory()) {
                //如果原路径是目录
                //如果原路径是非空目录,遍历原路径
                //空目录时无法使用forEach
                Fs.readdirSync(filePath).forEach(item => {
                    //递归调用函数，以子文件路径为新参数
                    removeFileOrDirSync(`${filePath}/${item}`);
                });
                //删除空文件夹
                Fs.rmdirSync(filePath);
            }
        }
    } catch (e) {
        console.error(e);
    }
}


/**
 * Converts a path string to POSIX format, ensuring it uses forward slashes.
 * @param {string} inputPath - The path string provided by the user.
 * @returns {string} - The POSIX style path.
 */
export function toPosixPath(inputPath: string): string {
    // Normalize the path to remove any redundancies
    const normalizedPath = Path.normalize(inputPath);

    // Convert path separators to POSIX style forward slashes
    return normalizedPath.split(Path.sep).join(Path.posix.sep);
}


export function splitChunksFilter(backgroundEntry: string | undefined, mainWorldEntryGroup: browserExtensionEntryConfig[], matchMainWorldEntry: boolean): 'all' | ((chunk: webpack.Chunk) => boolean) {
    // const backgroundEntry = Object.values(pagesConfig).find(config => config.type === 'background')?.entry;
    // const mainWorldEntryGroup = Object.values(pagesConfig).filter(config => config.type === 'content_script' && config.world === 'MAIN');

    if (!backgroundEntry && mainWorldEntryGroup.length === 0) {
        return 'all';
    }

    return (chunk: webpack.Chunk) => {
        if (matchMainWorldEntry) {
            return mainWorldEntryGroup.some(entry => entry.entry === chunk.name);
        }
        return !(chunk.name === backgroundEntry || mainWorldEntryGroup.some(entry => entry.entry === chunk.name));
    }
}
