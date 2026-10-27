<script setup lang="ts">
import VueDraggableResizable from 'vue-draggable-resizable'
import {computed, nextTick, onBeforeUnmount, reactive, ref, watch} from "vue";
import * as path from "path-browserify";
import {
  CircleCloseFilled,
  CopyDocument,
  Crop,
  Delete,
  DocumentChecked,
  Download,
  EditPen,
  MagicStick,
  Plus,
  Refresh,
  RefreshLeft,
  Upload,
  WarningFilled
} from "@element-plus/icons-vue";
import {VueDraggable} from "vue-draggable-plus";
import {formatSize} from "@/util/convertUtil";
import UILayoutCodeWin from "@/components/UILayoutCodeWin.vue";
import {ElMessage, ElMessageBox} from "element-plus";
import {
  captureScreen,
  createScreen,
  findEnumConflicts,
  isImageFile,
  loadProject,
  makeLayoutId,
  normalizeProject,
  pathBaseName,
  restoreScreen,
  saveProject,
  uniqueCodeName
} from "@/util/uiLayoutStore";

/**界面布局调试*/
defineOptions({name: 'UILayout'})

const uiLayoutOption = reactive<UILayoutOption>({
  inputDir: '',
  inputWidth: 240,
  inputHeight: 240,
  width: 240,
  height: 240,
  showXCenter: false,
  showYCenter: false,
  zoomScale: 1,
  bgColor: '#ffffff',
  imgList: [],
  imgListLoading: false,
})

/**当前工程的所有界面*/
const screens = ref<UILayoutScreen[]>([])
/**当前编辑的界面 id*/
const activeScreenId = ref('')
const projectName = ref('未命名工程')
const projectLoaded = ref(false)
const projectLoading = ref(false)
/**当前界面*/
const currentScreen = computed(() => screens.value.find(screen => screen.id === activeScreenId.value))
/**当前界面的 C 标识，可直接编辑*/
const screenCodeName = computed({
  get: () => currentScreen.value?.codeName || '',
  set: (value: string) => {
    if (currentScreen.value) currentScreen.value.codeName = value
  }
})

/**UI布局数据（只保存当前界面的布局项）*/
const uiLayoutData = reactive<UILayoutData>({
  list: []
})

const draggable = ref<InstanceType<typeof VueDraggableResizable>>([])

const {activeIndex} = defineProps<{ activeIndex: string }>()

/**枚举名冲突的图片（例如 a.png 与 a.jpg 都会变成 A）*/
const enumConflicts = computed(() => findEnumConflicts(uiLayoutOption.imgList))

/**自动保存定时器*/
let autoSaveTimer: number | null = null

/**
 * 读取目录中的图片资源
 * 只保留支持的图片扩展名，并按过滤后的顺序生成 index（与固件图片数组顺序一致）
 * @param dir 图片目录
 */
const loadImagesFromDir = async (dir: string): Promise<ImgOptions[]> => {
  const {success, data: files, error} = await window.electronAPI.getDirectoryFiles(dir)
  if (!success || !files) {
    throw new Error(error || '读取图片目录失败')
  }
  const imageFiles = files.filter(isImageFile)
  const imageList: ImgOptions[] = []
  for (const file of imageFiles) {
    const filePath = path.join(dir, file)
    const image = await window.electronAPI.readImageBase64(filePath, path.basename(file, path.extname(file)))
    if (!image.success) {
      console.warn('读取图片失败:', file, image.error)
      continue
    }
    imageList.push({
      filePath,
      originalFileName: file,
      fileName: path.basename(file, path.extname(file)),
      index: imageList.length,
      width: image.width,
      height: image.height,
      size: image.size,
      base64: image.fileBase64,
      enumName: image.enumName
    })
  }
  return imageList
}

/**把当前编辑器状态写回当前界面*/
const captureActiveScreen = () => {
  if (!currentScreen.value) return
  captureScreen(uiLayoutOption, uiLayoutData.list, currentScreen.value)
}

