/**
 * 集成测试层：基于 memfs 的完整数据流验证
 *
 * 验证链路：文件系统输入 → 核心函数真实执行 → manifest.json 产物断言
 * 仅 mock fs 模块（替换为 memfs volume）和 glob.sync（替换为 volume 扫描器），
 * logger/chalk 沿用 mock，deepmerge 使用真实库。
 */

import { Volume } from 'memfs';
import Path from 'path';
import {
  findPagesConfig,
  loadContentScriptsConfig,
  writeManifestV3Json,
  completionManifestPath,
  loadManifestBaseJson,
  loadManifestTargetJson,
} from '../utils';
import { browserExtensionConfig, browserExtensionDefaultConfig, Target } from '../interface';

// ─────────────────────────────────────────────────────────────────
// External mutable references — set per-test before any function call
// ─────────────────────────────────────────────────────────────────
let _globSyncImpl: ((pattern: string) => string[]) | null = null;
let _fsVolume: Volume | null = null;

// ─────────────────────────────────────────────────────────────────
// Mock fs module — delegate all Fs.* calls to current _fsVolume
// ─────────────────────────────────────────────────────────────────
jest.mock('fs', () => {
  const FS_METHODS = [
    'readFileSync', 'writeFileSync', 'existsSync', 'statSync',
    'readdirSync', 'copyFileSync', 'mkdirSync', 'unlinkSync', 'rmdirSync',
  ];
  const fsMock: Record<string, Function> = {};
  for (const method of FS_METHODS) {
    fsMock[method] = (...args: any[]) => {
      if (!_fsVolume) {
        throw new Error(`Fs.${method} called before memfs volume setup`);
      }
      const vol = _fsVolume as any;
      if (typeof vol[method] !== 'function') {
        throw new Error(`Method ${method} not found on memfs Volume`);
      }
      // writeFileSync: auto-create parent directory so outputPath don't fail
      if (method === 'writeFileSync') {
        const dir = require('path').posix.dirname(args[0]);
        try {
          vol.mkdirSync(dir, { recursive: true });
        } catch (_) {
          // directory may already exist
        }
      }
      return vol[method](...args);
    };
  }
  return fsMock;
});

// ─────────────────────────────────────────────────────────────────
// Mock @umijs/utils — real deepmerge, mock glob/logger/chalk
// ─────────────────────────────────────────────────────────────────
jest.mock('@umijs/utils', () => {
  return {
    deepmerge: jest.requireActual('deepmerge'),
    glob: {
      sync: (...args: any[]) => {
        if (!_globSyncImpl) {
          throw new Error('glob.sync called before _globSyncImpl setup');
        }
        return (_globSyncImpl as any)(...args);
      },
    },
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
  };
});

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** 创建 pluginConfig 对象（合并默认值） */
function makePluginConfig(overrides: Partial<browserExtensionConfig> = {}): browserExtensionConfig {
  return { ...browserExtensionDefaultConfig, rootPath: 'src/pages', ...overrides };
}

/** 创建 memfs volume 并注入文件树（以 process.cwd() 为基，确保相对路径解析正确） */
function setupVolume(tree: Record<string, string>): Volume {
  const vol = new Volume();
  vol.fromJSON(tree, process.cwd());
  return vol;
}

/** 将 glob 文件名模式转换为正则（仅支持 `index.[jt]s{,x}` 这类简单模式） */
function globPatternToRegex(pattern: string): RegExp {
  let re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')     // 转义正则特殊字符
    .replace(/\\\[([^\]]+)\\\]/g, '[$1]')      // 恢复字符类 [jt]
    .replace(/\\\{([^}]*)\\\}/g, (_m: string, inner: string) => {
      const parts = inner.split(',');
      if (parts.length === 2 && parts[0] === '') {
        return `(?:${parts[1]})?`;              // {,x} → (?:x)?
      }
      return `(?:${parts.join('|')})`;           // {a,b} → (?:a|b)
    });
  return new RegExp(`^${re}$`);
}

