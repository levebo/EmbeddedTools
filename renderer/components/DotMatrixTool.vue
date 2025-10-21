<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from "vue";
// 图标组件
import {DocumentCopy, Download, Edit, Picture, Refresh, View, Warning} from "@element-plus/icons-vue";

/*点阵转换*/
defineOptions({name: 'DotMatrixTool'});

// 响应式数据
const textInput = ref('电子点阵');
const fontSize = ref(30);
const fontFamily = ref('SimHei');
const fontFamilyArray = ref([
  {label: 'Arial', value: 'Arial'},
  {label: 'Verdana', value: 'Verdana'},
  {label: 'Courier New', value: 'Courier New'},
  {label: 'Times New Roman', value: 'Times New Roman'},
  {label: '黑体', value: 'SimHei'},
  {label: '宋体', value: 'SimSun'},
  {label: '楷体', value: 'KaiTi'}
]);

const dotMatrix = ref([]);
const matrixWidth = ref(0);
const matrixHeight = ref(0);
const canvas = ref(null);
const fillPixels = reactive({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
});
const fillDirections = [
  {label: '上', key: 'top'},
  {label: '下', key: 'bottom'},
  {label: '左', key: 'left'},
  {label: '右', key: 'right'}
];
const threshold = ref(150);
const invert = ref(false);
const hoverDot = reactive({x: -1, y: -1});
const dotInfo = reactive({
  visible: false,
  x: 0,
  y: 0,
  dataX: 0,
  dataY: 0,
  active: false
});
const dotSize = ref(8);
const dotSpacing = ref(1);
const activeTab = ref('hex');
const hexOutput = ref('// 十六进制输出将显示在这里');
const binOutput = ref('// 二进制输出将显示在这里');
// 上一次处理类型 默认文字
const lastHandlerType = ref('text');
// 扫描方式
const scanDirection = ref('row_left_right_top_bottom');

const scanStep = ref(0);
const intervalId = ref(null);
// 记录每个单元格的激活状态
const activeCells = ref<boolean[][]>(Array.from({length: 8}, () => Array(8).fill(false)));

// 计算属性
const byteCount = computed(() => {
  if (!dotMatrix.value.length) return 0;
  const width = dotMatrix.value[0].length;
  const height = dotMatrix.value.length;
  // 根据扫描方向计算字节数
  if (scanDirection.value.startsWith('row')) {
    return Math.ceil(width / 8) * height;
  } else {
    return Math.ceil(height / 8) * width;
  }
});

const activeDots = computed(() => {
  if (!dotMatrix.value.length) return 0;
  return dotMatrix.value.flat().filter(dot => dot === 1).length;
});


const dotStyle = computed(() => {
  return {
    width: `${dotSize.value}px`,
    height: `${dotSize.value}px`,
    margin: `${dotSpacing.value}px`
  };
});

// 监听字体变化
watch(() => fontFamily.value, () => {
  if (lastHandlerType.value === 'text') {
    convertText()
  }
})

// 监听字体大小变化
watch(() => fontSize.value, () => {
  if (lastHandlerType.value === 'text') {
    convertText()
  }
})

// 监听边界填充像素变化
watch(() => fillPixels, () => {
  if (lastHandlerType.value === 'text') {
    convertText()
  } else if (lastHandlerType.value === 'img') {
    convertImage()
  }
}, {deep: true})

// 监听虚化采样变化
watch(() => threshold.value, () => {
  if (lastHandlerType.value === 'text') {
    convertText()
  } else if (lastHandlerType.value === 'img') {
    convertImage()
  }
})

// 监听取反
watch(() => invert.value, () => {
  applyEffects()
});

// 监听扫描方向变化
watch(() => scanDirection.value, () => {
  activeCells.value = Array.from({length: 8}, () => Array(8).fill(false));
  startScan(scanDirection.value);
  generateCArray();
})

/**
 * 开始扫描动画
 * @param direction
 */
