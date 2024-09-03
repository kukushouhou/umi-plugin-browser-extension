# umi-plugin-browser-extension

UmiJs v4 plugin: browser extension development

This plugin allows you to develop browser extensions with UmiJS v4 using Manifest V3. It automatically scans for entry files for `content_scripts`, `background`, `options`, and `popup` based on convention-based routing. Additionally, it generates the corresponding `manifest.json` file.

Starting from version v1.1.0, the plugin supports compiling extensions for both Chrome and Firefox simultaneously, generating the corresponding extension files for each browser.

If you need to develop browser extensions with Manifest V2, please use [`umi-plugin-chromium-extension`](https://github.com/kukushouhou/umi-plugin-chromium-extension).

这个插件可以让你用`UmiJs v4`下开发`Manifest V3`浏览器扩展，通过约定式路由自动的扫描出相应目录下的`content_scripts`、`background`、`options`与`popup`的入口文件，并自动生成相应的manifest.json文件。

从v1.1.0版本开始，该插件支持同时编译Chrome和Firefox扩展，并生成对应的扩展文件。

若需开发`Manifest V2`的浏览器扩展，请使用[`umi-plugin-chromium-extension`](https://github.com/kukushouhou/umi-plugin-chromium-extension)

## Example | 示例

### [umi-browser-extension-example](https://github.com/kukushouhou/umi-browser-extension-example)

## Install | 安装

```bash
npm i umi-plugin-browser-extension --save-dev
```

## Usage | 用法

Configure in `.umirc.ts` or `.umirc.js`,

在`.umirc.ts`或`.umirc.js`中配置

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

## Options | 选项

| Option / 配置项           | Type / 类型               | Default / 默认值     | Explain                                                                                                                                                                                                                                                                                                                                                        | 说明                                                                                          | Version / 版本 | 
|------------------------|-------------------------|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|--------------|
| rootPath               | string                  | `./src/pages`     | Root path of the entry file for the code.                                                                                                                                                                                                                                                                                                                      | 代码入口文件的根路径。                                                                                 | -            |     
| entryFileName          | string                  | `index.[jt]s{,x}` | The regular expression used to find the entry file name will automatically exclude entry files in subfolders named `components`, `models`, and `utils`.                                                                                                                                                                                                        | 寻找入口文件名称时用的正则,会自动排除入口文件夹中的子文件夹是`components`、`models`和`utils`的入口文件。                          | -            |            
| configFileName         | string                  | `index.json`      | When matching an entry in the content_scripts folder, it will automatically search for a configuration file in the corresponding directory. You can customize the configuration file name using this configuration option.                                                                                                                                     | `content_scripts`文件夹匹配到入口时会自动在相应目录下寻找配置文件，通过此配置项可自定义配置文件名。                                  | -            |            
| encoding               | string                  | `utf-8`           | The encoding used for reading and writing configuration files.                                                                                                                                                                                                                                                                                                 | 读取和写入配置文件时用的编码。                                                                             | -            |
| jsCssOutputDir         | string                  | ``                | The target subdirectories for the output of JavaScript and CSS artifacts. After setting this, the system will add corresponding subdirectories with the given names under the output directory to wrap these files, making the build artifacts clearer and more organized. If left empty, the files will be output directly to the compilation root directory. | `JavaScript` 和 `CSS` 产物输出的目标子目录。设置后，系统将在输出目录下添加相应名称子目录以包裹这些文件，使构建产物更清晰美观。若为空，则文件直接输出到编译根目录。 | -            |            
| manifestFilePath       | string                  | `manifest.json`   | The relative full path to the `manifest.json` source file, by default in the project root directory.                                                                                                                                                                                                                                                           | `manifest.json`源文件的相对完整路径，默认为项目根目录。                                                         | -            |
| contentScriptsPathName | string                  | `content_scripts` | The directory name of the content scripts directory. It will be combined with the `rootPath` option to generate the complete directory name of the content scripts directory, and then used to search for entry files.                                                                                                                                         | 内容脚本目录的目录名名称，将会合并`rootPath`选项生成最终内容脚本目录的完整目录名，然后以此搜索入口文件。                                   | -            |            
| backgroundPathName     | string                  | `background`      | The directory name of the background script page will be merged with the `rootPath` option to generate the complete directory name of the content script directory, and then use it to search for the entry file.                                                                                                                                              | 后台脚本页的目录名名称，将会合并`rootPath`选项生成最终内容脚本目录的完整目录名，然后以此搜索入口文件。                                    | -            |          
| optionsPathName        | string                  | `options`         | The directory name of the options page will be merged with the `rootPath` option to generate the complete directory name of the content script directory, and then use it to search for the entry file.                                                                                                                                                        | 选项页的目录名名称，将会合并`rootPath`选项生成最终内容脚本目录的完整目录名，然后以此搜索入口文件。                                      | -            |        
| optionsOpenInTab       | boolean                 | `true`            | When opening the options page in the browser, whether to open it in a new tab or display it as a popup in the extension management page. Set to `true` to open in a new tab.                                                                                                                                                                                   | 选项页在浏览器中是否用新标签页打开，还是在扩展管理页中弹出显示，设置为`true`时用新标签页打开。                                          | -            |       
| optionsTitle           | string                  | ``                | The default title of the HTML file for the options page. If left empty, it will be supplemented with the value of the `name` field defined in the `manifest.json` source file.                                                                                                                                                                                 | 选项页构建的HTML文件的默认标题，设为空时将用`manifest.json`源文件中定义的`name`字段值完善。                                  | -            |
| popupPathName          | string                  | `popup`           | The directory name of the popup page will be merged with the `rootPath` option to generate the complete directory name of the content script directory, and then use it to search for the entry file.                                                                                                                                                          | 弹出页的目录名名称，将会合并`rootPath`选项生成最终内容脚本目录的完整目录名，然后以此搜索入口文件。                                      | -            |      
| popupDefaultTitle      | string                  | ``                | The default title displayed when hovering over the extension icon. If left empty, it will be supplemented with the value of the `name` field defined in the `manifest.json` source file.                                                                                                                                                                       | 鼠标悬停在扩展图标时显示的默认标题。设为空时将用`manifest.json`源文件中定义的`name`字段值完善。                                  | -            | 
| popupDefaultIcon       | {[size:string]: string} | `{}`              | The default icon for the extension in the top-right corner of the browser. The key is the icon size, and the value is the icon path. If left empty, it will default to the value defined in the `icons` field of the `manifest.json` source file.                                                                                                              | 扩展在浏览器右上角的默认图标，键为图标尺寸，值为图标路径。若为空则默认使用`manifest.json`源文件中定义的`icons`字段值。                      | -            |       
| splitChunks            | boolean                 | `true`            | During `build`, whether to split all modules reused two or more times in the content script, options page, and popup page into the `vendor.js` file. Background scripts can only define a single JS file and therefore do not participate in the splitting.                                                                                                    | 在`build`时是否将内容脚本、选项页、弹出页复用2次及以上的全部模块均切分到`vendor.js`文件中，后台脚本只能定义单一js文件因此不参与切分。               | -            |           
| splitChunksPathName    | string                  | `chunks`          | The folder name where the split `vendor.js` file is stored by default is `chunks`.                                                                                                                                                                                                                                                                             | 切分后的`vendor.js`文件存放文件夹名称，默认为`chunks`。                                                       | -            |
| targets                | string[]                | `['chrome']`      | Specifies the target browsers for compilation. The default is to compile only for Chrome extensions. Currently, the available options are `chrome` and `firefox`. Multiple selections are allowed, and when multiple targets are selected, the `dev` and `build` commands will generate compiled files for all specified target browsers simultaneously.       | 编译的目标浏览器。默认为只编译Chrome扩展，目前的可选值为`chrome`、`firefox`，可多选，多选后`dev`和`build`时将同时分别生成出目标浏览器的编译文件。  | v1.1.0       |       

### Guidelines for writing the `manifest.json` source file. | `manifest.json`源文件编写说明

In the folder corresponding to the `manifestFilePath` configuration option, create a `manifest.json` file. By default, it is located in the project root directory. See [manifest.json](https://developer.chrome.com/docs/extensions/reference/manifest).  
在`manifestFilePath`配置项对应的文件夹中创建`manifest.json`文件，默认情况下为项目根路径。详见[manifest.json](https://developer.chrome.com/docs/extensions/reference/manifest?hl=zh-cn)。

> **Note:** Starting from version v1.1.0, you can define different `manifest.json` files for different targets. For example, to specify the Chrome-specific field `minimum_chrome_version`, create a `manifest.chrome.json` file in the same directory as `manifest.json` and define the field there.
> Similarly, for Firefox-specific fields, create a `manifest.firefox.json` file. The contents of these files will be automatically merged and overridden into the `manifest.json` file in the build directory after compilation.  
> **注意：** 从v1.1.0版本开始，您可以根据不同的target定义不同的`manifest.json`文件。例如，如果需要定义Chrome的专属字段“minimum_chrome_version”，可以在与`manifest.json`相同的目录下创建`manifest.chrome.json`文件并在其中定义该字段。同样地，对于Firefox的专属字段，可以创建`manifest.firefox.json`
> 文件。这些文件的内容将在编译后自动合并并覆盖到构建目录下的`manifest.json`文件中。

#### Do not need to fill in the following fields in manifest.json: | 不需要在`manifest.json`中填写字段:

##### `content_scripts`

This field will be automatically generated based on the entry file and configuration file found in the corresponding content script directory.  
该字段将会根据对应内容脚本目录中搜索到的入口文件和配置文件自动生成相应的配置.

##### `background`

This field will be automatically generated based on the entry file and configuration file found in the corresponding background script directory.  
该字段将会根据对应后台脚本目录中搜索到的入口文件自动生成相应的配置.

##### `options_ui`

This field will be automatically generated based on the entry file found in the corresponding options page directory and the configuration options of this plugin.  
该字段将会根据对应选项页目录中搜索到的入口文件以及本插件的配置项自动生成相应的配置.

##### `action`

This field will be automatically generated based on the entry file found in the corresponding popup page directory and the configuration options of this plugin.  
该字段将会根据对应弹出页目录中搜索到的入口文件以及本插件的配置项自动生成相应的配置.

### Guidelines for writing the configuration file for content scripts. | 内容脚本的配置文件编写说明

Simply create a file with the same name as specified in the `configFileName` configuration option in the entry folder corresponding to the content script to identify it as the configuration file for the content script.

This configuration file only needs to fill in a single node content of the `content_scripts` configuration item in the original `manifest.json` file, and the `js` and `css` fields do not need to be filled.

For example:

只需要在内容脚本对应入口文件夹中创建与`configFileName`配置项对应名称的文件即可识别为内容脚本的配置文件。

该配置文件只需要填写原版`manifest.json`文件的`content_scripts`配置项的单一节点内容即可，可不填写`js`和`css`字段。

例如：

```json
{
  "matches": [
    "*://item.jd.com/*"
  ],
  "run_at": "document_start"
}
```

If the `js` and `css` fields are not filled, this plugin will automatically complete them based on the output.

If you have filled in the `js` and `css` fields, you only need to provide relative paths from the current folder. This plugin will automatically add prefixes based on the configuration. If code splitting is set up, the split `vendor.js` file will also be automatically added to the configuration.

未填写`js`和`css`字段的情况下本插件将会自动根据输出的产物自动完善`js`和`css`字段

若填写了`js`和`css`字段，请只填写相对当前文件夹的相对路径即可，本插件将会根据配置自动完善前缀，若设定了切割代码也会自动将切割后的`vendor.js`文件加入配置。

## TODO | 待实现

- [x] 内容脚本若处在主要运行时时单独切割代码或则不切割代码,主要运行时的代码主要负责调用页面本身上下文无法使用各种扩展Api
- [ ] 监听内容脚本配置的改变并更新到构建产物的manifest.json中
- [ ] 检测到新增任何入口后自动重启umijs处理
- [ ] host_permissions、web_accessible_resources和内容脚本的matches中支持填入变量 <matches_urls>, 若填入该变量则最终输出的manifest.json中该变量自动替换为其他已找到的内容脚本全部匹配的url,但会忽略其他内容脚本定义的exclude_matches,include_globs,exclude_globs
- [ ] 内容脚本的matches中支持填入变量 <folder_matches_urls>, 若填入该变量效果和<matches_urls>一样, 但只会合并当前入口父级目录下的全部内容脚本中设定的matches
- [ ] web_accessible_resources的动态管理，允许在内容脚本的入口同级目录下创建resources.json文件来动态配置web_accessible_resources，也允许在源manifest.json中统一配置web_accessible_resources，若源manifest.json中配置了web_accessible_resources，且内容脚本中包含resources.json配置则会追加在源manifest.json中配置的web_accessible_resources的后面

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
