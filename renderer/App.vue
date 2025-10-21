<script setup lang="ts">
import DotMatrixTool from "./components/DotMatrixTool.vue";
import Help from "./components/Help.vue";
import {ref} from "vue";
import {Grid, Operation, PictureFilled, ScaleToOriginal} from "@element-plus/icons-vue";
import ImageToArray from "./components/ImageToArray.vue";
import ArrayToBin from "./components/ArrayToBin.vue";
import SerialTool from "./components/SerialTool.vue";
// 当前菜单 1.点阵转换 2.图片转数组 3.数组转二进制文件
const activeIndex = ref("1")
const handleSelect = (key: string, __keyPath: string[]) => {
  activeIndex.value = key;
}
// 打开链接
const handleLink = async () => {
  await window.electronAPI.openExternalWindow('https://github.com/levebo/EmbeddedTools')
}
</script>

<template>
  <el-container style="height: calc(100% - 1px);background-color: #f2f2f2;">
    <el-header height="70px" style="padding: 0;background-color: #ffffff;">
      <div class="app-header">
        <template v-if="activeIndex === '1'">
          <el-text line-clamp="1">
            将文字或图片转换为C语言格式的点阵数组，支持自定义字体大小和预览功能。适用于嵌入式系统、LED点阵屏等开发场景。
          </el-text>
        </template>
        <template v-if="activeIndex === '2'">
          <el-text line-clamp="1">
            将图像转换为C源文件
          </el-text>
        </template>
        <template v-if="activeIndex === '3'">
          <el-text line-clamp="1">
            解析图像数组数据的C源文件，并生成二进制文件和头文件。
          </el-text>
        </template>
        <template v-if="activeIndex === '4'">
          <el-text line-clamp="1">
            用于方便和各种嵌入式设备或者其他串口设备调试。
          </el-text>
        </template>
        <Help :activeIndex="activeIndex"/>
      </div>
      <el-menu :default-active="activeIndex" mode="horizontal" @select="handleSelect">
        <el-menu-item index="1">
          <el-icon>
            <Grid/>
          </el-icon>
          <span>点阵转换</span>
        </el-menu-item>
        <el-menu-item index="2">
          <el-icon>
            <PictureFilled/>
          </el-icon>
          <span>图片转数组</span>
        </el-menu-item>
        <el-menu-item index="3">
          <el-icon>
            <ScaleToOriginal/>
          </el-icon>
          <span>输出二进制文件</span>
        </el-menu-item>
        <el-menu-item index="4">
          <el-icon>
            <Operation/>
          </el-icon>
          <span>串口调试</span>
        </el-menu-item>
      </el-menu>
    </el-header>
    <el-main style="padding: 0; height: calc(100% - 102px);">
      <DotMatrixTool v-show="activeIndex === '1'"/>
      <ImageToArray :activeIndex="activeIndex" v-show="activeIndex === '2'"/>
      <ArrayToBin v-show="activeIndex === '3'"/>
      <SerialTool v-show="activeIndex === '4'"/>
    </el-main>
    <el-footer height="30px" class="app-footer">
      <el-text>基于 Vue 3 + Element Plus 构建 | 嵌入式工具 v3.1.0 | by
        <el-link style="vertical-align: baseline;" underline="never" @click="handleLink">levebo</el-link>
      </el-text>
    </el-footer>
  </el-container>
</template>

<style scoped>
.app-header {
  line-height: 35px;
  padding: 0 7px 0 11px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-footer {
  line-height: 30px;
  text-align: center;
  color: #bbbbbb;
}

.el-menu--horizontal {
  --el-menu-horizontal-height: 35px;
}
</style>
