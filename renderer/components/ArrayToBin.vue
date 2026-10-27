<script setup lang="ts">
import {computed, h, nextTick, reactive, ref, watch} from "vue";
import type {Columns, TableColumnCtx} from "element-plus"
import {ElAutoResizer, ElMessage, TableV2Alignment} from "element-plus";
import {
  CircleCloseFilled,
  CloseBold,
  DeleteFilled,
  Document,
  Edit,
  Loading,
  MagicStick,
  Plus,
  QuestionFilled,
  Refresh,
  ScaleToOriginal,
  Sort
} from "@element-plus/icons-vue";
import * as path from "path-browserify";
import {formatDate, splitBytes} from "@/util/dataUtil";
import {convertToByte, formatSize, uint8ArrayToAscii, uint8ArrayToHexString} from "@/util/convertUtil";
import {crc32} from "crc";
import {DraggableEvent, useDraggable, VueDraggable} from "vue-draggable-plus";

const imageToArrayOutputDir = localStorage.getItem("outputDir1") || '';
let localInputDir = localStorage.getItem("inputDir2") || '';
// 判断当前目录为空 并且图片转数组输出目录不为空
if (localInputDir === '' && imageToArrayOutputDir !== '') {
  localInputDir = imageToArrayOutputDir;
}
const localOutputDir = localStorage.getItem("outputDir2") || '';
/**
 * 当前功能类型：数组转二进制文件 | 二进制文件处理
 */
const binTabIndex = ref<'arr_to_bin' | 'handle_bin'>('arr_to_bin');
/*数组转二进制表单信息*/
const form = reactive({
  type: 0,
  inputDir: localInputDir,
  outputDir: localOutputDir,
  mergedFileName: 'all_images',
  /* 是否显示启用RLE编码 */
  showRLE: true,
  /* 是否生成枚举映射 */
  isEnumMapping: false,
  /* 是否显示字节序信息 */
  showLittleEndian: false
});

/*附加内容*/
interface FileAddContent {
  key: string;
  /**值*/
  value: string,
  /**备注信息*/
  remark: string,
  /**类型：文本 | 十六进制 | 十进制 | 二进制*/
  type: 'text' | 'hex' | 'dec' | 'bin',
  /** 字节长度 */
  byteLength: number,
  /** 字节预览 */
  viewValue: string,
  /** 预览类型 */
  viewType: 'hex' | 'dec'
}

/*值类型下拉*/
const valueTypeOptions = [
  {value: 'text', label: '文本'},
  {value: 'hex', label: '十六进制'},
  {value: 'dec', label: '十进制'},
  {value: 'bin', label: '二进制'}
]

/**
 * 文件预览对象
 */
interface FileHexView {
  /**地址偏移量*/
  offsetHex: string,
  /**16进制数据*/
  hexArr: string[],
  /**ASCII数据*/
  asciiArr: string[]
}

/**
 * 文件信息
 */
interface FileInfo {
  name: string,
  originalName: string,
  path: string,
  size: number,
  crc32Hex?: string
}

/*二进制表单*/
interface HandleBinForm {
  /** 是否加载中 */
  loading: boolean,
  /**文件路径 多个，分割*/
  filePath: string,
  /**文件开头附加信息*/
  fileHeaders: FileAddContent[],
  /**附加文件头数据大小*/
  fileHeaderSize: number,
  /**文件末尾附加信息*/
  fileFooters: FileAddContent[],
  /**附加文件未数据大小*/
  fileFooterSize: number,
  /**文件列表*/
  fileList: FileInfo[],
  /**当前选中文件*/
  selectFileIndex: number,
  /** 文件字节数据 */
  fileBytes: Uint8Array,
  /** 文件预览对象 */
  fileHexViewArr: FileHexView[],
  /** 文件头预览类型 */
  headerViewType: 'hex' | 'dec',
  /** 文件尾预览类型 */
  footerViewType: 'hex' | 'dec'
}

/**
 * 附加信息默认值
 */
const defaultBinItem: FileAddContent = {
  key: '',
  value: '',
  remark: '',
  type: 'text',
  byteLength: 4,
  viewValue: '',
  viewType: 'hex'
};

/*二进制文件处理表单信息*/
const handleBinForm = reactive<HandleBinForm>({
  loading: false,
  filePath: '',
  fileHeaders: [],
  fileHeaderSize: 0,
  fileFooters: [],
  fileFooterSize: 0,
  fileBytes: new Uint8Array(0),
  fileList: [],
  selectFileIndex: -1,
  fileHexViewArr: [],
  headerViewType: 'hex',
  footerViewType: 'hex'
});
// 结果
const results = ref([]);
// 生成文件信息
const generatedFiles = ref([]);
// 进度
const processing = ref(false);

interface BottomBinInfo {
  crc32Hex: string,
  srcFileSize: number,
  destFileSize: number,
}

const bottomBinInfo = reactive<BottomBinInfo>({
  crc32Hex: '',
  srcFileSize: 0,
  destFileSize: 0
})

// ---------------------- 数组转二进制文件相关 -------------------------
/**
 * 选择输入文件夹
 */
const selectInputDir = async () => {
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择输入文件夹');
  if (success) form.inputDir = selectedPath;
};
/**
 * 选择输出文件夹
 */
const selectOutputDir = async () => {
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择输出文件夹');
  if (success) form.outputDir = selectedPath;
};

