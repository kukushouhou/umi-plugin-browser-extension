import Path from 'path';
import Fs from 'fs';
import { glob, deepmerge, logger, chalk } from '@umijs/utils';
import {
  findFileGroup,
  loadContentScriptsConfig,
  findPagesConfig,
  writeManifestV3Json,
  initPluginConfig,
  completionManifestPath,
  loadManifestBaseJson,
  loadManifestTargetJson,
  completionManifestV3ToChrome102,
  completionManifestV3ToFirefox,
  completionWebpackEntryConfig,
  syncTargetsFiles,
  firstWriteAllFile,
  firstWriteManifestV3Json,
  copyFileOrDirSync,
  removeFileOrDirSync,
  toPosixPath,
  splitChunksFilter,
} from '../utils';
import { browserExtensionConfig, browserExtensionDefaultConfig } from '../interface';

jest.mock('@umijs/utils', () => ({
  glob: { sync: jest.fn() },
  deepmerge: { all: jest.fn((arr: any[]) => Object.assign({}, ...arr)) },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    ready: jest.fn(),
    debug: jest.fn(),
  },
  chalk: {
    green: jest.fn((s: string) => s),
    blue: jest.fn((s: string) => s),
  },
}));

const mockGlobSync = glob.sync as jest.Mock;