const startScan = (direction: string) => {
  if (intervalId.value) {
    clearInterval(intervalId.value);
  }
  scanDirection.value = direction;
  scanStep.value = 0;
  intervalId.value = setInterval(() => {
    if (scanStep.value >= 64) {
      clearInterval(intervalId.value);
      return;
    }
    const totalCols = 8;
    const totalRows = 8;
    let currentRow: number, currentCol: number;
    switch (direction) {
      case 'row_left_right_top_bottom':
        currentRow = Math.floor(scanStep.value / totalCols);
        currentCol = scanStep.value % totalCols;
        break;
      case 'col_top_bottom_left_right':
        currentRow = scanStep.value % totalRows;
        currentCol = Math.floor(scanStep.value / totalRows);
        break;
      case 'row_right_left_top_bottom':
        currentRow = Math.floor(scanStep.value / totalCols);
        currentCol = totalCols - 1 - (scanStep.value % totalCols);
        break;
      case 'col_bottom_top_left_right':
        currentRow = totalRows - 1 - (scanStep.value % totalRows);
        currentCol = Math.floor(scanStep.value / totalRows);
        break;
      default:
        return;
    }
    // 新增：标记当前单元格为激活状态
    activeCells.value[currentRow][currentCol] = true;
    scanStep.value++;
  }, 100);
}
/**
 * 是否点亮当前像素
 * @param row
 * @param col
 */
const isCellActive = (row: number, col: number) => {
  return activeCells.value[row - 1][col - 1];
}

const scanActiveDesc = computed(() => {
  switch (scanDirection.value) {
    case 'row_left_right_top_bottom':
      return {title: '行扫描: 左→右, 上→下', desc: '(传统方式，从左到右逐行扫描)'}
    case 'col_top_bottom_left_right':
      return {title: '列扫描: 上→下, 左→右', desc: '(垂直扫描，常用于柱状显示屏)'}
    case 'row_right_left_top_bottom':
      return {title: '行扫描: 右→左, 上→下', desc: '(从右到左逐行扫描)'}
    case 'col_bottom_top_left_right':
      return {title: '列扫描: 下→上, 左→右', desc: '(从底部向上扫描)'}
    default:
      return {title: '', desc: ''}
  }
})

// 初始化画布上下文
let ctx = null;
onMounted(() => {
  // 初始化画布
  const canvasEl = canvas.value;
  ctx = canvasEl.getContext('2d');
  convertText();
})
let image = null;
// 处理文件上传
const handleFileChange = (file) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    image = new Image();
    image.src = <string>e.target.result;

    image.onload = () => {
      convertImage();
    };
  };

  reader.readAsDataURL(file.raw);
};

// 转换图像
const convertImage = () => {
  // 增加额外宽度和高度以容纳图片
  // 使用四个方向的填充值
  const paddingTop = fillPixels.top;
  const paddingRight = fillPixels.right;
  const paddingBottom = fillPixels.bottom;
  const paddingLeft = fillPixels.left;

  const imgWidth = Math.ceil(image.width) + paddingLeft + paddingRight;
  const imgHeight = Math.ceil(image.height) + paddingTop + paddingBottom;

  if (imgWidth <= 0 || imgHeight <= 0) {
    ElMessage.warning('总像素不能小于1')
    return;
  }

  // 设置画布尺寸
  canvas.value.width = imgWidth;
  canvas.value.height = imgHeight;

  // 绘制图片
  ctx.drawImage(image, paddingLeft, paddingTop, image.width, image.height);

  // 处理画布生成点阵
  processCanvas();

  // 改变上一次类型
  lastHandlerType.value = 'img';
}

// 转换文字
const convertText = () => {
  if (!textInput.value.trim()) {
    ElMessage.warning('请输入要转换的文字');
    return;
  }

  const font = `${fontSize.value}px ${fontFamily.value}`;

  // 设置字体并测量文字
  ctx.font = font;
  const textMetrics = ctx.measureText(textInput.value);

  // 增加额外宽度和高度以容纳文字
  // 使用四个方向的填充值
  const paddingTop = fillPixels.top;
  const paddingRight = fillPixels.right;
  const paddingBottom = fillPixels.bottom;
  const paddingLeft = fillPixels.left;

  const textWidth = Math.ceil(textMetrics.width) + paddingLeft + paddingRight;
  const textHeight = Math.ceil(fontSize.value) + paddingTop + paddingBottom;

  if (textWidth <= 0 || textHeight <= 0) {
    ElMessage.warning('总像素不能小于1')
    return;
  }

  // 设置画布尺寸
  canvas.value.width = textWidth;
  canvas.value.height = textHeight;

  // 重置上下文
  ctx.font = font;
  ctx.textBaseline = 'top';

  // 绘制白色背景
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  // 绘制黑色文字
  ctx.fillStyle = 'black';
  ctx.fillText(textInput.value, paddingLeft, paddingTop);

  // 处理画布生成点阵
  processCanvas();

  // 改变上一次类型
  lastHandlerType.value = 'text';
};

