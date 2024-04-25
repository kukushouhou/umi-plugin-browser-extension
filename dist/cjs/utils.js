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
  completionWebpackEntryConfig: () => completionWebpackEntryConfig,
  findPagesConfig: () => findPagesConfig,
  firstWriteManifestV3Json: () => firstWriteManifestV3Json,
  initPluginConfig: () => initPluginConfig,
  loadManifestBaseJson: () => loadManifestBaseJson,
  removeFileOrDirSync: () => removeFileOrDirSync,
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
    result[entry] = loadContentScriptsConfig(entry, pluginConfig, umiMpaEntryConfig, vendorEntry);
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
  if (import_fs.default.existsSync(configPath)) {
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
  }
  const entryConfig = {
    name: mpaName,
    path,
    file: entry,
    entry: completionEntry(mpaName, pluginConfig),
    title,
    type: "content_script",
    config
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
function completionContentScriptsConfig(assets, pageConfig, vendorEntry) {
  Object.values(pageConfig).forEach((entryConfig) => {
    const { type, entry, config } = entryConfig;
    if (type === "content_script") {
      for (const asset of assets) {
        if (asset.name.startsWith(`${entry}.`)) {
          if (asset.name.endsWith(".js") && !("js" in config)) {
            config.js = [asset.name];
            if (vendorEntry) {
              config.js.unshift(`${vendorEntry}.js`);
            }
          } else if (asset.name.endsWith(".css") && !("css" in config)) {
            config.css = [asset.name];
          }
        }
      }
    }
  });
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
function completionManifestV3Json(manifestBaseJson, pagesConfig) {
  const manifestJson = { ...manifestBaseJson };
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
  return manifestJson;
}
function firstWriteManifestV3Json(stats, manifestBaseJson, outputPath, pagesConfig, vendorEntry) {
  const { assets } = stats.toJson();
  if (assets) {
    completionContentScriptsConfig(assets, pagesConfig, vendorEntry);
  }
  writeManifestV3Json(manifestBaseJson, outputPath, pagesConfig);
}
function writeManifestV3Json(manifestBaseJson, outputPath, pagesConfig) {
  const manifestJson = completionManifestV3Json(manifestBaseJson, pagesConfig);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  completionManifestPath,
  completionManifestV3Json,
  completionWebpackEntryConfig,
  findPagesConfig,
  firstWriteManifestV3Json,
  initPluginConfig,
  loadManifestBaseJson,
  removeFileOrDirSync,
  toPosixPath,
  writeManifestV3Json
});
