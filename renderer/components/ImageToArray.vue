<script setup lang="ts">
import {computed, reactive, ref, watch} from 'vue';
import {ElMessage} from 'element-plus';
import * as path from 'path-browserify';
import {MagicStick, Refresh} from "@element-plus/icons-vue";

/*图片转数组*/
defineOptions({name: 'ImageToArray'});

interface ConversionResult {
  // 文件名
  fileName: string;
  // 原始文件名
  originalFileName: string;
  // 图片base64数据
  fileBase64: string;
  // 图片宽度
  width: number;
  // 图片高度
  height: number;
  // 图片原始大小
  originalSize: number;
  // 图片压缩后的大小
  rleSize: number;
  arrayData: Uint16Array<ArrayBuffer> | Buffer<ArrayBuffer>;
  // 图片压缩率
  compressionRatio: number;
  status: 'pending' | 'processing' | 'success' | 'error';
}

const {activeIndex} = defineProps<{ activeIndex: string }>();

const localInputDir = localStorage.getItem('inputDir1') || ''
const localOutputDir = localStorage.getItem('outputDir1') || ''
const form = reactive({
  inputDir: localInputDir,
  outputDir: localOutputDir,
  // 是否开启RLE编码
  isRLE: false,
  // 是否开启数组分割
  isArrayChunk: false,
  // 数组分割大小
  arrayChunkSize: 24,
  // 是否小端序
  littleEndian: true,
  // 颜色编码类型
  colorCodedType: 'RGB565'
});
// 是否处理中
const isProcessing = ref(false);
const totalCount = ref(0);
const currentCount = ref(0);
const overallProgress = ref(0);
const fileProgress = ref(0);
const activeFile = ref('');
const results = ref<ConversionResult[]>([]);
// 缓存结果 实时渲染引起性能问题
let resultsNotRef = []

// 监听颜色编码类型变化
watch(() => form.colorCodedType, (value) => {
  if (value === 'RGB888') {
    form.isRLE = false;
  }
})

/*watch(() => activeIndex, async (value) => {
  if (form.inputDir && value === '2' && results.value.length == 0) {
    isProcessing.value = true;
    await updateFileList();
    isProcessing.value = false;
  }
})*/

const progressStatus = computed(() => {
  if (overallProgress.value === 100) return 'success';
  return isProcessing.value ? undefined : 'warning';
});

const totalCompressionRatio = computed(() => {
  if (results.value.length === 0) return 0;

  const totalOriginal = results.value
      .filter(r => r.status === 'success')
      .reduce((sum, r) => sum + r.originalSize, 0);

  const totalRle = results.value
      .filter(r => r.status === 'success')
      .reduce((sum, r) => sum + r.rleSize, 0);

  return totalOriginal > 0 ? (totalRle / totalOriginal * 100) : 0;
});
// 节省空间大小
const totalSaved = computed(() => {
  return results.value
      .filter(r => r.status === 'success')
      .reduce((sum, r) => sum + (r.originalSize - r.rleSize), 0);
});

// 图片原始大小总占用空间
const totalSize = computed(() => {
  return results.value.filter(r => r.status === 'success')
      .reduce((sum, r) => sum + r.originalSize, 0);
})

// 压缩后大小
const totalCompressionSize = computed(() => {
  return results.value.filter(r => r.status === 'success')
      .reduce((sum, r) => sum + r.rleSize, 0);
})
/**
 * 更新目录文件列表
 */
const updateFileList = async (): Promise<void> => {
  // 获取输入目录中的所有图像文件
  // 注意：这里需要主进程提供文件列表
  return new Promise((resolve, reject) => {
    window.electronAPI.getDirectoryFiles(form.inputDir).then(({data: files}) => {
      // 筛选图像文件并同时初始化结果数组
      const [imageFiles, resultFiles] = files.reduce(([imageFilesAcc, resultsAcc], file) => {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.bmp'].includes(ext)) {
          imageFilesAcc.push(file);
          resultsAcc.push({
            fileName: path.basename(file, path.extname(file)),
            originalFileName: path.basename(file),
            fileBase64: '',
            width: 0,
            height: 0,
            originalSize: 0,
            rleSize: 0,
            arrayData: null,
            compressionRatio: 0,
            status: 'pending'
          });
        }
        return [imageFilesAcc, resultsAcc];
      }, [[], []]);
      // 更新总图像文件数量
      totalCount.value = imageFiles.length;

      if (imageFiles.length === 0) {
        results.value = [];
        ElMessage.warning('输入目录中没有找到支持的图像文件');
        isProcessing.value = false;
        return;
      }

      // 更新结果数组
      resultsNotRef = resultFiles;
      resolve();
    }).catch((error) => {
      reject(error);
    });
  })
}

