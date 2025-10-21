const {FusesPlugin} = require('@electron-forge/plugin-fuses');
const {FuseV1Options, FuseVersion} = require('@electron/fuses');
const {execSync, exec} = require("child_process");
const path = require("node:path");

module.exports = {
    packagerConfig: {
        asar: true,
        icon: path.join(__dirname, 'public', 'favicon.ico'),
        executableName: 'EmbeddedTools',
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                iconUrl: path.join(__dirname, 'public', 'icon.ico'),
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
    ],
    hooks: {
        // 在打包前先执行 Vite 构建
        generateAssets: async () => {
            // 打包编译前端
            execSync('npm run build');
            // 运行开发调试前端
            // exec('npm run dev');
        }
    }
};
