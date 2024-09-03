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

// src/interface.ts
var interface_exports = {};
__export(interface_exports, {
  F_EXCLUDE_COMPONENTS: () => F_EXCLUDE_COMPONENTS,
  F_EXCLUDE_MODELS: () => F_EXCLUDE_MODELS,
  F_EXCLUDE_UTILS: () => F_EXCLUDE_UTILS,
  PluginName: () => PluginName,
  browserExtensionDefaultConfig: () => browserExtensionDefaultConfig
});
module.exports = __toCommonJS(interface_exports);
var import_path = __toESM(require("path"));
var PluginName = "[umi-browser-extension]";
var F_EXCLUDE_COMPONENTS = `${import_path.default.posix.sep}components${import_path.default.posix.sep}`;
var F_EXCLUDE_MODELS = `${import_path.default.posix.sep}models${import_path.default.posix.sep}`;
var F_EXCLUDE_UTILS = `${import_path.default.posix.sep}utils${import_path.default.posix.sep}`;
var browserExtensionDefaultConfig = {
  rootPath: import_path.default.posix.join("src", "pages"),
  entryFileName: "index.[jt]s{,x}",
  configFileName: "index.json",
  encoding: "utf-8",
  jsCssOutputDir: "",
  manifestFilePath: "manifest.json",
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
  targets: ["chrome"]
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  F_EXCLUDE_COMPONENTS,
  F_EXCLUDE_MODELS,
  F_EXCLUDE_UTILS,
  PluginName,
  browserExtensionDefaultConfig
});
