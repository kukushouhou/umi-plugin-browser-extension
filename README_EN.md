# umi-plugin-browser-extension

> English | **[中文](README.md)**

UmiJs v4 plugin for browser extension development with Manifest V3 support.

This plugin allows you to develop browser extensions with UmiJS v4 using Manifest V3. It automatically scans for entry files for `content_scripts`, `background`, `options`, and `popup` based on convention-based routing, and generates the corresponding `manifest.json` file.

Starting from v1.1.0, the plugin supports compiling extensions for both Chrome and Firefox simultaneously, generating the corresponding extension files for each browser.

If you need to develop browser extensions with Manifest V2, please use [`umi-plugin-chromium-extension`](https://github.com/kukushouhou/umi-plugin-chromium-extension).

## Example

### [umi-browser-extension-example](https://github.com/kukushouhou/umi-browser-extension-example)

## Install

```bash
npm i umi-plugin-browser-extension --save-dev
```

## Usage

Configure in `.umirc.ts` or `.umirc.js`:

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

## Options

| Option | Type | Default | Description | Version |
|--------|------|---------|-------------|---------|
| rootPath | string | `./src/pages` | Root path of the entry files | - |
| entryFileName | string | `index.[jt]s{,x}` | Regex for finding entry file names. Automatically excludes entry files in subfolders named `components`, `models`, and `utils` | - |
| configFileName | string | `index.json` | When matching an entry in the content_scripts folder, it will automatically search for a configuration file in the corresponding directory. You can customize the configuration file name using this option | - |
| encoding | string | `utf-8` | The encoding used for reading and writing configuration files | - |
| jsCssOutputDir | string | `` | Target subdirectories for JavaScript and CSS output. When set, the system adds corresponding subdirectories under the output directory to wrap these files. If empty, files are output directly to the compilation root directory | - |
| manifestFilePath | string | `manifest.json` | Relative full path to the `manifest.json` source file, defaults to the project root directory | - |
| manifestHandler | (manifest: any, target: Target) => any | undefined | The `manifest.json` source file is passed into this function before compilation. You can modify the content and return the modified version. This function executes after reading but before writing the `manifest.json` file for each target | v1.1.3 |
| contentScriptsPathName | string | `content_scripts` | Directory name for content scripts. Combined with `rootPath` to generate the full directory path for searching entry files | - |
| backgroundPathName | string | `background` | Directory name for the background script page. Combined with `rootPath` to generate the full directory path for searching entry files | - |
| optionsPathName | string | `options` | Directory name for the options page. Combined with `rootPath` to generate the full directory path for searching entry files | - |
| optionsOpenInTab | boolean | `true` | Whether to open the options page in a new tab or display it as a popup in the extension management page. Set to `true` to open in a new tab | - |
| optionsTitle | string | `` | Default title for the options page HTML file. If empty, the `name` field from `manifest.json` will be used | - |
| popupPathName | string | `popup` | Directory name for the popup page. Combined with `rootPath` to generate the full directory path for searching entry files | - |
| popupDefaultTitle | string | `` | Default tooltip title when hovering over the extension icon. If empty, the `name` field from `manifest.json` will be used | - |
| popupDefaultIcon | {[size:string]: string} | `{}` | Default icon for the extension in the browser toolbar. Key is the icon size, value is the icon path. If empty, the `icons` field from `manifest.json` will be used | - |
| splitChunks | boolean | `true` | During `build`, whether to split all modules reused two or more times in content scripts, options page, and popup page into a `vendor.js` file. Background scripts do not participate in splitting as they can only define a single JS file | - |
| splitChunksPathName | string | `chunks` | Folder name for storing the split `vendor.js` file, defaults to `chunks` | - |
| targets | string[] | `['chrome']` | Target browsers for compilation. Defaults to Chrome only. Available options are `chrome`, `chrome102`, and `firefox`. Multiple selections allowed; when multiple targets are selected, `dev` and `build` commands will generate compiled files for all specified targets simultaneously | v1.1.0 |
| clearAbsPath | boolean or string | `true` | Cleans absolute path variables in the code before compression to ensure consistent build outputs across different systems and paths. Firefox requires that the compiled output must be identical to the uploaded files in any environment | v1.1.4 |

### Guidelines for writing the manifest.json source file

Create a `manifest.json` file in the folder corresponding to the `manifestFilePath` configuration option (defaults to the project root). See [manifest.json](https://developer.chrome.com/docs/extensions/reference/manifest).

> **Note:** Starting from v1.1.0, you can define different `manifest.json` files for different targets. For example, to specify the Chrome-specific field `minimum_chrome_version`, create a `manifest.chrome.json` file in the same directory as `manifest.json` and define the field there. Similarly, for Firefox-specific fields, create a `manifest.firefox.json` file. The contents of these files will be automatically merged and overridden into the `manifest.json` file in the build directory after compilation.
>
> Starting from v1.1.2, the target supports setting to `chrome102`. When set to `chrome102`, the configuration for scripts running in the main world in the content scripts will not be written into the final `manifest.json` during compilation. Instead, the relevant configuration will be written into `main-world.json` in the same directory as the final `manifest.json`, and users can dynamically register the main world content scripts by reading this file through `service_worker`.

#### Fields that do not need to be filled in manifest.json

##### `content_scripts`

This field will be automatically generated based on the entry files and configuration files found in the corresponding content script directory.

##### `background`

This field will be automatically generated based on the entry files found in the corresponding background script directory.

##### `options_ui`

This field will be automatically generated based on the entry files found in the corresponding options page directory and the plugin configuration options.

##### `action`

This field will be automatically generated based on the entry files found in the corresponding popup page directory and the plugin configuration options.

### Guidelines for writing content script configuration files

Simply create a file with the same name as specified in the `configFileName` configuration option in the entry folder corresponding to the content script to identify it as the configuration file.

This configuration file only needs to contain a single node of the `content_scripts` configuration item from the original `manifest.json` file. The `js` and `css` fields do not need to be filled.

For example:

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

## TODO

- [x] Content scripts in the main world context should split code separately or not split at all, as main world code primarily handles calling page context that cannot use extension APIs
- [ ] Watch for content script configuration changes and update the build output manifest.json
- [ ] Automatically restart umijs processing when new entries are detected
- [ ] Support variable `<matches_urls>` in host_permissions, web_accessible_resources and content script matches — when used, the variable is automatically replaced with all matched URLs from other content scripts, ignoring exclude_matches, include_globs, and exclude_globs
- [ ] Support variable `<folder_matches_urls>` in content script matches — same as `<matches_urls>` but only merges matches from content scripts in the same parent directory
- [ ] Dynamic management of web_accessible_resources — allow creating resources.json files alongside content script entries to dynamically configure web_accessible_resources, with support for appending to the source manifest.json configuration

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
