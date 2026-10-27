<script setup lang="ts">
import {computed, reactive, ref} from "vue";
import type {Component} from "vue";
// language
import "codemirror/mode/clike/clike.js";
import Codemirror from "codemirror-editor-vue3";
// placeholder
import "codemirror/addon/display/placeholder.js";
import {Editor, EditorConfiguration} from "codemirror";
import type {EpPropMergeType} from "element-plus/es/utils";
import {Document} from "@element-plus/icons-vue";
import {ElMessage} from "element-plus";
import {findEnumConflicts, sanitizeCodeName} from "@/util/uiLayoutStore";

/*界面布局调试生成代码弹窗*/
defineOptions({name: 'UILayoutCodeWin'});

const {
  btnText = "生成代码", btnIsText = false, btnType = "", disabled = false, icon, screens, imgData
} = defineProps<{
  /*按钮文字*/
  btnText?: string,
  /*是否是文本类型按钮*/
  btnIsText?: boolean,
  /*按钮类型*/
  btnType?: EpPropMergeType<StringConstructor, "" | "default" | "text" | "primary" | "success" | "warning" | "info" | "danger", unknown>,
  /*是否禁用*/
  readonly disabled: boolean,
  /*按钮图标*/
  readonly icon?: Component,
  /*工程中的所有界面*/
  screens: UILayoutScreen[],
  /*图片资源信息*/
  imgData: UILayoutOption
}>();

const show = ref(false)

const cmOptions: EditorConfiguration = reactive({
  mode: "clike",
  theme: "default",
  readOnly: false,
  lineNumbers: true,
  lineWiseCopyCut: true,
  gutters: ["CodeMirror-lint-markers"],
  lint: true,
});

/*代码编辑器实例*/
const cmInstance = ref<Editor | null>(null);
const onReady = (cm: Editor) => {
  cmInstance.value = cm;
};

interface CodeOptions {
  /**显示图片函数名称*/
  displayFunName: string
  /**界面布局函数名前缀*/
  uiLayoutFunPrefix: string
  /**图片数组名称*/
  imageArrayName: string
}

// 代码配置项
const codeOptions = reactive<CodeOptions>({
  displayFunName: "display_image",
  uiLayoutFunPrefix: "display_ui_layout",
  imageArrayName: 'IMGS'
})

/**有枚举名的图片才参与代码生成*/
const validImages = computed(() => imgData.imgList.filter(item => !!item.enumName))

/**枚举名冲突（例如 a.png / a.jpg 都变成 A）*/
const enumConflicts = computed(() => findEnumConflicts(validImages.value))

/**逐界面检查缺失资源*/
const screenIssues = computed(() => {
  const enumNames = new Set(validImages.value.map(item => item.enumName as string))
  const fileNames = new Set(validImages.value.map(item => item.fileName))
  return screens.map(screen => {
    const missing = new Set<string>()
    for (const item of screen.items) {
      const exists = item.enumName
          ? enumNames.has(item.enumName)
          : !!(item.fileName && fileNames.has(item.fileName))
      if (!exists) {
        missing.add(item.enumName || item.fileName || item.id || '未知资源')
      }
    }
    return {screen, missing: [...missing]}
  })
})

/**所有界面中找不到的资源*/
const missingResources = computed(() => {
  const result = new Set<string>()
  for (const issue of screenIssues.value) {
    for (const name of issue.missing) {
      result.add(`${issue.screen.name}: ${name}`)
    }
  }
  return [...result]
})

/**坐标转 unsigned short，避免浮点数直接初始化整型字段*/
const toUShort = (value: number): number => {
  return Math.max(0, Math.min(65535, Math.round(value || 0)))
}

/**按枚举名（其次文件名）解析布局项的枚举*/
const resolveEnumName = (item: UILayoutSnapshotItem, images: ImgOptions[]): string => {
  return item.enumName || images.find(img => img.fileName === item.fileName)?.enumName || ''
}