const selectInputDir = async () => {
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择输入文件夹');
  if (success) form.inputDir = selectedPath
};

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
// 格式化数据大小单位
const formatBytes = (bytes: number): { value: number, suffix: string, fullValue: string } => {
  if (bytes === 0) return {value: 0, suffix: 'Bytes', fullValue: '0 Bytes'};
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  const suffix = sizes[i];
  return {value, suffix, fullValue: value + suffix};
};

const reset = () => {
  form.inputDir = '';
  form.outputDir = '';
  form.isRLE = false;
  form.littleEndian = true;
  form.colorCodedType = 'RGB565';
  form.isArrayChunk = false;
  form.arrayChunkSize = 24;
  results.value = [];
  overallProgress.value = 0;
  fileProgress.value = 0;
  activeFile.value = '';
  localStorage.removeItem('inputDir1');
  localStorage.removeItem('outputDir1');
};

/**
 * 转换图片成数组
 * @param file 图片文件信息
 * @param resultIndex 当前索引
 */
const handleFileConversion = async (file: ConversionResult, resultIndex: number): Promise<boolean> => {
  resultsNotRef[resultIndex].status = 'processing';
  activeFile.value = file.originalFileName;
  fileProgress.value = 0;
  try {
    const {success, result, error} = await window.electronAPI.convertImage({
      inputPath: path.join(form.inputDir, file.originalFileName),
      outputDir: form.outputDir,
      isRLE: form.isRLE,
      littleEndian: form.littleEndian,
      colorCodedType: form.colorCodedType
    });

    if (success) {
      resultsNotRef[resultIndex] = {
        ...result,
        status: 'success'
      };
      return true;
    } else {
      throw new Error(error);
    }
  } catch (error) {
    resultsNotRef[resultIndex].status = 'error';
    ElMessage.error(`文件 ${file} 转换失败: ${error.message}`);
    return false;
  }
}

const startConversion = async () => {
  if (!form.inputDir || !form.outputDir) {
    ElMessage.error('请选择输入和输出目录');
    return;
  }

  try {
    isProcessing.value = true;
    overallProgress.value = 0;

    await updateFileList();
    let successCount = 0;
    for (const file of resultsNotRef) {
      const resultIndex = resultsNotRef.indexOf(file);
      const resStatus = await handleFileConversion(file, resultIndex)
      if (resStatus) {
        successCount += 1;
        overallProgress.value = Math.round(((resultIndex + 1) / resultsNotRef.length) * 100);
        currentCount.value = resultIndex + 1
      }
    }
    // 生成主文件
    if (successCount > 0) {
      const imagesForMaster = []
      for (const r of resultsNotRef) {
        if (r.status === 'success') {
          imagesForMaster.push({
            fileName: r.fileName,
            width: r.width,
            height: r.height,
            isRLE: form.isRLE,
            littleEndian: form.littleEndian,
            colorCodedType: form.colorCodedType,
            rleSize: r.rleSize,
            arrayData: r.arrayData
          });
        }
      }
      const {success, error} = await window.electronAPI.generateMasterFile(
          form.outputDir,
          imagesForMaster,
          form.isArrayChunk,
          form.arrayChunkSize
      );

      if (success) {
        results.value = resultsNotRef
        ElMessage.success(`转换完成！成功转换 ${successCount} 张图像`);
      } else {
        ElMessage.error(`生成总文件失败: ${error}`);
      }
    }

    localStorage.setItem('inputDir1', form.inputDir);
    localStorage.setItem('outputDir1', form.outputDir);

  } catch (error: any) {
    ElMessage.error(`转换过程中出错: ${error.message}`);
  } finally {
    isProcessing.value = false;
    activeFile.value = '';
    fileProgress.value = 0;
  }
};

</script>

