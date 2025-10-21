import {fileURLToPath, URL} from 'node:url'

import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        vue(),
        vueDevTools(),
        AutoImport({
            dts: 'types/auto-imports.d.ts',
            resolvers: [
                ElementPlusResolver(),
                // 自动导入图标组件
                IconsResolver({
                    prefix: 'Icon',
                })
            ],
            eslintrc: {
                enabled: true,
                filepath: './.eslintrc-auto-import.json',
                globalsPropValue: true
            }
        }),
        Components({
            resolvers: [
                // 自动注册图标组件
                IconsResolver({
                    enabledCollections: ['ep'],
                }),
                // 自动导入 Element Plus 组件
                ElementPlusResolver()
            ]
        }),
        Icons({
            autoInstall: true,
        })
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./renderer', import.meta.url))
        },
    },
})
