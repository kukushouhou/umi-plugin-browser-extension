import Path from 'path';

// ─────────────────────────────────────────────────────────────────
// Mock the entire utils module before importing the plugin
// ─────────────────────────────────────────────────────────────────
const mockInitPluginConfig = jest.fn();
const mockCompletionManifestPath = jest.fn();
const mockLoadManifestBaseJson = jest.fn();
const mockLoadManifestTargetJson = jest.fn();
const mockFindPagesConfig = jest.fn();
const mockFindFileGroup = jest.fn();
const mockLoadContentScriptsConfig = jest.fn();
const mockWriteManifestV3Json = jest.fn();
const mockRemoveFileOrDirSync = jest.fn();
const mockCompletionWebpackEntryConfig = jest.fn();
const mockFirstWriteAllFile = jest.fn();
const mockSyncTargetsFiles = jest.fn();
const mockSplitChunksFilter = jest.fn();

let capturedUmiMpaEntryConfig: any = null;
let capturedPagesConfig: any = null;
let capturedVendorEntry: string | null = null;

// Mock findPagesConfig to capture the umiMpaEntryConfig reference
mockFindPagesConfig.mockImplementation(
  (_manifestBaseJson: any, _pluginConfig: any, umiMpaEntryConfig: any, vendorEntry: string) => {
    capturedUmiMpaEntryConfig = umiMpaEntryConfig;
    capturedVendorEntry = vendorEntry;
    capturedPagesConfig = {};
    return capturedPagesConfig;
  },
);

jest.mock('../utils', () => ({
  initPluginConfig: (...args: any[]) => mockInitPluginConfig(...args),
  completionManifestPath: (...args: any[]) => mockCompletionManifestPath(...args),
  loadManifestBaseJson: (...args: any[]) => mockLoadManifestBaseJson(...args),
  loadManifestTargetJson: (...args: any[]) => mockLoadManifestTargetJson(...args),
  findPagesConfig: (...args: any[]) => mockFindPagesConfig(...args),
  findFileGroup: (...args: any[]) => mockFindFileGroup(...args),
  loadContentScriptsConfig: (...args: any[]) => mockLoadContentScriptsConfig(...args),
  writeManifestV3Json: (...args: any[]) => mockWriteManifestV3Json(...args),
  removeFileOrDirSync: (...args: any[]) => mockRemoveFileOrDirSync(...args),
  completionWebpackEntryConfig: (...args: any[]) => mockCompletionWebpackEntryConfig(...args),
  firstWriteAllFile: (...args: any[]) => mockFirstWriteAllFile(...args),
  syncTargetsFiles: (...args: any[]) => mockSyncTargetsFiles(...args),
  splitChunksFilter: (...args: any[]) => mockSplitChunksFilter(...args),
}));

