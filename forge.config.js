const {FusesPlugin} = require('@electron-forge/plugin-fuses');
const {FuseV1Options, FuseVersion} = require('@electron/fuses');
const path = require("node:path");

// 运行期不需要的顶层目录/文件，避免被打进 asar
const IGNORED_TOP_LEVEL = new Set([
    '图片处理',
    '.idea',
    '.git',
    '.gitignore',
    '.npmrc',
    'renderer',
    'types',
    'public',
    'index.html',
    'vite.config.mjs',
    'forge.config.js',
    'components.d.ts',
    'README.md',
    'tsconfig.json',
    'jsconfig.json',
    '.eslintrc-auto-import.json',
    'package-lock.json',
]);

module.exports = {
    packagerConfig: {
        asar: true,
        icon: path.join(__dirname, 'public', 'icons', 'win', 'icon.ico'),
        executableName: 'EmbeddedTools',
        // 只保留 electron / dist / package.json / LICENSE / node_modules
        ignore: (filePath) => {
            const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
            const topLevel = normalized.split('/')[0];
            if (IGNORED_TOP_LEVEL.has(topLevel)) return true;
            // pinyin 只保留 Node 实际加载的 CJS 构建；ESM/UMD/types/bin 运行期用不到
            if (normalized.startsWith('node_modules/pinyin/lib/esm/')
                || normalized.startsWith('node_modules/pinyin/lib/umd/')
                || normalized.startsWith('node_modules/pinyin/lib/types/')
                || normalized.startsWith('node_modules/pinyin/bin/')) {
                return true;
            }
            // source map 与 npm 内部缓存不需要进安装包
            if (normalized.startsWith('node_modules/') && normalized.endsWith('.map')) return true;
            if (normalized === 'node_modules/.package-lock.json') return true;
            // 开发期缓存
            return normalized.startsWith('node_modules/.vite/')
                || normalized.startsWith('node_modules/.cache/');
        },
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                // iconUrl 需要公网 HTTP(S) 地址，本地文件不生效；安装器图标用 setupIcon
                setupIcon: path.join(__dirname, 'public', 'icons', 'win', 'icon.ico'),
                // rcedit 在中文输出目录下加载 Squirrel.exe 会失败，跳过 Update.exe 图标
                skipUpdateIcon: true,
                loadingGif: path.join(__dirname, 'public', 'loading.gif'),
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
        },
        {
            name: '@electron-forge/maker-deb',
            config: {},
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {},
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ]
};