/** 递归收集目录下匹配正则的文件路径 */
function collectFiles(vol: Volume, dir: string, regex: RegExp, results: string[]): void {
  let entries: string[];
  try {
    entries = vol.readdirSync(dir) as string[];
  } catch {
    return; // 目录不存在
  }
  for (const entry of entries) {
    const fullPath = `${dir}/${entry}`;
    try {
      const stat = vol.statSync(fullPath);
      if (stat.isDirectory()) {
        collectFiles(vol, fullPath, regex, results);
      } else if (regex.test(entry)) {
        results.push(Path.posix.normalize(fullPath));
      }
    } catch {
      // 跳过无法 stat 的条目
    }
  }
}

/** 构造基于 memfs volume 的 glob.sync 实现（含 F_EXCLUDE_* 过滤） */
function makeVolumeGlobSync(vol: Volume): (pattern: string) => string[] {
  return (pattern: string): string[] => {
    const starIndex = pattern.indexOf('/**/');
    if (starIndex === -1) return [];
    const basePath = pattern.substring(0, starIndex);
    const filePattern = pattern.substring(starIndex + 4); // 跳过 "/**/"
    const regex = globPatternToRegex(filePattern);
    const results: string[] = [];
    collectFiles(vol, basePath, regex, results);
    // 复现 findFileGroup 的 F_EXCLUDE_* 过滤逻辑
    return results.filter(
      p => !p.includes('/components/') && !p.includes('/models/') && !p.includes('/utils/'),
    );
  };
}

/** 快捷：初始化 volume、_fsVolume、_globSyncImpl */
function initTestEnv(vol: Volume): void {
  _fsVolume = vol;
  _globSyncImpl = makeVolumeGlobSync(vol);
}