// 处理画布生成点阵数据
const processCanvas = () => {
  const imageData = ctx.getImageData(0, 0, canvas.value.width, canvas.value.height);
  const data = imageData.data;

  // 转换为点阵数据
  const matrix = [];
  for (let y = 0; y < canvas.value.height; y++) {
    const row = [];
    for (let x = 0; x < canvas.value.width; x++) {
      const index = (y * canvas.value.width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      // 使用亮度计算
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      let dotValue = brightness < threshold.value ? 1 : 0;
      if (invert.value) {
        dotValue = dotValue === 1 ? 0 : 1;
      }
      row.push(dotValue);
    }
    matrix.push(row);
  }

  // 更新点阵数据
  dotMatrix.value = matrix;
  matrixWidth.value = canvas.value.width;
  matrixHeight.value = canvas.value.height;

  // 生成C语言数组
  generateCArray();
};

// 应用效果
const applyEffects = () => {
  if (!dotMatrix.value.length) {
    ElMessage.warning('请先生成点阵数据');
    return;
  }
  processCanvas();
};

// 生成C语言数组
const generateCArray = () => {
  const height = dotMatrix.value.length;
  if (height === 0) return;

  const width = dotMatrix.value[0].length;

  let byteArray = [];

  // 按行处理，每8个点组成一个字节
  /*for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 8) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (x + bit < width && dotMatrix.value[y][x + bit] === 1) {
          byte |= (1 << (7 - bit)); // 高位在前
        }
      }
      byteArray.push(byte);
    }
  }*/

  // 根据扫描方向处理点阵数据
  switch (scanDirection.value) {
    case 'row_left_right_top_bottom': // 行扫描: 左→右, 上→下
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x += 8) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            if (x + bit < width && dotMatrix.value[y][x + bit] === 1) {
              byte |= (1 << (7 - bit));
            }
          }
          byteArray.push(byte);
        }
      }
      break;

    case 'row_right_left_top_bottom': // 行扫描: 右→左, 上→下
      for (let y = 0; y < height; y++) {
        for (let x = width - 1; x >= 0; x -= 8) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const pos = x - bit;
            if (pos >= 0 && dotMatrix.value[y][pos] === 1) {
              byte |= (1 << (7 - bit));
            }
          }
          byteArray.push(byte);
        }
      }
      break;

    case 'col_top_bottom_left_right': // 列扫描: 上→下, 左→右
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y += 8) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            if (y + bit < height && dotMatrix.value[y + bit][x] === 1) {
              byte |= (1 << bit);
            }
          }
          byteArray.push(byte);
        }
      }
      break;

    case 'col_bottom_top_left_right': // 列扫描: 下→上, 左→右
      for (let x = 0; x < width; x++) {
        for (let y = height - 1; y >= 0; y -= 8) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const pos = y - bit;
            if (pos >= 0 && dotMatrix.value[pos][x] === 1) {
              byte |= (1 << bit);
            }
          }
          byteArray.push(byte);
        }
      }
      break;
  }

  // 生成C语言十六进制数组字符串
  let hexOutputStr = `// 十六进制格式点阵数据: ${width} x ${height} 像素 | 扫描方向: ${getDirectionName(scanDirection.value)}\n`;
  hexOutputStr += `// 字节总数: ${byteArray.length}\n`;
  hexOutputStr += `// 生成时间: ${new Date().toLocaleString()}\n`;
  hexOutputStr += `// 设置: 阈值=${threshold.value}, 取反=${invert.value ? '是' : '否'}\n`;
  hexOutputStr += `static const unsigned char bitmap_bytes[] = {\n`;

  // 每行显示8个字节
  for (let i = 0; i < byteArray.length; i++) {
    if (i % 8 === 0) {
      hexOutputStr += '    ';
    }

    hexOutputStr += `0x${byteArray[i].toString(16).padStart(2, '0').toUpperCase()}`;

    if (i < byteArray.length - 1) {
      hexOutputStr += ', ';
      if (i % 8 === 7) {
        hexOutputStr += '\n';
      }
    }
  }

  hexOutputStr += '\n};';

  hexOutput.value = hexOutputStr;

  // 生成二进制数组字符串
  let binOutputStr = `// 二进制格式点阵数据: ${width} x ${height} 像素 | 扫描方向: ${getDirectionName(scanDirection.value)}\n`;
  binOutputStr += `// 字节总数: ${byteArray.length}\n`;
  binOutputStr += `// 生成时间: ${new Date().toLocaleString()}\n`;
  binOutputStr += `// 设置: 阈值=${threshold.value}, 取反=${invert.value ? '是' : '否'}\n`;
  binOutputStr += `static const unsigned char bitmap_bits[] = {\n`;

  for (let i = 0; i < byteArray.length; i++) {
    if (i % 4 === 0) {
      binOutputStr += '    ';
    }

    // 将字节转换为8位二进制字符串
    const binStr = byteArray[i].toString(2).padStart(8, '0');
    binOutputStr += `0b${binStr}`;

    if (i < byteArray.length - 1) {
      binOutputStr += ', ';
      if (i % 4 === 3) {
        binOutputStr += '\n';
      }
    }
  }

  binOutputStr += '\n};';

  binOutput.value = binOutputStr;
};

