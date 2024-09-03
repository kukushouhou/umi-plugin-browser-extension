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

// src/utils.ts
var utils_exports = {};
__export(utils_exports, {
  completionManifestPath: () => completionManifestPath,
  completionManifestV3Json: () => completionManifestV3Json,
  completionManifestV3ToFirefox: () => completionManifestV3ToFirefox,
  completionWebpackEntryConfig: () => completionWebpackEntryConfig,
  copyFileOrDirSync: () => copyFileOrDirSync,
  findPagesConfig: () => findPagesConfig,
  firstWriteAllFile: () => firstWriteAllFile,
  firstWriteManifestV3Json: () => firstWriteManifestV3Json,
  initPluginConfig: () => initPluginConfig,
  loadManifestBaseJson: () => loadManifestBaseJson,
  loadManifestTargetJson: () => loadManifestTargetJson,
  removeFileOrDirSync: () => removeFileOrDirSync,
  splitChunksFilter: () => splitChunksFilter,
  syncTargetsFiles: () => syncTargetsFiles,
  toPosixPath: () => toPosixPath,
  writeManifestV3Json: () => writeManifestV3Json
});
module.exports = __toCommonJS(utils_exports);
var import_utils = require("@umijs/utils");
var import_interface = require("./interface");
var import_path = __toESM(require("path"));
var import_fs = __toESM(require("fs"));
function completionWebpackEntryConfig(pagesConfig, webpackEntryConfig) {
  for (const page of Object.values(pagesConfig)) {
    const { entry, file, type } = page;
    if (!(entry in webpackEntryConfig) || type === "content_script" || type === "background") {
      webpackEntryConfig[entry] = [import_path.default.join(process.cwd(), file)];
    }
  }
}
function initPluginConfig(pluginConfig) {
  const result = {
    ...import_interface.browserExtensionDefaultConfig,
    ...pluginConfig
  };
  result.rootPath = toPosixPath(result.rootPath);
  return result;
}
function findPagesConfig(manifestBaseJson, pluginConfig, umiMpaEntryConfig, vendorEntry) {
  const { rootPath, contentScriptsPathName, backgroundPathName, optionsPathName, popupPathName, entryFileName } = pluginConfig;
  const contentScriptsPath = import_path.default.posix.join(rootPath, contentScriptsPathName);
  const backgroundPath = import_path.default.posix.join(rootPath, backgroundPathName);
  const optionsPath = import_path.default.posix.join(rootPath, optionsPathName);
  const popupPath = import_path.default.posix.join(rootPath, popupPathName);
  const result = {};
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
    import_utils.logger.error(`${import_interface.PluginName} background entry file must be one, but found ${backgroundEntry.length}`);
  }
  const optionsEntry = findFileGroup(optionsPath, entryFileName);
  if (optionsEntry.length === 1) {
    const entry = optionsEntry[0];
    result[entry] = loadOptionsConfig(manifestBaseJson, entry, pluginConfig, umiMpaEntryConfig);
  } else if (optionsEntry.length > 1) {
    import_utils.logger.error(`${import_interface.PluginName} options entry file must be one, but found ${optionsEntry.length}`);
  }
  const popupEntry = findFileGroup(popupPath, entryFileName);
  if (popupEntry.length === 1) {
    const entry = popupEntry[0];
    result[entry] = loadPopupConfig(manifestBaseJson, entry, pluginConfig, umiMpaEntryConfig);
  } else if (popupEntry.length > 1) {
    import_utils.logger.error(`${import_interface.PluginName} popup entry file must be one, but found ${popupEntry.length}`);
  }
  return result;
}
function loadContentScriptsConfig(entry, pluginConfig, umiMpaEntryConfig, vendorEntry) {
  const { rootPath, configFileName, encoding, jsCssOutputDir } = pluginConfig;
  const path = import_path.default.posix.dirname(entry);
  const mpaName = path.replace(`${rootPath}${import_path.default.posix.sep}`, "");
  const configPath = import_path.default.posix.join(path, configFileName);
  const jsCssOutputPath = import_path.default.posix.join(jsCssOutputDir, mpaName);
  let config = {};
  let title = void 0;
  if (!import_fs.default.existsSync(configPath)) {
    return null;
  }
  config = JSON.parse(import_fs.default.readFileSync(configPath, { encoding }).toString());
  title = config.title;
  delete config.title;
  if ("js" in config) {
    completionFilePathFromNameList(jsCssOutputPath, config.js);
    if (vendorEntry) {
      config.js.unshift(`${vendorEntry}.js`);
    }
  }
  if ("css" in config) {
    completionFilePathFromNameList(jsCssOutputPath, config.css);
  }
  const entryConfig = {
    name: mpaName,
    path,
    file: entry,
    entry: completionEntry(mpaName, pluginConfig),
    title,
    type: "content_script",
    config,
    world: config.world ?? ""
  };
  completionUmiMpaEntryConfig(entryConfig, umiMpaEntryConfig);
  return entryConfig;
}
function loadBackgroundConfig(file, pluginConfig, umiMpaEntryConfig) {
  const { rootPath } = pluginConfig;
  const path = import_path.default.posix.dirname(file);
  const mpaName = path.replace(`${rootPath}${import_path.default.posix.sep}`, "");
  const entry = completionEntry(mpaName, pluginConfig);
  const entryConfig = {
    name: mpaName,
    path,
    file,
    entry,
    title: void 0,
    type: "background",
    config: {
      service_worker: `${entry}.js`
    }
  };
  completionUmiMpaEntryConfig(entryConfig, umiMpaEntryConfig);
  return entryConfig;
}
function loadOptionsConfig(manifestBaseJson, file, pluginConfig, umiMpaEntryConfig) {
  const { name: extensionName } = manifestBaseJson;
  const { rootPath, optionsOpenInTab, optionsTitle } = pluginConfig;
  const path = import_path.default.posix.dirname(file);
  const mpaName = path.replace(`${rootPath}${import_path.default.posix.sep}`, "");
  const entry = completionEntry(mpaName, pluginConfig);
  const entryConfig = {
    name: mpaName,
    path,
    file,
    entry,
    title: optionsTitle || extensionName || "options",
    type: "options",
    config: {
      page: `${entry}.html`,
      open_in_tab: optionsOpenInTab
    }
  };
  completionUmiMpaEntryConfig(entryConfig, umiMpaEntryConfig);
  return entryConfig;
}
function loadPopupConfig(manifestBaseJson, file, pluginConfig, umiMpaEntryConfig) {
  const { name: extensionName } = manifestBaseJson;
  const { rootPath, popupDefaultTitle, popupDefaultIcon } = pluginConfig;
  const path = import_path.default.posix.dirname(file);
  const mpaName = path.replace(`${rootPath}${import_path.default.posix.sep}`, "");
  const entry = completionEntry(mpaName, pluginConfig);
  const entryConfig = {
    name: mpaName,
    path,
    file,
    entry,
    title: popupDefaultTitle || extensionName || "popup",
    type: "popup",
    config: {
      default_icon: popupDefaultIcon,
      default_title: popupDefaultTitle,
      default_popup: `${entry}.html`
    }
  };
  completionUmiMpaEntryConfig(entryConfig, umiMpaEntryConfig);
  return entryConfig;
}
function completionContentScriptsConfig(statsData, pageConfig, vendorEntry) {
  if (statsData.entrypoints && statsData.chunks) {
    for (const { type, entry, config } of Object.values(pageConfig)) {
      if (type === "content_script") {
        const existJs = "js" in config && config.js.length > 0;
        const existCss = "css" in config && config.css.length > 0;
        if (entry in statsData.entrypoints) {
          const entryPoint = statsData.entrypoints[entry];
          if (entryPoint.chunks) {
            let existVendor = false;
            for (const chunkId of entryPoint.chunks) {
              const chunk = statsData.chunks.find((c) => c.id === chunkId);
              if (chunk && chunk.files) {
                for (const file of chunk.files) {
                  if (file.endsWith(".js")) {
                    if (!existJs) {
                      if (!("js" in config)) {
                        config.js = [];
                      }
                      config.js.push(file);
                    }
                    if (file.startsWith(`${vendorEntry}.`)) {
                      existVendor = true;
                    }
                  } else if (file.endsWith(".css")) {
                    if (!existCss) {
                      if (!("css" in config)) {
                        config.css = [];
                      }
                      config.css.push(file);
                    }
                  }
                }
              }
            }
            if (existJs && vendorEntry && !existVendor) {
              config.js = config.js.filter((file) => !file.startsWith(`${vendorEntry}.`));
            }
          }
        }
      }
    }
  }
}
function completionUmiMpaEntryConfig(extensionEntryConfig, umiMpaEntryConfig) {
  const { name, entry } = extensionEntryConfig;
  if (name in umiMpaEntryConfig) {
    const umiEntryConfig = umiMpaEntryConfig[name];
    if (umiEntryConfig.title) {
      extensionEntryConfig.title = umiEntryConfig.title;
    }
  }
  if (!name.includes(import_path.default.posix.sep)) {
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
function completionManifestPath(pluginConfig, resultAbsolutePath = false) {
  const { rootPath, manifestFilePath } = pluginConfig;
  let result = manifestFilePath;
  if (!import_fs.default.existsSync(result)) {
    result = import_path.default.posix.join(rootPath, manifestFilePath);
    if (!import_fs.default.existsSync(result)) {
      import_utils.logger.error(`[${import_interface.PluginName}]  manifest file no found:	${result}`);
      throw Error();
    }
  }
  if (resultAbsolutePath) {
    result = import_path.default.resolve(result);
  }
  return result;
}
function loadManifestBaseJson(manifestSourcePath, pluginConfig) {
  return JSON.parse(import_fs.default.readFileSync(manifestSourcePath, { encoding: pluginConfig.encoding }).toString());
}
function loadManifestTargetJson(manifestSourcePathBefore, targets, pluginConfig) {
  const result = {};
  for (const target of targets) {
    const targetSourcePath = `${manifestSourcePathBefore}.${target}.json`;
    if (import_fs.default.existsSync(targetSourcePath)) {
      const targetJson = JSON.parse(import_fs.default.readFileSync(targetSourcePath, { encoding: pluginConfig.encoding }).toString());
      if (targetJson) {
        result[target] = targetJson;
      }
    }
  }
  return result;
}
function completionManifestV3Json(manifestBaseJson, manifestTargetsJson, pagesConfig, target) {
  let manifestJson = import_utils.deepmerge.all([manifestBaseJson]);
  if (target in manifestTargetsJson && Object.keys(manifestTargetsJson[target]).length > 0) {
    manifestJson = import_utils.deepmerge.all([manifestJson, manifestTargetsJson[target]]);
  }
  const contentScriptsConfig = [];
  for (const pageConfig of Object.values(pagesConfig)) {
    const { type, config } = pageConfig;
    switch (type) {
      case "content_script":
        contentScriptsConfig.push(config);
        break;
      case "options":
        manifestJson.options_ui = config;
        break;
      case "popup":
        if (config && Object.keys(config).length > 0) {
          manifestJson.action = { ...config };
          if (!manifestJson.action.default_icon || Object.keys(manifestJson.action.default_icon).length === 0) {
            manifestJson.action.default_icon = manifestJson.icons;
          }
          if (!manifestJson.action.default_title) {
            manifestJson.action.default_title = manifestJson.name;
          }
        }
        break;
      case "background":
        manifestJson.background = config;
        break;
      default:
        import_utils.logger.error(`[${import_interface.PluginName}]  unknown page type:	${type}`);
        throw Error();
    }
  }
  if (contentScriptsConfig.length > 0) {
    manifestJson.content_scripts = contentScriptsConfig;
  }
  if (target === "firefox") {
    completionManifestV3ToFirefox(manifestJson);
  }
  return manifestJson;
}
function completionManifestV3ToFirefox(manifestJson) {
  if (manifestJson) {
    if (manifestJson.permissions && manifestJson.permissions.includes("commands")) {
      manifestJson.permissions = manifestJson.permissions.filter((permission) => permission !== "commands");
    }
    if (manifestJson.background && manifestJson.background.service_worker && !manifestJson.background.scripts) {
      manifestJson.background = {
        scripts: [manifestJson.background.service_worker]
      };
    }
    if (manifestJson.incognito && manifestJson.incognito === "split") {
      manifestJson.incognito = "not_allowed";
    }
  }
}
function syncTargetsFiles(stats, outputPath, outputBasePath, targets) {
  const changedFiles = stats.compilation.emittedAssets;
  for (const changedFile of changedFiles) {
    for (let i = 1; i < targets.length; i += 1) {
      const target = targets[i];
      const targetPath = import_path.default.posix.join(outputBasePath, target);
      copyFileOrDirSync(import_path.default.posix.join(outputPath, changedFile), import_path.default.posix.join(targetPath, changedFile));
    }
  }
}
function firstWriteAllFile(stats, manifestBaseJson, manifestTargetsJson, outputPath, outputBasePath, pagesConfig, vendorEntry, targets) {
  if (targets.length > 1) {
    for (let i = 1; i < targets.length; i += 1) {
      const targetPath = import_path.default.posix.join(outputBasePath, targets[i]);
      copyFileOrDirSync(outputPath, targetPath);
      firstWriteManifestV3Json(stats, manifestBaseJson, manifestTargetsJson, targetPath, pagesConfig, vendorEntry, targets[i]);
    }
  }
  firstWriteManifestV3Json(stats, manifestBaseJson, manifestTargetsJson, outputPath, pagesConfig, vendorEntry, targets[0]);
  import_utils.logger.info(`${import_interface.PluginName} Go to 'chrome://extensions/', enable 'Developer mode', click 'Load unpacked', and select this directory.`);
  import_utils.logger.info(`${import_interface.PluginName} 请打开 'chrome://extensions/', 启用 '开发者模式', 点击 '加载已解压的扩展程序', 然后选择该目录。`);
  for (const target of targets) {
    const targetPath = import_path.default.posix.join(outputBasePath, target);
    import_utils.logger.ready(`${import_interface.PluginName} Build Complete. ${target} browser load from: `, import_utils.chalk.green(import_path.default.resolve(targetPath)));
  }
}
function firstWriteManifestV3Json(stats, manifestBaseJson, manifestTargetsJson, outputPath, pagesConfig, vendorEntry, target) {
  const statsData = stats.toJson({ all: true });
  if (statsData.chunks) {
    completionContentScriptsConfig(statsData, pagesConfig, vendorEntry);
  }
  writeManifestV3Json(manifestBaseJson, manifestTargetsJson, outputPath, pagesConfig, target);
}
function writeManifestV3Json(manifestBaseJson, manifestTargetsJson, outputPath, pagesConfig, target) {
  const manifestJson = completionManifestV3Json(manifestBaseJson, manifestTargetsJson, pagesConfig, target);
  import_fs.default.writeFileSync(import_path.default.posix.join(outputPath, "manifest.json"), JSON.stringify(manifestJson, null, 2));
}
function findFileGroup(pathBefore, fileName) {
  return import_utils.glob.sync(`${pathBefore}/**/${fileName}`).map((path) => import_path.default.posix.normalize(path)).filter((path) => !path.includes(import_interface.F_EXCLUDE_COMPONENTS) && !path.includes(import_interface.F_EXCLUDE_MODELS) && !path.includes(import_interface.F_EXCLUDE_UTILS));
}
function completionFilePathFromNameList(path, nameList) {
  if (nameList) {
    for (let i = 0; i < nameList.length; i += 1) {
      const name = nameList[i];
      if (name.indexOf(path) === -1) {
        nameList[i] = import_path.default.posix.join(path, name);
      }
    }
  }
}
function completionEntry(mpaName, pluginConfig) {
  const { jsCssOutputDir } = pluginConfig;
  return import_path.default.posix.join(jsCssOutputDir, mpaName, "index");
}
function copyFileOrDirSync(src, dest) {
  try {
    if (import_fs.default.existsSync(src)) {
      const STATUS = import_fs.default.statSync(src);
      if (STATUS.isFile()) {
        import_fs.default.copyFileSync(src, dest);
      } else if (STATUS.isDirectory()) {
        import_fs.default.mkdirSync(dest);
        import_fs.default.readdirSync(src).forEach((item) => {
          copyFileOrDirSync(`${src}/${item}`, `${dest}/${item}`);
        });
      }
    }
  } catch (e) {
    console.error(e);
    import_utils.logger.error(`${import_interface.PluginName} Encountered an error while syncing file ${import_utils.chalk.blue(src)} to ${import_utils.chalk.green(dest)}`);
    import_utils.logger.error(`${import_interface.PluginName} 同步文件 ${import_utils.chalk.blue(src)} 到 ${import_utils.chalk.green(dest)} 时遇到错误`);
  }
}
function removeFileOrDirSync(filePath) {
  try {
    if (import_fs.default.existsSync(filePath)) {
      const STATUS = import_fs.default.statSync(filePath);
      if (STATUS.isFile()) {
        import_fs.default.unlinkSync(filePath);
      } else if (STATUS.isDirectory()) {
        import_fs.default.readdirSync(filePath).forEach((item) => {
          removeFileOrDirSync(`${filePath}/${item}`);
        });
        import_fs.default.rmdirSync(filePath);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
function toPosixPath(inputPath) {
  const normalizedPath = import_path.default.normalize(inputPath);
  return normalizedPath.split(import_path.default.sep).join(import_path.default.posix.sep);
}
function splitChunksFilter(backgroundEntry, mainWorldEntryGroup, matchMainWorldEntry) {
  if (!backgroundEntry && mainWorldEntryGroup.length === 0) {
    return "all";
  }
  return (chunk) => {
    if (matchMainWorldEntry) {
      return mainWorldEntryGroup.some((entry) => entry.entry === chunk.name);
    }
    return !(chunk.name === backgroundEntry || mainWorldEntryGroup.some((entry) => entry.entry === chunk.name));
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  completionManifestPath,
  completionManifestV3Json,
  completionManifestV3ToFirefox,
  completionWebpackEntryConfig,
  copyFileOrDirSync,
  findPagesConfig,
  firstWriteAllFile,
  firstWriteManifestV3Json,
  initPluginConfig,
  loadManifestBaseJson,
  loadManifestTargetJson,
  removeFileOrDirSync,
  splitChunksFilter,
  syncTargetsFiles,
  toPosixPath,
  writeManifestV3Json
});