// 生成代码计算
const computedCode = computed(() => {
  const images = validImages.value
  if (images.length === 0) {
    return '// 当前资源目录没有可用图片，无法生成代码'
  }
  if (screens.length === 0) {
    return '// 当前工程没有界面，无法生成代码'
  }

  // 每个界面实际要绘制的项（重复放置也会保留）
  const screenEntries = screens.map(screen => ({
    screen,
    entries: screen.items
        .map(item => ({
          enumName: resolveEnumName(item, images),
          fileName: item.fileName,
          x: toUShort(item.x),
          y: toUShort(item.y)
        }))
        .filter(item => !!item.enumName)
  }))
  const totalItems = screenEntries.reduce((sum, item) => sum + item.entries.length, 0)
  // 4 字节打包：image(8bit) | x(12bit) << 8 | y(12bit) << 20
  const packed = images.length <= 256
      && screens.every(screen => toUShort(screen.width) <= 4095
          && toUShort(screen.height) <= 4095
          && screen.items.every(item => toUShort(item.x) <= 4095 && toUShort(item.y) <= 4095))
  const itemIndexType = totalItems <= 65535 ? 'uint16_t' : 'uint32_t'
  const screenIndexType = screens.length <= 255 ? 'uint8_t' : 'uint16_t'

  let code = `#include <stdint.h>

#define  IMG_ARRAY_LENGTH                          ${images.length} ///< 图片数组长度


`

  // 枚举映射
  let imageMapping = `// 图片枚举映射
typedef enum {\n`
  images.forEach((item, index) => {
    const comma = index === images.length - 1 ? '' : ','
    imageMapping += `  /* ${index}: ${item.fileName} */\n  ${item.enumName}${index === 0 ? ' = 0' : ''}${comma}\n`
  })
  imageMapping += `} ImageMapping;\n\n`
  code += imageMapping

  // 所有界面共用的稀疏布局项表
  code += `/** 布局项总数 */\n#define UI_LAYOUT_ITEM_COUNT ${totalItems}\n\n`
  if (packed) {
    code += `/**
 * 4 字节打包布局项：image(8bit) | x(12bit) << 8 | y(12bit) << 20
 * 要求图片数量 <= 256、坐标 < 4096
 */
#define UI_LAYOUT_ITEM(image, x, y) ((uint32_t)(((uint32_t)(image) & 0xFFu) | (((uint32_t)(x) & 0x0FFFu) << 8) | (((uint32_t)(y) & 0x0FFFu) << 20)))
#define UI_LAYOUT_ITEM_IMAGE(value) ((ImageMapping)((value) & 0xFFu))
#define UI_LAYOUT_ITEM_X(value) ((unsigned short)(((value) >> 8) & 0x0FFFu))
#define UI_LAYOUT_ITEM_Y(value) ((unsigned short)(((value) >> 20) & 0x0FFFu))

const uint32_t ui_layout_items[UI_LAYOUT_ITEM_COUNT > 0 ? UI_LAYOUT_ITEM_COUNT : 1] = {\n`
    if (totalItems === 0) {
      code += `    0 // 空工程占位\n`
    }
    screenEntries.forEach(({screen, entries}) => {
      entries.forEach(entry => {
        code += `    UI_LAYOUT_ITEM(${entry.enumName}, ${entry.x}, ${entry.y}), // ${screen.name}: ${entry.fileName}\n`
      })
    })
    code += `};\n\n`
  } else {
    code += `/** 稀疏布局项（图片枚举可能超过 255 或坐标超过 4095，使用结构体）*/
typedef struct {
    unsigned short x;
    unsigned short y;
    uint16_t image;
} UiLayoutItem;

const UiLayoutItem ui_layout_items[UI_LAYOUT_ITEM_COUNT > 0 ? UI_LAYOUT_ITEM_COUNT : 1] = {\n`
    if (totalItems === 0) {
      code += `    {0, 0, 0} // 空工程占位\n`
    }
    screenEntries.forEach(({screen, entries}) => {
      entries.forEach(entry => {
        code += `    {${entry.x}, ${entry.y}, ${entry.enumName}}, // ${screen.name}: ${entry.fileName}\n`
      })
    })
    code += `};\n\n`
  }

  // 界面表只保存稀疏表的起点和数量
  code += `#define UI_SCREEN_COUNT ${screens.length}\n\n`
  code += `/**
 * 界面信息表
 */
typedef struct {
    unsigned short width;
    unsigned short height;
    ${itemIndexType} first;
    ${itemIndexType} count;
} UiScreen;

const UiScreen ui_screens[UI_SCREEN_COUNT] = {\n`
  let offset = 0
  screenEntries.forEach(({screen, entries}, index) => {
    const comma = index === screens.length - 1 ? '' : ','
    code += `    {${toUShort(screen.width)}, ${toUShort(screen.height)}, ${offset}, ${entries.length}}${comma} // ${screen.name}\n`
    offset += entries.length
  })
  code += `};\n\n`

  // 显示图片函数声明，实现放在最后，便于直接使用 ui_screens
  code += `/**
* 显示图片函数
* @param image_mapping 图片枚举映射
* @param x X轴起始位置
* @param y Y轴起始位置
*/
void ${codeOptions.displayFunName}(ImageMapping image_mapping, unsigned short x, unsigned short y);

/**
* 按界面索引绘制
*/
void display_ui_screen(${screenIndexType} screen_index) {
    if (screen_index >= UI_SCREEN_COUNT) return;
    const UiScreen *screen = &ui_screens[screen_index];
    for (${itemIndexType} i = 0; i < screen->count; i++) {\n`
  if (packed) {
    code += `        uint32_t item = ui_layout_items[screen->first + i];
        ${codeOptions.displayFunName}(UI_LAYOUT_ITEM_IMAGE(item), UI_LAYOUT_ITEM_X(item), UI_LAYOUT_ITEM_Y(item));\n`
  } else {
    code += `        const UiLayoutItem *item = &ui_layout_items[screen->first + i];
        ${codeOptions.displayFunName}((ImageMapping)item->image, item->x, item->y);\n`
  }
  code += `    }
}

`

  // 每个界面一个命名入口
  const usedCodes = new Set<string>()
  screenEntries.forEach(({screen}, index) => {
    let codeName = sanitizeCodeName(screen.codeName || screen.name, 'SCREEN')
    while (usedCodes.has(codeName)) {
      codeName = `${codeName}_2`
    }
    usedCodes.add(codeName)
    code += `/* 界面: ${screen.name} */\nvoid ${codeOptions.uiLayoutFunPrefix}_${codeName}(void) {
    display_ui_screen(${index});
}

`
  })

  // 单界面时保留原来的无参函数入口
  if (screens.length === 1) {
    code += `/* 单界面兼容接口 */\nvoid ${codeOptions.uiLayoutFunPrefix}(void) {
    display_ui_screen(0);
}

`
  }

  // 默认显示函数实现（替换成自己的显示逻辑）
  code += `/**
* 显示图片函数
* @param image_mapping 图片枚举映射
* @param x X轴起始位置
* @param y Y轴起始位置
*/
void ${codeOptions.displayFunName}(ImageMapping image_mapping, unsigned short x, unsigned short y) {
    // 图片信息 可以参考转换二进制文件生成的信息：offset size width height
    // ${codeOptions.imageArrayName}[image_mapping]
    // 当前图片的定位信息
    // x, y
    // 调用自己的显示方法根据这些参数把图片显示到屏幕
}
`

  return code;
})

