<script setup lang="ts">

import {HelpFilled} from "@element-plus/icons-vue";
import {ref} from "vue";
import serialHelpImg from "/img/serial_help.png"

defineProps({activeIndex: String});

const show = ref(false);
</script>

<template>
  <el-button :icon="HelpFilled" size="small" style="margin-right: 5px;" @click="show = true">使用说明</el-button>
  <el-dialog v-model="show" title="使用说明" width="800">
    <div v-if="activeIndex === '1'" style="margin: 10px 20px" class="instructions">
      <ul>
        <li><strong>文字/图片输入</strong>：输入文字或上传图片文件进行转换</li>
        <li><strong>选择字体</strong>：如果列表没有想要的字体，可以根据当前系统有的字体手动临时输入字体名称应用字体设置，但要注意字体名字的正确性
        </li>
        <li><strong>填充像素</strong>：调整生成后的点阵图像整体大小 根据四个方向可以灵活调整整体图像显示</li>
        <li><strong>虚化调节</strong>：调整阈值控制点阵的密度（值越小点阵越密集）</li>
        <li><strong>取反效果</strong>：开启后点阵数据将黑白反转</li>
        <li><strong>点阵预览</strong>：<span style="color:blue;">蓝色</span>点表示点亮的像素，鼠标悬停可查看详细信息</li>
        <li><strong>C语言数组</strong>：生成格式为 <code>static const unsigned char bitmap[] =
          {...};</code></li>
        <li><strong>十六进制输出</strong>：标准格式 <code>0x00, 0xFF, ...</code></li>
        <li><strong>二进制输出</strong>：直观格式 <code>0b00000000, 0b11111111, ...</code></li>
        <li><strong>数据排列</strong>：从上到下，每行从左到右，每8个点组成一个字节（高位在前）</li>
      </ul>
    </div>
    <div v-else-if="activeIndex === '2'" style="margin: 10px 20px" class="instructions">
      <ul>
        <li><strong>输入文件夹</strong>：请选择包含图像文件的输入文件夹（支持 JPG, PNG, BMP 格式）</li>
        <li><strong>输出文件夹</strong>：选择输出文件夹用于保存转换结果</li>
        <li><strong>颜色编码类型</strong>：RGB565：用 16 位来表示一个像素的颜色，其中红色占 5 位，绿色占 6 位，蓝色占 5
          位, 总共可以表示 32×64×32=65,536 种不同的颜色。<br>RGB888：用 24 位来表示一个像素的颜色，红色、绿色、蓝色各占 8 位,
          可以表示 256×256×256=16,777,216 种不同的颜色。
        </li>
        <li><strong>RLE编码</strong>：RLE（Run - Length
          Encoding）即行程长度编码，是一种简单的无损数据压缩算法，常用于图像、视频、音频等数据的压缩，但是解码需要一定的硬件性能可以结合硬件权衡是否使用
        </li>
        <li><strong>字节序</strong>：大端序（Big - Endian） 高位字节存储在低地址，低位字节存储在高地址<br>示例：<code>0x1234
          -> 0x12 0x34</code>内存布局：[0x12, 0x34]<br> 小端序（Little -
          Endian）低位字节存储在低地址，高位字节存储在高地址<br>示例：<code>0x1234 -> 0x34 0x12</code>内存布局：[0x34, 0x12]
        </li>
        <li><strong>总数组分割</strong>：开启总数组分割后 合并的总数组文件 <code>all_images.c</code> 会把数组按照指定大小分片
          由于像keil这类大部分编译器没有链接的代码都不会编译到机器里面方便在测试的时候分批写入数据
        </li>
        <li><strong>开始转换</strong>：转换完成后会生成包含所有图像数据的主文件</li>
      </ul>
    </div>
    <div v-else-if="activeIndex === '3'" style="margin: 10px 20px" class="instructions">
      <ul>
        <li><strong>输入文件夹</strong>：请选择包含图像数据数组的C源文件的输入文件夹</li>
        <li><strong>输出文件夹</strong>：选择输出文件夹用于保存转换结果</li>
        <li><strong>合并文件名称</strong>：合并成二进制文件的文件名</li>
        <li><strong>显示RLE信息</strong>：描述信息的<code>images_info_c</code>文件是否显示RLE编码信息
          如果显示结构体会多一个是否启用RLE编码的变量
        </li>
        <li><strong>生成枚举映射</strong>：用于需要频繁修改图片资源的情况下直接用下标访问不方便修改的时候。 映射成枚举后
          直接通过枚举访问图片资源替代下标，只要资源文件名字不变修改或者添加资源文件后都能自动映射
        </li>
        <li><strong>开始处理</strong>：处理完成后每个文件会生成独立的二进制文件和合并所有转换的文件后的总二进制文件
          和描述信息的<code>images_info_c</code>文件
        </li>
      </ul>
    </div>
    <div v-else-if="activeIndex === '4'" style="margin-top: 0;" class="instructions">
      <el-image :src="serialHelpImg"/>
      <el-divider content-position="left">左边操作说明</el-divider>
      <el-space direction="vertical" alignment="normal" :size="2">
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">1</el-tag>
          选中串口设备后可以连接串口
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">2</el-tag>
          第一次连接时必须要点击刷新，点击后可以刷新串口设备
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">3</el-tag>
          点击下拉列表后选择需要连接的串口设备
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">4</el-tag>
          用于指定串口通信建立时的数据传输速率，单位是波特（baud），即每秒传输的比特数。不同的设备可能支持不同的波特率，常见的波特率有
          9600、115200 等。
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">5</el-tag>
          表示每一帧数据中数据位的数量，取值可以是 7 或 8。数据位用于携带实际要传输的数据信息。
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">6</el-tag>
          定义每一帧数据末尾的停止位数量，取值可以是 1 或 2。停止位用于标识一帧数据的结束，帮助接收方识别数据的边界。
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">7</el-tag>
          奇偶校验位用于检测数据传输过程中是否发生错误。
          <br>"none"：不发送奇偶校验位，适用于对数据传输可靠性要求不高或者数据本身已经有其他错误检测机制的情况。
          <br>"even"：数据位和奇偶校验位的总和为偶数。发送方会根据数据位的情况设置奇偶校验位，使得数据位和奇偶校验位中 1
          的总数为偶数。接收方会检查接收到的数据是否满足这个条件。
          <br>"odd"：数据位和奇偶校验位的总和为奇数，原理与 "even" 类似。
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">8</el-tag>
          用于控制数据的传输速率，防止发送方发送数据过快，导致接收方来不及处理而丢失数据。
          <br>"none"：不启用流控制，发送方会持续发送数据，不考虑接收方的处理能力。适用于数据传输速率较低或者接收方处理能力较强的情况。
          <br>"hardware"：启用硬件流控制，使用 RTS（Request to Send，请求发送）和 CTS（Clear to
          Send，允许发送）信号来协调发送方和接收方的数据传输。当接收方准备好接收数据时，会通过 CTS
          信号通知发送方可以发送数据；当接收方缓冲区接近满时，会通过 RTS 信号通知发送方暂停发送数据。
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">9</el-tag>
          用于指定为串口通信创建的读写缓冲区的大小。缓冲区用于临时存储从串口读取或要发送到串口的数据。
          <br>影响：较大的缓冲区可以处理突发的大量数据传输，但会占用更多的内存；较小的缓冲区则可能在数据传输量较大时导致数据丢失或溢出。默认值为
          255。
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">10</el-tag>
          开启后可以通过串口直接发送文件数据。可以配置发送数据的格式和响应具体用法 配置里面有示例用法
        </el-text>
        <el-divider content-position="left">顶部操作说明</el-divider>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">11</el-tag>
          发送接收日志显示格式。可以选：文本 | 16进制 | 文本&16进制
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">12</el-tag>
          数据显示间隔。合理配置可以让显示的数据更符合期望的数据显示分割
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">13</el-tag>
          是否自动滚动显示最新数据
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">14</el-tag>
          清空显示数据
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">15</el-tag>
          复制显示数据到系统剪切板
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">16</el-tag>
          导出显示数据到文件
        </el-text>
        <el-divider content-position="left">右边拓展操作说明</el-divider>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">17</el-tag>
          用于将指令分组方便操作
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">18</el-tag>
          新增快捷发送指令 指令包含普通指令和发送文件
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">19</el-tag>
          导出快捷发送指令
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">20</el-tag>
          导入快捷发送指令
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">21</el-tag>
          是否以16进制发送指令
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">22</el-tag>
          快捷发送指令内容
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">23</el-tag>
          单独发送当前快捷指令
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">24</el-tag>
          更多操作：包含重命名和删除当前指令 如果是发送文件 会有发送文件配置
        </el-text>
        <el-divider content-position="left">底部操作说明</el-divider>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">25</el-tag>
          通过串口发送数据 数据可以是普通文本数据和16进制数据 也可以直接发送文件数据
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">26</el-tag>
          发送串口数据
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">27</el-tag>
          是否通过16进制发送
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">28</el-tag>
          末尾添加回车和换行符
        </el-text>
        <el-text>
          <el-tag size="small" type="danger" effect="dark" round style="vertical-align: text-top;">29</el-tag>
          是否开启循环发送
        </el-text>
      </el-space>
    </div>
  </el-dialog>
</template>

<style scoped>
.instructions {
  margin-top: 30px;
}

.instructions h3 {
  color: var(--el-color-primary);
}

.instructions ul {
  padding-left: 25px;
}

.instructions li {
  font-size: 1.1rem;
  line-height: 1.6;
}

.instructions code {
  background: rgba(0, 0, 0, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
</style>