jest.mock('@umijs/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    ready: jest.fn(),
    debug: jest.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────
// Helper to create a mock IApi
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

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────
describe('插件入口 (index.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock returns
    mockInitPluginConfig.mockReturnValue({
      rootPath: 'src/pages',
      entryFileName: 'index.[jt]s{,x}',
      configFileName: 'index.json',
      encoding: 'utf-8',
      jsCssOutputDir: 'umi',
      manifestFilePath: 'manifest.json',
      contentScriptsPathName: 'content_scripts',
      backgroundPathName: 'background',
      optionsPathName: 'options',
      popupPathName: 'popup',
      optionsOpenInTab: true,
      optionsTitle: '',
      popupDefaultTitle: '',
      popupDefaultIcon: {},
      splitChunks: true,
      splitChunksPathName: 'chunks',
      targets: ['chrome'],
      clearAbsPath: true,
    });
    mockCompletionManifestPath.mockReturnValue('src/manifest.json');
    mockLoadManifestBaseJson.mockReturnValue({ name: 'TestExtension', version: '1.0.0', manifest_version: 3 });
    mockLoadManifestTargetJson.mockReturnValue({});
    mockSplitChunksFilter.mockReturnValue('all');

    // Reset capture variables
    capturedUmiMpaEntryConfig = null;
    capturedPagesConfig = null;
    capturedVendorEntry = null;
  });

  // ─────────────────────────────────────────────────────────────
  // Cross-lifecycle state passing
  // ─────────────────────────────────────────────────────────────
  describe('跨生命周期状态传递 (modifyConfig → onGenerateFiles)', () => {
    it('应在 modifyConfig 阶段捕获 memo.mpa.entry 引用至闭包变量', () => {
      const { api, hooks } = createMockApi('development');

      // Load the plugin (which registers all hooks)
      require('../index').default(api);

      // Verify modifyConfig was registered
      expect(api.modifyConfig).toHaveBeenCalledTimes(1);
      expect(hooks.modifyConfig).toBeDefined();
      expect(hooks.modifyConfig!.length).toBe(1);

      // Trigger modifyConfig callback
      const memo = { mpa: { entry: { myEntry: { title: 'test' } } } };
      hooks.modifyConfig![0].callback(memo);

      // umiMpaEntryConfig should now reference memo.mpa.entry
      expect(capturedUmiMpaEntryConfig).toBe(memo.mpa.entry);
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
      expect(hooks.addTmpGenerateWatcherPaths).toBeDefined();

      const paths = hooks.addTmpGenerateWatcherPaths![0].callback();

      // Should include manifest source path
      expect(paths).toContain('src/manifest.json');
      // Should include target-specific manifest paths (for chrome)
      expect(paths.some((p: string) => p.includes('.chrome.json'))).toBe(true);
      // Should include content scripts config pattern
      const configPattern = paths.find((p: string) => p.includes('content_scripts') && p.includes('index.json'));
      expect(configPattern).toBeDefined();
      expect(configPattern).toContain('**');
    });

    it('应在多 target 场景下列出所有 target 的 manifest 路径', () => {
      mockInitPluginConfig.mockReturnValue({
        rootPath: 'src/pages',
        entryFileName: 'index.[jt]s{,x}',
        configFileName: 'index.json',
        encoding: 'utf-8',
        jsCssOutputDir: 'umi',
        manifestFilePath: 'manifest.json',
        contentScriptsPathName: 'content_scripts',
        backgroundPathName: 'background',
        optionsPathName: 'options',
        popupPathName: 'popup',
        optionsOpenInTab: true,
        optionsTitle: '',
        popupDefaultTitle: '',
        popupDefaultIcon: {},
        splitChunks: true,
        splitChunksPathName: 'chunks',
        targets: ['chrome', 'firefox'],
        clearAbsPath: true,
      });

      const { api, hooks } = createMockApi('development');

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
    function setupAndTriggerModifyConfig(env: 'development' | 'production' = 'development') {
      const { api, hooks } = createMockApi(env);

      // Clear the module cache to get fresh plugin instance
      jest.isolateModules(() => {
        // Not using isolateModules here; we need the same module reference
      });

      require('../index').default(api);

      // Trigger modifyConfig to initialize pagesConfig and umiMpaEntryConfig
      const memo: any = { mpa: { entry: {} } };
      hooks.modifyConfig![0].callback(memo);

      return { api, hooks, memo };
    }

    it('应忽略 production 环境下的文件变更', () => {
      const { api, hooks } = createMockApi('production');

      require('../index').default(api);

      // Trigger modifyConfig
      hooks.modifyConfig![0].callback({ mpa: { entry: {} } });

      // Trigger onGenerateFiles with content script config change
      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // In production, the callback should execute but not enter the isDev block
      expect(mockWriteManifestV3Json).not.toHaveBeenCalled();
    });

    it('应忽略首次生成 (isFirstTime=true) 时的文件变更', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: true, files });
      }

      // Should not write manifest because isFirstTime is true
      expect(mockWriteManifestV3Json).not.toHaveBeenCalled();
    });

    it('应忽略 files 为 undefined/null 的情况', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files: undefined });
      }

      expect(mockWriteManifestV3Json).not.toHaveBeenCalled();
    });

    it('应在内容脚本配置文件变更时触发增量更新并重写 manifest.json', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      // Setup mock for findFileGroup to return one entry
      mockFindFileGroup.mockReturnValue(['src/pages/content_scripts/foo/index.ts']);
      // Setup mock for loadContentScriptsConfig to return a new config
      mockLoadContentScriptsConfig.mockReturnValue({
        name: 'content_scripts/foo',
        path: 'src/pages/content_scripts/foo',
        file: 'src/pages/content_scripts/foo/index.ts',
        entry: 'umi/content_scripts/foo/index',
        type: 'content_script',
        config: { matches: ['https://updated.com/*'], js: ['foo.js'] },
      });

      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // Should call findFileGroup for the changed directory
      expect(mockFindFileGroup).toHaveBeenCalledWith(
        'src/pages/content_scripts/foo',
        'index.[jt]s{,x}',
      );
      // Should call loadContentScriptsConfig for the found entry
      expect(mockLoadContentScriptsConfig).toHaveBeenCalled();
      // Should call writeManifestV3Json for each target (default: chrome)
      expect(mockWriteManifestV3Json).toHaveBeenCalledTimes(1);
    });

    it('应正确处理多个内容脚本配置文件同时变更', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      mockFindFileGroup.mockImplementation((dir: string) => {
        if (dir.includes('foo')) return ['src/pages/content_scripts/foo/index.ts'];
        if (dir.includes('bar')) return ['src/pages/content_scripts/bar/index.ts'];
        return [];
      });

      mockLoadContentScriptsConfig.mockImplementation((entryPath: string) => ({
        name: entryPath.includes('foo') ? 'content_scripts/foo' : 'content_scripts/bar',
        config: { matches: ['https://example.com/*'] },
        type: 'content_script',
      }));

      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
        { event: 'change', path: 'src/pages/content_scripts/bar/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // Should call loadContentScriptsConfig twice (once per changed config)
      expect(mockLoadContentScriptsConfig).toHaveBeenCalledTimes(2);
      // Should call writeManifestV3Json once (batch update after all configs processed)
      expect(mockWriteManifestV3Json).toHaveBeenCalledTimes(1);
    });

    it('应仅响应 change 事件，忽略 add 和 unlink 事件', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      const files = [
        { event: 'add', path: 'src/pages/content_scripts/new_script/index.json' },
        { event: 'unlink', path: 'src/pages/content_scripts/old_script/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // Should not call findFileGroup or loadContentScriptsConfig for add/unlink
      expect(mockFindFileGroup).not.toHaveBeenCalled();
      expect(mockLoadContentScriptsConfig).not.toHaveBeenCalled();
    });

    it('应忽略非 content_scripts 路径下的 index.json 变更', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      const files = [
        { event: 'change', path: 'src/pages/background/index.json' },
        { event: 'change', path: 'src/pages/options/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // content_scripts path is "src/pages/content_scripts"
      // background path "src/pages/background" should NOT match
      expect(mockFindFileGroup).not.toHaveBeenCalled();
      expect(mockLoadContentScriptsConfig).not.toHaveBeenCalled();
    });

    it('应在 findFileGroup 返回非唯一结果时记录警告并跳过更新', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      // Return multiple entries for a single directory
      mockFindFileGroup.mockReturnValue([
        'src/pages/content_scripts/foo/index.ts',
        'src/pages/content_scripts/foo/index.tsx',
      ]);

      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // Should log warning about non-unique entry
      const { logger } = require('@umijs/utils');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('entry path not unique'),
      );
      // Should NOT call loadContentScriptsConfig
      expect(mockLoadContentScriptsConfig).not.toHaveBeenCalled();
    });

    it('应在 loadContentScriptsConfig 返回 null 时从 pagesConfig 中删除对应条目', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      mockFindFileGroup.mockReturnValue(['src/pages/content_scripts/foo/index.ts']);
      mockLoadContentScriptsConfig.mockReturnValue(null);

      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // Should still call writeManifestV3Json (with the entry removed)
      expect(mockWriteManifestV3Json).toHaveBeenCalledTimes(1);
    });

    it('应在多 target 场景下遍历所有 target 重写 manifest.json', () => {
      mockInitPluginConfig.mockReturnValue({
        rootPath: 'src/pages',
        entryFileName: 'index.[jt]s{,x}',
        configFileName: 'index.json',
        encoding: 'utf-8',
        jsCssOutputDir: 'umi',
        manifestFilePath: 'manifest.json',
        contentScriptsPathName: 'content_scripts',
        backgroundPathName: 'background',
        optionsPathName: 'options',
        popupPathName: 'popup',
        optionsOpenInTab: true,
        optionsTitle: '',
        popupDefaultTitle: '',
        popupDefaultIcon: {},
        splitChunks: false,
        splitChunksPathName: 'chunks',
        targets: ['chrome', 'firefox'],
        clearAbsPath: true,
      });

      const { api, hooks } = createMockApi('development');
      require('../index').default(api);

      // Trigger modifyConfig
      hooks.modifyConfig![0].callback({ mpa: { entry: {} } });

      mockFindFileGroup.mockReturnValue(['src/pages/content_scripts/foo/index.ts']);
      mockLoadContentScriptsConfig.mockReturnValue({
        name: 'foo',
        config: { matches: ['https://example.com/*'] },
        type: 'content_script',
      });

      const files = [
        { event: 'change', path: 'src/pages/content_scripts/foo/index.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // Should write manifest for both targets
      expect(mockWriteManifestV3Json).toHaveBeenCalledTimes(2);

      // Verify target parameters (chrome and firefox)
      const calls = mockWriteManifestV3Json.mock.calls;
      const targetsInCalls = calls.map((c: any[]) => c[4]); // 5th arg is target
      expect(targetsInCalls).toContain('chrome');
      expect(targetsInCalls).toContain('firefox');
    });

    it('应维持既有的 manifest 源文件变更检测逻辑不变', () => {
      const { hooks } = setupAndTriggerModifyConfig('development');

      const files = [
        { event: 'change', path: 'src/manifest.json' },
      ];

      if (hooks.onGenerateFiles && hooks.onGenerateFiles.length > 0) {
        hooks.onGenerateFiles[0].callback({ isFirstTime: false, files });
      }

      // Should reload manifest base json
      expect(mockLoadManifestBaseJson).toHaveBeenCalled();
      // Should reload manifest target json
      expect(mockLoadManifestTargetJson).toHaveBeenCalled();
      // Should rewrite manifest for each target
      expect(mockWriteManifestV3Json).toHaveBeenCalled();
    });
  });
});