const emit = defineEmits<{
  onShow: [];
}>()

// 保存到文件
const saveToFile = () => {
  if (enumConflicts.value.length > 0) {
    ElMessage.error(`存在枚举名冲突，请先修改文件名：${enumConflicts.value.join('、')}`)
    return
  }
  if (missingResources.value.length > 0) {
    ElMessage.error(`存在当前目录找不到的资源，请先处理：${missingResources.value.join('、')}`)
    return
  }
  window.electronAPI.downloadFile(computedCode.value, `ui_layout_${new Date().getTime()}.c`)
}

// 显示
const handleShow = () => {
  show.value = true
  emit('onShow')
}

// 关闭
const handleClose = (done: () => void) => {
  done()
}
</script>

<template>
  <el-button :disabled="disabled" style="flex: 1;" :type="btnType" :icon="icon" :text="btnIsText" @click="handleShow">{{
      btnText
    }}
  </el-button>
  <el-dialog v-model="show" title="界面布局代码生成" width="900" top="5vh" append-to-body :before-close="handleClose">
    <el-form inline>
      <el-form-item label="界面函数名前缀">
        <el-input v-model="codeOptions.uiLayoutFunPrefix"/>
      </el-form-item>
      <el-form-item label="显示图片函数名">
        <el-input v-model="codeOptions.displayFunName"/>
      </el-form-item>
      <el-form-item label="图片数组名">
        <el-input v-model="codeOptions.imageArrayName"/>
      </el-form-item>
    </el-form>
    <el-alert type="info" :closable="false" show-icon
              title="定位数据使用共用的稀疏表，只保存实际放置的图片；display_image 需要接收 x/y，通过 display_ui_screen(index) 按界面绘制"
              style="margin-bottom: 8px;"/>
    <el-alert v-if="enumConflicts.length > 0" type="error" :closable="false" show-icon
              :title="`枚举名冲突：${enumConflicts.join('、')}，生成的 C 枚举会重定义`"
              style="margin-bottom: 8px;"/>
    <el-alert v-if="missingResources.length > 0" type="warning" :closable="false" show-icon
              :title="`${missingResources.length} 个布局项在当前资源目录中找不到：${missingResources.join('、')}`"
              style="margin-bottom: 8px;"/>
    <Codemirror :value="computedCode" :options="cmOptions" height="460" width="100%" :border="true"
                @ready="onReady"/>
    <template #footer>
      <el-button :icon="Document" type="warning" @click="saveToFile">保存到文件</el-button>
      <el-button @click="show = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>

</style>