// 获取扫描方向名称
const getDirectionName = (dir) => {
  switch (dir) {
    case 'row_left_right_top_bottom':
      return '行扫描: 左→右, 上→下';
    case 'row_right_left_top_bottom':
      return '行扫描: 右→左, 上→下';
    case 'col_top_bottom_left_right':
      return '列扫描: 上→下, 左→右';
    case 'col_bottom_top_left_right':
      return '列扫描: 下→上, 左→右';
    default:
      return '行扫描: 左→右, 上→下';
  }
}

// 点悬停处理
const handleDotHover = (event) => {
  const dotElement = event.target;
  if (dotElement.classList.contains('dot')) {
    const x = parseInt(dotElement.getAttribute('data-x'));
    const y = parseInt(dotElement.getAttribute('data-y'));
    const active = dotElement.classList.contains('active');

    hoverDot.x = x;
    hoverDot.y = y;

    // 更新点信息
    dotInfo.visible = true;
    dotInfo.x = event.pageX + 15;
    dotInfo.y = event.pageY + 15;
    dotInfo.dataX = x;
    dotInfo.dataY = y;
    dotInfo.active = active;
  }
};

const hideDotInfo = () => {
  dotInfo.visible = false;
  hoverDot.x = -1;
  hoverDot.y = -1;
};

// 复制到剪贴板
const copyToClipboard = () => {
  const text = activeTab.value === 'hex' ? hexOutput.value : binOutput.value;
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('代码已复制到剪贴板');
  }).catch(err => {
    ElMessage.error('复制失败: ' + err);
  });
};

