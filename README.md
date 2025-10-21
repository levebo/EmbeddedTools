# 嵌入式工具

嵌入式工具, 用于处理点阵文字图片、图片转数组、数组转二进制文件、串口调试等功能。用于提升嵌入式系统开发的效率


## 目录
- [使用指南](#使用指南)
- [文件目录说明](#文件目录说明)
- [整体架构](#整体架构)

### 使用指南

### 文件目录说明
eg:

```
EmbeddedTools 
├── README.md
├── /electron/
├── /public/
├── /renderer/
│  ├── /assets/
│  ├── /components/
│  ├── /util/
|  ├── App.vue
|  └── main.js
├── /types/
├── forge.config.js
├── index.html
├── jsconfig.json
├── package.json
├── tsconfig.json
└── vite.config.mjs

```


### 整体架构

- 应用基于 electron 构建
- 前端基于 Vue 3 + Element Plus 构建