<template>
  <div style="padding: 10px;background-color: #ffffff;">
    <el-form :model="form" :disabled="isProcessing" label-width="120px">
      <el-row>
        <el-col :span="12">
          <el-form-item label="输入文件夹">
            <div style="display: inline-flex;align-items: center;width: 100%;">
              <el-input v-model="form.inputDir" placeholder="请选择需要转换的图片所在目录" readonly>
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
              <el-input v-model="form.outputDir" readonly placeholder="请选择转换后的文件保存的目录">
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
        <el-col :span="8">
          <el-form-item label="颜色编码类型">
            <el-radio-group v-model="form.colorCodedType">
              <el-radio value="RGB565">RGB565</el-radio>
              <el-radio value="RGB888">RGB888</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="开启RLE编码">
            <el-switch @change="val => results = []" :disabled="form.colorCodedType === 'RGB888'" v-model="form.isRLE" active-color="primary"/>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item v-if="form.colorCodedType === 'RGB565'" label="字节序">
            <el-radio-group v-model="form.littleEndian">
              <el-radio :value="true">小端序</el-radio>
              <el-radio :value="false">大端序</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="10">
          <el-form-item label="开启总数组分割">
            <div style="display: inline-flex;align-items: center;width: 100%; gap: 10px;">
              <el-switch v-model="form.isArrayChunk" active-color="primary"/>
              <el-input-number v-if="form.isArrayChunk" v-model="form.arrayChunkSize">
                <template #suffix>
                  <span>KB</span>
                </template>
              </el-input-number>
            </div>
          </el-form-item>
        </el-col>
        <el-col :span="14" style="display: flex;justify-content: right;">
          <el-form-item>
            <el-button
                :icon="MagicStick"
                type="primary"
                @click="startConversion"
                :disabled="isProcessing"
            >
              开始转换
            </el-button>
            <el-button :icon="Refresh" @click="reset">重置</el-button>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <el-divider content-position="left">转换进度</el-divider>
    <el-row>
      <el-col :span="8">
        <template v-if="activeFile">
          <el-text>当前处理:</el-text>
          <el-text size="small" class="current-file">
            {{ activeFile }}
          </el-text>
        </template>
        <div style="display: flex; align-content: center;" v-else>
          <el-tag v-if="progressStatus === 'success'" effect="dark" type="success" style="margin-right: 10px;">
            处理完成
          </el-tag>
        </div>
      </el-col>
      <el-col style="text-align: right;" :span="8">
        <el-text>{{ currentCount + '/' + totalCount }}</el-text>
      </el-col>
      <el-col :offset="1" :span="7">

      </el-col>
    </el-row>

    <el-table
        :data="results"
        height="calc(100vh - 442px)"
        class="result-table" v-loading="isProcessing"
    >
      <el-table-column type="index" width="55" label="序号"/>
      <el-table-column prop="fileName" label="文件名" min-width="180">
        <template #default="{row}">
          <div style="display: flex; align-items: center;">
            <el-image v-if="row.fileBase64" style="height: 50px; width: auto;margin-right: 5px;" fit="contain"
                      preview-teleported
                      :preview-src-list="[row.fileBase64]" :src="row.fileBase64"/>
            <el-text :line-clamp="2">{{ row.originalFileName }}</el-text>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="尺寸" min-width="120"
                       :formatter="row => row.width == 0 && row.height == 0 ? '-': row.width + '×' + row.height"/>
      <el-table-column prop="originalSize" label="原始大小" min-width="120">
        <template #default="{ row }">
          <el-tag size="small" style="margin-right: 5px;">{{ row.originalSize + 'Bytes' }}</el-tag>
          <el-tag size="small" type="info">{{ formatBytes(row.originalSize).fullValue }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="rleSize" label="字节数组大小" min-width="120">
        <template #default="{ row }">
          <el-tag size="small" style="margin-right: 5px;">{{ row.rleSize + 'Bytes' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="form.isRLE" label="压缩率" width="120">
        <template #default="{ row }">
          <el-tag :type="row.compressionRatio < 70 ? 'success' : 'warning'">
            {{ row.compressionRatio.toFixed(1) }}%
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'success'" type="success">成功</el-tag>
          <el-tag v-else-if="row.status === 'error'" type="danger">失败</el-tag>
          <el-tag v-else type="info">等待</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <div class="summary mt-2">
      <el-row :gutter="20">
        <el-col :span="4">
          <el-statistic title="总文件数" :value="results.length"/>
        </el-col>
        <el-col :offset="1" :span="4">
          <el-statistic title="总大小" :value="formatBytes(totalSize).value">
            <template #suffix>{{ formatBytes(totalSize).suffix }}</template>
          </el-statistic>
        </el-col>
        <el-col :offset="1" :span="4">
          <el-statistic title="数组总大小" :value="formatBytes(totalCompressionSize).value">
            <template #suffix>{{ formatBytes(totalCompressionSize).suffix }}</template>
          </el-statistic>
        </el-col>
        <template v-if="form.isRLE">
          <el-col :offset="1" :span="4">
            <el-statistic title="总压缩率" :value="totalCompressionRatio">
              <template #suffix>%</template>
            </el-statistic>
          </el-col>
          <el-col :offset="1" :span="4">
            <el-statistic title="节省空间" :value="formatBytes(totalSaved).value">
              <template #suffix>{{ formatBytes(totalSaved).suffix }}</template>
            </el-statistic>
          </el-col>
        </template>
      </el-row>
    </div>
  </div>
</template>

<style scoped>

.mt-2 {
  margin-top: 8px;
}

.current-file {
  background-color: #f5f7fa;
  padding: 4px 8px;
  border-radius: 4px;
}

.result-table {
  margin-top: 20px;
  border-radius: 8px;
  overflow: hidden;
}

.summary {
  background-color: #f9fafc;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}
</style>