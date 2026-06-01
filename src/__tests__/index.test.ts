import Fs from 'fs';

// ─────────────────────────────────────────────────────────────────
// Mock variables — declared before jest.mock (hoisting requirement)
// ─────────────────────────────────────────────────────────────────
const mockFindFileGroup = jest.fn();
const mockLoadContentScriptsConfig = jest.fn();
const mockFindPagesConfig = jest.fn().mockReturnValue({});
const mockLoadManifestBaseJson = jest.fn().mockReturnValue({
  name: 'TestExt',
  version: '1.0.0',
  manifest_version: 3,
});
const mockLoadManifestTargetJson = jest.fn().mockReturnValue({});
const mockCompletionManifestPath = jest.fn().mockReturnValue('src/manifest.json');

// ─────────────────────────────────────────────────────────────────
// Mock @umijs/utils — needed by writeManifestV3Json (deepmerge.all)
// ─────────────────────────────────────────────────────────────────
jest.mock('@umijs/utils', () => ({
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
  deepmerge: {
    all: jest.fn((arr: any[]) => Object.assign({}, ...arr)),
  },
  glob: {
    sync: jest.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────
// Mock utils — writeManifestV3Json is REAL (from ...actual), rest mocked
// ─────────────────────────────────────────────────────────────────
jest.mock('../utils', () => {
  const actual = jest.requireActual('../utils');
  return {
    ...actual,
    findFileGroup: (...args: any[]) => mockFindFileGroup(...args),
    loadContentScriptsConfig: (...args: any[]) => mockLoadContentScriptsConfig(...args),
    findPagesConfig: (...args: any[]) => mockFindPagesConfig(...args),
    loadManifestBaseJson: (...args: any[]) => mockLoadManifestBaseJson(...args),
    loadManifestTargetJson: (...args: any[]) => mockLoadManifestTargetJson(...args),
    completionManifestPath: (...args: any[]) => mockCompletionManifestPath(...args),
    removeFileOrDirSync: jest.fn(),
    firstWriteAllFile: jest.fn(),
    syncTargetsFiles: jest.fn(),
    completionWebpackEntryConfig: jest.fn(),
    splitChunksFilter: jest.fn().mockReturnValue('all'),
    copyFileOrDirSync: jest.fn(),
  };
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
interface HookRecord {
  callback: (...args: any[]) => any;
}

function createMockApi(
  env: 'development' | 'production' = 'development',
  userConfig: any = {},
): any {
  const hooks: Record<string, HookRecord[]> = {};

  const api: any = {
    env,
    userConfig: { browserExtension: userConfig },
    describe: jest.fn(),
    onStart: jest.fn((fn: () => void) => {
      if (!hooks.onStart) hooks.onStart = [];
      hooks.onStart.push({ callback: fn });
    }),
    modifyConfig: jest.fn((fn: (memo: any) => any) => {
      if (!hooks.modifyConfig) hooks.modifyConfig = [];
      hooks.modifyConfig.push({ callback: fn });
    }),
    modifyWebpackConfig: jest.fn((fn: (memo: any) => any) => {
      if (!hooks.modifyWebpackConfig) hooks.modifyWebpackConfig = [];
      hooks.modifyWebpackConfig.push({ callback: fn });
    }),
    onBuildComplete: jest.fn((fn: (args: any) => void) => {
      if (!hooks.onBuildComplete) hooks.onBuildComplete = [];
      hooks.onBuildComplete.push({ callback: fn });
    }),
    onDevCompileDone: jest.fn((fn: (args: any) => void) => {
      if (!hooks.onDevCompileDone) hooks.onDevCompileDone = [];
      hooks.onDevCompileDone.push({ callback: fn });
    }),
    onGenerateFiles: jest.fn((fn: (args: any) => void) => {
      if (!hooks.onGenerateFiles) hooks.onGenerateFiles = [];
      hooks.onGenerateFiles.push({ callback: fn });
    }),
    addTmpGenerateWatcherPaths: jest.fn((fn: () => string[]) => {
      if (!hooks.addTmpGenerateWatcherPaths) hooks.addTmpGenerateWatcherPaths = [];
      hooks.addTmpGenerateWatcherPaths.push({ callback: fn });
    }),
  };

  return { api, hooks };
}

/**
 * Register the plugin + trigger modifyConfig (resets pagesConfig to findPagesConfig return).
 */
function setupAndTriggerModifyConfig(
  env: 'development' | 'production' = 'development',
  userConfig: any = {},
) {
  const { api, hooks } = createMockApi(env, userConfig);
  require('../index').default(api);
  const memo: any = { mpa: { entry: {} } };
  hooks.modifyConfig![0].callback(memo);
  return { api, hooks, memo };
}

/** Build a minimal content_script entry config for pagesConfig population. */
function csEntry(overrides: any = {}) {
  return {
    name: 'foo',
    path: 'src/pages/content_scripts/foo',
    file: 'src/pages/content_scripts/foo/index.ts',
    entry: 'umi/content_scripts/foo/index',
    type: 'content_script' as const,
    config: { matches: ['https://example.com/*'], js: ['foo.js'] },
    ...overrides,
  };
}

/** Parse the captured manifest.json content from the last writeFileSync call. */
function getLastWrittenManifest(): any {
  const calls = (Fs.writeFileSync as jest.Mock).mock.calls;
  const manifestCalls = calls.filter((c: any[]) => (c[0] as string).endsWith('manifest.json'));
  if (manifestCalls.length === 0) return null;
  return JSON.parse(manifestCalls[manifestCalls.length - 1][1]);
}

/** Return all captured manifest.json contents (for multi-target tests). */
function getAllWrittenManifests(): { path: string; content: any }[] {
  const calls = (Fs.writeFileSync as jest.Mock).mock.calls;
  return calls
    .filter((c: any[]) => (c[0] as string).endsWith('manifest.json'))
    .map((c: any[]) => ({ path: c[0] as string, content: JSON.parse(c[1]) }));
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────
describe('插件入口 (index.ts)', () => {
  let writeFileSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock defaults
    mockFindPagesConfig.mockReturnValue({});
    mockLoadManifestBaseJson.mockReturnValue({
      name: 'TestExt',
      version: '1.0.0',
      manifest_version: 3,
    });
    mockLoadManifestTargetJson.mockReturnValue({});
    mockCompletionManifestPath.mockReturnValue('src/manifest.json');

    // Spy on Fs.writeFileSync to capture manifest.json writes
    writeFileSyncSpy = jest.spyOn(Fs, 'writeFileSync').mockImplementation(() => {});
  });

  afterEach(() => {
    writeFileSyncSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────
  // 跨生命周期状态传递 (modifyConfig → onGenerateFiles)
  // ─────────────────────────────────────────────────────────────
  describe('跨生命周期状态传递 (modifyConfig → onGenerateFiles)', () => {
    it('应在 modifyConfig 阶段捕获 memo.mpa.entry 引用并传递给 onGenerateFiles 回调', () => {
      const { api, hooks } = createMockApi('development');

      require('../index').default(api);

      expect(api.modifyConfig).toHaveBeenCalledTimes(1);
      expect(hooks.modifyConfig).toBeDefined();
      expect(hooks.modifyConfig!.length).toBe(1);

      const memo: any = { mpa: { entry: { myEntry: { title: 'test' } } } };
      hooks.modifyConfig![0].callback(memo);

      // Trigger onGenerateFiles → loadContentScriptsConfig receives captured umiMpaEntryConfig
      mockFindFileGroup.mockReturnValue(['src/pages/content_scripts/foo/index.ts']);
      mockLoadContentScriptsConfig.mockReturnValue(csEntry());

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [{ event: 'change', path: 'src/pages/content_scripts/foo/index.json' }],
      });

      // 3rd arg to loadContentScriptsConfig === umiMpaEntryConfig === memo.mpa.entry
      expect(mockLoadContentScriptsConfig).toHaveBeenCalled();
      const capturedRef: any = mockLoadContentScriptsConfig.mock.calls[0][2];
      expect(capturedRef).toBe(memo.mpa.entry);

      // 引用传递验证：修改源对象应反映在捕获引用中
      memo.mpa.entry.newProp = 'visible';
      expect(capturedRef.newProp).toBe('visible');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // addTmpGenerateWatcherPaths
  // ─────────────────────────────────────────────────────────────
  describe('addTmpGenerateWatcherPaths', () => {
    it('应在返回数组中包含内容脚本配置文件的通配路径', () => {
      const { api, hooks } = createMockApi('development');

      require('../index').default(api);

      expect(api.addTmpGenerateWatcherPaths).toHaveBeenCalledTimes(1);
      const paths = hooks.addTmpGenerateWatcherPaths![0].callback();

      expect(paths).toContain('src/manifest.json');
      expect(paths.some((p: string) => p.includes('.chrome.json'))).toBe(true);

      const configPattern = paths.find(
        (p: string) => p.includes('content_scripts') && p.includes('index.json'),
      );
      expect(configPattern).toBeDefined();
      expect(configPattern).toContain('**');
    });

    it('应在多 target 场景下列出所有 target 的 manifest 路径', () => {
      const { api, hooks } = createMockApi('development', {
        targets: ['chrome', 'firefox'],
      });

      require('../index').default(api);

      const paths = hooks.addTmpGenerateWatcherPaths![0].callback();

      expect(paths.some((p: string) => p.includes('.chrome.json'))).toBe(true);
      expect(paths.some((p: string) => p.includes('.firefox.json'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // onGenerateFiles — 内容脚本配置变更检测
  // ─────────────────────────────────────────────────────────────
  describe('onGenerateFiles — 内容脚本配置变更检测', () => {
    it('应忽略 production 环境下的文件变更', () => {
      const { hooks } = setupAndTriggerModifyConfig('production');

      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // production 环境下 isDev=false → 不进入 if(isDev) 分支 → 不写 manifest
      expect(Fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('应忽略首次生成 (isFirstTime=true) 时的文件变更', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: true, files });
      }

      expect(Fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('应忽略 files 为 undefined/null 的情况', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files: undefined });
      }

      expect(Fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('应在内容脚本配置文件变更时写入正确 manifest.json（产物断言）', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      mockFindFileGroup.mockReturnValue(['src/pages/content_scripts/foo/index.ts']);
      mockLoadContentScriptsConfig.mockReturnValue(
        csEntry({ config: { matches: ['https://updated.com/*'], js: ['foo.js'] } }),
      );

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [{ event: 'change', path: 'src/pages/content_scripts/foo/index.json' }],
      });

      // 写入 1 次 manifest.json（单 target chrome）
      expect(Fs.writeFileSync).toHaveBeenCalledTimes(1);

      const manifest = getLastWrittenManifest();
      expect(manifest).not.toBeNull();
      expect(manifest.name).toBe('TestExt');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.manifest_version).toBe(3);
      expect(manifest.content_scripts).toBeDefined();
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.content_scripts[0]).toMatchObject({
        matches: ['https://updated.com/*'],
        js: ['foo.js'],
      });
    });

    it('应正确处理多个内容脚本配置文件同时变更（批量写一次）', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      mockFindFileGroup.mockImplementation((dir: string) => {
        if (dir.includes('foo')) return ['src/pages/content_scripts/foo/index.ts'];
        if (dir.includes('bar')) return ['src/pages/content_scripts/bar/index.ts'];
        return [];
      });

      mockLoadContentScriptsConfig.mockImplementation((entryPath: string) =>
        entryPath.includes('foo')
          ? csEntry({
              name: 'foo',
              file: 'src/pages/content_scripts/foo/index.ts',
              config: { matches: ['https://foo.com/*'], js: ['foo.js'] },
            })
          : csEntry({
              name: 'bar',
              file: 'src/pages/content_scripts/bar/index.ts',
              config: { matches: ['https://bar.com/*'], css: ['bar.css'] },
            }),
      );

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [
          { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
          { event: 'change', path: 'src/pages/content_scripts/bar/index.json' },
        ],
      });

      // loadContentScriptsConfig 调用 2 次，但 writeManifestV3Json 只调用 1 次（批量）
      expect(mockLoadContentScriptsConfig).toHaveBeenCalledTimes(2);
      expect(Fs.writeFileSync).toHaveBeenCalledTimes(1);

      const manifest = getLastWrittenManifest();
      expect(manifest.content_scripts).toHaveLength(2);
      expect(manifest.content_scripts[0]).toMatchObject({ matches: ['https://foo.com/*'], js: ['foo.js'] });
      expect(manifest.content_scripts[1]).toMatchObject({ matches: ['https://bar.com/*'], css: ['bar.css'] });
    });

    it('应仅响应 change 事件，忽略 add 和 unlink 事件', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [
          { event: 'add', path: 'src/pages/content_scripts/new_script/index.json' },
          { event: 'unlink', path: 'src/pages/content_scripts/old_script/index.json' },
        ],
      });

      // 既无 findFileGroup 也无 loadContentScriptsConfig 调用，更无写 manifest
      expect(mockFindFileGroup).not.toHaveBeenCalled();
      expect(mockLoadContentScriptsConfig).not.toHaveBeenCalled();
      expect(Fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('应忽略非 content_scripts 路径下的 index.json 变更', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [
          { event: 'change', path: 'src/pages/background/index.json' },
          { event: 'change', path: 'src/pages/options/index.json' },
        ],
      });

      expect(mockFindFileGroup).not.toHaveBeenCalled();
      expect(mockLoadContentScriptsConfig).not.toHaveBeenCalled();
      expect(Fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('应在 findFileGroup 返回非唯一结果时记录警告，跳过该条目但 manifest 仍会写入', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      mockFindFileGroup.mockReturnValue([
        'src/pages/content_scripts/foo/index.ts',
        'src/pages/content_scripts/foo/index.tsx',
      ]);

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [{ event: 'change', path: 'src/pages/content_scripts/foo/index.json' }],
      });

      const { logger } = require('@umijs/utils');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('entry path not unique'),
      );
      // continue 跳过 loadContentScriptsConfig，但 writeManifestV3Json 仍执行
      expect(mockLoadContentScriptsConfig).not.toHaveBeenCalled();

      // manifest 仍会写入（pagesConfig 为空，只有基础字段）
      expect(Fs.writeFileSync).toHaveBeenCalledTimes(1);
      const manifest = getLastWrittenManifest();
      expect(manifest.name).toBe('TestExt');
      expect(manifest.content_scripts).toBeUndefined();
    });

    it('应在 loadContentScriptsConfig 返回 null 时从 pagesConfig 删除条目且 manifest 不含该条目', () => {
      // 预设 findPagesConfig 返回一个已有条目，模拟"之前存在，现在配置被删除"
      mockFindPagesConfig.mockReturnValue({
        'src/pages/content_scripts/foo/index.ts': csEntry({
          name: 'foo',
          file: 'src/pages/content_scripts/foo/index.ts',
          config: { matches: ['https://old.com/*'], js: ['old.js'] },
        }),
      });

      const { hooks } = setupAndTriggerModifyConfig('development');

      mockFindFileGroup.mockReturnValue(['src/pages/content_scripts/foo/index.ts']);
      mockLoadContentScriptsConfig.mockReturnValue(null); // 配置删除了

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [{ event: 'change', path: 'src/pages/content_scripts/foo/index.json' }],
      });

      // writeManifestV3Json 仍被调用，但 content_scripts 应为空
      expect(Fs.writeFileSync).toHaveBeenCalledTimes(1);

      const manifest = getLastWrittenManifest();
      expect(manifest.content_scripts).toBeUndefined();
    });

    it('应在多 target 场景下遍历所有 target 分别写入正确的 manifest.json', () => {
      const { hooks } = setupAndTriggerModifyConfig('development', {
        targets: ['chrome', 'firefox'],
      });

      mockFindFileGroup.mockReturnValue(['src/pages/content_scripts/foo/index.ts']);
      mockLoadContentScriptsConfig.mockReturnValue(
        csEntry({
          config: {
            matches: ['https://example.com/*'],
            js: ['foo.js'],
          },
        }),
      );

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [{ event: 'change', path: 'src/pages/content_scripts/foo/index.json' }],
      });

      // chrome + firefox = 2 次 writeFileSync
      expect(Fs.writeFileSync).toHaveBeenCalledTimes(2);

      const manifests = getAllWrittenManifests();
      expect(manifests).toHaveLength(2);

      // chrome manifest
      const chromeManifest = manifests.find((m) => m.path.includes('chrome') && !m.path.includes('firefox'));
      expect(chromeManifest).toBeDefined();
      expect(chromeManifest!.content.content_scripts).toHaveLength(1);
      expect(chromeManifest!.content.content_scripts[0].matches).toEqual(['https://example.com/*']);

      // firefox manifest → service_worker 被替换为 scripts（内部 completionManifestV3ToFirefox 调用）
      const firefoxManifest = manifests.find((m) => m.path.includes('firefox'));
      expect(firefoxManifest).toBeDefined();
    });

    it('应在 manifest 源文件变更时重新加载 base/target json 并重写所有 target 的 manifest', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      // 模拟 manifest.json 自身被修改后，loadManifestBaseJson 返回新内容
      mockLoadManifestBaseJson.mockReturnValue({
        name: 'UpdatedExt',
        version: '2.0.0',
        manifest_version: 3,
      });

      hooks.onGenerateFiles![0].callback({
        isFirstTime: false,
        files: [{ event: 'change', path: 'src/manifest.json' }],
      });

      // 应重新加载 base json
      expect(mockLoadManifestBaseJson).toHaveBeenCalled();
      // 应重新加载 target json
      expect(mockLoadManifestTargetJson).toHaveBeenCalled();
      // 单 target 写 1 次
      expect(Fs.writeFileSync).toHaveBeenCalledTimes(1);

      const manifest = getLastWrittenManifest();
      expect(manifest.name).toBe('UpdatedExt');
      expect(manifest.version).toBe('2.0.0');
    });
  });
});