// ─────────────────────────────────────────────────────────────────
// 全局清理
// ─────────────────────────────────────────────────────────────────
afterEach(() => {
  _fsVolume = null;
  _globSyncImpl = null;
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════
// 集成测试场景
// ═════════════════════════════════════════════════════════════════

describe('Integration Tests (memfs)', () => {

  // ── ITG-01: 单 content_script 完整链路 ──────────────────────
  // (对齐 plan.md 第115-150行)
  describe('ITG-01: 单 content_script 完整链路', () => {
    it('应从文件系统输入到 manifest.json 产物输出完整验证', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
          js: ['content.js'],
        }),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome');

      // 产物断言
      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      expect(manifest.content_scripts).toBeDefined();
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.content_scripts[0].matches).toEqual(['https://example.com/*']);
      expect(manifest.content_scripts[0].js).toBeDefined();
      expect(manifest.content_scripts[0].js.length).toBeGreaterThan(0);
      expect(manifest.content_scripts[0].js[0]).toContain('content.js');
    });
  });

  // ── ITG-02: content_script + background ─────────────────────
  // (对齐 plan.md 第153-184行)
  describe('ITG-02: content_script + background', () => {
    it('应同时输出 content_scripts 与 background', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
        'src/pages/background/index.ts': '// bg',
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome');

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      expect(manifest.content_scripts).toBeDefined();
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.background).toBeDefined();
      expect(manifest.background.service_worker).toBeDefined();
      expect(manifest.background.service_worker).toContain('.js');
    });
  });

  // ── ITG-03: content_script + options ────────────────────────
  // (对齐 plan.md 第187-218行)
  describe('ITG-03: content_script + options', () => {
    it('应输出 content_scripts 与 options_ui', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
        'src/pages/options/index.ts': '// opts',
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig({ optionsOpenInTab: true });
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome');

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      expect(manifest.content_scripts).toBeDefined();
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.options_ui).toBeDefined();
      expect(manifest.options_ui.page).toBeDefined();
      expect(manifest.options_ui.page).toContain('.html');
      expect(manifest.options_ui.open_in_tab).toBe(true);
    });
  });

  // ── ITG-04: content_script + popup ──────────────────────────
  // (对齐 plan.md 第221-253行)
  describe('ITG-04: content_script + popup', () => {
    it('应输出 content_scripts 与 action', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
        'src/pages/popup/index.ts': '// popup',
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome');

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      expect(manifest.content_scripts).toBeDefined();
      expect(manifest.content_scripts).toHaveLength(1);
      expect(manifest.action).toBeDefined();
      expect(manifest.action.default_popup).toBeDefined();
      expect(manifest.action.default_popup).toContain('.html');
    });

    it('应在 popupDefaultTitle 为空时回退为 manifestBaseJson.name', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
        'src/pages/popup/index.ts': '// popup',
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig({ popupDefaultTitle: '' });
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome');

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      expect(manifest.action.default_title).toBe('TestExt');
    });

    it('应在 popupDefaultIcon 为空对象时回退为 manifestBaseJson.icons', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
          icons: { '16': 'icon16.png', '48': 'icon48.png' },
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
        'src/pages/popup/index.ts': '// popup',
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig({ popupDefaultIcon: {} });
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome');

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      expect(manifest.action.default_icon).toEqual({ '16': 'icon16.png', '48': 'icon48.png' });
    });
  });

  // ── ITG-05: 多 target 编译（firefox 降级）──────────────────
  // (对齐 plan.md 第256-293行)
  describe('ITG-05: 多 target 编译（firefox 降级）', () => {
    it('应将 firefox 不兼容字段正确降级', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
          permissions: ['commands'],
          background: { service_worker: 'bg.js' },
          incognito: 'split',
        }),
        'manifest.firefox.json': JSON.stringify({
          permissions: ['tabs'],
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const manifestPathBefore = manifestPath.replace(/\.json$/, '');
      const manifestTargetsJson = loadManifestTargetJson(manifestPathBefore, ['firefox'], pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/firefox';

      writeManifestV3Json(manifestBaseJson, manifestTargetsJson, outputPath, pagesConfig, 'firefox');

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      // permissions 不含 "commands"，含 "tabs"（来自 target 覆盖）
      expect(manifest.permissions).not.toContain('commands');
      expect(manifest.permissions).toContain('tabs');
      // background 降级为 scripts
      expect(manifest.background.scripts).toBeDefined();
      expect(Array.isArray(manifest.background.scripts)).toBe(true);
      expect(manifest.background.service_worker).toBeUndefined();
      // incognito 降级
      expect(manifest.incognito).toBe('not_allowed');
    });
  });

  // ── ITG-06: Chrome102 兼容（MAIN world 分离）───────────────
  // (对齐 plan.md 第296-333行)
  describe('ITG-06: Chrome102 兼容（MAIN world 分离）', () => {
    it('应将 MAIN world 条目分离到 main-world.json', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'manifest.chrome102.json': JSON.stringify({}),
        'src/pages/content_scripts/main_world/index.ts': '// main',
        'src/pages/content_scripts/main_world/index.json': JSON.stringify({
          world: 'MAIN', matches: ['https://example.com/*'], js: ['main.js'],
        }),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const manifestPathBefore = manifestPath.replace(/\.json$/, '');
      const manifestTargetsJson = loadManifestTargetJson(manifestPathBefore, ['chrome102'], pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome102';

      writeManifestV3Json(manifestBaseJson, manifestTargetsJson, outputPath, pagesConfig, 'chrome102');

      // manifest.json 不含 MAIN world 条目
      const rawManifest = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(rawManifest);
      if (manifest.content_scripts) {
        const mainWorldEntries = manifest.content_scripts.filter(
          (cs: any) => cs.world === 'MAIN',
        );
        expect(mainWorldEntries).toHaveLength(0);
      }

      // main-world.json 存在且内容为数组
      const rawMainWorld = vol.readFileSync(`${outputPath}/main-world.json`, 'utf-8') as string;
      const mainWorld = JSON.parse(rawMainWorld);
      expect(Array.isArray(mainWorld)).toBe(true);
      expect(mainWorld).toHaveLength(1);
      expect(mainWorld[0].world).toBe('MAIN');
      expect(mainWorld[0].matches).toEqual(['https://example.com/*']);
      expect(mainWorld[0].js[0]).toContain('main.js');
    });
  });

  // ── ITG-07: 配置文件不存在 ──────────────────────────────────
  // (对齐 plan.md 第336-365行)
  describe('ITG-07: 配置文件不存在', () => {
    it('loadContentScriptsConfig 应返回 null，content_scripts 不出现在产物中', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/no_config/index.ts': '// entry',
        // 无 index.json
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const config = loadContentScriptsConfig(
        'src/pages/content_scripts/no_config/index.ts',
        pluginConfig,
        {},
        '',
      );

      expect(config).toBeNull();

      // 完整链路验证产物不含 content_scripts
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome');

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);
      expect(manifest.content_scripts).toBeUndefined();
    });
  });

  // ── ITG-08: 非法 JSON 配置 ──────────────────────────────────
  // (对齐 plan.md 第368-396行)
  describe('ITG-08: 非法 JSON 配置', () => {
    it('应在 JSON.parse 阶段抛出 SyntaxError', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/bad_json/index.ts': '// entry',
        'src/pages/content_scripts/bad_json/index.json': '{ invalid json: true',
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();

      expect(() => {
        loadContentScriptsConfig(
          'src/pages/content_scripts/bad_json/index.ts',
          pluginConfig,
          {},
          '',
        );
      }).toThrow(SyntaxError);
    });

    it('应在 manifest.json 为非法 JSON 时 loadManifestBaseJson 抛出异常', () => {
      const vol = setupVolume({
        'manifest.json': '{ broken',
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({}),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);

      expect(() => {
        loadManifestBaseJson(manifestPath, pluginConfig);
      }).toThrow(SyntaxError);
    });
  });

  // ── ITG-09: js/css 路径补全 ─────────────────────────────────
  // (对齐 plan.md 第399-432行)
  describe('ITG-09: js/css 路径补全', () => {
    it('应在 jsCssOutputDir 非空时补全 js/css 路径前缀', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/styled_script/index.ts': '// entry',
        'src/pages/content_scripts/styled_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
          js: ['app.js'],
          css: ['style.css'],
        }),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig({ jsCssOutputDir: 'dist/js' });
      const config = loadContentScriptsConfig(
        'src/pages/content_scripts/styled_script/index.ts',
        pluginConfig,
        {},
        '',
      );

      expect(config).not.toBeNull();
      expect(config!.config.js).toBeDefined();
      expect(config!.config.css).toBeDefined();

      // 每个 js 元素均以 jsCssOutputDir 为前缀
      for (const js of config!.config.js) {
        expect(js.startsWith('dist/js/')).toBe(true);
      }
      expect(config!.config.js[0]).toContain('app.js');

      // 每个 css 元素均以 jsCssOutputDir 为前缀
      for (const css of config!.config.css) {
        expect(css.startsWith('dist/js/')).toBe(true);
      }
      expect(config!.config.css[0]).toContain('style.css');
    });
  });

  // ── ITG-10: vendorEntry 注入 ────────────────────────────────
  // (对齐 plan.md 第435-465行)
  describe('ITG-10: vendorEntry 注入', () => {
    it('应在 vendorEntry 非空时将 vendor.js 置于 js 数组头部', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
          js: ['content.js'],
        }),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig({ jsCssOutputDir: 'dist' });
      const vendorEntry = 'dist/chunks/vendor';
      const config = loadContentScriptsConfig(
        'src/pages/content_scripts/my_script/index.ts',
        pluginConfig,
        {},
        vendorEntry,
      );

      expect(config).not.toBeNull();
      expect(config!.config.js).toBeDefined();
      expect(config!.config.js.length).toBe(2);
      expect(config!.config.js[0]).toBe('dist/chunks/vendor.js');
      expect(config!.config.js[1]).toContain('content.js');
    });

    it('应在 vendorEntry 为空时不注入 vendor.js', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
          js: ['content.js'],
        }),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig({ jsCssOutputDir: 'dist' });
      const config = loadContentScriptsConfig(
        'src/pages/content_scripts/my_script/index.ts',
        pluginConfig,
        {},
        '', // 空 vendorEntry
      );

      expect(config).not.toBeNull();
      expect(config!.config.js).toBeDefined();
      expect(config!.config.js.length).toBe(1);
      expect(config!.config.js[0]).not.toContain('vendor');
    });
  });

  // ── ITG-11: manifestHandler 回调 ────────────────────────────
  // (对齐 plan.md 第468-498行)
  describe('ITG-11: manifestHandler 回调', () => {
    it('应在提供 manifestHandler 时调用回调并写入返回值', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      const manifestHandler = jest.fn((manifest: any, target: Target) => ({
        ...manifest,
        custom_key: 'injected_by_handler',
        target_used: target,
      }));

      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome', manifestHandler);

      expect(manifestHandler).toHaveBeenCalledTimes(1);
      expect(manifestHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TestExt' }),
        'chrome',
      );

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      // 回调注入的自定义字段
      expect(manifest.custom_key).toBe('injected_by_handler');
      expect(manifest.target_used).toBe('chrome');
      // 保留原有字段
      expect(manifest.name).toBe('TestExt');
      expect(manifest.content_scripts).toBeDefined();
    });

    it('应在无 manifestHandler 时正常生成 manifest', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/my_script/index.ts': '// entry',
        'src/pages/content_scripts/my_script/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');
      const outputPath = '/dist/chrome';

      // 不传 manifestHandler（undefined）
      writeManifestV3Json(manifestBaseJson, {}, outputPath, pagesConfig, 'chrome');

      const raw = vol.readFileSync(`${outputPath}/manifest.json`, 'utf-8') as string;
      const manifest = JSON.parse(raw);

      expect(manifest.name).toBe('TestExt');
      expect(manifest.content_scripts).toBeDefined();
      // 不存在自定义字段
      expect((manifest as any).custom_key).toBeUndefined();
    });
  });

  // ── 补充: F_EXCLUDE_* 过滤验证 ──────────────────────────────
  // (对齐 plan.md 第100-101行 & decision-bus N-01 Q2)
  describe('F_EXCLUDE_* 过滤（对齐 findFileGroup 行为）', () => {
    it('应在 mock glob.sync 中排除 components/models/utils 子路径', () => {
      const vol = setupVolume({
        'manifest.json': JSON.stringify({
          name: 'TestExt', version: '1.0.0', manifest_version: 3,
        }),
        'src/pages/content_scripts/valid/index.ts': '// entry',
        'src/pages/content_scripts/valid/index.json': JSON.stringify({
          matches: ['https://example.com/*'],
        }),
        // 这些文件应被 F_EXCLUDE_* 过滤排除
        'src/pages/content_scripts/valid/components/Modal/index.ts': '// excluded',
        'src/pages/content_scripts/valid/models/useModel/index.ts': '// excluded',
        'src/pages/content_scripts/valid/utils/helper/index.ts': '// excluded',
      });
      initTestEnv(vol);

      const pluginConfig = makePluginConfig();
      const manifestPath = completionManifestPath(pluginConfig);
      const manifestBaseJson = loadManifestBaseJson(manifestPath, pluginConfig);
      const pagesConfig = findPagesConfig(manifestBaseJson, pluginConfig, {}, '');

      // 仅 valid 条目被保留，components/models/utils 下的条目被过滤
      const pageEntries = Object.keys(pagesConfig);
      expect(pageEntries).toHaveLength(1);
      expect(pageEntries[0]).toContain('valid/index.ts');
    });
  });

});