/**立即保存整个工程*/
const saveProjectNow = async (showMessage = false) => {
  if (!projectLoaded.value) return
  captureActiveScreen()
  try {
    await saveProject(normalizeProject({
      version: 3,
      name: projectName.value,
      inputDir: uiLayoutOption.inputDir,
      activeScreenId: activeScreenId.value,
      screens: screens.value
    }))
    if (showMessage) ElMessage.success('工程已保存')
  } catch (error: any) {
    ElMessage.error(error.message || '保存工程失败')
  }
}

/**延迟自动保存，避免拖动时频繁写文件*/
const scheduleSave = () => {
  if (!projectLoaded.value) return
  if (autoSaveTimer !== null) window.clearTimeout(autoSaveTimer)
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null
    void saveProjectNow(false)
  }, 800)
}

/**
 * 拖放组件父容器大小变化
 */
const handleDraggableChange = async () => {
  uiLayoutOption.width = uiLayoutOption.inputWidth;
  uiLayoutOption.height = uiLayoutOption.inputHeight;

  await nextTick()
  setTimeout(() => {
    for (let i = 0; i < draggable.value.length; i++) {
      const img = uiLayoutData.list[i];
      if (!img) continue
      if (img.x + img.width > uiLayoutOption.inputWidth) {
        img.x = uiLayoutOption.inputWidth - img.width;
        draggable.value[i].left = img.x
      }
      if (img.y + img.height > uiLayoutOption.inputHeight) {
        img.y = uiLayoutOption.inputHeight - img.height;
        draggable.value[i].top = img.y
      }
      draggable.value[i].checkParentSize()
    }
  }, 200)
}

/**应用屏幕尺寸并保存*/
const applyScreenSize = async () => {
  await handleDraggableChange()
  scheduleSave()
}

/**规范化当前界面的 C 标识，避免重名/非法字符*/
const normalizeCurrentCodeName = () => {
  const screen = currentScreen.value
  if (!screen) return
  screen.codeName = uniqueCodeName(screens.value, screen.codeName, screen.id)
  scheduleSave()
}

/**把某个界面加载到编辑器*/
const loadActiveScreen = async () => {
  const screen = currentScreen.value
  if (!screen) {
    uiLayoutData.list = []
    return
  }
  uiLayoutOption.inputWidth = screen.width
  uiLayoutOption.inputHeight = screen.height
  uiLayoutOption.width = screen.width
  uiLayoutOption.height = screen.height
  uiLayoutOption.bgColor = screen.bgColor
  uiLayoutOption.showXCenter = false
  uiLayoutOption.showYCenter = false

  const {list, missing} = restoreScreen(screen, uiLayoutOption.imgList)
  uiLayoutData.list = list
  uiLayoutData.select = undefined
  await nextTick()
  handleDraggableChange()
  if (missing.length > 0 && uiLayoutOption.inputDir) {
    ElMessage.warning(`界面「${screen.name}」有 ${missing.length} 个资源找不到：${missing.slice(0, 5).join('、')}${missing.length > 5 ? '…' : ''}`)
  }
}

/**加载工程（只读一次）*/
const ensureProjectLoaded = async () => {
  if (projectLoaded.value || projectLoading.value) return
  projectLoading.value = true
  try {
    const project = await loadProject()
    screens.value = project.screens
    activeScreenId.value = project.activeScreenId
    projectName.value = project.name
    uiLayoutOption.inputDir = project.inputDir
    if (project.inputDir) {
      try {
        uiLayoutOption.imgList = await loadImagesFromDir(project.inputDir)
      } catch (error: any) {
        ElMessage.warning(error.message || '读取图片资源失败')
      }
    }
    projectLoaded.value = true
    await loadActiveScreen()
  } catch (error: any) {
    ElMessage.error(error.message || '加载界面工程失败')
  } finally {
    projectLoading.value = false
  }
}