function createMockConfig(overrides: Partial<browserExtensionConfig> = {}): browserExtensionConfig {
  return {
    ...browserExtensionDefaultConfig,
    rootPath: 'src/pages',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────
// findFileGroup
// ─────────────────────────────────────────────────────────────────
describe('findFileGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应调用 glob.sync 并返回过滤后的路径列表', () => {
    mockGlobSync.mockReturnValue([
      'src/pages/content_scripts/foo/index.ts',
      'src/pages/content_scripts/bar/index.tsx',
    ]);
    const result = findFileGroup('src/pages/content_scripts', 'index.[jt]s{,x}');
    expect(mockGlobSync).toHaveBeenCalledWith('src/pages/content_scripts/**/index.[jt]s{,x}');
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('foo/index.ts');
    expect(result[1]).toContain('bar/index.tsx');
  });

  it('应排除 components/models/utils 目录下的文件', () => {
    mockGlobSync.mockReturnValue([
      'src/pages/foo/index.ts',
      'src/pages/foo/components/Modal/index.ts',
      'src/pages/bar/models/useModel/index.ts',
      'src/pages/baz/utils/helper/index.ts',
    ]);
    const result = findFileGroup('src/pages', 'index.ts');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('foo/index.ts');
  });

  it('应返回空数组当 glob 无匹配时', () => {
    mockGlobSync.mockReturnValue([]);
    const result = findFileGroup('nonexistent', 'index.ts');
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────
// loadContentScriptsConfig
// ─────────────────────────────────────────────────────────────────
describe('loadContentScriptsConfig', () => {
  const pluginConfig = createMockConfig();
  const umiMpaEntryConfig: { [k: string]: any } = {};
  const vendorEntry = '';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应解析有效的内容脚本配置文件并返回 entryConfig', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({
      matches: ['https://example.com/*'],
      js: ['content.js'],
      css: ['style.css'],
    })));

    const result = loadContentScriptsConfig(
      'src/pages/content_scripts/my_script/index.ts',
      pluginConfig,
      umiMpaEntryConfig,
      vendorEntry,
    );

    expect(result).not.toBeNull();
    expect(result!.type).toBe('content_script');
    expect(result!.config.matches).toEqual(['https://example.com/*']);
    expect(result!.config.js).toContain('content_scripts/my_script/content.js');
    expect(result!.config.css).toContain('content_scripts/my_script/style.css');

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应在配置文件不存在时返回 null', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);
    const result = loadContentScriptsConfig(
      'src/pages/content_scripts/missing/index.ts',
      pluginConfig,
      umiMpaEntryConfig,
      vendorEntry,
    );
    expect(result).toBeNull();
    existsSyncSpy.mockRestore();
  });

  it('应正确补全 js/css 路径（拼接 jsCssOutputDir）', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({
      js: ['main.js'],
      css: ['main.css'],
    })));

    const config = createMockConfig({ jsCssOutputDir: 'umi' });
    const result = loadContentScriptsConfig(
      'src/pages/content_scripts/foo/index.ts',
      config,
      umiMpaEntryConfig,
      vendorEntry,
    );

    expect(result!.config.js).toEqual(['umi/content_scripts/foo/main.js']);
    expect(result!.config.css).toEqual(['umi/content_scripts/foo/main.css']);

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应在配置中未指定 js/css 时不添加对应字段', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({
      matches: ['https://example.com/*'],
    })));

    const result = loadContentScriptsConfig(
      'src/pages/content_scripts/foo/index.ts',
      pluginConfig,
      umiMpaEntryConfig,
      vendorEntry,
    );

    expect(result!.config.js).toBeUndefined();
    expect(result!.config.css).toBeUndefined();

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应正确处理 world 字段', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({
      world: 'MAIN',
    })));

    const result = loadContentScriptsConfig(
      'src/pages/content_scripts/main_script/index.ts',
      pluginConfig,
      umiMpaEntryConfig,
      vendorEntry,
    );

    expect(result!.world).toBe('MAIN');

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应在配置中无 world 字段时默认为空字符串', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({})));

    const result = loadContentScriptsConfig(
      'src/pages/content_scripts/foo/index.ts',
      pluginConfig,
      umiMpaEntryConfig,
      vendorEntry,
    );

    expect(result!.world).toBe('');

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应在配置中包含 title 时提取 title 字段', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({
      title: 'My Script',
    })));

    const result = loadContentScriptsConfig(
      'src/pages/content_scripts/foo/index.ts',
      pluginConfig,
      umiMpaEntryConfig,
      vendorEntry,
    );

    expect(result!.title).toBe('My Script');
    // title 应从 config 中删除
    expect(result!.config.title).toBeUndefined();

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应在启用 vendorEntry 时将 vendor.js 插入 js 数组头部', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({
      js: ['main.js'],
    })));

    const result = loadContentScriptsConfig(
      'src/pages/content_scripts/foo/index.ts',
      pluginConfig,
      umiMpaEntryConfig,
      'umi/chunks/vendor',
    );

    expect(result!.config.js[0]).toBe('umi/chunks/vendor.js');

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应在配置文件内容为非法 JSON 时抛出异常', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from('{invalid json}'));

    expect(() => {
      loadContentScriptsConfig(
        'src/pages/content_scripts/foo/index.ts',
        pluginConfig,
        umiMpaEntryConfig,
        vendorEntry,
      );
    }).toThrow();

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// findPagesConfig
// ─────────────────────────────────────────────────────────────────
describe('findPagesConfig', () => {
  const baseManifestJson = { name: 'TestExtension', version: '1.0.0' };
  const pluginConfig = createMockConfig();
  const umiMpaEntryConfig: { [k: string]: any } = {};
  const vendorEntry = '';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应扫描 content_scripts 目录并返回所有内容脚本配置', () => {
    mockGlobSync.mockImplementation((pattern: string) => {
      if (pattern.includes('content_scripts')) {
        return [
          'src/pages/content_scripts/script1/index.ts',
          'src/pages/content_scripts/script2/index.tsx',
        ];
      }
      return [];
    });

    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({
      matches: ['https://example.com/*'],
    })));

    const result = findPagesConfig(baseManifestJson, pluginConfig, umiMpaEntryConfig, vendorEntry);

    expect(Object.keys(result)).toHaveLength(2);
    const values = Object.values(result);
    expect(values.every(v => v.type === 'content_script')).toBe(true);

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应忽略配置文件不存在的 content_scripts 条目', () => {
    mockGlobSync.mockImplementation((pattern: string) => {
      if (pattern.includes('content_scripts')) {
        return [
          'src/pages/content_scripts/valid/index.ts',
          'src/pages/content_scripts/invalid/index.ts',
        ];
      }
      return [];
    });

    const existsSyncSpy = jest.spyOn(Fs, 'existsSync')
      .mockReturnValueOnce(true)   // valid 的配置文件存在
      .mockReturnValueOnce(false); // invalid 的配置文件不存在
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify({})));

    const result = findPagesConfig(baseManifestJson, pluginConfig, umiMpaEntryConfig, vendorEntry);

    expect(Object.keys(result)).toHaveLength(1);

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应记录错误当 background 目录下有多个入口文件', () => {
    mockGlobSync.mockImplementation((pattern: string) => {
      if (pattern.includes('content_scripts')) return [];
      if (pattern.includes('background')) {
        return ['src/pages/background/index.ts', 'src/pages/background/index2.ts'];
      }
      return [];
    });

    const result = findPagesConfig(baseManifestJson, pluginConfig, umiMpaEntryConfig, vendorEntry);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('background entry file must be one'),
    );
  });

  it('应记录错误当 options 目录下有多个入口文件', () => {
    mockGlobSync.mockImplementation((pattern: string) => {
      if (pattern.includes('content_scripts')) return [];
      if (pattern.includes('background')) return [];
      if (pattern.includes('options')) {
        return ['src/pages/options/index.ts', 'src/pages/options/index2.ts'];
      }
      return [];
    });

    findPagesConfig(baseManifestJson, pluginConfig, umiMpaEntryConfig, vendorEntry);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('options entry file must be one'),
    );
  });

  it('应记录错误当 popup 目录下有多个入口文件', () => {
    mockGlobSync.mockImplementation((pattern: string) => {
      if (pattern.includes('content_scripts')) return [];
      if (pattern.includes('background')) return [];
      if (pattern.includes('options')) return [];
      if (pattern.includes('popup')) {
        return ['src/pages/popup/index.ts', 'src/pages/popup/index2.ts'];
      }
      return [];
    });

    findPagesConfig(baseManifestJson, pluginConfig, umiMpaEntryConfig, vendorEntry);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('popup entry file must be one'),
    );
  });

  it('应在 background 目录下零个入口文件时静默跳过', () => {
    mockGlobSync.mockImplementation((pattern: string) => {
      if (pattern.includes('content_scripts')) return [];
      if (pattern.includes('background')) return [];
      if (pattern.includes('options')) return [];
      if (pattern.includes('popup')) return [];
      return [];
    });

    const result = findPagesConfig(baseManifestJson, pluginConfig, umiMpaEntryConfig, vendorEntry);

    const backgroundEntries = Object.values(result).filter(v => v.type === 'background');
    expect(backgroundEntries).toHaveLength(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('应在 options 目录下零个入口文件时静默跳过', () => {
    mockGlobSync.mockImplementation((pattern: string) => {
      if (pattern.includes('content_scripts')) return [];
      if (pattern.includes('background')) return [];
      if (pattern.includes('options')) return [];
      if (pattern.includes('popup')) return [];
      return [];
    });

    const result = findPagesConfig(baseManifestJson, pluginConfig, umiMpaEntryConfig, vendorEntry);

    const optionsEntries = Object.values(result).filter(v => v.type === 'options');
    expect(optionsEntries).toHaveLength(0);
  });

  it('应在 popup 目录下零个入口文件时静默跳过', () => {
    mockGlobSync.mockImplementation((pattern: string) => {
      if (pattern.includes('content_scripts')) return [];
      if (pattern.includes('background')) return [];
      if (pattern.includes('options')) return [];
      if (pattern.includes('popup')) return [];
      return [];
    });

    const result = findPagesConfig(baseManifestJson, pluginConfig, umiMpaEntryConfig, vendorEntry);

    const popupEntries = Object.values(result).filter(v => v.type === 'popup');
    expect(popupEntries).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// writeManifestV3Json
// ─────────────────────────────────────────────────────────────────
describe('writeManifestV3Json', () => {
  const baseManifestJson = { name: 'TestExtension', version: '1.0.0', manifest_version: 3 };
  const manifestTargetsJson = {};
  const outputPath = '/dist/dev/chrome';

  beforeEach(() => {
    jest.clearAllMocks();
    (deepmerge.all as jest.Mock).mockImplementation((arr: any[]) => Object.assign({}, ...arr));
  });

  it('应将 content_script 类型配置写入 manifest.content_scripts 数组', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const pagesConfig = {
      'entry1': {
        name: 'script1',
        path: '/src/pages/content_scripts/script1',
        file: '/src/pages/content_scripts/script1/index.ts',
        entry: 'umi/content_scripts/script1/index',
        type: 'content_script' as const,
        config: { matches: ['https://example.com/*'], js: ['script1.js'] },
      },
    };

    writeManifestV3Json(baseManifestJson, manifestTargetsJson, outputPath, pagesConfig, 'chrome');

    expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);
    const writtenPath = writeFileSyncSpy.mock.calls[0][0] as string;
    const writtenContent = writeFileSyncSpy.mock.calls[0][1] as string;
    expect(writtenPath).toContain('manifest.json');
    const parsed = JSON.parse(writtenContent);
    expect(parsed.content_scripts).toHaveLength(1);
    expect(parsed.content_scripts[0].matches).toEqual(['https://example.com/*']);

    writeFileSyncSpy.mockRestore();
  });

  it('应将 options 类型配置写入 manifest.options_ui', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const pagesConfig = {
      'entry1': {
        name: 'options',
        path: '/src/pages/options',
        file: '/src/pages/options/index.ts',
        entry: 'umi/options/index',
        type: 'options' as const,
        config: { page: 'options.html', open_in_tab: true },
      },
    };

    writeManifestV3Json(baseManifestJson, manifestTargetsJson, outputPath, pagesConfig, 'chrome');

    const writtenContent = writeFileSyncSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.options_ui).toEqual({ page: 'options.html', open_in_tab: true });

    writeFileSyncSpy.mockRestore();
  });

  it('应将 popup 类型配置写入 manifest.action', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const pagesConfig = {
      'entry1': {
        name: 'popup',
        path: '/src/pages/popup',
        file: '/src/pages/popup/index.ts',
        entry: 'umi/popup/index',
        type: 'popup' as const,
        config: { default_popup: 'popup.html' },
      },
    };

    writeManifestV3Json(baseManifestJson, manifestTargetsJson, outputPath, pagesConfig, 'chrome');

    const writtenContent = writeFileSyncSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.action.default_popup).toBe('popup.html');

    writeFileSyncSpy.mockRestore();
  });

  it('应处理 firefox 目标时调用 completionManifestV3ToFirefox', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const pagesConfig = {
      'entry1': {
        name: 'bg',
        path: '/src/pages/background',
        file: '/src/pages/background/index.ts',
        entry: 'umi/background/index',
        type: 'background' as const,
        config: { service_worker: 'background.js' },
      },
    };

    // firefox 会将 service_worker 替换为 scripts
    writeManifestV3Json(baseManifestJson, manifestTargetsJson, outputPath, pagesConfig, 'firefox');

    const writtenContent = writeFileSyncSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.background.scripts).toBeDefined();
    expect(parsed.background.service_worker).toBeUndefined();

    writeFileSyncSpy.mockRestore();
  });

  it('应处理 chrome102 目标时调用 completionManifestV3ToChrome102', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const pagesConfig = {
      'entry1': {
        name: 'main_script',
        path: '/src/pages/content_scripts/main_script',
        file: '/src/pages/content_scripts/main_script/index.ts',
        entry: 'umi/content_scripts/main_script/index',
        type: 'content_script' as const,
        world: 'MAIN' as const,
        config: { matches: ['https://example.com/*'], js: ['main.js'], world: 'MAIN' },
      },
    };

    writeManifestV3Json(baseManifestJson, manifestTargetsJson, outputPath, pagesConfig, 'chrome102');

    // chrome102 应该移除 world=MAIN 的 content_script 并写出 main-world.json
    const calls = writeFileSyncSpy.mock.calls;
    const manifestCall = calls.find((c: any[]) => (c[0] as string).endsWith('manifest.json'));
    const mainWorldCall = calls.find((c: any[]) => (c[0] as string).endsWith('main-world.json'));

    expect(manifestCall).toBeDefined();
    const manifestJson = JSON.parse(manifestCall![1] as string);
    expect(manifestJson.content_scripts).toHaveLength(0);

    expect(mainWorldCall).toBeDefined();

    writeFileSyncSpy.mockRestore();
  });

  it('应在提供 manifestHandler 时调用回调并写入返回值', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const manifestHandler = jest.fn((manifest: any) => ({
      ...manifest,
      custom_field: 'injected',
    }));
    const pagesConfig = {};

    writeManifestV3Json(baseManifestJson, manifestTargetsJson, outputPath, pagesConfig, 'chrome', manifestHandler);

    expect(manifestHandler).toHaveBeenCalledTimes(1);
    expect(manifestHandler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'TestExtension' }),
      'chrome',
    );

    const writtenContent = writeFileSyncSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.custom_field).toBe('injected');

    writeFileSyncSpy.mockRestore();
  });

  it('应在 pagesConfig 为空时不写入 content_scripts 数组', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    writeManifestV3Json(baseManifestJson, manifestTargetsJson, outputPath, {}, 'chrome');

    const writtenContent = writeFileSyncSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.content_scripts).toBeUndefined();

    writeFileSyncSpy.mockRestore();
  });

  it('应在 popup 配置 default_icon 为空对象时回退为 manifestBaseJson.icons', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const manifestWithIcons = { ...baseManifestJson, icons: { '16': 'icon.png' } };
    const pagesConfig = {
      'entry1': {
        name: 'popup',
        path: '/src/pages/popup',
        file: '/src/pages/popup/index.ts',
        entry: 'umi/popup/index',
        type: 'popup' as const,
        config: { default_icon: {}, default_popup: 'popup.html' },
      },
    };

    writeManifestV3Json(manifestWithIcons, manifestTargetsJson, outputPath, pagesConfig, 'chrome');

    const writtenContent = writeFileSyncSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.action.default_icon).toEqual({ '16': 'icon.png' });

    writeFileSyncSpy.mockRestore();
  });

  it('应在 popup 配置 default_title 为空字符串时回退为 manifestBaseJson.name', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const pagesConfig = {
      'entry1': {
        name: 'popup',
        path: '/src/pages/popup',
        file: '/src/pages/popup/index.ts',
        entry: 'umi/popup/index',
        type: 'popup' as const,
        config: { default_title: '', default_popup: 'popup.html' },
      },
    };

    writeManifestV3Json(baseManifestJson, manifestTargetsJson, outputPath, pagesConfig, 'chrome');

    const writtenContent = writeFileSyncSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.action.default_title).toBe('TestExtension');

    writeFileSyncSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// initPluginConfig
