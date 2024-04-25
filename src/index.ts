import type {IApi} from 'umi';
import {chalk, logger} from "@umijs/utils";
import Path from "path";
import {browserExtensionDefaultConfig, browserExtensionEntryConfig, PluginName} from "./interface";
import {completionManifestPath, completionWebpackEntryConfig, findPagesConfig, firstWriteManifestV3Json, initPluginConfig, loadManifestBaseJson, removeFileOrDirSync, writeManifestV3Json} from "./utils";


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
                });
            },
        }
    });

    const isDev = api.env === 'development';
    let hasOpenHMR = false;
    const pluginConfig = initPluginConfig(api.userConfig.browserExtension || {});
    const {splitChunks, jsCssOutputDir, splitChunksPathName, contentScriptsPathName, backgroundPathName} = pluginConfig;
    const manifestSourcePath = completionManifestPath(pluginConfig);
    let manifestBaseJson = loadManifestBaseJson(manifestSourcePath, pluginConfig)
    let outputPath: string;
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
        removeFileOrDirSync(outputPath);
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
            memo.optimization = {
                ...memo.optimization,
                splitChunks: {
                    //切割代码时排除background,background不能参与切割,因为引入background的js文件只支持单一文件引入
                    cacheGroups: {
                        vendor: {
                            chunks: backgroundEntry ? (chunk) => chunk.name !== backgroundEntry : 'all',
                            test: /\.[j|t]sx*$/,
                            name: vendorEntry,
                            minChunks: 2, //使用操作两次就可以提取到vendor,因为插件本地化不用在意单个文件的大小,因此这里设置成2
                            priority: 1,
                        },
                    },
                    ...(typeof splitChunks === "object" ? splitChunks : {}),
                }
            }
        }
        // console.log("modifyWebpackConfig", memo);
        return memo;
    });


    api.onBuildComplete(({err, stats}) => {
        if (err) return;
        firstWriteManifestV3Json(stats, manifestBaseJson, outputPath, pagesConfig, vendorEntry);
        // writeManifestV3Json(manifestBaseJson, outputPath, pagesConfig);
        logger.info(`${PluginName} Go to 'chrome://extensions/', enable 'Developer mode', click 'Load unpacked', and select this directory.`);
        logger.info(`${PluginName} 请打开 'chrome://extensions/', 启用 '开发者模式', 点击 '加载已解压的扩展程序', 然后选择该目录。`);
        logger.ready(`${PluginName} Build Complete. Load from: `, chalk.green(Path.resolve(outputPath)));
    });

    api.onDevCompileDone(({isFirstCompile, stats}) => {
        if (isFirstCompile) {
            firstWriteManifestV3Json(stats, manifestBaseJson, outputPath, pagesConfig, vendorEntry);
            logger.info(`${PluginName} Go to 'chrome://extensions/', enable 'Developer mode', click 'Load unpacked', and select this directory.`);
            logger.info(`${PluginName} 首次开发编译完成。请打开 'chrome://extensions/', 启用 '开发者模式', 点击 '加载已解压的扩展程序', 然后选择该目录。`);
            logger.ready(`${PluginName} Dev Compile Complete. Load from: `, chalk.green(Path.resolve(outputPath)));
        }
    });

    api.onGenerateFiles(({isFirstTime, files}) => {
        if (isDev) {
            if (!isFirstTime && files) {
                for (const {event, path} of files) {
                    if (path.includes(manifestSourcePath) && event === 'change') {
                        manifestBaseJson = loadManifestBaseJson(manifestSourcePath, pluginConfig);
                        writeManifestV3Json(manifestBaseJson, outputPath, pagesConfig);
                        logger.info(`${PluginName} Update and write manifest.json file successfully.`);
                    }
                }
            }
        }
    });

    api.addTmpGenerateWatcherPaths(() => [manifestSourcePath]);

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
