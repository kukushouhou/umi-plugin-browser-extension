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
          splitChunksPathName: joi.string().default("chunks"),
          targets: joi.array().items(joi.string().valid("chrome", "firefox")).default(["chrome"])
        });
      }
    }
  });
  const isDev = api.env === "development";
  let hasOpenHMR = false;
  const pluginConfig = (0, import_utils2.initPluginConfig)(api.userConfig.browserExtension || {});
  const { splitChunks, jsCssOutputDir, splitChunksPathName, contentScriptsPathName, backgroundPathName, targets } = pluginConfig;
  const manifestSourcePath = (0, import_utils2.completionManifestPath)(pluginConfig);
  const manifestSourcePathBefore = manifestSourcePath.replace(/\.json$/, "");
  let manifestBaseJson = (0, import_utils2.loadManifestBaseJson)(manifestSourcePath, pluginConfig);
  let manifestTargetsJson = (0, import_utils2.loadManifestTargetJson)(manifestSourcePathBefore, targets, pluginConfig);
  let outputPath;
  let outputBasePath;
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
    outputBasePath = outputPath;
    (0, import_utils2.removeFileOrDirSync)(outputPath);
    if (targets.length === 0) {
      import_utils.logger.error(`${import_interface.PluginName} 必须要有一个具体的target,不能设置为空target`);
      throw Error(`${import_interface.PluginName} Please set a specific target, cannot be set to an empty target`);
    } else if (targets.length > 1) {
      outputPath = import_path.default.posix.join(outputPath, targets[0]);
    }
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
    (0, import_utils2.firstWriteAllFile)(stats, manifestBaseJson, manifestTargetsJson, outputPath, outputBasePath, pagesConfig, vendorEntry, targets);
  });
  api.onDevCompileDone(({ isFirstCompile, stats }) => {
    if (isFirstCompile) {
      (0, import_utils2.firstWriteAllFile)(stats, manifestBaseJson, manifestTargetsJson, outputPath, outputBasePath, pagesConfig, vendorEntry, targets);
    } else {
      (0, import_utils2.syncTargetsFiles)(stats, outputPath, outputBasePath, targets);
    }
  });
  api.onGenerateFiles(({ isFirstTime, files }) => {
    if (isDev) {
      if (!isFirstTime && files) {
        let manifestIsModified = false;
        for (const { event, path } of files) {
          if (path.startsWith(manifestSourcePathBefore) && event === "change") {
            manifestIsModified = true;
          }
        }
        if (manifestIsModified) {
          manifestBaseJson = (0, import_utils2.loadManifestBaseJson)(manifestSourcePath, pluginConfig);
          manifestTargetsJson = (0, import_utils2.loadManifestTargetJson)(manifestSourcePathBefore, targets, pluginConfig);
          for (const target of targets) {
            const targetPath = import_path.default.posix.join(outputBasePath, target);
            (0, import_utils2.writeManifestV3Json)(manifestBaseJson, manifestTargetsJson, targetPath, pagesConfig, target);
          }
          import_utils.logger.info(`${import_interface.PluginName} Update and write manifest.json file successfully.`);
        }
      }
    }
  });
  api.addTmpGenerateWatcherPaths(() => [manifestSourcePath, ...targets.map((t) => `${manifestSourcePathBefore}.${t}.json`)]);
};