// 下载代码
const downloadCode = () => {
  const text = activeTab.value === 'hex' ? hexOutput.value : binOutput.value;
  const extension = activeTab.value === 'hex' ? 'hex.c' : 'bin.c';

  const blob = new Blob([text], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bitmap_${activeTab.value}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// 导出图像
const exportImage = () => {
  if (!dotMatrix.value.length) {
    ElMessage.warning('没有可导出的点阵数据');
    return;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = matrixWidth.value;
  const height = matrixHeight.value;

  canvas.width = width * 10;
  canvas.height = height * 10;

  // 绘制背景
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 绘制点阵
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (dotMatrix.value[y][x] === 1) {
        ctx.fillStyle = '#4fc3f7';
        ctx.beginPath();
        ctx.arc(x * 10 + 5, y * 10 + 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = 'rgba(79, 195, 247, 0.7)';
        ctx.shadowBlur = 8;
      }
    }
  }

  // 创建下载链接
  const link = document.createElement('a');
  link.download = `dot_matrix.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

// 重置表单
const resetForm = () => {
  textInput.value = '电子点阵';
  fontSize.value = 30;
  fontFamily.value = 'SimHei';
  fillPixels.top = 0;
  fillPixels.left = 0;
  fillPixels.right = 0;
  fillPixels.bottom = 0;
  threshold.value = 150;
  invert.value = false;
  scanDirection.value = 'row_left_right_top_bottom';
  convertText();
};

// 显示示例
const showSample = () => {
  textInput.value = '点阵示例';
  fontSize.value = 42;
  fontFamily.value = 'SimHei';
  threshold.value = 120;
  invert.value = true;
  convertText();

  ElMessage.success({
    message: '已加载点阵示例配置',
    type: 'info',
    duration: 3000
  });
};
</script>

<template>

  <div class="main-container">
    <el-card body-style="height: 100%">
      <template #header>
        <h3 class="panel-title">输入设置</h3>
      </template>
      <el-scrollbar height="calc(100% - 53px)">
        <div class="form-container">
          <el-form inline>
            <el-form-item label="输入文字">
              <el-input v-model="textInput" placeholder="输入要转换的文字" clearable></el-input>
            </el-form-item>

            <el-form-item label="字体大小">
              <el-slider style="min-width: 190px;" v-model="fontSize" :min="12" :max="72" :step="2"
                         show-input></el-slider>
            </el-form-item>
            <el-form-item>
              <template #label>
                <el-tooltip content="如果没有想要的字体可以手动输入系统里面已经存在的字体">
                  <div style="display: flex; align-items: center; justify-content: center;">
                    <span>字体类型</span>
                    <el-icon>
                      <Warning/>
                    </el-icon>
                  </div>
                </el-tooltip>
              </template>
              <el-select v-model="fontFamily" placeholder="选择字体" filterable allow-create default-first-option
                         style="min-width: 160px;">
                <el-option v-for="(font, index) in fontFamilyArray" :label="font.label" :value="font.value"
                           :key="index">
                  <el-text line-clamp="1" style="float: left">{{ font.label }}</el-text>
                  <el-text
                      style="float: right;color: var(--el-text-color-secondary);font-size: 0.8rem;margin-right: -15px;">
                    {{
                      font.value
                    }}
                  </el-text>
                </el-option>
              </el-select>
            </el-form-item>

            <el-form-item label="图片文件">
              <el-upload
                  action="#"
                  :auto-upload="false"
                  :on-change="handleFileChange"
                  :show-file-list="false"
              >
                <template #trigger>
                  <el-button type="primary">选择图片文件</el-button>
                </template>
              </el-upload>
            </el-form-item>
          </el-form>
          <el-form-item>
            <template #label>
              <el-tooltip content="除了本来图片或者文字额外填充的像素">
                <div style="display: flex; align-items: center; justify-content: center;">
                  <span>填充像素</span>
                  <el-icon>
                    <Warning/>
                  </el-icon>
                </div>
              </el-tooltip>
            </template>
            <div class="fill-controls">
              <div v-for="dir in fillDirections" :key="dir.key" class="fill-control">
                <span class="direction-label">{{ dir.label }}:</span>
                <el-slider
                    v-model="fillPixels[dir.key]"
                    :min="-50"
                    :max="100"
                    :step="1"
                    show-input
                    class="fill-slider"
                ></el-slider>
              </div>
            </div>
          </el-form-item>
          <el-form-item>
            <template #label>
              <el-tooltip :content="'阈值: '+ threshold  +'(值越小点阵越密集)'">
                <div style="display: flex; align-items: center; justify-content: center;">
                  <span>虚化调节</span>
                  <el-icon>
                    <Warning/>
                  </el-icon>
                </div>
              </el-tooltip>
            </template>
            <el-slider
                v-model="threshold"
                :min="0"
                :max="255"
                :step="1"
                show-input
                class="threshold-slider"
            ></el-slider>
          </el-form-item>
          <el-form-item label="取反">
            <el-switch
                v-model="invert"
                active-color="primary"
            ></el-switch>
            <p style="margin-left: 5px; color: #aaa; font-size: 0.9rem;">
              开启后点阵数据将黑白反转
            </p>
          </el-form-item>
        </div>

        <div class="action-buttons">
          <el-button type="primary" @click="convertText" :icon="Edit">转换文字</el-button>
          <el-button type="success" @click="resetForm" :icon="Refresh">重置</el-button>
          <!--          <el-button type="warning" @click="applyEffects" :icon="MagicStick">应用效果</el-button>-->
          <el-button type="info" @click="showSample" :icon="View">查看示例</el-button>
        </div>

        <div class="preview-section">
          <h3 class="preview-title">画布预览</h3>
          <canvas id="canvas" ref="canvas" width="300" height="80"></canvas>
        </div>
      </el-scrollbar>
    </el-card>
    <el-card body-style="height: 100%">
      <template #header>
        <h3 class="panel-title">输出结果</h3>
      </template>
      <el-scrollbar height="calc(100% - 53px)">
        <div class="preview-section">
          <h3 class="preview-title" style="margin-top: 0;">点阵预览 ({{ matrixWidth }}×{{ matrixHeight }})
            字节数:{{ byteCount }} , 点亮像素:{{ activeDots }} , 总像素:{{ matrixWidth * matrixHeight }}</h3>
          <div class="grid-size-controls">
            <div class="grid-size-control">
              <h4>点阵缩放</h4>
              <el-slider v-model="dotSize" :min="1" :max="20" :step="1" show-input></el-slider>
            </div>
            <div class="grid-size-control">
              <h4>点间距</h4>
              <el-slider v-model="dotSpacing" :min="1" :max="10" :step="1" show-input></el-slider>
            </div>
          </div>
          <el-scrollbar :max-height="1600" style="width: calc(58.5vw);border-radius: 8px;">
            <div class="dot-preview" @mousemove="handleDotHover" @mouseleave="hideDotInfo">
              <div v-for="(row, y) in dotMatrix" :key="y" class="dot-row">
                <div
                    v-for="(dot, x) in row"
                    :key="x"
                    class="dot"
                    :class="{ active: dot === 1 ,highlight: hoverDot.x === x && hoverDot.y === y}"
                    :style="dotStyle"
                    :data-x="x"
                    :data-y="y"
                ></div>
              </div>
            </div>
          </el-scrollbar>
          <div style="height: 20px;">
            <div class="dot-info" :style="{ left: dotInfo.x + 'px', top: dotInfo.y + 'px' }" v-show="dotInfo.visible">
              坐标: ({{ dotInfo.dataX }}, {{ dotInfo.dataY }}) 状态: <span
                :style="{fontWeight:'bold',color: dotInfo.active? 'blue': ''}">{{
                dotInfo.active ? '点亮' : '熄灭'
              }}</span>
            </div>
          </div>
        </div>

        <div class="scan-direction-control">
          <h4>扫描方向配置</h4>
          <div style="display: flex; align-items: flex-start; justify-content: space-between;">
            <el-radio-group v-model="scanDirection" style="width: 50%;gap: 5px;">
              <el-radio value="row_left_right_top_bottom" border>行扫描: 左→右, 上→下</el-radio>
              <el-radio value="col_top_bottom_left_right" border>列扫描: 上→下, 左→右</el-radio>
              <el-radio value="row_right_left_top_bottom" border>行扫描: 右→左, 上→下</el-radio>
              <el-radio value="col_bottom_top_left_right" border>列扫描: 下→上, 左→右</el-radio>
            </el-radio-group>
            <div class="direction-option">
              <h4>{{ scanActiveDesc.title }}</h4>
              <div class="direction-visual">
                <div class="direction-row" v-for="(row, rowIndex) in 8" :key="rowIndex">
                  <div class="direction-cell" v-for="(col, colIndex) in 8" :key="`${rowIndex}-${colIndex}`"
                       :class="{ active: isCellActive(rowIndex + 1, colIndex + 1) }"></div>
                </div>
              </div>
              <div class="direction-description">{{ scanActiveDesc.desc }}</div>
            </div>
          </div>
        </div>

        <h3 class="preview-title">C语言数组输出</h3>
        <div class="output-container">
          <div class="output-tabs">
            <div
                class="tab"
                :class="{ active: activeTab === 'hex' }"
                @click="activeTab = 'hex'"
            >
              十六进制格式
            </div>
            <div
                class="tab"
                :class="{ active: activeTab === 'bin' }"
                @click="activeTab = 'bin'"
            >
              二进制格式
            </div>
          </div>
          <pre
              class="output-section hex-output"
              v-show="activeTab === 'hex'"
          >{{ hexOutput }}</pre>
          <pre
              class="output-section bin-output"
              v-show="activeTab === 'bin'"
          >{{ binOutput }}</pre>
        </div>

        <div class="action-buttons">
          <el-button type="primary" @click="copyToClipboard" :icon="DocumentCopy">复制到剪贴板</el-button>
          <el-button type="info" @click="downloadCode" :icon="Download">下载代码</el-button>
          <el-button type="success" @click="exportImage" :icon="Picture">导出图像</el-button>
        </div>
      </el-scrollbar>
    </el-card>
  </div>
</template>

<style scoped>
.main-container {
  --primary-color: #1a73e8;
  --secondary-color: #4fc3f7;

  padding: 5px 10px 0 10px;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 15px;
}

@media (max-width: 900px) {
  .main-container {
    grid-template-columns: 1fr;
  }
}

.panel-title {
  color: var(--el-color-primary);
}

.panel-title i {
  margin-right: 10px;
}

.form-container {
  display: flex;
  flex-direction: column;
}

/* 填充控制样式 */
.fill-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.fill-control {
  display: flex;
  align-items: center;
}

.direction-label {
  width: 30px;
  text-align: center;
  font-weight: bold;
}

.fill-slider {
  flex: 1;
  margin-left: 10px;
}


.preview-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 10px;
}

canvas {
  background: white;
  border-radius: 2px;
  max-width: 100%;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.preview-title {
  margin: 15px 0;
  font-weight: 500;
}

.highlight {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

.grid-size-controls {
  display: grid;
  width: 80%;
  grid-template-columns: 1fr 1fr;
  gap: 50px;
  margin: 10px;
}

.grid-size-control {
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-size-control h4 {
  width: 120px;
}

.dot-preview {
  display: inline-block;
  background: rgba(0, 0, 0, 0.22);
  padding: 15px;
  border-radius: 8px;
  height: fit-content;
}

.dot-row {
  display: flex;
  height: fit-content;
}

.dot {
  width: 6px;
  height: 6px;
  margin: 1px;
  border-radius: 20%;
  background: rgba(0, 0, 0, 0.6);
}

.dot.active {
  background: blue;
}

.scan-direction-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 15px;
  background: #f8f8f8;
  border-radius: 10px;
}

.direction-option {
  min-width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.direction-option h4 {
  margin: 0 0 10px 0;
}

.direction-visual {
  display: grid;
  grid-template-columns: repeat(1, 86px);
  grid-template-rows: repeat(8, 8px);
  gap: 2px;
}

.direction-row {
  display: flex;
  width: 100%;
  gap: 2px;
}

.direction-cell {
  background: rgba(0, 0, 0, 0.7);
  width: 100%;
  height: 100%;
  border-radius: 2px;
}

.direction-cell.active {
  background: var(--el-color-primary);
}

.direction-description {
  margin-top: 10px;
  font-size: 0.9rem;
  color: var(--el-text-color-secondary);
  text-align: center;
}


.output-container {
  background: rgba(20, 25, 45, 0.9);
  border-radius: 12px;
  padding: 0;
  margin-top: 15px;
  border: 1px solid rgba(76, 201, 240, 0.3);
  box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.output-tabs {
  display: flex;
  background: rgba(15, 20, 40, 0.95);
  border-bottom: 1px solid rgba(76, 201, 240, 0.3);
}

.tab {
  padding: 15px 25px;
  cursor: pointer;
  font-weight: 600;
  color: #7b8ab8;
  transition: all 0.3s ease;
  border-right: 1px solid rgba(76, 201, 240, 0.1);
}

.tab.active {
  background: rgba(76, 201, 240, 0.15);
  color: #4cc9f0;
  border-bottom: 2px solid #4cc9f0;
}

.tab:hover:not(.active) {
  background: rgba(76, 201, 240, 0.1);
}

.output-section {
  padding: 20px;
  font-family: 'Fira Code', 'Courier New', monospace;
  white-space: pre-wrap;
  max-height: 400px;
  overflow: auto;
  line-height: 1.8;
  font-size: 0.95rem;
}

.hex-output {
  color: #9eff9e;
}

.bin-output {
  color: #ff9edc;
}

:deep(.el-input-number) {
  width: 100px;
}

:deep(.fill-slider .el-input-number) {
  width: 110px;
}

:deep(.threshold-slider .el-input-number) {
  width: 110px;
}

:deep(.el-card__header) {
  padding: 10px;
}

.el-button {
  transition: all 0.3s ease;
  margin-left: 0;
}

.el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 5px;
}

@media (max-width: 900px) {
  .action-buttons {
    display: flex;
    gap: 30px;
    flex-direction: row;
  }
}

</style>