// 打开输出目录
const openDir = async (path: string) => {
  const {success, error} = await window.electronAPI.openPath(path);
  if (!success) {
    ElMessage.error(error);
  }
}
// 处理转换
const processFiles = async () => {
  if (!form.inputDir) {
    ElMessage.error('请选择输入目录');
    return;
  }

  if (!form.outputDir) {
    ElMessage.error('请选择输出目录');
    return;
  }

  if (!form.mergedFileName) {
    ElMessage.error('请输入合并文件名称');
    return;
  }

  processing.value = true;
  results.value = [];
  generatedFiles.value = [];

  try {
    // 获取目录文件
    const {data: files} = await window.electronAPI.getDirectoryFiles(form.inputDir);
    let extArr = ['.jpg', '.jpeg', '.png', '.bmp']
    if (form.type === 0) {
      extArr = ['.c']
    }
    const validFiles = files.filter((file: string) => {
      const ext = path.extname(file).toLowerCase();
      return extArr.includes(ext);
    }).map((file: string) => ({
      fileName: file,
      filePath: path.join(form.inputDir, file)
    }));


    if (validFiles.length === 0) {
      ElMessage.warning('输入目录中没有找到支持的图像文件');
      processing.value = false;
      return;
    }

    const options = {
      files: validFiles,
      outputDir: form.outputDir,
      mergedFileName: form.mergedFileName,
      showRLE: form.showRLE,
      isEnumMapping: form.isEnumMapping
    };

    const response = await window.electronAPI.processImages(options);

    // 处理结果
    results.value = response.results.map(result => {
      if (result.success) {
        return {
          fileName: result.fileName,
          fileBase64: result.fileBase64,
          success: true,
          width: result.width,
          height: result.height,
          size: result.size,
          offset: result.offset,
          message: '处理成功',
        };
      } else {
        return {
          fileName: result.fileName,
          success: false,
          message: result.error,
        };
      }
    });

    // 生成的文件
    generatedFiles.value = [response.source, response.mergedFile];

    if (response.warnings && response.warnings.length > 0) {
      ElMessage.warning({
        message: response.warnings.join('；'),
        duration: 8000,
        showClose: true
      });
    }

    ElMessage.success('文件处理完成！');

    localStorage.setItem('inputDir2', form.inputDir);
    localStorage.setItem('outputDir2', form.outputDir);
  } catch (error) {
    ElMessage.error(`处理失败: ${error.message}`);
  } finally {
    processing.value = false;
  }
};

const reset = () => {
  form.type = 0;
  form.inputDir = '';
  form.outputDir = '';
  form.mergedFileName = 'all_images';
  results.value = [];
  generatedFiles.value = [];

  localStorage.removeItem('inputDir2');
  localStorage.removeItem('outputDir2');
};

/**
 * 转16进制
 * @param value 需要转换的值
 * @param length 显示长度
 */
const toHexStr = (value: number | undefined, length: number) => {
  if (value === undefined) {
    return '';
  }
  const hex = value.toString(16).padStart(length, '0').toUpperCase();
  return '0x' + hex;
}

// --------------------------- 二进制文件处理相关 ----------------------------------
/*头附加信息表*/
const headerTableRef = ref<typeof import('element-plus/es')['ElTable'] | null>()
/*末尾附加信息表*/
const footerTableRef = ref<typeof import('element-plus/es')['ElTable'] | null>()

/**
 * 文件头总字节数据预览
 */
const sumHeaderViewValue = computed(() => {
  let viewStr = ''
  if (handleBinForm.fileHeaders.length > 0) {
    handleBinForm.fileHeaders.forEach((fileHeader) => {
      if (fileHeader.value.length > 0) {
        viewStr += convertToByte(fileHeader.value, fileHeader.type, handleBinForm.headerViewType, fileHeader.byteLength) + ' '
      }
    })
    viewStr = viewStr.substring(0, viewStr.length - 1)
    if (viewStr.length > 0) {
      handleBinForm.fileHeaderSize = viewStr.split(' ').length;
    }
  } else {
    handleBinForm.fileHeaderSize = 0
  }
  return viewStr;
})

/**
 * 文件尾总字节数据预览
 */
const sumFooterViewValue = computed(() => {
  let viewStr = ''
  if (handleBinForm.fileFooters.length > 0) {
    handleBinForm.fileFooters.forEach((fileFooter) => {
      if (fileFooter.value.length > 0) {
        viewStr += convertToByte(fileFooter.value, fileFooter.type, handleBinForm.footerViewType, fileFooter.byteLength) + ' '
      }
    })
    viewStr = viewStr.substring(0, viewStr.length - 1)
    if (viewStr.length > 0) {
      handleBinForm.fileFooterSize = viewStr.split(' ').length;
    }
  } else {
    handleBinForm.fileFooterSize = 0;
  }

  return viewStr;
})

/**
 * 计算文件总大小
 */
const sumFileSize = computed(() => {
  return handleBinForm.fileList.reduce((size, item) => size + item.size, 0)
})

/**
 * 计算地址偏移量 hex格式
 * @param index
 */
const fileOffsetHex = (index: number) => {
  let offset = 0
  handleBinForm.fileList.forEach((item, fileIndex) => {
    if (fileIndex < index) {
      offset += item.size
    }
  })
  return offset.toString(16).padStart(8, '0').toUpperCase()
}

/**
 * 选择文件
 */
