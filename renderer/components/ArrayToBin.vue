<script setup lang="ts">
import {reactive, ref} from "vue";
import {ElMessage} from "element-plus";
import {Document, MagicStick, Refresh} from "@element-plus/icons-vue";
import * as path from "path-browserify";
import {formatDate} from "./../util/dataUtil";
import {formatSize} from "@/util/convertUtil";

const imageToArrayOutputDir = localStorage.getItem("outputDir1") || '';
let localInputDir = localStorage.getItem("inputDir2") || '';
// 判断当前目录为空 并且图片转数组输出目录不为空
if (localInputDir === '' && imageToArrayOutputDir !== '') {
  localInputDir = imageToArrayOutputDir;
}
const localOutputDir = localStorage.getItem("outputDir2") || '';


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

const results = ref([]);
const generatedFiles = ref([]);
const processing = ref(false);


const selectInputDir = async () => {
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择输入文件夹');
  if (success) form.inputDir = selectedPath;
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

</script>

<template>
  <div class="converter-container">
    <el-form :disabled="processing" :model="form" label-width="120px">
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
      <el-table :data="results" stripe style="width: 100%" height="calc(100vh - 408px)">
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
  </div>
</template>

<style scoped>
.converter-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  background-color: #ffffff;
  height: calc(100vh - 101px);
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

.file-size {
  color: #888;
  font-size: 0.9em;
}

:deep(.el-card__header) {
  padding: 10px 20px;
}

</style>