/**清空当前界面（不删除界面）*/
const clearLayout = () => {
  uiLayoutData.list = []
  uiLayoutData.select = undefined
  uiLayoutOption.showXCenter = false
  uiLayoutOption.showYCenter = false
  scheduleSave()
}

/**
 * 刷新当前目录的图片资源
 * 替换同名图片后重新读取预览，布局项按 enumName / fileName 重新挂接，不丢位置
 */
const refreshImages = async () => {
  if (!uiLayoutOption.inputDir || uiLayoutOption.imgListLoading) return
  const screen = currentScreen.value
  if (!screen) return
  captureActiveScreen()
  uiLayoutOption.imgListLoading = true
  try {
    const imageList = await loadImagesFromDir(uiLayoutOption.inputDir)
    if (imageList.length === 0) {
      throw new Error('目录中没有找到支持的图片文件')
    }
    uiLayoutOption.imgList = imageList
    const {list, missing} = restoreScreen(screen, imageList)
    uiLayoutData.list = list
    uiLayoutData.select = undefined
    await nextTick()
    handleDraggableChange()
    if (missing.length > 0) {
      ElMessage.warning(`有 ${missing.length} 个布局项找不到对应资源：${missing.slice(0, 5).join('、')}${missing.length > 5 ? '…' : ''}`)
    } else {
      ElMessage.success('图片资源已刷新')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '刷新图片资源失败')
  } finally {
    uiLayoutOption.imgListLoading = false
  }
}

/**选择图片资源目录*/
const selectInputDir = async () => {
  if (uiLayoutOption.imgListLoading || projectLoading.value) return
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择图片资源文件夹')
  if (!success || !selectedPath) return
  if (selectedPath === uiLayoutOption.inputDir && uiLayoutOption.imgList.length > 0) {
    await refreshImages()
    return
  }
  const hasItems = uiLayoutData.list.length > 0 || screens.value.some(screen => screen.items.length > 0)
  if (hasItems) {
    try {
      await ElMessageBox.confirm('切换资源目录会开始一个新工程并清空当前界面布局，是否继续？', '提示', {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning'
      })
    } catch {
      return
    }
  }

  uiLayoutOption.imgListLoading = true
  try {
    const imageList = await loadImagesFromDir(selectedPath)
    const screen = createScreen('主界面', 240, 240, '#ffffff', 'SCREEN_1')
    uiLayoutOption.inputDir = selectedPath
    uiLayoutOption.imgList = imageList
    uiLayoutOption.inputWidth = 240
    uiLayoutOption.inputHeight = 240
    projectName.value = pathBaseName(selectedPath) || '未命名工程'
    screens.value = [screen]
    activeScreenId.value = screen.id
    projectLoaded.value = true
    await loadActiveScreen()
    await saveProjectNow(false)
    if (imageList.length === 0) {
      ElMessage.warning('目录中没有找到支持的图片文件')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '读取图片目录失败')
  } finally {
    uiLayoutOption.imgListLoading = false
  }
}

// 打开输出目录
const openDir = async (dir: string) => {
  const {success, error} = await window.electronAPI.openPath(dir);
  if (!success) {
    ElMessage.error(error);
  }
}

/**切换界面*/
const switchScreen = async (id: string) => {
  if (id === activeScreenId.value) return
  captureActiveScreen()
  activeScreenId.value = id
  await loadActiveScreen()
  await saveProjectNow(false)
}

/**新增界面*/
const addScreen = async () => {
  try {
    const {value} = await ElMessageBox.prompt('请输入界面名称', '新增界面', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: `界面${screens.value.length + 1}`
    })
    captureActiveScreen()
    const name = (value || '').trim() || `界面${screens.value.length + 1}`
    const screen = createScreen(
        name,
        uiLayoutOption.inputWidth,
        uiLayoutOption.inputHeight,
        uiLayoutOption.bgColor,
        uniqueCodeName(screens.value, name)
    )
    screens.value.push(screen)
    activeScreenId.value = screen.id
    await loadActiveScreen()
    await saveProjectNow(false)
  } catch {
    // 取消
  }
}