const selectSendFile = async () => {
  const {
    success,
    paths
  } = await window.electronAPI.selectDirectory('选择需要处理的二进制文件', ["multiSelections"]);
  if (success) {
    // 处理文件列表
    for (const filePath of paths) {
      const pasePath = path.format(filePath)
      const {fileSize} = await window.electronAPI.getFileSize(pasePath)
      const fileInfo: FileInfo = {
        name: filePath.name,
        originalName: filePath.base,
        path: pasePath,
        size: fileSize
      }
      handleBinForm.fileList.push(fileInfo);
    }
    handleBinForm.filePath = handleBinForm.fileList.map(m => m.path).join(',');
    handleBinForm.selectFileIndex = 0;

    viewFileContent(handleBinForm.selectFileIndex);
  }
};
/**
 * 查看文件内容
 * @param index
 */
const viewFileContent = (index: number) => {
  handleBinForm.loading = true;

  handleBinForm.selectFileIndex = index;
  const fileInfo = handleBinForm.fileList[index];
  window.electronAPI.readFileBytes(fileInfo.path).then(({data, fileSize}) => {
    bottomBinInfo.crc32Hex = crc32(data as any).toString(16);
    bottomBinInfo.srcFileSize = fileSize;
    handleBinForm.fileHexViewArr = []
    let offset = 0;
    for (let i = 0; i < data.length; i += 16) {
      let fileHexView: FileHexView = {offsetHex: '', hexArr: [], asciiArr: []};
      const uint8Array1 = data.subarray(i, i + 8);
      const uint8Array2 = data.subarray(i + 8, i + 16);

      // 地址偏移量
      fileHexView.offsetHex = offset.toString(16).padStart(8, '0').toLocaleUpperCase();
      offset += 16;

      // hex数据
      fileHexView.hexArr.push(uint8ArrayToHexString(uint8Array1));
      fileHexView.hexArr.push(uint8ArrayToHexString(uint8Array2));

      // ASCII 数据
      fileHexView.asciiArr.push(uint8ArrayToAscii(uint8Array1));
      fileHexView.asciiArr.push(uint8ArrayToAscii(uint8Array2));

      handleBinForm.fileHexViewArr.push(fileHexView);
    }

    handleBinForm.fileBytes = data

    handleBinForm.loading = false;
  })
}
/**
 * 移除当前文件
 * @param index
 */
const removeItemFile = (index: number) => {
  if (handleBinForm.selectFileIndex === index) {
    viewFileContent(index);
  }
  handleBinForm.fileList.splice(index, 1);
}

// 保存到文件
const saveBinFoFile = async () => {
  // 计算总大小
  let size = handleBinForm.fileList.reduce((size, item) => size + item.size, 0)

  let headerBytes: number[] = []
  let footerBytes: number[] = []
  // 是否有附加头数据
  if (sumHeaderViewValue.value.length > 0) {
    headerBytes = sumHeaderViewValue.value.split(' ').map(hexStr => parseInt(hexStr, 16));
    if (headerBytes.length > 0) {
      size += headerBytes.length
    }
  }
  // 是否有附加末尾数据
  if (sumFooterViewValue.value.length > 0) {
    footerBytes = sumFooterViewValue.value.split(' ').map(hexStr => parseInt(hexStr, 16));
    if (footerBytes.length > 0) {
      size += footerBytes.length
    }
  }
  const allBin = new Uint8Array(size);
  // 地址偏移量
  let offset = 0;
  // 添加头数据
  if (headerBytes.length > 0) {
    allBin.set(new Uint8Array(headerBytes), offset);
    offset += headerBytes.length
  }
  // 合并文件字节数据
  for (const item of handleBinForm.fileList) {
    const {data} = await window.electronAPI.readFileBytes(item.path)
    allBin.set(data, offset);
    offset += data.length;
  }
  // 添加末尾数据
  if (footerBytes.length > 0) {
    allBin.set(new Uint8Array(footerBytes), offset);
  }
  await window.electronAPI.downloadFile(allBin, `bin_merge_${new Date().getTime()}.bin`)
}
/**
 * 关闭文件
 */
const closeAllFile = () => {
  handleBinForm.fileList = []
  handleBinForm.selectFileIndex = -1
  handleBinForm.fileHexViewArr = []
  handleBinForm.fileBytes = new Uint8Array(0)
  handleBinForm.filePath = ''
}

/**
 * 文件拖动排序改变事件
 * @param event
 */
const fileDraggableSortChange = (event: DraggableEvent) => {
  const {newIndex, oldIndex} = event;
  if (oldIndex === handleBinForm.selectFileIndex) {
    handleBinForm.selectFileIndex = newIndex;
  } else if (newIndex === handleBinForm.selectFileIndex) {
    if (oldIndex < newIndex) {
      handleBinForm.selectFileIndex--
    } else {
      handleBinForm.selectFileIndex++
    }
  } else if (oldIndex > newIndex && (oldIndex > handleBinForm.selectFileIndex && newIndex < handleBinForm.selectFileIndex)) {
    handleBinForm.selectFileIndex++
  } else if (newIndex > oldIndex && (newIndex > handleBinForm.selectFileIndex && oldIndex < handleBinForm.selectFileIndex)) {
    handleBinForm.selectFileIndex--
  }
}

/**
 * 显示crc32 校检码
 * @param item
 */
const crc32ViewHandler = async (item: FileInfo) => {
  const {data} = await window.electronAPI.readFileBytes(item.path)
  item.crc32Hex = crc32(data as any).toString(16);
}

