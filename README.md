# umi-plugin-browser-extension

A umi plugin

这个插件可以让你用`UmiJs v4.x.x`下开发`Manifest V3`浏览器扩展，通过约定式路由自动的扫描出相应目录下的`content_scripts`、`background`、`options`与`popup`的入口文件，并自动生成相应的manifest.json文件。

详细说明以及示例代码很快会编写完毕

## Install

```bash
pnpm i umi-plugin-browser-extension
```

## Usage

Configure in `.umirc.ts`,

```js
export default {
    plugins: [
        ['umi-plugin-browser-extension'],
    ],
}
```

## Options

TODO

## LICENSE

MIT
