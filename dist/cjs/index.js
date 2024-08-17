var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  default: () => src_default
});
module.exports = __toCommonJS(src_exports);
var import_utils = require("@umijs/utils");
var import_path = __toESM(require("path"));
var import_interface = require("./interface");
var import_utils2 = require("./utils");
var src_default = (api) => {
  api.describe({
    key: "browserExtension",
    config: {
      default: import_interface.browserExtensionDefaultConfig,
      schema(joi) {
        return joi.object({
          rootPath: joi.string(),
          entryFileName: joi.string(),
          configFileName: joi.string(),
          encoding: joi.string(),
          jsCssOutputDir: joi.string().default(""),
          manifestFilePath: joi.string().default("manifest.json"),
          contentScriptsPathName: joi.string().default("content_scripts"),
          backgroundPathName: joi.string().default("background"),
          optionsPathName: joi.string().default("options"),
          optionsOpenInTab: joi.boolean().default(true),
          optionsTitle: joi.string().default(""),
          popupPathName: joi.string().default("popup"),
          popupDefaultTitle: joi.string().default(""),
          popupDefaultIcon: joi.object().pattern(joi.string(), joi.string()).default({}),
          splitChunks: joi.boolean().default(true),
          splitChunksPathName: joi.string().default("chunks")
        });
      }
    }
  });
  const isDev = api.env === "development";
  let hasOpenHMR = false;
  const pluginConfig = (0, import_utils2.initPluginConfig)(api.userConfig.browserExtension || {});
  const { splitChunks, jsCssOutputDir, splitChunksPathName, contentScriptsPathName, backgroundPathName } = pluginConfig;
  const manifestSourcePath = (0, import_utils2.completionManifestPath)(pluginConfig);
  let manifestBaseJson = (0, import_utils2.loadManifestBaseJson)(manifestSourcePath, pluginConfig);
  let outputPath;
  let pagesConfig = {};
  const enableSplitChunks = splitChunks && !isDev;
  const vendorEntry = enableSplitChunks ? import_path.default.posix.join(jsCssOutputDir, splitChunksPathName, "vendor") : "";
  api.onStart(() => {
    if (process.env.SOCKET_SERVER) {
      hasOpenHMR = true;
    } else {
      process.env.HMR = "none";
    }
  });
  api.modifyConfig((memo) => {
    if (!("mpa" in memo)) {
      memo.mpa = {};
    }
    if (!("entry" in memo.mpa)) {
      memo.mpa.entry = {};
    }
    if (!("template" in memo.mpa)) {
      memo.mpa.template = import_path.default.resolve(__dirname, "./template.html");
    }
    if (memo.codeSplitting) {
      memo.codeSplitting = null;
      import_utils.logger.warn(`${import_interface.PluginName} 请勿配置UmiJs自带代码分割功能,需使用本插件提供的代码分割`);
      import_utils.logger.warn(`${import_interface.PluginName} Please do not configure UmiJs own code splitting function, use the code splitting provided by this plugin`);
    }
    pagesConfig = (0, import_utils2.findPagesConfig)(manifestBaseJson, pluginConfig, memo.mpa.entry, vendorEntry);
    outputPath = memo.outputPath || "dist";
    outputPath = import_path.default.posix.join(outputPath, isDev ? "dev" : "build");
    (0, import_utils2.removeFileOrDirSync)(outputPath);
    if (isDev) {
      if (!hasOpenHMR) {
        if (memo.fastRefresh === void 0) {
          memo.fastRefresh = false;
        }
      }
      if (memo.mfsu === void 0) {
        memo.mfsu = false;
      }
      if (memo.writeToDisk === void 0 || memo.writeToDisk === true) {
        memo.writeToDisk = (filePath) => {
          return !/\.hot-update\..*$/.test(filePath);
        };
      }
    }
    memo.outputPath = outputPath;
    return memo;
  });
  api.modifyWebpackConfig((memo) => {
    var _a;
    if (!memo.entry) {
      memo.entry = {};
    }
    if (typeof memo.entry === "object") {
      (0, import_utils2.completionWebpackEntryConfig)(pagesConfig, memo.entry);
    } else {
      import_utils.logger.error(`${import_interface.PluginName} webpack config entry is not object, please check your webpack config: ${memo.entry}`);
    }
    const { plugins } = memo;
    if (plugins) {
      memo.plugins = plugins.filter((plugin) => {
        if (plugin.constructor.name === "HtmlWebpackPlugin") {
          const { userOptions: { filename } } = plugin;
          return !(filename.includes(`${contentScriptsPathName}${import_path.default.posix.sep}`) || filename.includes(`${backgroundPathName}${import_path.default.posix.sep}`));
        }
        return !(!hasOpenHMR && plugin.constructor.name === "HotModuleReplacementPlugin");
      });
    }
    if (enableSplitChunks) {
      const backgroundEntry = (_a = Object.values(pagesConfig).find((config) => config.type === "background")) == null ? void 0 : _a.entry;
      const mainWorldEntryGroup = Object.values(pagesConfig).filter((config) => config.type === "content_script" && config.world === "MAIN");
      const cacheGroups = {};
      cacheGroups["vendor"] = {
        chunks: (0, import_utils2.splitChunksFilter)(backgroundEntry, mainWorldEntryGroup, false),
        test: /\.(jsx?|tsx?|json)$/,
        name: vendorEntry,
        minChunks: 2,
        //使用操作两次就可以提取到vendor,因为插件本地化不用在意单个文件的大小,因此这里设置成2
        priority: 1
      };
      if (mainWorldEntryGroup.length > 0) {
        cacheGroups["vendor-main"] = {
          chunks: (0, import_utils2.splitChunksFilter)(backgroundEntry, mainWorldEntryGroup, true),
          test: /\.(jsx?|tsx?|json)$/,
          name: `${vendorEntry}-main`,
          minChunks: 2,
          //使用操作两次就可以提取到vendor,因为插件本地化不用在意单个文件的大小,因此这里设置成2
          priority: 1
        };
      }
      memo.optimization = {
        ...memo.optimization,
        splitChunks: {
          //切割代码时排除background,background不能参与切割,因为引入background的js文件只支持单一文件引入
          cacheGroups,
          ...typeof splitChunks === "object" ? splitChunks : {}
        }
      };
    }
    return memo;
  });
  api.onBuildComplete(({ err, stats }) => {
    if (err)
      return;
    (0, import_utils2.firstWriteManifestV3Json)(stats, manifestBaseJson, outputPath, pagesConfig, vendorEntry);
    import_utils.logger.info(`${import_interface.PluginName} Go to 'chrome://extensions/', enable 'Developer mode', click 'Load unpacked', and select this directory.`);
    import_utils.logger.info(`${import_interface.PluginName} 请打开 'chrome://extensions/', 启用 '开发者模式', 点击 '加载已解压的扩展程序', 然后选择该目录。`);
    import_utils.logger.ready(`${import_interface.PluginName} Build Complete. Load from: `, import_utils.chalk.green(import_path.default.resolve(outputPath)));
  });
  api.onDevCompileDone(({ isFirstCompile, stats }) => {
    if (isFirstCompile) {
      (0, import_utils2.firstWriteManifestV3Json)(stats, manifestBaseJson, outputPath, pagesConfig, vendorEntry);
      import_utils.logger.info(`${import_interface.PluginName} Go to 'chrome://extensions/', enable 'Developer mode', click 'Load unpacked', and select this directory.`);
      import_utils.logger.info(`${import_interface.PluginName} 首次开发编译完成。请打开 'chrome://extensions/', 启用 '开发者模式', 点击 '加载已解压的扩展程序', 然后选择该目录。`);
      import_utils.logger.ready(`${import_interface.PluginName} Dev Compile Complete. Load from: `, import_utils.chalk.green(import_path.default.resolve(outputPath)));
    }
  });
  api.onGenerateFiles(({ isFirstTime, files }) => {
    if (isDev) {
      if (!isFirstTime && files) {
        for (const { event, path } of files) {
          if (path.includes(manifestSourcePath) && event === "change") {
            manifestBaseJson = (0, import_utils2.loadManifestBaseJson)(manifestSourcePath, pluginConfig);
            (0, import_utils2.writeManifestV3Json)(manifestBaseJson, outputPath, pagesConfig);
            import_utils.logger.info(`${import_interface.PluginName} Update and write manifest.json file successfully.`);
          }
        }
      }
    }
  });
  api.addTmpGenerateWatcherPaths(() => [manifestSourcePath]);
};