/**
 * 新增附加信息
 * @param list
 */
const handleBinItemAdd = (list: FileAddContent[]) => {
  list.push({...defaultBinItem, key: new Date().getTime().toString()})
}

/**
 * 删除当前元素
 * @param list
 * @param index
 */
const handleBinItemDel = (list: FileAddContent[], index: number) => {
  list.splice(index, 1);
}
/**
 * 交换元素位置
 * @param list
 * @param index1
 * @param index2
 */
/*const handleBinItemSwap = (list: FileAddContent[], index1: number, index2: number) => {
  [list[index1], list[index2]] = [list[index2], list[index1]];
}*/
/**附加内容改变事件*/
const handleBinItemInputChange = (value: string, item: FileAddContent) => {
  item.viewValue = convertToByte(value, item.type, item.viewType, item.byteLength)
}

interface SummaryMethodProps<T = FileAddContent> {
  columns: TableColumnCtx<T>[]
  data: T[]
}

const getSummaries = (param: SummaryMethodProps) => {
  const {columns, data} = param
  const sums: string[] = []
  columns.forEach((column, index) => {
    if (index === 1) {
      sums[index] = '数据长度'
      return
    }
    if (index === 4) {
      sums[index] = data.reduce((val, curr) => Number(curr.byteLength) + val, 0) + ' byte'
    }
  })
  return sums
}

/**
 * 文件hex信息预览表格列
 */
const hexViewColumns: Columns<any> = [
  {
    key: 'offsetHex',
    width: 65,
    title: '地址',
    dataKey: 'offsetHex',
    align: TableV2Alignment.CENTER,
    style: {padding: 0},
    cellRenderer: ({cellData: offsetHex}) => {
      return h(ElText, {
        type: 'primary',
        size: 'small',
        style: "user-select: none; font-family: Consolas, Menlo, Monaco, 'Lucida Console', 'Liberation Mono', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Courier New', monospace, serif;margin-right: 5px;"
      }, () => offsetHex)
    }
  }, {
    key: 'hex',
    width: 335,
    title: '十六进制数据',
    dataKey: 'hexArr',
    style: {padding: 0},
    headerCellRenderer: () => h(ElSpace, {
      size: [8, 0]
    }, () => ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'].map((hexStr: string, index: number) => h('span', {
      style: {width: '12px', textAlign: 'center', marginRight: index === 7 ? '4px' : 0}
    }, hexStr))),
    cellRenderer: ({cellData: hexArr}) => h(ElSpace, {
      size: [12, 0]
    }, () => hexArr.map((hex: string) => h(ElText, {
      size: 'small',
      style: "font-family: Consolas, Menlo, Monaco, 'Lucida Console', 'Liberation Mono', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Courier New', monospace, serif;"
    }, () => hex)))
  }, {
    key: 'ascii',
    width: 119,
    title: 'ASCII',
    dataKey: 'asciiArr',
    align: TableV2Alignment.CENTER,
    style: {padding: 0},
    cellRenderer: ({cellData: asciiArr}) => h(ElSpace, {
      size: [4, 0],
    }, () => asciiArr.map((ascii: string) => h(ElText, {
      size: 'small',
      style: "user-select: none; font-family: Consolas, Menlo, Monaco, 'Lucida Console', 'Liberation Mono', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Courier New', monospace, serif;width: 55px; text-align: left;"
    }, () => ascii)))
  }
]

watch(() => binTabIndex.value, async (value) => {
  if (value === 'handle_bin') {
    await nextTick()
    if (headerTableRef.value) {
      const tbodyEl = headerTableRef.value.$el.querySelector('tbody');
      // 挂载拖动el节点
      useDraggable(tbodyEl, handleBinForm.fileHeaders as any, {animation: 150, handle: '.header-sort-btn'})
    }
    if (footerTableRef.value) {
      const tbodyEl = footerTableRef.value.$el.querySelector('tbody');
      // 挂载拖动el节点
      useDraggable(tbodyEl, handleBinForm.fileFooters as any, {animation: 150, handle: '.footer-sort-btn'})
    }
  }
})
</script>