// ─────────────────────────────────────────────────────────────────
describe('initPluginConfig', () => {
  it('应合并用户配置与默认配置', () => {
    const result = initPluginConfig({ rootPath: 'custom/path' } as browserExtensionConfig);
    expect(result.rootPath).toBe('custom/path');
    expect(result.encoding).toBe(browserExtensionDefaultConfig.encoding);
  });

  it('应将 rootPath 转换为 POSIX 路径', () => {
    const result = initPluginConfig({ rootPath: 'src\\pages' } as browserExtensionConfig);
    expect(result.rootPath).toBe('src/pages');
  });
});

// ─────────────────────────────────────────────────────────────────
// toPosixPath
// ─────────────────────────────────────────────────────────────────
describe('toPosixPath', () => {
  it('应将 Windows 反斜杠转换为正斜杠', () => {
    expect(toPosixPath('src\\pages\\content_scripts')).toBe('src/pages/content_scripts');
  });

  it('应对已为 POSIX 的路径保持不变', () => {
    expect(toPosixPath('src/pages/content_scripts')).toBe('src/pages/content_scripts');
  });
});

// ─────────────────────────────────────────────────────────────────
// completionManifestPath
// ─────────────────────────────────────────────────────────────────
describe('completionManifestPath', () => {
  it('应在 manifestFilePath 存在时直接返回', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const result = completionManifestPath(createMockConfig({ manifestFilePath: 'manifest.json' }));
    expect(result).toBe('manifest.json');
    existsSyncSpy.mockRestore();
  });

  it('应在 manifestFilePath 不存在且拼接 rootPath 后仍不存在时记录错误并抛出异常', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);

    expect(() => {
      completionManifestPath(createMockConfig({ manifestFilePath: 'missing.json', rootPath: 'src/pages' }));
    }).toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('manifest file no found'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('src/pages/missing.json'),
    );

    existsSyncSpy.mockRestore();
  });

  it('应在 resultAbsolutePath 为 true 时返回绝对路径', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);

    const result = completionManifestPath(
      createMockConfig({ manifestFilePath: 'manifest.json', rootPath: 'src/pages' }),
      true,
    );

    expect(result).toBe(Path.resolve('manifest.json'));
    existsSyncSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// splitChunksFilter
