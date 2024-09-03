import type {IApi} from 'umi';
import {logger} from "@umijs/utils";
import Path from "path";
import {browserExtensionDefaultConfig, browserExtensionEntryConfig, PluginName} from "./interface";
import {completionManifestPath, completionWebpackEntryConfig, findPagesConfig, firstWriteAllFile, initPluginConfig, loadManifestBaseJson, loadManifestTargetJson, removeFileOrDirSync, splitChunksFilter, syncTargetsFiles, writeManifestV3Json} from "./utils";


export default (api: IApi) => {
    api.describe({
        key: 'browserExtension',
        config: {
            default: browserExtensionDefaultConfig,
            schema(joi) {
                return joi.object({
                    rootPath: joi.string(),
                    entryFileName: joi.string(),
                    configFileName: joi.string(),
                    encoding: joi.string(),
                    jsCssOutputDir: joi.string().default(''),
                    manifestFilePath: joi.string().default('manifest.json'),
                    contentScriptsPathName: joi.string().default("content_scripts"),
                    backgroundPathName: joi.string().default('background'),
                    optionsPathName: joi.string().default('options'),
                    optionsOpenInTab: joi.boolean().default(true),
                    optionsTitle: joi.string().default(''),
                    popupPathName: joi.string().default('popup'),
                    popupDefaultTitle: joi.string().default(''),
                    popupDefaultIcon: joi.object().pattern(joi.string(), joi.string()).default({}),
                    splitChunks: joi.boolean().default(true),
                    splitChunksPathName: joi.string().default('chunks'),
                    targets: joi.array().items(joi.string().valid('chrome', 'firefox')).default(['chrome']),
                });
            },
        }
    });

    const isDev = api.env === 'development';
    let hasOpenHMR = false;
    const pluginConfig = initPluginConfig(api.userConfig.browserExtension || {});
    const {splitChunks, jsCssOutputDir, splitChunksPathName, contentScriptsPathName, backgroundPathName, targets} = pluginConfig;
    const manifestSourcePath = completionManifestPath(pluginConfig);
    const manifestSourcePathBefore = manifestSourcePath.replace(/\.json$/, "");
    let manifestBaseJson = loadManifestBaseJson(manifestSourcePath, pluginConfig);
    let manifestTargetsJson = loadManifestTargetJson(manifestSourcePathBefore, targets, pluginConfig);
    let outputPath: string;
    let outputBasePath: string; // 如果只有一个目标时BasePath = outputPath, 多个时BasePath = outputPath.parent();
    let pagesConfig: { [k: string]: browserExtensionEntryConfig } = {};
    //是否启用切割代码
    const enableSplitChunks = splitChunks && !isDev;
    const vendorEntry = enableSplitChunks ? Path.posix.join(jsCssOutputDir, splitChunksPathName, 'vendor') : "";

    api.onStart(() => {
        // 如果没有指定hmr的socket服务器地址,则自动禁用hmr,因为默认情况下插件无法适配hmr,只有popup与options有可能通过自定义真实sockets地址来做到
        if (process.env.SOCKET_SERVER) {
            hasOpenHMR = true;
        } else {
            process.env.HMR = "none";
        }
    });

    // 修改启动前最终umijs配置
    api.modifyConfig((memo) => {
        // 目前umi的mpa功能只支持一级目录,因此按约定好的目录下那就只有选项页会用到mpa自动生成的入口,其他页面自行生成入口
        // 先初始化全部入口,然后按需写入mpa的entry中
        if (!('mpa' in memo)) {
            memo.mpa = {};
        }
        if (!('entry' in memo.mpa)) {
            memo.mpa.entry = {};
        }
        if (!('template' in memo.mpa)) {
            // umi的默认模板过于敷衍甚至没有utf-8协议头,导致如果title如果是中文名会乱码,因此若用户没设置则用我们自己提供的html模板
            // 如果后期umi改了默认模板修复该问题则移除该功能
            // 通过api.addHTMLMetas也并没用
            memo.mpa.template = Path.resolve(__dirname, './template.html');
        }
        if (memo.codeSplitting) {
            memo.codeSplitting = null;
            logger.warn(`${PluginName} 请勿配置UmiJs自带代码分割功能,需使用本插件提供的代码分割`);
            logger.warn(`${PluginName} Please do not configure UmiJs own code splitting function, use the code splitting provided by this plugin`)
        }
        pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, memo.mpa.entry, vendorEntry);
        outputPath = memo.outputPath || "dist";
        outputPath = Path.posix.join(outputPath, isDev ? 'dev' : 'build');
        outputBasePath = outputPath;
        removeFileOrDirSync(outputPath);
        if (targets.length === 0) {
            logger.error(`${PluginName} 必须要有一个具体的target,不能设置为空target`);
            throw Error(`${PluginName} Please set a specific target, cannot be set to an empty target`);
        } else if (targets.length > 1) {
            // 如果是多目标打包，则默认编译到第一个目标，然后把结果copy到其他目标并根据不同的target生成对应的manifest.json
            outputPath = Path.posix.join(outputPath, targets[0]);
        }

        if (isDev) {
            if (!hasOpenHMR) {
                if (memo.fastRefresh === undefined) {
                    memo.fastRefresh = false;
                }
            }
            //mfsu功能会将代码分割,而插件不需要分割
            if (memo.mfsu === undefined) {
                memo.mfsu = false;
            }
            // umi 默认设置true的话不会去排除热更新文件,因此需要手动排除热更新文件,未来如果umi默认排除就不需要传方法了,直接改成true
            if (memo.writeToDisk === undefined || memo.writeToDisk === true) {
                memo.writeToDisk = (filePath: string) => {
                    return !(/\.hot-update\..*$/.test(filePath));
                };
            }
        }
        memo.outputPath = outputPath;
        // console.log("modifyConfig", memo);
        return memo;
    });

    // 修改启动后编译前最终webpack配置
    api.modifyWebpackConfig((memo) => {
        // contentScriptsConfig = findContentScriptsConfig(contentScriptsPath, pluginConfig);
        if (!memo.entry) {
            memo.entry = {};
        }
        if (typeof memo.entry === "object") {
            completionWebpackEntryConfig(pagesConfig, memo.entry);
        } else {
            logger.error(`${PluginName} webpack config entry is not object, please check your webpack config: ${memo.entry}`);
        }
        const {plugins} = memo;

        if (plugins) {
            //如果umi给contentScripts,server worker入口配置了html模板插件则移除
            memo.plugins = plugins.filter(plugin => {
                if (plugin.constructor.name === 'HtmlWebpackPlugin') {
                    // @ts-ignore
                    const {userOptions: {filename}} = plugin;
                    return !(filename.includes(`${contentScriptsPathName}${Path.posix.sep}`) || filename.includes(`${backgroundPathName}${Path.posix.sep}`));
                }
                // 同时也要移除热更新插件
                return !(!hasOpenHMR && plugin.constructor.name === 'HotModuleReplacementPlugin');
            });
        }
        if (enableSplitChunks) {
            const backgroundEntry = Object.values(pagesConfig).find(config => config.type === 'background')?.entry;
            const mainWorldEntryGroup = Object.values(pagesConfig).filter(config => config.type === 'content_script' && config.world === 'MAIN');

            const cacheGroups: { [k: string]: any } = {};
            cacheGroups['vendor'] = {
                chunks: splitChunksFilter(backgroundEntry, mainWorldEntryGroup, false),
                test: /\.(jsx?|tsx?|json)$/,
                name: vendorEntry,
                minChunks: 2, //使用操作两次就可以提取到vendor,因为插件本地化不用在意单个文件的大小,因此这里设置成2
                priority: 1,
            };
            if (mainWorldEntryGroup.length > 0) {
                cacheGroups['vendor-main'] = {
                    chunks: splitChunksFilter(backgroundEntry, mainWorldEntryGroup, true),
                    test: /\.(jsx?|tsx?|json)$/,
                    name: `${vendorEntry}-main`,
                    minChunks: 2, //使用操作两次就可以提取到vendor,因为插件本地化不用在意单个文件的大小,因此这里设置成2
                    priority: 1,
                }
            }
            memo.optimization = {
                ...memo.optimization,
                splitChunks: {
                    //切割代码时排除background,background不能参与切割,因为引入background的js文件只支持单一文件引入
                    cacheGroups: cacheGroups,
                    ...(typeof splitChunks === "object" ? splitChunks : {}),
                }
            }
        }
        // console.log("modifyWebpackConfig", memo);
        return memo;
    });


    api.onBuildComplete(({err, stats}) => {
        if (err) return;
        firstWriteAllFile(stats, manifestBaseJson, manifestTargetsJson, outputPath, outputBasePath, pagesConfig, vendorEntry, targets);
    });

    api.onDevCompileDone(({isFirstCompile, stats}) => {
        if (isFirstCompile) {
            firstWriteAllFile(stats, manifestBaseJson, manifestTargetsJson, outputPath, outputBasePath, pagesConfig, vendorEntry, targets);
        } else {
            syncTargetsFiles(stats, outputPath, outputBasePath, targets)
        }
    });

    api.onGenerateFiles(({isFirstTime, files}) => {
        if (isDev) {
            if (!isFirstTime && files) {
                let manifestIsModified = false;
                for (const {event, path} of files) {
                    if (path.startsWith(manifestSourcePathBefore) && event === 'change') {
                        manifestIsModified = true;
                    }
                }
                if (manifestIsModified) {
                    manifestBaseJson = loadManifestBaseJson(manifestSourcePath, pluginConfig);
                    manifestTargetsJson = loadManifestTargetJson(manifestSourcePathBefore, targets, pluginConfig);
                    for (const target of targets) {
                        const targetPath = Path.posix.join(outputBasePath, target);
                        writeManifestV3Json(manifestBaseJson, manifestTargetsJson, targetPath, pagesConfig, target);
                    }
                    logger.info(`${PluginName} Update and write manifest.json file successfully.`);
                }
            }
        }
    });

    api.addTmpGenerateWatcherPaths(() => [manifestSourcePath, ...targets.map((t) => `${manifestSourcePathBefore}.${t}.json`)]);

    // TODO 添加 content_script, options, background, popup页面的微生成器,下面的生成ManifestV3的微生成器没用,微生成器是给开发者的脚手架,不是编译中用的

    // api.registerGenerator({
    //     key: 'ManifestV3',
    //     name: 'Create manifest.json',
    //     description: 'Create a Manifest V3-compliant JSON file.',
    //     type: GeneratorType.generate,
    //     fn: () => {
    //         const manifestSourcePath = completionManifestPath(pluginConfig);
    //         const manifestTargetPath = Path.posix.join(outputPath, 'manifest.json');
    //         const manifestV3Json = completionManifestV3Json(manifestSourcePath, pagesConfig, pluginConfig);
    //         const manifestString = JSON.stringify(manifestV3Json, null, 2);
    //         if (lastWriteManifestJson != manifestString) {
    //             Fs.writeFileSync(manifestTargetPath, manifestString, encoding);
    //             lastWriteManifestJson = manifestString;
    //             logger.info(`Generate manifest.json file successful.`);
    //         }
    //     }
    // })

};
