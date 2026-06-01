import Path from 'path';
import Fs from 'fs';
import { glob, deepmerge, logger } from '@umijs/utils';
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
});

// ─────────────────────────────────────────────────────────────────
// splitChunksFilter
// ─────────────────────────────────────────────────────────────────
describe('splitChunksFilter', () => {
  it('应在无 background 和 mainWorld 入口时返回 all', () => {
    const result = splitChunksFilter(undefined, [], false);
    expect(result).toBe('all');
  });
});