// ─────────────────────────────────────────────────────────────────
describe('splitChunksFilter', () => {
  it('应在无 background 和 mainWorld 入口时返回 all', () => {
    const result = splitChunksFilter(undefined, [], false);
    expect(result).toBe('all');
  });

  it('应在 matchMainWorldEntry=false 时排除 background 和 mainWorld 入口', () => {
    const filterFn = splitChunksFilter('bg_entry', [{ entry: 'mw_entry', name: '', path: '', file: '', type: 'content_script', config: {} }], false);

    expect(typeof filterFn).toBe('function');
    const fn = filterFn as (chunk: { name: string }) => boolean;
    expect(fn({ name: 'bg_entry' })).toBe(false);
    expect(fn({ name: 'mw_entry' })).toBe(false);
    expect(fn({ name: 'other_chunk' })).toBe(true);
  });

  it('应在 matchMainWorldEntry=true 时仅返回 mainWorld 入口的 chunk', () => {
    const filterFn = splitChunksFilter('bg_entry', [{ entry: 'mw_entry', name: '', path: '', file: '', type: 'content_script', config: {} }], true);

    expect(typeof filterFn).toBe('function');
    const fn = filterFn as (chunk: { name: string }) => boolean;
    expect(fn({ name: 'mw_entry' })).toBe(true);
    expect(fn({ name: 'bg_entry' })).toBe(false);
    expect(fn({ name: 'other_chunk' })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// completionWebpackEntryConfig
// ─────────────────────────────────────────────────────────────────
describe('completionWebpackEntryConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应不覆盖已存在的普通 page entry', () => {
    const pagesConfig = {
      page1: {
        name: 'page1',
        path: '/src/pages/page1',
        file: 'src/pages/page1/index.ts',
        entry: 'page1',
        type: 'popup' as const,
        config: {},
      },
    };
    const webpackEntryConfig = { page1: ['old.js'] };

    completionWebpackEntryConfig(pagesConfig, webpackEntryConfig);

    expect(webpackEntryConfig['page1']).toEqual(['old.js']);
  });

  it('应添加不存在的普通 page entry', () => {
    const pagesConfig = {
      newPage: {
        name: 'newPage',
        path: '/src/pages/newPage',
        file: 'src/pages/newPage/index.ts',
        entry: 'newPage',
        type: 'popup' as const,
        config: {},
      },
    };
    const webpackEntryConfig: { [k: string]: any } = {};

    completionWebpackEntryConfig(pagesConfig, webpackEntryConfig);

    expect(webpackEntryConfig['newPage']).toEqual([
      Path.join(process.cwd(), 'src/pages/newPage/index.ts'),
    ]);
  });

  it('应强制覆盖 content_script 类型的已有 entry', () => {
    const pagesConfig = {
      cs1: {
        name: 'cs1',
        path: '/src/pages/cs1',
        file: 'src/cs1/index.ts',
        entry: 'cs1',
        type: 'content_script' as const,
        config: {},
      },
    };
    const webpackEntryConfig = { cs1: ['old.js'] };

    completionWebpackEntryConfig(pagesConfig, webpackEntryConfig);

    expect(webpackEntryConfig['cs1']).toEqual([
      Path.join(process.cwd(), 'src/cs1/index.ts'),
    ]);
  });

  it('应强制覆盖 background 类型的已有 entry', () => {
    const pagesConfig = {
      bg1: {
        name: 'bg1',
        path: '/src/pages/bg1',
        file: 'src/bg1/index.ts',
        entry: 'bg1',
        type: 'background' as const,
        config: {},
      },
    };
    const webpackEntryConfig = { bg1: ['old.js'] };

    completionWebpackEntryConfig(pagesConfig, webpackEntryConfig);

    expect(webpackEntryConfig['bg1']).toEqual([
      Path.join(process.cwd(), 'src/bg1/index.ts'),
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────
// loadManifestBaseJson
// ─────────────────────────────────────────────────────────────────
describe('loadManifestBaseJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应正确读取并解析 JSON 文件', () => {
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(
      Buffer.from('{"name":"TestExt"}'),
    );
    const pluginConfig = createMockConfig({ encoding: 'utf-8' });

    const result = loadManifestBaseJson('/src/manifest.json', pluginConfig);

    expect(result).toEqual({ name: 'TestExt' });
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(readFileSyncSpy).toHaveBeenCalledWith('/src/manifest.json', {
      encoding: 'utf-8',
    });
    readFileSyncSpy.mockRestore();
  });

  it('应在读取非法 JSON 时抛出 SyntaxError', () => {
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(
      Buffer.from('{invalid json}'),
    );
    const pluginConfig = createMockConfig({ encoding: 'utf-8' });

    expect(() => {
      loadManifestBaseJson('/src/manifest.json', pluginConfig);
    }).toThrow(SyntaxError);

    readFileSyncSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// loadManifestTargetJson
// ─────────────────────────────────────────────────────────────────
describe('loadManifestTargetJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回已存在目标的解析 JSON，跳过不存在的目标', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(
      Buffer.from('{"k":"v"}'),
    );
    const pluginConfig = createMockConfig({ encoding: 'utf-8' });

    const result = loadManifestTargetJson(
      '/src/manifest',
      ['chrome', 'firefox'],
      pluginConfig,
    );

    expect(result).toEqual({ chrome: { k: 'v' } });
    expect(existsSyncSpy).toHaveBeenCalledTimes(2);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应在目标文件存在但解析结果为假值时过滤掉', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const readFileSyncSpy = jest.spyOn(Fs, 'readFileSync').mockReturnValue(
      Buffer.from('null'),
    );
    const pluginConfig = createMockConfig();

    const result = loadManifestTargetJson('/src/manifest', ['chrome'], pluginConfig);

    expect(result).toEqual({});

    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('应在所有目标均不存在时返回空对象', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);
    const pluginConfig = createMockConfig();

    const result = loadManifestTargetJson(
      '/src/manifest',
      ['chrome', 'firefox'],
      pluginConfig,
    );

    expect(result).toEqual({});
    expect(existsSyncSpy).toHaveBeenCalledTimes(2);

    existsSyncSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// completionManifestV3ToChrome102
// ─────────────────────────────────────────────────────────────────
describe('completionManifestV3ToChrome102', () => {
  let writeFileSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (writeFileSyncSpy) writeFileSyncSpy.mockRestore();
  });

  it('应在无 MAIN world 内容脚本时不写文件', () => {
    writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const manifestJson = { content_scripts: [{ world: 'ISOLATED' }] };

    completionManifestV3ToChrome102(manifestJson, '/dist');

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(manifestJson.content_scripts).toHaveLength(1);
  });

  it('应写出 main-world.json 并从 content_scripts 中移除 MAIN world 项', () => {
    writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const manifestJson = {
      content_scripts: [
        { world: 'MAIN', m: 1 },
        { world: 'ISOLATED', m: 2 },
      ],
    };

    completionManifestV3ToChrome102(manifestJson, '/dist');

    expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(writeFileSyncSpy).toHaveBeenCalledWith(
      '/dist/main-world.json',
      JSON.stringify([{ world: 'MAIN', m: 1 }], null, 4),
    );
    expect(manifestJson.content_scripts).toEqual([{ world: 'ISOLATED', m: 2 }]);
  });

  it('应在 content_scripts 字段未定义时无副作用', () => {
    writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const manifestJson = {};

    completionManifestV3ToChrome102(manifestJson, '/dist');

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// completionManifestV3ToFirefox
// ─────────────────────────────────────────────────────────────────
describe('completionManifestV3ToFirefox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应从 permissions 中移除 commands', () => {
    const manifestJson = { permissions: ['tabs', 'commands'] };

    completionManifestV3ToFirefox(manifestJson);

    expect(manifestJson.permissions).toEqual(['tabs']);
  });

  it('应将 background.service_worker 降级为 scripts', () => {
    const manifestJson = { background: { service_worker: 'bg.js' } };

    completionManifestV3ToFirefox(manifestJson);

    expect(manifestJson.background).toEqual({ scripts: ['bg.js'] });
  });

  it('应将 incognito split 降级为 not_allowed', () => {
    const manifestJson = { incognito: 'split' };

    completionManifestV3ToFirefox(manifestJson);

    expect(manifestJson.incognito).toBe('not_allowed');
  });

  it('应在无匹配项时保持字段不变', () => {
    const manifestJson = {
      permissions: ['tabs'],
      background: { scripts: ['bg.js'] },
      incognito: 'spanning',
    };

    completionManifestV3ToFirefox(manifestJson);

    expect(manifestJson).toEqual({
      permissions: ['tabs'],
      background: { scripts: ['bg.js'] },
      incognito: 'spanning',
    });
  });

  it('应在 manifestJson 为 null 时不抛出异常', () => {
    expect(() => {
      completionManifestV3ToFirefox(null);
    }).not.toThrow();
  });

  it('应在 background.scripts 已存在时不覆盖', () => {
    const manifestJson = {
      background: { service_worker: 'sw.js', scripts: ['old.js'] },
    };

    completionManifestV3ToFirefox(manifestJson);

    expect(manifestJson.background).toEqual({
      service_worker: 'sw.js',
      scripts: ['old.js'],
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// syncTargetsFiles
// ─────────────────────────────────────────────────────────────────
describe('syncTargetsFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应在单 target 时无复制操作', () => {
    const stats = {
      compilation: { emittedAssets: new Set(['a.js']) },
    } as any;
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);

    syncTargetsFiles(stats, '/dist/chrome', '/dist', ['chrome']);

    // 因为 targets 只有一个，内层 for 循环 (i=1; i<1) 永远不执行
    // copyFileOrDirSync 不会因 existsSync=false 而有副作用
    expect(existsSyncSpy).not.toHaveBeenCalled();

    existsSyncSpy.mockRestore();
  });

  it('应在多 target 时增量复制所有输出文件', () => {
    const stats = {
      compilation: { emittedAssets: new Set(['a.js', 'b.css']) },
    } as any;
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync').mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as any);
    const copyFileSyncSpy = jest.spyOn(Fs, 'copyFileSync').mockImplementation(() => {});

    syncTargetsFiles(stats, '/dist/chrome', '/dist', ['chrome', 'firefox', 'chrome102']);

    // 2 files × 2 additional targets = 4 copies
    expect(copyFileSyncSpy).toHaveBeenCalledTimes(4);
    expect(copyFileSyncSpy).toHaveBeenCalledWith('/dist/chrome/a.js', '/dist/firefox/a.js');
    expect(copyFileSyncSpy).toHaveBeenCalledWith('/dist/chrome/a.js', '/dist/chrome102/a.js');
    expect(copyFileSyncSpy).toHaveBeenCalledWith('/dist/chrome/b.css', '/dist/firefox/b.css');
    expect(copyFileSyncSpy).toHaveBeenCalledWith('/dist/chrome/b.css', '/dist/chrome102/b.css');

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    copyFileSyncSpy.mockRestore();
  });

  it('应在 emittedAssets 为空时无复制操作', () => {
    const stats = {
      compilation: { emittedAssets: new Set() },
    } as any;
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);

    syncTargetsFiles(stats, '/dist/chrome', '/dist', ['chrome', 'firefox']);

    expect(existsSyncSpy).not.toHaveBeenCalled();

    existsSyncSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// firstWriteAllFile
// ─────────────────────────────────────────────────────────────────
describe('firstWriteAllFile', () => {
  const manifestBaseJson = { name: 'TestExtension' };
  const manifestTargetsJson = {};
  const pagesConfig = {};
  const vendorEntry = '';

  beforeEach(() => {
    jest.clearAllMocks();
    (deepmerge.all as jest.Mock).mockImplementation((arr: any[]) => Object.assign({}, ...arr));
  });

  it('应在单 target 时仅写一次 manifest 并输出日志', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const stats = {
      toJson: jest.fn().mockReturnValue({}),
    } as any;

    firstWriteAllFile(
      stats, manifestBaseJson, manifestTargetsJson,
      '/dist/chrome', '/dist', pagesConfig, vendorEntry,
      ['chrome'],
    );

    // 单 target 不触发 copyFileOrDirSync（for 循环不执行）
    // writeManifestV3Json 被调用 1 次 → writeFileSync 1 次
    expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.ready).toHaveBeenCalledTimes(1);
    expect(logger.ready).toHaveBeenCalledWith(
      expect.stringContaining('Build Complete'),
      expect.any(String),
    );

    existsSyncSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
  });

  it('应在多 target 时复制目录并多次写 manifest', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const stats = {
      toJson: jest.fn().mockReturnValue({}),
    } as any;

    firstWriteAllFile(
      stats, manifestBaseJson, manifestTargetsJson,
      '/dist/chrome', '/dist', pagesConfig, vendorEntry,
      ['chrome', 'firefox'],
    );

    // firefox (index 1) + chrome (index 0) = 2 次 writeManifestV3Json → 2 次 writeFileSync
    expect(writeFileSyncSpy).toHaveBeenCalledTimes(2);
    expect(logger.ready).toHaveBeenCalledTimes(2);

    existsSyncSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// firstWriteManifestV3Json
// ─────────────────────────────────────────────────────────────────
describe('firstWriteManifestV3Json', () => {
  const manifestBaseJson = { name: 'TestExtension' };
  const manifestTargetsJson = {};
  const outputPath = '/dist/chrome';
  const pagesConfig = {};
  const vendorEntry = '';

  beforeEach(() => {
    jest.clearAllMocks();
    (deepmerge.all as jest.Mock).mockImplementation((arr: any[]) => Object.assign({}, ...arr));
  });

  it('应在 statsData.chunks 存在时调用 writeManifestV3Json', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const stats = {
      toJson: jest.fn().mockReturnValue({ chunks: [{ id: 'c1', files: ['a.js'] }], entrypoints: {} }),
    } as any;

    firstWriteManifestV3Json(
      stats, manifestBaseJson, manifestTargetsJson,
      outputPath, pagesConfig, vendorEntry, 'chrome',
    );

    expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);

    writeFileSyncSpy.mockRestore();
  });

  it('应在 statsData.chunks 不存在时仍调用 writeManifestV3Json', () => {
    const writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
    const stats = {
      toJson: jest.fn().mockReturnValue({}),
    } as any;

    firstWriteManifestV3Json(
      stats, manifestBaseJson, manifestTargetsJson,
      outputPath, pagesConfig, vendorEntry, 'chrome',
    );

    expect(writeFileSyncSpy).toHaveBeenCalledTimes(1);

    writeFileSyncSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// copyFileOrDirSync
// ─────────────────────────────────────────────────────────────────
describe('copyFileOrDirSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应在源路径不存在时无操作', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);
    const statSyncSpy = jest.spyOn(Fs, 'statSync');
    const copyFileSyncSpy = jest.spyOn(Fs, 'copyFileSync');
    const mkdirSyncSpy = jest.spyOn(Fs, 'mkdirSync');

    copyFileOrDirSync('/src', '/dest');

    expect(existsSyncSpy).toHaveBeenCalledTimes(1);
    expect(statSyncSpy).not.toHaveBeenCalled();
    expect(copyFileSyncSpy).not.toHaveBeenCalled();
    expect(mkdirSyncSpy).not.toHaveBeenCalled();

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    copyFileSyncSpy.mockRestore();
    mkdirSyncSpy.mockRestore();
  });

  it('应复制文件当源路径为文件时', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync').mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as any);
    const copyFileSyncSpy = jest.spyOn(Fs, 'copyFileSync').mockImplementation(() => {});

    copyFileOrDirSync('/src/file.txt', '/dest/file.txt');

    expect(copyFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(copyFileSyncSpy).toHaveBeenCalledWith('/src/file.txt', '/dest/file.txt');

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    copyFileSyncSpy.mockRestore();
  });

  it('应创建空目录当源路径为空目录时', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync').mockReturnValue({
      isFile: () => false,
      isDirectory: () => true,
    } as any);
    const readdirSyncSpy = jest.spyOn(Fs, 'readdirSync').mockReturnValue([]);
    const mkdirSyncSpy = jest.spyOn(Fs, 'mkdirSync').mockImplementation((() => {}) as any);

    copyFileOrDirSync('/src/dir', '/dest/dir');

    expect(mkdirSyncSpy).toHaveBeenCalledTimes(1);
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/dest/dir');
    expect(readdirSyncSpy).toHaveBeenCalledTimes(1);

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
    mkdirSyncSpy.mockRestore();
  });

  it('应复制含单文件的目录', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync')
      .mockReturnValueOnce({ isFile: () => false, isDirectory: () => true } as any)  // /src/dir
      .mockReturnValueOnce({ isFile: () => true, isDirectory: () => false } as any); // /src/dir/a.txt
    const readdirSyncSpy = jest.spyOn(Fs, 'readdirSync').mockReturnValue(['a.txt'] as any);
    const mkdirSyncSpy = jest.spyOn(Fs, 'mkdirSync').mockImplementation((() => {}) as any);
    const copyFileSyncSpy = jest.spyOn(Fs, 'copyFileSync').mockImplementation(() => {});

    copyFileOrDirSync('/src/dir', '/dest/dir');

    expect(mkdirSyncSpy).toHaveBeenCalledWith('/dest/dir');
    expect(copyFileSyncSpy).toHaveBeenCalledWith('/src/dir/a.txt', '/dest/dir/a.txt');

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
    mkdirSyncSpy.mockRestore();
    copyFileSyncSpy.mockRestore();
  });

  it('应递归复制含嵌套子目录的目录', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync')
      .mockReturnValueOnce({ isFile: () => false, isDirectory: () => true } as any)  // /src/dir
      .mockReturnValueOnce({ isFile: () => false, isDirectory: () => true } as any)  // /src/dir/sub
      .mockReturnValueOnce({ isFile: () => true, isDirectory: () => false } as any); // /src/dir/sub/b.txt
    const readdirSyncSpy = jest.spyOn(Fs, 'readdirSync')
      .mockReturnValueOnce(['sub'] as any)
      .mockReturnValueOnce(['b.txt'] as any);
    const mkdirSyncSpy = jest.spyOn(Fs, 'mkdirSync').mockImplementation((() => {}) as any);
    const copyFileSyncSpy = jest.spyOn(Fs, 'copyFileSync').mockImplementation(() => {});

    copyFileOrDirSync('/src/dir', '/dest/dir');

    expect(mkdirSyncSpy).toHaveBeenCalledWith('/dest/dir');
    expect(mkdirSyncSpy).toHaveBeenCalledWith('/dest/dir/sub');
    expect(copyFileSyncSpy).toHaveBeenCalledWith('/src/dir/sub/b.txt', '/dest/dir/sub/b.txt');

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
    mkdirSyncSpy.mockRestore();
    copyFileSyncSpy.mockRestore();
  });

  it('应在复制过程中抛异常时捕获错误并记录日志', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync').mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as any);
    const copyFileSyncSpy = jest.spyOn(Fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });

    copyFileOrDirSync('/src/file.txt', '/dest/file.txt');

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(2);

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    copyFileSyncSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────
// removeFileOrDirSync
// ─────────────────────────────────────────────────────────────────
describe('removeFileOrDirSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应在路径不存在时无操作', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(false);
    const statSyncSpy = jest.spyOn(Fs, 'statSync');
    const unlinkSyncSpy = jest.spyOn(Fs, 'unlinkSync');
    const rmdirSyncSpy = jest.spyOn(Fs, 'rmdirSync');

    removeFileOrDirSync('/old');

    expect(existsSyncSpy).toHaveBeenCalledTimes(1);
    expect(statSyncSpy).not.toHaveBeenCalled();
    expect(unlinkSyncSpy).not.toHaveBeenCalled();
    expect(rmdirSyncSpy).not.toHaveBeenCalled();

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    unlinkSyncSpy.mockRestore();
    rmdirSyncSpy.mockRestore();
  });

  it('应删除文件当路径为文件时', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync').mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as any);
    const unlinkSyncSpy = jest.spyOn(Fs, 'unlinkSync').mockImplementation(() => {});

    removeFileOrDirSync('/old/file.txt');

    expect(unlinkSyncSpy).toHaveBeenCalledTimes(1);
    expect(unlinkSyncSpy).toHaveBeenCalledWith('/old/file.txt');

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    unlinkSyncSpy.mockRestore();
  });

  it('应删除空目录当路径为空目录时', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync').mockReturnValue({
      isFile: () => false,
      isDirectory: () => true,
    } as any);
    const readdirSyncSpy = jest.spyOn(Fs, 'readdirSync').mockReturnValue([]);
    const rmdirSyncSpy = jest.spyOn(Fs, 'rmdirSync').mockImplementation(() => {});

    removeFileOrDirSync('/old/dir');

    expect(readdirSyncSpy).toHaveBeenCalledTimes(1);
    expect(rmdirSyncSpy).toHaveBeenCalledTimes(1);
    expect(rmdirSyncSpy).toHaveBeenCalledWith('/old/dir');

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
    rmdirSyncSpy.mockRestore();
  });

  it('应递归删除含嵌套子项的目录', () => {
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync')
      .mockReturnValueOnce({ isFile: () => false, isDirectory: () => true } as any)  // /old/dir
      .mockReturnValueOnce({ isFile: () => false, isDirectory: () => true } as any)  // /old/dir/sub
      .mockReturnValueOnce({ isFile: () => true, isDirectory: () => false } as any); // /old/dir/sub/file.txt
    const readdirSyncSpy = jest.spyOn(Fs, 'readdirSync')
      .mockReturnValueOnce(['sub'] as any)
      .mockReturnValueOnce(['file.txt'] as any);
    const unlinkSyncSpy = jest.spyOn(Fs, 'unlinkSync').mockImplementation(() => {});
    const rmdirSyncSpy = jest.spyOn(Fs, 'rmdirSync').mockImplementation(() => {});

    removeFileOrDirSync('/old/dir');

    expect(existsSyncSpy).toHaveBeenCalledWith('/old/dir/sub/file.txt');
    expect(unlinkSyncSpy).toHaveBeenCalledWith('/old/dir/sub/file.txt');
    expect(rmdirSyncSpy).toHaveBeenCalledWith('/old/dir/sub');
    expect(rmdirSyncSpy).toHaveBeenCalledWith('/old/dir');

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
    unlinkSyncSpy.mockRestore();
    rmdirSyncSpy.mockRestore();
  });

  it('应在删除过程中抛异常时捕获错误', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const existsSyncSpy = jest.spyOn(Fs, 'existsSync').mockReturnValue(true);
    const statSyncSpy = jest.spyOn(Fs, 'statSync').mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
    } as any);
    const unlinkSyncSpy = jest.spyOn(Fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('permission denied');
    });

    removeFileOrDirSync('/old/file.txt');

    expect(consoleErrorSpy).toHaveBeenCalled();

    existsSyncSpy.mockRestore();
    statSyncSpy.mockRestore();
    unlinkSyncSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