<template>
  <div class="converter-container">
    <el-radio-group v-model="binTabIndex">
      <el-radio-button value="arr_to_bin">数组转二进制文件</el-radio-button>
      <el-radio-button value="handle_bin">二进制文件处理</el-radio-button>
    </el-radio-group>
    <template v-if="binTabIndex === 'arr_to_bin'">
      <el-form style="margin-top: 10px;" :disabled="processing" :model="form" label-width="120px">
        <el-row>
          <!--        <el-col :span="12">
                    <el-form-item label="转换类型">
                      <el-radio-group v-model="form.type">
                        <el-radio :value="0">图像数组的C源文件</el-radio>
                        <el-radio :value="1">图片</el-radio>
                      </el-radio-group>
                    </el-form-item>
                  </el-col>-->
          <el-col :span="12">
            <el-form-item label="输入文件夹">
              <div style="display: inline-flex;align-items: center;width: 100%;">
                <el-input v-model="form.inputDir"
                          :placeholder="'请选择需要转换的'+(form.type === 0 ? '数组' : '图片') +'所在目录'" readonly>
                  <template #append>
                    <el-button @click="selectInputDir">选择目录</el-button>
                  </template>
                </el-input>
                <el-button @click="openDir(form.inputDir)" v-if="form.inputDir" type="primary"
                           style="margin-left: 5px;">前往
                </el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="输出文件夹">
              <div style="display: inline-flex;align-items: center;width: 100%;">
                <el-input v-model="form.outputDir" placeholder="请选择转换后的文件保存的目录" readonly>
                  <template #append>
                    <el-button @click="selectOutputDir">选择目录</el-button>
                  </template>
                </el-input>
                <el-button @click="openDir(form.outputDir)" v-if="form.outputDir" type="primary"
                           style="margin-left: 5px;">前往
                </el-button>
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="6">
            <el-form-item label="合并文件名称">
              <el-input v-model="form.mergedFileName" placeholder="输入合并文件名称"/>
            </el-form-item>
          </el-col>
          <el-col :span="5">
            <el-form-item label="显示RLE信息">
              <el-switch v-model="form.showRLE"/>
            </el-form-item>
          </el-col>
          <el-col :span="5">
            <el-form-item label="生成枚举映射">
              <el-switch v-model="form.isEnumMapping"/>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <div class="action-buttons">
              <el-button
                  type="primary"
                  :icon="MagicStick"
                  :loading="processing"
                  @click="processFiles"
              >
                开始处理
              </el-button>
              <el-button :icon="Refresh" @click="reset">重置</el-button>
            </div>
          </el-col>
        </el-row>
      </el-form>
      <el-divider content-position="left">处理结果</el-divider>

      <div v-if="results.length > 0" class="results-container">
        <el-table :data="results" stripe style="width: 100%" height="calc(100% - 108px)">
          <el-table-column type="index" label="序号" width="60"/>
          <el-table-column prop="fileName" label="文件名" min-width="100">
            <template #default="{row:{fileName, fileBase64}}">
              <div style="display: flex; align-items: center;">
                <el-image style="height: 50px; width: auto;margin-right: 5px;" fit="contain" preview-teleported
                          :preview-src-list="[fileBase64]" :src="fileBase64"/>
                <el-text :line-clamp="2">{{ fileName }}</el-text>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.success ? 'success' : 'danger'">
                {{ row.success ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="width" label="宽度" width="80"/>
          <el-table-column prop="height" label="高度" width="80"/>
          <el-table-column prop="size" label="大小" min-width="130">
            <template #default="{ row }">
              <div style="display: inline-flex;align-items: center;">
                <el-text>{{ row.size ? row.size + ' Bytes' : '-' }}</el-text>
                <el-tag style="margin-left: 5px;" v-if="row.size && row.size > 1024">{{ formatSize(row.size) }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="offset" label="地址偏移量" min-width="120">
            <template #default="{ row: { offset } }">
              <div style="display: inline-flex;align-items: center;gap: 5px;font-family: Consolas,serif;">
                <el-tag v-if="offset !== undefined" type="info" style="color:#800080;font-size: 0.9rem;">
                  {{ toHexStr(offset, 8) }}
                </el-tag>
                <el-text style="font-size: 0.9rem;">{{ offset }}</el-text>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="信息" min-width="130"/>
        </el-table>

        <el-card v-if="generatedFiles.length > 0" body-style="padding: 0 20px;" class="generated-files">
          <template #header>
            <div style="display: inline-flex;align-items: center; gap: 10px;">
              <span>生成的文件</span>
              <el-tag>{{ form.outputDir }}</el-tag>
              <el-button @click="openDir(form.outputDir)" v-if="form.outputDir" type="primary"
                         size="small" style="margin-left: 5px;">前往
              </el-button>
            </div>
          </template>
          <ul>
            <li v-for="(file, index) in generatedFiles" :key="index">
              <div style="display: inline-flex;align-items: center;gap: 10px;">
                <el-icon>
                  <Document/>
                </el-icon>
                <el-text size="large" line-clamp="1">{{ file.name }}</el-text>
                <el-text style="color:#888888;" size="small">{{ file.desc }}</el-text>
              </div>
              <div style="display: inline-flex;align-items: center;">
                <el-text size="small" class="file-size">{{ file.size + ' Bytes' }}</el-text>
                <el-tag style="margin-left: 5px;" v-if="file.size && file.size > 1024">{{
                    formatSize(file.size)
                  }}
                </el-tag>
              </div>
              <el-text>{{ formatDate(file.createTime) }}</el-text>
            </li>
          </ul>
        </el-card>
      </div>
      <el-empty v-loading="processing" v-else description="暂无处理结果"/>
    </template>
    <template v-else-if="binTabIndex === 'handle_bin'">
      <div style="height: calc(100% - 83px); display: flex; justify-content: space-between;">
        <div style="height: calc(100% - 50px); width: calc(100% - 508px);">
          <el-form>
            <el-row style="height: 50px; line-height: 50px; display: flex; align-items: center;">
              <el-col :span="24">
                <el-form-item label="选择文件" style="margin-bottom: 0;padding-bottom: 0;">
                  <el-input :title="handleBinForm.filePath" readonly placeholder="请选择需要处理的文件"
                            v-model="handleBinForm.filePath">
                    <template #append>
                      <el-button @click="selectSendFile">选择文件</el-button>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <el-scrollbar height="calc(100%)">
            <el-form :model="handleBinForm">
              <template v-if="handleBinForm.fileList.length > 0">
                <el-form-item label="合并文件列表拖动改变合并顺序" label-position="top" style="margin-bottom: 0;">
                  <div
                      style="border: var(--el-border); border-radius: var(--el-border-radius-base); padding: 10px;width: 100%;line-height: normal;">
                    <VueDraggable :animation="150" v-model="handleBinForm.fileList" :on-sort="fileDraggableSortChange">
                      <div
                          style="background-color: var(--el-bg-color-page);border-radius: var(--el-border-radius-base);"
                          v-for="(item, index) in handleBinForm.fileList" :key="item.originalName">
                        <el-row style="height: 35px;display: flex; align-items: center;">
                          <el-col :span="8" style="display: flex; align-items: center;">
                            <el-tag round effect="dark" type="warning" style="margin-left: 10px;">{{
                                index + 1
                              }}
                            </el-tag>
                            <el-text style="margin-left: 5px;" truncated :title="item.name">{{ item.name }}</el-text>
                          </el-col>
                          <el-col :span="8">
                            <el-text size="small" style="vertical-align: baseline;margin-right: 5px;">地址偏移量
                            </el-text>
                            <el-text style="user-select: all;vertical-align: middle;" title="地址偏移量"
                                     class="code-font-family"
                                     type="primary" truncated>{{ fileOffsetHex(index) }}
                            </el-text>
                          </el-col>
                          <el-col :span="8" style="display: flex; justify-content: flex-end;align-items: center;">
                            <div style="display: flex; align-items: center; justify-content: space-between;flex: 1;">
                              <div>
                                <el-text style="user-select: all;">{{ item.size }}</el-text>
                                <el-text> byte</el-text>
                              </div>
                              <el-text type="success" truncated>{{ formatSize(item.size) }}</el-text>
                            </div>
                            <el-icon @click="viewFileContent(index)" style="margin: 0 10px;cursor: pointer;"
                                     :color="handleBinForm.selectFileIndex === index ? 'var(--el-color-primary)' : ''"
                                     :size="16" title="预览文件内容">
                              <ScaleToOriginal/>
                            </el-icon>
                            <el-icon @click="removeItemFile(index)" style="margin-right: 5px;cursor: pointer;"
                                     color="var(--el-color-danger)" title="移除当前文件" :size="16">
                              <CircleCloseFilled/>
                            </el-icon>
                          </el-col>
                        </el-row>
                        <div style="margin: 5px 0;" v-if="handleBinForm.fileList.length - 1 > index"/>
                      </div>
                    </VueDraggable>
                  </div>
                </el-form-item>
                <el-form-item label="CRC32" style="margin-bottom: 0;">
                  <div style="display: flex; align-items: center; flex-wrap: wrap;"
                       v-for="(item, index) in handleBinForm.fileList" :key="item.originalName">
                    <el-tag size="small" type="warning" effect="dark" round>{{ index + 1 }}</el-tag>
                    <el-text v-if="item.crc32Hex" class="code-font-family" style="margin-left: 10px;">0x{{
                        item.crc32Hex
                      }}
                    </el-text>
                    <el-button @click="crc32ViewHandler(item)" v-else type="text" text style="margin-left: 10px;">
                      点击查看
                    </el-button>
                    <el-divider v-if="index < handleBinForm.fileList.length - 1" direction="vertical"/>
                  </div>
                </el-form-item>
                <el-form-item label="合并后文件大小">
                  <el-text>{{ sumFileSize }} byte</el-text>
                  <el-text style="margin-left: 20px;" type="success">{{ formatSize(sumFileSize) }}</el-text>
                </el-form-item>
                <el-form-item label="附加后的文件大小">
                  <el-text>{{ sumFileSize + handleBinForm.fileHeaderSize + handleBinForm.fileFooterSize }} byte
                  </el-text>
                  <el-text style="margin-left: 20px;" type="success">{{ formatSize(sumFileSize) }}</el-text>
                </el-form-item>
              </template>
              <el-row>
                <el-col :span="24">
                  <el-form-item label="添加到文件开头" label-position="top">
                    <div
                        style="border-radius: var(--el-border-radius-base); border: var(--el-border); padding: 10px;width: 100%;">
                      <el-table ref="headerTableRef" size="small" :data="handleBinForm.fileHeaders"
                                style="width: 100%;" stripe :row-key="row => row.key" show-summary
                                :summary-method="getSummaries">
                        <el-table-column type="index" label="序号" width="40"/>
                        <el-table-column label="附加内容" min-width="85">
                          <template #default="{row}">
                            <el-input size="small" v-model="row.value"
                                      @input="(value) => handleBinItemInputChange(value, row)"/>
                          </template>
                        </el-table-column>
                        <el-table-column label="备注">
                          <template #default="{row}">
                            <el-input size="small" v-model="row.remark"/>
                          </template>
                        </el-table-column>
                        <el-table-column label="类型" width="90">
                          <template #default="{row}">
                            <el-select size="small" v-model="row.type"
                                       @change="() => row.viewValue = convertToByte(row.value, row.type, row.viewType, row.byteLength)">
                              <el-option v-for="(item, index) in valueTypeOptions" :key="index" :value="item.value"
                                         :label="item.label"/>
                            </el-select>
                          </template>
                        </el-table-column>
                        <el-table-column width="90">
                          <template #header>
                            <div style="display: flex;align-items: center;">
                              <el-tooltip effect="light" content="数据字节(byte)长度不足时会补0">
                                <el-icon style="cursor: pointer;" :size="13">
                                  <QuestionFilled/>
                                </el-icon>
                              </el-tooltip>
                              <span>长度</span>
                            </div>
                          </template>
                          <template #default="{row}">
                            <el-input style="width: 60px;" size="small" type="number" v-model="row.byteLength"/>
                          </template>
                        </el-table-column>
                        <el-table-column label="操作" width="80" align="right">
                          <template #header>
                            <el-button size="small" @click="handleBinItemAdd(handleBinForm.fileHeaders)" :icon="Plus">
                              新增
                            </el-button>
                          </template>
                          <template #default="{row, $index}">
                            <div style="display: flex; align-items: center;justify-content: flex-end;">
                              <el-button size="small" @click="handleBinItemDel(handleBinForm.fileHeaders, $index)"
                                         title="删除" circle
                                         type="danger" :icon="DeleteFilled"/>
                              <el-button class="header-sort-btn" title="拖动调整排序" style="padding: 0 6px;"
                                         type="info" size="small" :icon="Sort"/>
                            </div>
                            <!--                                <el-button v-if="handleBinForm.fileHeaders.length > 1 && $index !== 0"
                                                                       title="向上移动位置"
                                                                       type="primary" :icon="Top"
                                                                       @click="handleBinItemSwap(handleBinForm.fileHeaders, $index, $index - 1)"/>
                                                            <el-button
                                                                v-if="handleBinForm.fileHeaders.length > 1 && $index !== handleBinForm.fileHeaders.length - 1"
                                                                title="向下移动位置" type="primary" :icon="Bottom"
                                                                @click="handleBinItemSwap(handleBinForm.fileHeaders, $index, $index + 1)"/>-->
                          </template>
                        </el-table-column>
                      </el-table>
                    </div>
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item :label="'文件头字节预览' + ' 当前数据长度 ' + handleBinForm.fileHeaderSize + ' byte'"
                                label-position="top">
                    <div v-if="sumHeaderViewValue !== ''" style="display: flex; align-items: center;">
                      <el-radio-group size="small" v-model="handleBinForm.headerViewType" style="width: 60px;">
                        <el-radio value="hex">HEX</el-radio>
                        <el-radio value="dec">DEC</el-radio>
                      </el-radio-group>
                      <el-space wrap :size="3"
                                style="font-family: Consolas, Menlo, Monaco, 'Lucida Console', 'Liberation Mono', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Courier New', monospace, serif;">
                        <el-space
                            v-for="item in splitBytes(sumHeaderViewValue?.split(' '),handleBinForm.fileHeaders.map(m=> m.byteLength))"
                            style="margin-right: 12px;"
                            :size="3">
                          <el-tag v-for="(value, index) in item" size="small"
                                  :key="index" :type="handleBinForm.headerViewType === 'hex' ? 'primary' : 'info'"
                                  effect="dark"
                                  :style="{padding: 0, width: handleBinForm.headerViewType === 'hex' ? '21px' : '25px'}">
                            {{ value }}
                          </el-tag>
                        </el-space>
                      </el-space>
                    </div>
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item label="添加到文件末尾" label-position="top">
                    <div
                        style="border-radius: var(--el-border-radius-base); border: var(--el-border); padding: 10px;width: 100%;">
                      <el-table ref="footerTableRef" size="small" :data="handleBinForm.fileFooters"
                                style="width: 100%;" stripe :row-key="row => row.key" show-summary
                                :summary-method="getSummaries">
                        <el-table-column type="index" label="序号" width="40"/>
                        <el-table-column label="附加内容" min-width="85">
                          <template #default="{row}">
                            <el-input size="small" v-model="row.value"
                                      @input="(value) => handleBinItemInputChange(value, row)"/>
                          </template>
                        </el-table-column>
                        <el-table-column label="备注">
                          <template #default="{row}">
                            <el-input size="small" v-model="row.remark"/>
                          </template>
                        </el-table-column>
                        <el-table-column label="类型" width="90">
                          <template #default="{row}">
                            <el-select size="small" v-model="row.type"
                                       @change="() => row.viewValue = convertToByte(row.value, row.type, row.viewType, row.byteLength)">
                              <el-option v-for="(item, index) in valueTypeOptions" :key="index" :value="item.value"
                                         :label="item.label"/>
                            </el-select>
                          </template>
                        </el-table-column>
                        <el-table-column width="90">
                          <template #header>
                            <div style="display: flex;align-items: center;">
                              <el-tooltip effect="light" content="数据字节(byte)长度不足时会补0">
                                <el-icon style="cursor: pointer;" :size="13">
                                  <QuestionFilled/>
                                </el-icon>
                              </el-tooltip>
                              <span>长度</span>
                            </div>
                          </template>
                          <template #default="{row}">
                            <el-input style="width: 60px;" size="small" type="number" v-model="row.byteLength"/>
                          </template>
                        </el-table-column>
                        <el-table-column label="操作" width="80" align="right">
                          <template #header>
                            <el-button size="small" @click="handleBinItemAdd(handleBinForm.fileFooters)" :icon="Plus">
                              新增
                            </el-button>
                          </template>
                          <template #default="{row, $index}">
                            <div style="display: flex; align-items: center;justify-content: flex-end;">
                              <el-button size="small" @click="handleBinItemDel(handleBinForm.fileFooters, $index)"
                                         title="删除" circle
                                         type="danger" :icon="DeleteFilled"/>
                              <el-button class="footer-sort-btn" title="拖动调整排序" style="padding: 0 6px;"
                                         type="info" size="small" :icon="Sort"/>
                            </div>
                            <!--                                <el-button v-if="handleBinForm.fileFooters.length > 1 && $index !== 0"
                                                                       title="向上移动位置"
                                                                       type="primary" :icon="Top"
                                                                       @click="handleBinItemSwap(handleBinForm.fileFooters, $index, $index - 1)"/>
                                                            <el-button
                                                                v-if="handleBinForm.fileFooters.length > 1 && $index !== handleBinForm.fileFooters.length - 1"
                                                                title="向下移动位置" type="primary" :icon="Bottom"
                                                                @click="handleBinItemSwap(handleBinForm.fileFooters, $index, $index + 1)"/>-->
                          </template>
                        </el-table-column>
                      </el-table>
                    </div>
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item :label="'文件尾字节预览' + ' 当前数据长度 ' + handleBinForm.fileFooterSize + ' byte'"
                                label-position="top">
                    <div v-if="sumFooterViewValue !== ''" style="display: flex; align-items: center;">
                      <el-radio-group size="small" v-model="handleBinForm.footerViewType" style="width: 60px;">
                        <el-radio value="hex">HEX</el-radio>
                        <el-radio value="dec">DEC</el-radio>
                      </el-radio-group>
                      <el-space wrap :size="3"
                                style="font-family: Consolas, Menlo, Monaco, 'Lucida Console', 'Liberation Mono', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Courier New', monospace, serif;">
                        <el-space
                            v-for="item in splitBytes(sumFooterViewValue?.split(' '),handleBinForm.fileFooters.map(m=> m.byteLength))"
                            style="margin-right: 12px;"
                            :size="3">
                          <el-tag v-for="(value, index) in item" size="small"
                                  :key="index" :type="handleBinForm.footerViewType === 'hex' ? 'primary' : 'info'"
                                  effect="dark"
                                  :style="{padding: 0, width: handleBinForm.footerViewType === 'hex' ? '21px' : '25px'}">
                            {{ value }}
                          </el-tag>
                        </el-space>
                      </el-space>
                    </div>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </el-scrollbar>
        </div>
        <div style="height: 100%; width: 508px; padding-bottom: 10px;">
          <el-button-group style="margin: 9px 10px 0 10px;">
            <el-button @click="saveBinFoFile" type="primary" :icon="Edit">保存到文件</el-button>
            <el-button @click="closeAllFile" :icon="CloseBold">关闭文件</el-button>
          </el-button-group>
          <div style="height: calc(100% - 41px); width: 508px;">
            <el-auto-resizer>
              <template #default="{height, width}">
                <el-table-v2 :columns="hexViewColumns" :data="handleBinForm.fileHexViewArr" :width="width"
                             :height="height" :row-height="18" :header-height="30" style="margin-left: 7px;">
                  <template v-if="handleBinForm.loading" #overlay>
                    <div class="el-loading-mask"
                         style="display: flex; align-items: center; justify-content: center">
                      <el-icon class="is-loading" color="var(--el-color-primary)" :size="26">
                        <Loading/>
                      </el-icon>
                    </div>
                  </template>
                  <template #empty>
                    <el-empty description="选择文件后才能查看"/>
                  </template>
                </el-table-v2>
              </template>
            </el-auto-resizer>
          </div>
        </div>
      </div>
      <el-card body-style="padding: 0 20px;" style="z-index: 1000;position: relative;">
        <el-descriptions style="margin: 6px 0;">
          <el-descriptions-item label="当前查看文件">
            <el-tag v-if="handleBinForm.selectFileIndex >= 0" style="vertical-align: baseline;" size="small"
                    type="warning" effect="dark" round>
              {{ handleBinForm.selectFileIndex + 1 }}
            </el-tag>
            <el-text style="margin-left: 5px;">{{
                handleBinForm.fileList[handleBinForm.selectFileIndex]?.name
              }}
            </el-text>
          </el-descriptions-item>
          <el-descriptions-item label="CRC32">
            <el-text v-if="bottomBinInfo.crc32Hex" class="code-font-family">0x{{ bottomBinInfo.crc32Hex }}</el-text>
          </el-descriptions-item>
          <el-descriptions-item label="文件大小">{{ bottomBinInfo.srcFileSize + ' byte' }}
            <el-tag style="vertical-align: baseline;" type="success">{{ formatSize(bottomBinInfo.srcFileSize) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.converter-container {
  padding: 10px 20px 0 20px;
  min-width: 1100px;
  margin: 0 auto;
  background-color: #ffffff;
  height: 100%;
  position: relative;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.results-container {
  margin-top: 20px;
  padding-bottom: 10px;
  position: relative;
  height: calc(100% - 211px);
}

.generated-files ul {
  list-style-type: none;
  padding: 0;
}

.generated-files li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.generated-files :last-child {
  border-bottom: none;
}

.header-sort-btn, .footer-sort-btn {
  cursor: move;
}

.file-size {
  color: #888;
  font-size: 0.9em;
}

.code-font-family {
  font-family: Consolas, Menlo, Monaco, 'Lucida Console', 'Liberation Mono', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Courier New', monospace, serif;
}

:deep(.el-card__header) {
  padding: 10px 20px;
}

:deep(.el-descriptions__body .el-descriptions__table:not(.is-bordered) .el-descriptions__cell) {
  padding-bottom: 0;
}
</style>