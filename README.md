# umi-plugin-browser-extension

> **[English](README_EN.md)** | 中文

UmiJs v4 浏览器扩展开发插件，支持 Manifest V3。

本插件可以让你在 `UmiJs v4` 下开发 `Manifest V3` 浏览器扩展，通过约定式路由自动扫描出 `content_scripts`、`background`、`options` 与 `popup` 的入口文件，并自动生成相应的 `manifest.json` 文件。

从 v1.1.0 版本开始，插件支持同时编译 Chrome 和 Firefox 扩展，并生成对应的扩展文件。

若需开发 `Manifest V2` 的浏览器扩展，请使用 [`umi-plugin-chromium-extension`](https://github.com/kukushouhou/umi-plugin-chromium-extension)。

## 示例

### [umi-browser-extension-example](https://github.com/kukushouhou/umi-browser-extension-example)

## 安装

```bash
npm i umi-plugin-browser-extension --save-dev
```

## 用法

在 `.umirc.ts` 或 `.umirc.js` 中配置：

```js
export default {
    plugins: [
        'umi-plugin-browser-extension',
    ],
    browserExtension: {
        ...options
    }
}
```

## 配置项

| 配置项 | 类型 | 默认值 | 说明 | 版本 |
|--------|------|--------|------|------|
| rootPath | string | `./src/pages` | 代码入口文件的根路径 | - |
| entryFileName | string | `index.[jt]s{,x}` | 寻找入口文件名称时用的正则，会自动排除入口文件夹中的子文件夹是 `components`、`models` 和 `utils` 的入口文件 | - |
| configFileName | string | `index.json` | `content_scripts` 文件夹匹配到入口时会自动在相应目录下寻找配置文件，通过此配置项可自定义配置文件名 | - |
| encoding | string | `utf-8` | 读取和写入配置文件时用的编码 | - |
| jsCssOutputDir | string | `` | `JavaScript` 和 `CSS` 产物输出的目标子目录。设置后，系统将在输出目录下添加相应名称子目录以包裹这些文件，使构建产物更清晰美观。若为空，则文件直接输出到编译根目录 | - |
| manifestFilePath | string | `manifest.json` | `manifest.json` 源文件的相对完整路径，默认为项目根目录 | - |
| manifestHandler | (manifest: any, target: Target) => any | undefined | `manifest.json` 源文件在编译前会传入此函数，你可以修改源文件内容并返回修改后的内容。此函数会在最终写入每一个 target 的 `manifest.json` 文件之前被执行 | v1.1.3 |
| contentScriptsPathName | string | `content_scripts` | 内容脚本目录的目录名，将会合并 `rootPath` 选项生成最终内容脚本目录的完整目录名，然后以此搜索入口文件 | - |
| backgroundPathName | string | `background` | 后台脚本页的目录名，将会合并 `rootPath` 选项生成最终后台脚本目录的完整目录名，然后以此搜索入口文件 | - |
| optionsPathName | string | `options` | 选项页的目录名，将会合并 `rootPath` 选项生成最终选项页目录的完整目录名，然后以此搜索入口文件 | - |
| optionsOpenInTab | boolean | `true` | 选项页在浏览器中是否用新标签页打开，还是在扩展管理页中弹出显示，设置为 `true` 时用新标签页打开 | - |
| optionsTitle | string | `` | 选项页构建的 HTML 文件的默认标题，设为空时将用 `manifest.json` 源文件中定义的 `name` 字段值补充 | - |
| popupPathName | string | `popup` | 弹出页的目录名，将会合并 `rootPath` 选项生成最终弹出页目录的完整目录名，然后以此搜索入口文件 | - |
| popupDefaultTitle | string | `` | 鼠标悬停在扩展图标时显示的默认标题。设为空时将用 `manifest.json` 源文件中定义的 `name` 字段值补充 | - |
| popupDefaultIcon | {[size:string]: string} | `{}` | 扩展在浏览器右上角的默认图标，键为图标尺寸，值为图标路径。若为空则默认使用 `manifest.json` 源文件中定义的 `icons` 字段值 | - |
| splitChunks | boolean | `true` | 在 `build` 时是否将内容脚本、选项页、弹出页复用 2 次及以上的全部模块均切分到 `vendor.js` 文件中，后台脚本只能定义单一 js 文件因此不参与切分 | - |
| splitChunksPathName | string | `chunks` | 切分后的 `vendor.js` 文件存放文件夹名称，默认为 `chunks` | - |
| targets | string[] | `['chrome']` | 编译的目标浏览器。默认为只编译 Chrome 扩展，目前的可选值为 `chrome`、`chrome102`、`firefox`，可多选。多选后 `dev` 和 `build` 时将同时分别生成目标浏览器的编译文件 | v1.1.0 |
| clearAbsPath | boolean or string | `true` | 编译后即将压缩代码前清理代码中的绝对路径变量，以解决不同系统、不同路径下构建后的产物未能完全一致的问题。Firefox 要求任意环境下编译后产物必须和上传的文件一致，因此需要清理绝对路径变量 | v1.1.4 |

### manifest.json 源文件编写说明

在 `manifestFilePath` 配置项对应的文件夹中创建 `manifest.json` 文件，默认情况下为项目根路径。详见 [manifest.json](https://developer.chrome.com/docs/extensions/reference/manifest?hl=zh-cn)。

> **注意：** 从 v1.1.0 版本开始，您可以根据不同的 target 定义不同的 `manifest.json` 文件。例如，如果需要定义 Chrome 的专属字段 `minimum_chrome_version`，可以在与 `manifest.json` 相同的目录下创建 `manifest.chrome.json` 文件并在其中定义该字段。同样地，对于 Firefox 的专属字段，可以创建 `manifest.firefox.json` 文件。这些文件的内容将在编译后自动合并并覆盖到构建目录下的 `manifest.json` 文件中。
>
> 从 v1.1.2 开始，target 支持设置为 `chrome102`。当设置为 `chrome102` 时，编译时将自动把内容脚本中运行在主世界的脚本配置不写入最终的 `manifest.json` 中，而是单独将相关的配置写入与最终的 `manifest.json` 同级目录中的 `main-world.json` 中，然后用户可以自行通过 `service_worker` 读取该文件并动态地注册主世界的内容脚本。

#### 不需要在 manifest.json 中填写的字段

##### `content_scripts`

该字段将会根据对应内容脚本目录中搜索到的入口文件和配置文件自动生成相应的配置。

##### `background`

该字段将会根据对应后台脚本目录中搜索到的入口文件自动生成相应的配置。

##### `options_ui`

该字段将会根据对应选项页目录中搜索到的入口文件以及本插件的配置项自动生成相应的配置。

##### `action`

该字段将会根据对应弹出页目录中搜索到的入口文件以及本插件的配置项自动生成相应的配置。

### 内容脚本的配置文件编写说明

只需要在内容脚本对应入口文件夹中创建与 `configFileName` 配置项对应名称的文件即可识别为内容脚本的配置文件。

该配置文件只需要填写原版 `manifest.json` 文件的 `content_scripts` 配置项的单一节点内容即可，可不填写 `js` 和 `css` 字段。

例如：

```json
{
  "matches": [
    "*://item.jd.com/*"
  ],
  "run_at": "document_start"
}
```

未填写 `js` 和 `css` 字段的情况下，本插件将会自动根据输出的产物完善 `js` 和 `css` 字段。

若填写了 `js` 和 `css` 字段，请只填写相对当前文件夹的相对路径即可，本插件将会根据配置自动完善前缀。若设定了切割代码，也会自动将切割后的 `vendor.js` 文件加入配置。

## 待实现

- [x] 内容脚本若处在主要运行时时单独切割代码或者不切割代码，主要运行时的代码主要负责调用页面本身上下文无法使用各种扩展 API
- [x] 监听内容脚本配置的改变并更新到构建产物的 manifest.json 中
- [ ] 检测到新增任何入口后自动重启 umijs 处理
- [ ] host_permissions、web_accessible_resources 和内容脚本的 matches 中支持填入变量 `<matches_urls>`，若填入该变量则最终输出的 manifest.json 中该变量自动替换为其他已找到的内容脚本全部匹配的 url，但会忽略其他内容脚本定义的 exclude_matches、include_globs、exclude_globs
- [ ] 内容脚本的 matches 中支持填入变量 `<folder_matches_urls>`，若填入该变量效果和 `<matches_urls>` 一样，但只会合并当前入口父级目录下的全部内容脚本中设定的 matches
- [ ] web_accessible_resources 的动态管理，允许在内容脚本的入口同级目录下创建 resources.json 文件来动态配置 web_accessible_resources，也允许在源 manifest.json 中统一配置 web_accessible_resources，若源 manifest.json 中配置了 web_accessible_resources，且内容脚本中包含 resources.json 配置则会追加在源 manifest.json 中配置的 web_accessible_resources 的后面

## 许可证

本项目基于 MIT 许可证开源，详见 [LICENSE](LICENSE) 文件。