/**复制当前界面*/
const duplicateScreen = async () => {
  captureActiveScreen()
  const source = currentScreen.value
  if (!source) return
  const copy = createScreen(
      `${source.name} 副本`,
      source.width,
      source.height,
      source.bgColor,
      uniqueCodeName(screens.value, `${source.codeName}_COPY`)
  )
  copy.items = source.items.map(item => ({...item, id: makeLayoutId()}))
  screens.value.push(copy)
  activeScreenId.value = copy.id
  await loadActiveScreen()
  await saveProjectNow(false)
}

/**重命名当前界面*/
const renameScreen = async () => {
  const screen = currentScreen.value
  if (!screen) return
  try {
    const {value} = await ElMessageBox.prompt('请输入界面名称', '重命名界面', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: screen.name
    })
    const name = (value || '').trim()
    if (!name) return
    screen.name = name
    await saveProjectNow(false)
  } catch {
    // 取消
  }
}

/**删除当前界面*/
const deleteScreen = async () => {
  if (screens.value.length <= 1) {
    ElMessage.warning('至少保留一个界面')
    return
  }
  const screen = currentScreen.value
  if (!screen) return
  try {
    await ElMessageBox.confirm(`确定删除界面「${screen.name}」吗？`, '删除界面', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  screens.value = screens.value.filter(item => item.id !== screen.id)
  activeScreenId.value = screens.value[0].id
  await loadActiveScreen()
  await saveProjectNow(false)
}

/**导出工程配置*/
const exportProject = async () => {
  captureActiveScreen()
  const project = normalizeProject({
    version: 3,
    name: projectName.value,
    inputDir: uiLayoutOption.inputDir,
    activeScreenId: activeScreenId.value,
    screens: screens.value
  })
  const safeName = (projectName.value || 'ui-project').replace(/[\\/:*?"<>|]/g, '_')
  try {
    const result = await window.electronAPI.downloadFile(JSON.stringify(project, null, 2), `${safeName}.ui-project.json`)
    if (result.success) {
      ElMessage.success('工程配置已导出')
    } else {
      ElMessage.error('导出工程配置失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '导出工程配置失败')
  }
}

/**导入工程配置*/
const importProject = async () => {
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择界面工程配置', ['openFile'])
  if (!success || !selectedPath) return
  const result = await window.electronAPI.readJSONFile(selectedPath)
  if (!result.success || !result.data) {
    ElMessage.error(result.error || '读取工程配置失败')
    return
  }

  const project = normalizeProject(result.data)
  if (!project.inputDir) {
    ElMessage.error('工程配置没有记录图片资源目录')
    return
  }

  projectLoading.value = true
  try {
    const imageList = await loadImagesFromDir(project.inputDir)
    uiLayoutOption.inputDir = project.inputDir
    uiLayoutOption.imgList = imageList
    screens.value = project.screens
    activeScreenId.value = project.activeScreenId
    projectName.value = project.name
    projectLoaded.value = true
    await loadActiveScreen()
    await saveProjectNow(false)
    ElMessage.success('工程配置已导入')
  } catch (error: any) {
    ElMessage.error(error.message || '导入工程配置失败')
  } finally {
    projectLoading.value = false
  }
}

/**
 * 点击图片列表，把图片放到预留界面
 * @param item 图片信息
 */
const rowClickHandler = (item: ImgOptions) => {
  if (uiLayoutOption.imgListLoading) return
  uiLayoutData.list.forEach(layout => layout.active = false)
  const width = item.width || 0
  const height = item.height || 0
  // 错开摆放，避免连续添加时全部叠在 (0,0)
  const offset = (uiLayoutData.list.length % 5) * 10
  const layout: UILayout = {
    id: makeLayoutId(),
    active: true,
    width,
    height,
    x: Math.min(offset, Math.max(0, uiLayoutOption.width - width)),
    y: Math.min(offset, Math.max(0, uiLayoutOption.height - height)),
    isXCenter: false,
    isYCenter: false,
    fileName: item.fileName,
    index: item.index,
    enumName: item.enumName,
    base64: item.base64,
    size: item.size
  };
  uiLayoutData.select = layout;
  uiLayoutData.list.push(layout)
  scheduleSave()
}

// 点击激活当前拖动元素
const onDraggableActive = (item: UILayout) => {
  uiLayoutData.list.forEach(layout => layout.active = false)
  item.active = true
  uiLayoutData.select = item
  uiLayoutOption.showXCenter = !!item.isXCenter
  uiLayoutOption.showYCenter = !!item.isYCenter
}

const onDraggableDeActive = () => {
  uiLayoutData.list.forEach(item => item.active = false)
  uiLayoutData.select = undefined
  uiLayoutOption.showXCenter = false
  uiLayoutOption.showYCenter = false
  scheduleSave()
}

// 元素拖动事件
const onDragging = (left: number, top: number, item: UILayout) => {
  item.x = left
  item.y = top
  const width = uiLayoutOption.width
  const imgWidth = item.width
  const expectedLeft = (width - imgWidth) / 2
  item.isXCenter = Math.abs(left - expectedLeft) <= 0.5
  uiLayoutOption.showXCenter = item.isXCenter
  const height = uiLayoutOption.height
  const imgHeight = item.height
  const expectedTop = (height - imgHeight) / 2
  item.isYCenter = Math.abs(top - expectedTop) <= 0.5
  uiLayoutOption.showYCenter = item.isYCenter
}

// 每次移动的步长（像素）
const moveStep = ref(1)

/**
 * 键盘按下事件处理
 * 只处理方向键；输入框/文本域里不拦截，避免影响正常输入
 * @param event 键盘事件
 */
const onKeyDown = (event: KeyboardEvent) => {
  const item = uiLayoutData.select
  if (!item) return

  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return
  }

  const preventDefaultKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']
  if (preventDefaultKeys.includes(event.key)) {
    event.preventDefault()
  }
  const step = event.ctrlKey ? moveStep.value * 5 : moveStep.value
  switch (event.key) {
    case 'ArrowUp':
      moveElement(0, -step, item)
      scheduleSave()
      break
    case 'ArrowDown':
      moveElement(0, step, item)
      scheduleSave()
      break
    case 'ArrowLeft':
      moveElement(-step, 0, item)
      scheduleSave()
      break
    case 'ArrowRight':
      moveElement(step, 0, item)
      scheduleSave()
      break
    default:
      break
  }
}

// 移动元素
const moveElement = (deltaX: number, deltaY: number, item: UILayout) => {
  const parentWidth = uiLayoutOption.width || 0
  const parentHeight = uiLayoutOption.height || 0

  const maxX = Math.max(0, parentWidth - item.width)
  const maxY = Math.max(0, parentHeight - item.height)
  item.x = Math.min(Math.max(0, item.x + deltaX), maxX)
  item.y = Math.min(Math.max(0, item.y + deltaY), maxY)

  const expectedLeft = (parentWidth - item.width) / 2
  item.isXCenter = Math.abs(item.x - expectedLeft) <= 0.5
  uiLayoutOption.showXCenter = item.isXCenter
  const expectedTop = (parentHeight - item.height) / 2
  item.isYCenter = Math.abs(item.y - expectedTop) <= 0.5
  uiLayoutOption.showYCenter = item.isYCenter
}

/**统一的 keydown 处理器，避免每次切换 Tab 重复注册*/
const keydownHandler = (event: KeyboardEvent) => onKeyDown(event)
const attachKeydown = () => {
  document.removeEventListener('keydown', keydownHandler)
  document.addEventListener('keydown', keydownHandler)
}
const detachKeydown = () => document.removeEventListener('keydown', keydownHandler)

/**生成代码前保存当前工程*/
const handleCodeShow = async () => {
  await saveProjectNow(false)
}

watch(() => activeIndex, async value => {
  if (value === '5') {
    attachKeydown()
    await ensureProjectLoaded()
  } else {
    detachKeydown()
    if (projectLoaded.value) {
      await saveProjectNow(false)
    }
  }
}, {immediate: true})

onBeforeUnmount(() => {
  detachKeydown()
  if (autoSaveTimer !== null) {
    window.clearTimeout(autoSaveTimer)
  }
  if (projectLoaded.value) {
    void saveProjectNow(false)
  }
})
</script>

<template>
  <div class="ui-layout" v-loading="projectLoading">
    <div style="background-color: var(--el-bg-color);width: 100%;flex-shrink: 0;">
      <el-form size="small" inline style="padding: 16px 10px 0 10px; margin-bottom: 0;">
        <el-form-item>
          <div style="display: inline-flex;align-items: center;">
            <el-input v-model="uiLayoutOption.inputDir" placeholder="请选择显示的图片所在目录" readonly>
              <template #append>
                <el-button @click="selectInputDir">选择目录</el-button>
              </template>
            </el-input>
            <el-button @click="openDir(uiLayoutOption.inputDir)" v-if="uiLayoutOption.inputDir" type="primary"
                       style="margin-left: 5px;">前往
            </el-button>
            <el-tooltip v-if="uiLayoutOption.inputDir" content="刷新图片资源（替换同名图片后点击）" placement="top">
              <el-button @click="refreshImages" :icon="Refresh" circle style="margin-left: 5px;"/>
            </el-tooltip>
          </div>
        </el-form-item>
        <el-form-item label="屏幕宽度">
          <el-input-number v-model="uiLayoutOption.inputWidth" style="width: 100px;" @change="applyScreenSize"/>
        </el-form-item>
        <el-form-item label="屏幕高度">
          <el-input-number v-model="uiLayoutOption.inputHeight" style="width: 100px;" @change="applyScreenSize"/>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Crop" @click="applyScreenSize">应用</el-button>
        </el-form-item>
        <el-form-item label="预览界面缩放比例">
          <el-slider :step="0.1" style="width: 120px;" v-model="uiLayoutOption.zoomScale" :min="0.5" :max="5"/>
        </el-form-item>
        <el-form-item label="背景">
          <el-color-picker v-model="uiLayoutOption.bgColor" @change="scheduleSave"/>
        </el-form-item>
      </el-form>
    </div>
    <div class="screen-bar">
      <el-text>工程</el-text>
      <el-input v-model="projectName" size="small" style="width: 140px;" @change="scheduleSave"/>
      <el-text>界面</el-text>
      <el-select :model-value="activeScreenId" size="small" style="width: 150px;" @change="switchScreen">
        <el-option v-for="screen in screens" :key="screen.id" :label="screen.name" :value="screen.id"/>
      </el-select>
      <el-button size="small" :icon="Plus" @click="addScreen">新增</el-button>
      <el-button size="small" :icon="CopyDocument" @click="duplicateScreen">复制</el-button>
      <el-button size="small" :icon="EditPen" @click="renameScreen">重命名</el-button>
      <el-button size="small" :icon="Delete" :disabled="screens.length <= 1" @click="deleteScreen">删除</el-button>
      <el-button size="small" :icon="Download" @click="exportProject">导出工程</el-button>
      <el-button size="small" :icon="Upload" @click="importProject">导入工程</el-button>
      <el-text type="info" size="small">C 标识</el-text>
      <el-input v-model="screenCodeName" size="small" style="width: 130px;" @change="normalizeCurrentCodeName"/>
    </div>
    <el-splitter style="width: 100%; flex: 1; min-height: 0;">
      <el-splitter-panel collapsible :resizable="false" :size="260">
        <div style="background-color: var(--el-bg-color); width: 100%; height: 100%;">
          <el-table height="100%" size="small" :data="uiLayoutOption.imgList" @row-click="rowClickHandler"
                    v-loading="uiLayoutOption.imgListLoading" empty-text="无图片文件">
            <el-table-column type="index" label="序号" width="40"/>
            <el-table-column prop="fileName" label="文件名 (点击选择到预留界面)" min-width="180">
              <template #default="{row}">
                <div style="display: flex; align-items: center;">
                  <el-image @click.stop v-if="row.base64"
                            style="height: 50px; width: auto;max-width: 50px; margin-right: 5px;"
                            fit="contain" :title="'图片 宽度: ' + row.width + 'px 高度: ' + row.height + 'px'"
                            preview-teleported loading="lazy"
                            :preview-src-list="[row.base64]" :src="row.base64"/>
                  <el-text style="cursor: pointer;" :line-clamp="2" :title="row.originalFileName">
                    {{ row.originalFileName }}
                  </el-text>
                  <el-tooltip v-if="row.enumName && enumConflicts.includes(row.enumName)"
                              content="枚举名重复，生成的 C 代码会冲突，请修改文件名">
                    <el-icon color="var(--el-color-danger)" style="margin-left: 4px;" :size="14">
                      <WarningFilled/>
                    </el-icon>
                  </el-tooltip>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-splitter-panel>
      <el-splitter-panel style="display: flex; justify-content: center;position: relative;">
        <el-card body-style="padding: 0; display: flex; align-items: center; justify-content: center; height: 100%;"
                 style="margin-top: 10px;position: fixed;"
                 :style="{width: uiLayoutOption.width + 20 + 'px',height: uiLayoutOption.height + 20 + 'px', zoom: uiLayoutOption.zoomScale}">
          <div style="outline: 1px solid var(--el-border-color); position: relative;"
               :style="{width: uiLayoutOption.width + 'px',height: uiLayoutOption.height + 'px',backgroundColor: uiLayoutOption.bgColor}">
            <div v-if="uiLayoutOption.showXCenter" :style="{left: uiLayoutOption.width/2 + 'px'}"
                 style="width: 0; height: 100%; border-left: 1px dashed var(--el-color-danger);position: absolute;"/>
            <div v-if="uiLayoutOption.showYCenter" :style="{top: uiLayoutOption.height/2 + 'px'}"
                 style="width: 100%; height: 0; border-top: 1px dashed var(--el-color-danger);position: absolute;"/>
            <vue-draggable-resizable v-for="(item, index) in uiLayoutData.list" :key="item.id || item.enumName"
                                     ref="draggable"
                                     class-name-draggable="draggable-ui-item" :active="item.active"
                                     class-name-active="draggable-ui-item-active" :z="index" :x="item.x" :y="item.y"
                                     @activated="()=> onDraggableActive(item)" @deactivated="onDraggableDeActive"
                                     @dragging="(left:number, top:number) => onDragging(left, top, item)"
                                     :w="item.width" :h="item.height" :parent="true">
              <el-image fit="contain" :src="item.base64"/>
            </vue-draggable-resizable>
          </div>
        </el-card>
        <div class="center-bottom-bar">
          <div style="margin-top: 10px;display: flex; align-items: center; justify-content: center;">
            <UILayoutCodeWin :disabled="uiLayoutData.list.length <= 0" :icon="MagicStick" btn-type="primary"
                             :screens="screens" :img-data="uiLayoutOption" @on-show="handleCodeShow"/>
            <el-button :icon="DocumentChecked" type="success" plain @click="saveProjectNow(true)">保存工程</el-button>
            <el-button @click="clearLayout" :icon="RefreshLeft">重置</el-button>
          </div>
        </div>
      </el-splitter-panel>
      <el-splitter-panel style="background-color: var(--el-bg-color)" collapsible :resizable="false" :size="260">
        <el-divider style="padding: 0 5px" content-position="left">当前选中图片</el-divider>
        <template v-if="uiLayoutData.select">
          <div style="display: flex; align-items: center;margin: 0 10px;">
            <el-image style="width: 30px; height: 30px; margin-right: 5px;" fit="contain"
                      :src="uiLayoutData.select.base64"/>
            <div style="width: 180px; text-align: start;">
              <el-text style="display: block;" size="small" truncated>{{ uiLayoutData.select.fileName }}</el-text>
              <el-text style="color: #C77DBB;font-weight: bold;" size="small" truncated>{{
                  uiLayoutData.select.enumName
                }}</el-text>
            </div>
            <div style="display: flex; flex-direction: column; flex: 1;">
              <el-text type="danger" size="small">{{ uiLayoutData.select.x }}</el-text>
              <el-text type="success" size="small">{{ uiLayoutData.select.y }}</el-text>
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-around;">
            <el-text size="small">宽高: {{ uiLayoutData.select.width + ' x ' + uiLayoutData.select.height }}</el-text>
            <el-text size="small">数组下标: {{ uiLayoutData.select.index }}</el-text>
            <el-text size="small" type="primary">{{ formatSize(uiLayoutData.select.size) }}</el-text>
          </div>
        </template>
        <el-text style="height: 54px;line-height: 54px; display: block; text-align: center;" v-else>
          当前未选择图片
        </el-text>
        <el-divider content-position="left">图片列表</el-divider>
        <el-scrollbar style="height: calc(100% - 157px);">
          <el-collapse style="margin-left: 10px;" expand-icon-position="left">
            <VueDraggable :animation="150" v-model="uiLayoutData.list">
              <el-collapse-item v-for="(item, index) in uiLayoutData.list" :key="item.id || item.enumName">
                <template #title>
                  <div class="draggable-right-item">
                    <el-image style="width: 30px; height: 30px; margin-right: 5px;" fit="contain" :src="item.base64"/>
                    <div style="width: 140px; text-align: start;">
                      <el-text style="display: block;" size="small" truncated>{{ item.fileName }}</el-text>
                      <el-text style="color: #C77DBB;font-weight: bold;" size="small" truncated>{{
                          item.enumName
                        }}</el-text>
                    </div>
                    <div style="display: flex; flex-direction: column; flex: 1;">
                      <el-text type="danger" size="small">{{ item.x }}</el-text>
                      <el-text type="success" size="small">{{ item.y }}</el-text>
                    </div>
                    <el-icon @click="uiLayoutData.list.splice(index, 1)" style="margin-right: 6px;" :size="20"
                             color="var(--el-color-danger)">
                      <CircleCloseFilled/>
                    </el-icon>
                  </div>
                </template>
                <div style="display: flex; align-items: flex-start; justify-content: space-around;">
                  <div>
                    <el-text size="small" style="display: block;">宽高: {{ item.width + ' x ' + item.height }}</el-text>
                    <el-text size="small" style="display: block;">数组下标: {{ item.index }}</el-text>
                  </div>
                  <el-text type="primary">{{ formatSize(item.size) }}</el-text>
                </div>
              </el-collapse-item>
            </VueDraggable>
          </el-collapse>
        </el-scrollbar>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<style scoped>
@import "vue-draggable-resizable/style.css";

.ui-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  min-height: 0;
}

.screen-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  background-color: var(--el-bg-color);
  flex-shrink: 0;
}

:deep(.el-form--inline .el-form-item) {
  margin-right: 12px;
}

.ui-layout .draggable-ui-item {
  border: none;
}

.ui-layout .draggable-ui-item-active {
  box-sizing: border-box;
  outline: 1px dashed blue;
}

.ui-layout .draggable-right-item {
  display: flex;
  align-items: center;
  line-height: 20px;
}

.ui-layout .center-bottom-bar {
  width: 100%;
  height: 60px;
  position: absolute;
  bottom: 0;
  left: 0;
  background-color: var(--el-bg-color);
}

:deep(.el-splitter-bar__dragger:before) {
  background-color: transparent;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 0;
}
</style>
