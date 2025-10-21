<script setup lang="ts">
import {computed, nextTick, reactive, ref, toRaw, watch} from "vue";
import {
  Back,
  CircleCloseFilled,
  DeleteFilled,
  EditPen,
  Files,
  Plus,
  Promotion,
  Refresh,
  Right,
  ScaleToOriginal,
  SetUp,
  SuccessFilled
} from "@element-plus/icons-vue";
import {ElMessage} from "element-plus";
import {ParityType, SendFileOptions} from "../../types/electron";
import {formatTime} from "@/util/dataUtil";
import {formatSize, hexStringToUint8Array, uint8ArrayToHexString, uint8ArrayToString} from "@/util/convertUtil";
import {awaitTime, awaitTimeout, execReceiveCustomScript, execSendCustomScript} from "@/util/SerialUtil";
import SerialFileConfigWin from "@/components/SerialFileConfigWin.vue";

/*串口调试工具*/
defineOptions({name: 'SerialTool'});

/*快捷指令对象*/
interface CodeTypes {
  /*名称*/
  name: string;
  /*类型*/
  type: ExtendCodeType;
  /*数据*/
  data: string;
  /*是否发送十六进制*/
  isHex: boolean;
  /*发送文件配置*/
  fileOptions?: SendFileOptions;
}

interface ExtendTypes {
  /*分组名称*/
  groupName: string;
  list: CodeTypes[]
}

// 指令列表
let extendList: ExtendTypes[] = [{
  groupName: "默认",
  list: [{
    name: '',
    type: 'code',
    data: '测试',
    isHex: false
  }, {
    name: '示例1',
    type: 'code',
    data: '55 aa 00 00 0a 00 00 04 18 fd fe 00 20',
    isHex: true
  }, {
    name: '示例2',
    type: 'code',
    data: '55 aa 00 00 0c 00 00 00 0b',
    isHex: true
  }]
}];

// 最大日志记录条数
const MAX_LOGS_SIZE = 3000;
let reader: ReadableStreamDefaultReader<Uint8Array>;

/*日志传输方向：接收 | 发送*/
type TransferType = "rx" | "tx";
/*数据发送类型：文本 | 十六进制*/
type SendDataType = "text" | "hex";
/*日志显示类型：文本 | 十六进制 | 文本和十六进制*/
type LogDataType = "text" | "hex" | "hex&text";
/*日志类型： 串口日志 | 系统日志*/
type LogMessageType = "serial" | "system";

/*快捷指令类型：指令消息 | 文件*/
type ExtendCodeType = "code" | "file";

/*日志对象*/
interface LogData {
  /*时间*/
  time: string,
  /*日志类型*/
  logType: LogMessageType,
  /*接收还是发送*/
  transferType: TransferType,
  /*数据类型*/
  dataType: LogDataType,
  /*文本数据*/
  text: string,
  /*十六进制数据*/
  hex: string
}

/**
 * 拓展功能对象
 */
interface ExtendOptions {
  /*是否新增分组*/
  isAddGroup: boolean,
  /*新增分组名称*/
  addGroupName: string,
  /*当前选择的分组*/
  groupIndex: number;
  /*分组数据*/
  extendList: ExtendTypes[];
  /*批量发送间隔时间(毫秒)*/
  batchIntervalTime: number;
}

/**
 * 默认文件配置
 */
const defaultFileOptions = {
  filePath: '',
  fileSize: 0,
  fileProgress: 0,
  isSendCode: false,
  sendCode: `// 发送指令时可以自定义发送格式 方便添加校检等
// 可以参考以下配置 下面是实现了添加校检规则发送指令
// sendData 发送数据
/**
 * 计算校验和
 * @param data 数组
 * @param len 数组大小
 * @return 校检和
 */
function calculateChecksum(data, len) {
    let sum = 0;
    for (let i = 0; i < len; i++) {
        sum += data[i];
    }
    return sum % 256;
}
// 将 sendData 的长度拆分为两个字节
const dataLengthBytes = new Uint8Array([(sendData.length >> 8) & 0xFF, sendData.length & 0xFF]);
// 创建头部信息
let header = new Uint8Array([0x55, 0xAA, 0x00, 0x00, 0x0B, 0x00, dataLengthBytes[0], dataLengthBytes[1]]);
// 创建最终的数据数组，预留一个位置给校验和
let toData = new Uint8Array(header.length + sendData.length + 1);
// 复制 header 到 toData
toData.set(header, 0);
// 复制 sendData 到 toData
toData.set(sendData, header.length);
// 计算校验和
let checksum = calculateChecksum(toData, toData.length - 1);
// 将校验和放在数组的最后一个位置
toData[toData.length - 1] = checksum;
// console.log('发送数据', toData);
return toData;`,
  currentSendBytes: new Uint8Array(0),
  currentReceiveSuccess: false,
  isChunkSend: false,
  chunkSize: 128,
  chunkSpeed: 35,
  isReceiveCode: false,
  receiveRetryTime: 400,
  receiveRetryNum: 10,
  receiveCode: `// 添加响应数据自定义处理 可以参考下面配置
// 以下是实现了分片发送文件的响应数据校检判断逻辑
// sendData 发送数据
// receiveData 响应数据
const targetReceiveSequence = new Uint8Array([0x55, 0xAA, 0x00, 0x00, 0x0B, 0x00, 0x00, 0x00, 0x0A]);
const targetSendSequence = new Uint8Array([0x55, 0xAA, 0x00, 0x00, 0x0B]);

// 比较是否包含指定数组
function containsSequence(uint8Array, sequence) {
  const sequenceLength = sequence.length;
  const arrayLength = uint8Array.length;

  for (let i = 0; i <= arrayLength - sequenceLength; i++) {
    let match = true;
    for (let j = 0; j < sequenceLength; j++) {
      if (uint8Array[i + j]!== sequence[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return true;
    }
  }
  return false;
}
// 匹配后删除对应数组
function removeSequence(uint8Array, sequence) {
  const sequenceLength = sequence.length;
  for (let i = 0; i <= uint8Array.length - sequenceLength; i++) {
    let match = true;
    for (let j = 0; j < sequenceLength; j++) {
      if (uint8Array[i + j]!== sequence[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      const before = uint8Array.slice(0, i);
      const after = uint8Array.slice(i + sequenceLength);
      return new Uint8Array([...before, ...after]);
    }
  }
  return uint8Array;
}
//if(window.receiveFileNum == undefined){
//  window.receiveFileNum = 0
//}

if(containsSequence(receiveData, targetReceiveSequence)
  && containsSequence(sendData, targetSendSequence)){
  //window.receiveFileNum += 1;
  receiveData = removeSequence(receiveData, targetReceiveSequence)
  // console.log('响应文件请求次数：', window.receiveFileNum)
  return { success: true, sendData, receiveData }
}

// success 返回 true 表示响应正常会继续发送分片. 返回 false 表示发送失败根据配置是否重试可以重新尝试发送响应失败的数据
return { success: false, sendData, receiveData }`
} as SendFileOptions;

// 默认拓展功能配置
const defaultExtendOptions = {
  isAddGroup: false,
  addGroupName: '',
  groupIndex: 0,
  extendList: JSON.parse(JSON.stringify(extendList)),
  batchIntervalTime: 500,
};

// 加载本地发送文件配置
const sendFileOptionLS = localStorage.getItem('sendFileOption')
let sendFileOptionSave: SendFileOptions;
if (sendFileOptionLS) {
  sendFileOptionSave = JSON.parse(sendFileOptionLS)
} else {
  sendFileOptionSave = JSON.parse(JSON.stringify(defaultFileOptions))
}
// 加载本地拓展功能配置
const extendOptionsLS = localStorage.getItem('extendOptions')
let extendOptionsSave: ExtendOptions;
if (extendOptionsLS) {
  extendOptionsSave = JSON.parse(extendOptionsLS)
} else {
  extendOptionsSave = JSON.parse(JSON.stringify(defaultExtendOptions))
}
/**
 * 发送文件配置
 */
const sendFileOption = reactive<SendFileOptions>(sendFileOptionSave)

/**
 * 串口配置对象
 */
const serialOptions = reactive<{
  /*连接状态*/
  connected: boolean,
  isReading: boolean,
  /*是否发送中*/
  isSending: boolean,
  /*是否批量发送中*/
  isBatchSending: boolean,
  /*是否循环发送中*/
  isLoopSending: boolean,
  /*波特率*/
  baudRate: number,
  /*数据位*/
  dataBits: number,
  /*停止位*/
  stopBits: number,
  /*校检位*/
  parity: ParityType,
  /*缓冲区大小*/
  bufferSize: number,
  /*流控制*/
  flowControl: FlowControlType,
  portList: SerialPort[],
  /*当前选择的串口名称*/
  selectedPortName: string,
  /*当前选择的串口*/
  selectedPort: SerialPort,
  /*当前打开的串口对象*/
  selectedOpenPort?: SerialPort,
  /*记录日志列表*/
  logs: LogData[],
  /*日志类型*/
  logDataType: LogDataType,
  /*是否自动滚动*/
  logAutoScroll: boolean,
  /*日志分包超时时间(ms)*/
  logTimeout: number,
  /*发送数据类型*/
  sendType: SendDataType,
  /*是否添加回车换行*/
  isCRLF: boolean,
  /*是否循环发送*/
  isLoop: boolean,
  /*循环发送间隔*/
  loopTime: number,
  /*是否发送文件*/
  isSendFile: boolean,
}>({
  connected: false,
  isReading: false,
  isSending: false,
  isBatchSending: false,
  isLoopSending: false,
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  bufferSize: 1024,
  flowControl: 'none',
  portList: [],
  selectedPortName: '',
  selectedPort: null,
  selectedOpenPort: null,
  logs: [],
  logDataType: 'hex&text',
  logAutoScroll: true,
  logTimeout: 50,
  /*发送数据类型*/
  sendType: 'text',
  /*末尾是否添加回车换行*/
  isCRLF: false,
  isLoop: false,
  loopTime: 500,
  isSendFile: false
})


// 拓展功能配置
const extendOptions = reactive<ExtendOptions>(extendOptionsSave)
/*选中的快捷指令*/
const selectCodeList = ref<CodeTypes[]>([]);

// 发送内容
const sendText = ref('');
// 数据缓冲区
let dataBuffer: Uint8Array = new Uint8Array(0);
//串口分包合并延迟时间对象
let serialTimeout = null
// 日志容器的引用
const logContainer = ref<InstanceType<typeof import('element-plus/es')['ElScrollbar']> | null>(null);

watch(() => serialOptions.logs.length, async () => {
  if (!serialOptions.isSending) {
    if (logContainer.value) {
      await nextTick();
      // 获取滚动内容容器的引用
      const scrollContent = logContainer.value.wrapRef;
      if (scrollContent && serialOptions.logAutoScroll) {
        // 滚动到最底部
        logContainer.value.scrollTo({
          top: scrollContent.scrollHeight,
          behavior: 'auto'
        });
      }
    }
  }
});

/**
 * 是否显示日志记录列表
 */
const showLogComputed = computed(() => {
  let isShow = true;
  if ((serialOptions.isSending && serialOptions.isSendFile)) {
    isShow = false
  }
  if (serialOptions.isBatchSending) {
    selectCodeList.value.forEach((code) => {
      if (code.type === 'file') {
        isShow = false
      }
    })
  }
  return isShow
})

const readData = async () => {
  serialOptions.isReading = true;
  while (serialOptions.connected && serialOptions.isReading && serialOptions.selectedOpenPort.readable) {
    // 读取流
    reader = serialOptions.selectedOpenPort.readable.getReader();
    try {
      while (true) {
        const {value, done} = await reader.read();
        if (done) {
          console.log('[readData] DONE', done);
          break;
        }
        handleReaderData(value);
      }
    } catch (error) {
      // 设备 Break 信号, 忽略错误等待设备恢复
      if (error.message.includes('Break received')) {
      } else {
        console.error('读取数据错误:', error.message);
      }
    } finally {
      reader?.releaseLock();
    }
  }
  if (serialOptions.selectedOpenPort.connected) {
    await serialOptions.selectedOpenPort.close();
  }
}
/**
 * 处理接收的消息
 * @param value
 */
const handleReaderData = (value: Uint8Array) => {
  const newByteLength = dataBuffer.byteLength + value.length;
  const newByteArray = new Uint8Array(newByteLength);
  newByteArray.set(dataBuffer, 0);
  newByteArray.set(value, dataBuffer.byteLength);
  dataBuffer = newByteArray;

  // 如果是发送文件 判断是否需要处理自定义脚本
  if (serialOptions.isSendFile && serialOptions.isSending) {
    if (sendFileOption.isReceiveCode) {
      const {
        success,
        receiveData
      } = execReceiveCustomScript(sendFileOption.currentSendBytes, dataBuffer, sendFileOption.receiveCode)
      if (!sendFileOption.currentReceiveSuccess) {
        sendFileOption.currentReceiveSuccess = success;
      }
      if (success) {
        // console.log('成功传输文件数据:', uint8ArrayToHexString(sendFileOption.currentSendBytes), '\n 响应指令:', uint8ArrayToHexString(dataBuffer))
        showReaderData(dataBuffer);
        dataBuffer = receiveData;
      }
    } else {
      showReaderData(dataBuffer);
      dataBuffer = new Uint8Array(0);
    }
    return;
  }
  if (serialOptions.logTimeout === 0) {
    showReaderData(dataBuffer);
    dataBuffer = new Uint8Array(0);
    return;
  }
  clearTimeout(serialTimeout)
  serialTimeout = setTimeout(() => {
    showReaderData(dataBuffer);
    dataBuffer = new Uint8Array(0);
  }, serialOptions.logTimeout);

}
/**
 * 显示日志
 * @param value
 */
const showReaderData = (value: Uint8Array) => {
  let text = '', hex = ''
  if (serialOptions.logDataType.toString().includes('hex')) {
    hex += uint8ArrayToHexString(value) + '\n'
  }
  if (serialOptions.logDataType.toString().includes("text")) {
    text += uint8ArrayToString(value) + '\n';
  }
  // 处理完整的信息
  serialOptions.logs.push({
    time: formatTime(new Date(), true),
    logType: 'serial',
    transferType: 'rx',
    dataType: serialOptions.logDataType,
    text,
    hex
  });
  // 检查数组长度是否超过最大限制
  if (serialOptions.logs.length > MAX_LOGS_SIZE) {
    serialOptions.logs.shift(); // 移除最早的记录
  }
}

window.electronAPI.onSerialPortList((list) => {
  serialOptions.portList = list;
});
window.electronAPI.onReconnectSerialPort(async (port: SerialPort) => {
  try {
    if ('serial' in navigator) {
      // 请求用户授权选择串口
      const ports = await navigator.serial.getPorts();
      const foundPort = ports.find(p => String(p.getInfo().usbVendorId) === port.vendorId && String(p.getInfo().usbProductId) === port.productId);
      if (foundPort) {
        // 如果端口已经打开，我们先关闭它（但通常应该是关闭的，因为设备刚重新插入）
        if (foundPort.readable || foundPort.writable) {
          // 如果端口是打开状态，我们可能需要先关闭它
          await foundPort.close();
        }
        // 使用找到的端口对象打开连接
        serialOptions.selectedOpenPort = foundPort;
        await handleSerialConnection(true);
      }
      /*serialObj.selectedOpenPort = await navigator.serial.requestPort();
      serialObj.selectedPort = port;
      serialObj.selectedPortName = port.displayName;*/

    }
  } catch (error) {
    console.error('重新连接串口失败:', error);
  }
});
window.electronAPI.onRemoveSerialPort(async (port: SerialPort) => {
  if (serialOptions.selectedPort.vendorId === port.vendorId && serialOptions.selectedPort.productId === port.productId) {
    serialOptions.connected = false;
    if (reader) {
      reader.releaseLock();
      reader = null;
      serialOptions.isReading = false;
    }
    await serialOptions.selectedOpenPort.close();
    serialOptions.connected = false;
    console.log(`${port.displayName} ${port.portName} 串口已关闭`);
  }
})

const getSerialPorts = async () => {
  try {
    if ('serial' in navigator) {
      // 请求用户授权选择串口
      serialOptions.selectedOpenPort = await navigator.serial.requestPort();
      const port = serialOptions.selectedOpenPort.getInfo()
      console.log('首次连接的串口设备', port);
    }
  } catch (error) {
    console.error('连接串口失败:', error);
  }
}
/**
 * 发送系统信息到串口输出界面
 * @param msg 消息内容
 */
const sendSystem = (msg: string): void => {
  serialOptions.logs.push({
    time: formatTime(new Date(), true),
    logType: 'system',
    transferType: 'tx',
    dataType: serialOptions.logDataType,
    hex: '',
    text: msg
  })
}

/**
 * 发送文件分片重试
 *
 * @param currentRetryNum 当前重试次数
 * @param writer
 */
const retrySendFileChunk = async (currentRetryNum: number, writer: WritableStreamDefaultWriter): Promise<void> => {
  const doRetry = async (currentRetryNum: number) => {
    // 检查是否在等待期间收到了成功响应
    if (sendFileOption.currentReceiveSuccess) {
      // 已响应 停止重试逻辑
      return;
    }
    // 发送数据
    await writer.write(sendFileOption.currentSendBytes);
    if (currentRetryNum < sendFileOption.receiveRetryNum) {
      // 重试延迟
      await awaitTimeout(sendFileOption.receiveRetryTime, 5, (elapsed) => {
        return sendFileOption.currentReceiveSuccess;
      });
      // 检查是否在等待期间收到了成功响应
      if (sendFileOption.currentReceiveSuccess) {
        return;
      }
      sendSystem('发送文件等待响应信息，重试' + (currentRetryNum + 1) + '次');
      // 重试
      await doRetry(currentRetryNum + 1);
    } else {
      // 处理重试次数达到上限的情况
      throw new Error('重试次数已达上限');
    }
  }
  // 调用 doRetry 方法开始重试逻辑
  await doRetry(currentRetryNum);
}

/**
 * 处理通过串口发送文件
 */
const handleSendFile = async (writer: WritableStreamDefaultWriter, fileOption: SendFileOptions) => {
  if (fileOption.filePath === '') {
    ElMessage.error('请选择有效的文件')
    writer.releaseLock();
    serialOptions.isSending = false
    return;
  }

  // 1. 先获取文件大小
  const {success, fileSize} = await window.electronAPI.getFileSize(fileOption.filePath);
  if (!success) {
    ElMessage.error('获取文件大小失败');
    writer.releaseLock();
    serialOptions.isSending = false;
    return;
  }
  fileOption.fileSize = fileSize;
  const chunkSize = fileOption.isChunkSend ? fileOption.chunkSize : fileSize;
  const totalChunks = Math.ceil(fileSize / chunkSize);

  // 2. 逐块读取和发送
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    // console.log('当前块', chunkIndex + 1, '总共', totalChunks);
    // 计算当前 chunkIndex 相对于数组的百分比
    if (chunkIndex === totalChunks - 1) {
      fileOption.fileProgress = 100;
    } else {
      fileOption.fileProgress = Number(((chunkIndex / totalChunks) * 100).toFixed(1));
    }

    // 读取当前块
    const {
      success: readSuccess,
      data,
      isLast
    } = await window.electronAPI.readFileChunk(fileOption.filePath, chunkIndex, chunkSize);

    if (!readSuccess) {
      ElMessage.error(`读取第${chunkIndex + 1}块失败`);
      break;
    }

    // 重置接收状态
    fileOption.currentReceiveSuccess = false;

    let bytes = data
    // 是否开启自定义处理发送信息
    if (fileOption.isSendCode) {
      bytes = execSendCustomScript(bytes, fileOption.sendCode)
    }
    const hex = uint8ArrayToHexString(bytes);
    const text = uint8ArrayToString(bytes);

    // 保存当前发送的数据用于脚本处理
    fileOption.currentSendBytes = new Uint8Array(bytes);
    // 判断是否开启响应状态自定义脚本并判断是否需要重试
    if (fileOption.isReceiveCode && fileOption.receiveRetryNum > 0) {
      await retrySendFileChunk(0, writer);
    } else {
      // 发送串口数据
      await writer.write(bytes);
    }

    serialOptions.logs.push({
      time: formatTime(new Date(), true),
      logType: 'serial',
      transferType: 'tx',
      dataType: serialOptions.logDataType,
      text,
      hex
    });

    // 判断是否设置分片发送间隔
    if (fileOption.chunkSpeed > 0) {
      await awaitTime(fileOption.chunkSpeed)
    }

    if (isLast) break;
  }
  serialOptions.isSending = false
  writer.releaseLock();
}
/**
 * 底部发送串口数据
 */
const bottomSendData = async () => {
  // 是否循环发送
  if (serialOptions.isLoop) {
    serialOptions.isLoopSending = true;
    while (serialOptions.isLoopSending) {
      await sendData(sendText.value, serialOptions.sendType, serialOptions.isSendFile, sendFileOption);
      // 循环发送间隔
      if (serialOptions.loopTime > 0) {
        await awaitTime(serialOptions.loopTime)
      }
    }
  } else {
    await sendData(sendText.value, serialOptions.sendType, serialOptions.isSendFile, sendFileOption);
  }
}

/**
 * 发送串口数据
 *
 * @param value 数据
 * @param dataType 数据类型
 * @param isSendFile 是否发送文件
 * @param sendFileOptions 文件配置信息
 */
const sendData = async (value: string = '', dataType: SendDataType = 'text', isSendFile: boolean = false, sendFileOptions?: SendFileOptions): Promise<boolean> => {
  if (!serialOptions.connected) {
    ElMessage.error('请先连接到串口设备')
    return false;
  }
  if (value === '' || value === null) {
    if (!isSendFile) {
      ElMessage.warning('请输入需要发送的内容')
      return false;
    }
  }
  // 写入流
  let writer: WritableStreamDefaultWriter;
  try {
    writer = serialOptions.selectedOpenPort.writable.getWriter();
    if (!writer) {
      ElMessage.error(`错误: 未连接到串口`);
      return false;
    }
    serialOptions.isSending = true

    // 判断是否发送文件
    if (isSendFile) {
      await handleSendFile(writer, sendFileOptions);
    } else {
      let data = value;
      let text = '', hex = ''

      // 检查是否是十六进制字符串
      if (dataType === 'hex') {
        let bytes = hexStringToUint8Array(data);
        if (serialOptions.isCRLF) {
          let dataBytes = new Uint8Array(bytes.length + 2);
          dataBytes.set(bytes);
          dataBytes[bytes.length] = 0x0d;
          dataBytes[bytes.length + 1] = 0x0a;
          // 发送串口数据
          await writer.write(dataBytes);

          hex = uint8ArrayToHexString(dataBytes);
          text = uint8ArrayToString(dataBytes);
        } else {
          // 发送串口数据
          await writer.write(bytes);

          hex = uint8ArrayToHexString(bytes);
          text = uint8ArrayToString(bytes);
        }
      } else {
        const encoder = new TextEncoder();
        // 是否在末尾添加回车换行
        if (serialOptions.isCRLF) {
          data = data + '\r\n';
        }
        const encodedData = encoder.encode(data);
        // 发送串口数据
        await writer.write(encodedData);

        hex = uint8ArrayToHexString(encodedData);
        text = data;
      }
      writer.releaseLock();
      serialOptions.logs.push({
        time: formatTime(new Date(), true),
        logType: 'serial',
        transferType: 'tx',
        dataType: serialOptions.logDataType,
        text,
        hex
      });
      serialOptions.isSending = false
    }
  } catch (error) {
    writer?.releaseLock();
    if (error.message === '重试次数已达上限') {
      sendSystem(error.message)
    } else {
      ElMessage.error(`发送错误: ${error.message}`);
    }
    serialOptions.isSending = false
    return false;
  }
  return true;
}

const handleSerialConnection = async (open = true) => {
  if (!open) {
    if (reader) {
      serialOptions.isReading = false;
      await reader?.cancel();
    }
    serialOptions.connected = false;
    console.log("串口已关闭");
  } else {
    // 打开串口
    await serialOptions.selectedOpenPort.open({
      baudRate: serialOptions.baudRate,
      dataBits: serialOptions.dataBits,
      stopBits: serialOptions.stopBits,
      parity: serialOptions.parity,
      bufferSize: serialOptions.bufferSize,
      flowControl: serialOptions.flowControl
    }).catch((e) => {
      ElMessage.error(`串口打开失败${e.message}`);
    });
    serialOptions.connected = true;
    console.log("串口已打开");
    // 启动数据读取循环
    readData();
  }
}

const seriaOptionClick = async (port) => {
  await window.electronAPI.selectSerialPort(toRaw(port));
  serialOptions.selectedPortName = port.displayName
  serialOptions.selectedPort = port;
}

/**
 * 清空日志
 */
const removeLog = () => {
  serialOptions.logs.splice(0, serialOptions.logs.length);
}

/**
 * 复制日志内容
 */
const copyLog = () => {
  const data = logContainer.value.wrapRef.textContent;
  let textarea = document.createElement('textarea')
  textarea.value = data
  textarea.readOnly = true
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  document.execCommand('copy')
  document.body.removeChild(textarea)

  //window.electronAPI.copyText(data);
  ElMessage.success('复制成功')
}
/**
 * 导出日志信息
 */
const exportLog = () => {
  const data = logContainer.value.wrapRef.textContent;
  window.electronAPI.downloadFile(data, `serial_${new Date().getTime()}.log`);
  // downloadFile(blob, `serial_${formatDate(new Date().getTime())}.log`);
}

/**
 * 下载文件
 * @param blob
 * @param fileName
 */
/*const downloadFile = (blob: Blob, fileName: string) => {
  if (window.navigator.msSaveOrOpenBlob) {
    navigator.msSaveBlob(blob, fileName)
  } else {
    let link = document.createElement('a')
    let body = document.querySelector('body	')
    link.href = window.URL.createObjectURL(blob)
    link.download = fileName
    // fix Firefox
    link.style.display = 'none'
    body.appendChild(link)
    link.click()
    body.removeChild(link)
    window.URL.revokeObjectURL(link.href)
  }
}*/

/**
 * 选择文件
 */
const selectSendFile = async () => {
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择输入文件夹', ["openFile"]);
  if (success) sendFileOption.filePath = selectedPath;
};

// ---------------------- 扩展分组相关 --------------------------

/**
 * 重命名分组
 */
const extendGroupRename = (item: ExtendTypes) => {
  ElMessageBox.prompt('修改分组名称', '重命名', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: item.groupName
  }).then(({value}) => {
    item.groupName = value
    ElMessage.success('修改成功')
  })
}

/**
 * 删除分组
 * @param index
 */
const extendGroupRemove = (index: number) => {
  const length = extendOptions.extendList[index].list.length;
  if (length > 0) {
    ElMessageBox.confirm('当前分组下还有指令是否删除？', '提示', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      extendOptions.extendList.splice(index, 1)
      if (extendOptions.groupIndex === index) {
        extendOptions.groupIndex = 0
      }
      ElMessage.success('删除成功')
    })
  } else {
    extendOptions.extendList.splice(index, 1)
    if (extendOptions.groupIndex === index) {
      extendOptions.groupIndex = 0
    }
    ElMessage.success('删除成功')
  }
}

/**
 * 新增分组
 */
const extendGroupAdd = () => {
  if (extendOptions.addGroupName === '') {
    ElMessage.error('请输入分组名称')
    return
  }
  extendOptions.extendList.push({
    groupName: extendOptions.addGroupName,
    list: []
  })
  extendOptions.isAddGroup = false;
  extendOptions.addGroupName = '';
}
/**
 * 取消新增分组
 */
const extendGroupAddCannel = () => {
  extendOptions.isAddGroup = false;
  extendOptions.addGroupName = ''
}

// ---------------------- 扩展列表相关 --------------------------
/**
 * 选择文件
 */
const extendListSelectSendFile = async (row: CodeTypes) => {
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择输入文件夹', ["openFile"]);
  if (success) row.fileOptions.filePath = selectedPath;
};
/**
 * 判断当前行是否被选中
 * @param row
 */
const isExtendRowSelected = (row: CodeTypes) => {
  return selectCodeList.value.some(itemCode => itemCode === row)
}
/**
 * 快捷指令 发送文件时 文件对象初始化
 * @param row
 */
const initExtendListFile = (row: CodeTypes) => {
  row.fileOptions = {...defaultFileOptions};
}

/**
 * 表格选中改变事件
 * @param selected
 */
const extendListSelectionChange = (selected: CodeTypes[]) => {
  selectCodeList.value = selected;
}

/**
 * 批量执行
 */
const batchSendExtendCode = async () => {
  if (!serialOptions.connected) {
    ElMessage.error('请先连接到串口设备')
    return;
  }
  serialOptions.isBatchSending = true;
  let sendErrorNum = 0;
  for (const code of selectCodeList.value) {
    const sendStatus = await sendExtendCode(code);
    if (!sendStatus) {
      sendErrorNum++;
    }
    // 间隔时间
    if (extendOptions.batchIntervalTime > 0) {
      await awaitTime(extendOptions.batchIntervalTime)
    }
  }
  if (sendErrorNum == selectCodeList.value.length) {
    ElMessage.error('批量发送执行失败')
  } else {
    ElMessage.success('批量发送执行完成,' + (sendErrorNum > 0 ? sendErrorNum + '条执行失败' : ''))
  }
  serialOptions.isBatchSending = false;
}

/**
 * 发送快捷指令
 * @param row
 */
const sendExtendCode = async (row: CodeTypes): Promise<boolean> => {
  if (row.data === '' && row.type === 'code') {
    ElMessage.warning('请输入需要发送的指令')
    return false
  }
  if (!row.fileOptions && row.fileOptions?.filePath === '' && row.type === 'file') {
    ElMessage.warning('请选择需要发送的文件')
    return false
  }
  return await sendData(row.data, row.isHex ? 'hex' : 'text', row.type === 'file', row.fileOptions)
}

/**
 * 新增快捷指令
 */
const extendListAdd = (type: ExtendCodeType) => {
  let item = {
    name: '',
    type,
    data: '',
    isHex: false
  } as CodeTypes;
  if (type === 'file') {
    initExtendListFile(item);
  }
  extendOptions.extendList[extendOptions.groupIndex].list.push(item)
}

/**
 * 删除当前快捷指令
 * @param index 索引
 */
const extendListRemove = (index: number) => {
  extendOptions.extendList[extendOptions.groupIndex].list.splice(index, 1)
}

/**
 * 列表指令重命名
 * @param row
 */
const extendListRename = (row: CodeTypes) => {
  ElMessageBox.prompt('修改快捷指令名称', '重命名', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: row.name
  }).then(({value}) => {
    row.name = value
    ElMessage.success('修改成功')
  })
}
/**
 * 导出指令
 */
const extendListExport = () => {
  const list = extendOptions.extendList[extendOptions.groupIndex].list
  window.electronAPI.downloadFile(JSON.stringify(list), `serial_instr_list_${new Date().getTime()}.json`)
}
/**
 * 导入指令
 */
const extendListImport = async () => {
  const {
    success,
    path: selectedPath
  } = await window.electronAPI.selectDirectory('选择需要导入指令列表的文件', ["openFile"]);
  if (success) {
    const {success: fileSuccess, data, error} = await window.electronAPI.readJSONFile(selectedPath);
    if (fileSuccess) {
      try {
        // 设置指令
        extendOptions.extendList[extendOptions.groupIndex].list = data
        ElMessage.success('导入指令列表成功')
      } catch (err) {
        ElMessage.warning(`部分指令导入失败，请检查导入的指令列表文件：${err.message}`)
      }
    } else {
      ElMessage.error(`读取指令列表文件失败: ${error}`)
    }
  }
}

/*----------------------------- 配置 ----------------------------*/
/**
 * 恢复默认配置
 */
const handleDefaultConfig = () => {
  // 重置拓展功能
  extendOptions.isAddGroup = false;
  extendOptions.addGroupName = '';
  extendOptions.groupIndex = 0;
  extendOptions.extendList = JSON.parse(JSON.stringify(extendList));
  extendOptions.batchIntervalTime = 500;

  // 重置底部发送配置
  for (const key in defaultFileOptions) {
    if (Object.prototype.hasOwnProperty.call(defaultFileOptions, key)) {
      sendFileOption[key] = defaultFileOptions[key];
    }
  }
  ElMessage.success('恢复默认配置成功')
}
/**
 * 导出配置
 */
const handleExportConfig = () => {
  window.electronAPI.downloadFile(JSON.stringify({
    extendOptions,
    sendFileOption
  }), `serial_config_${new Date().getTime()}.json`)
}

/**
 * 导入配置
 */
const handleImportConfig = async () => {
  const {success, path: selectedPath} = await window.electronAPI.selectDirectory('选择需要导入的文件', ["openFile"]);
  if (success) {
    const {success: fileSuccess, data, error} = await window.electronAPI.readJSONFile(selectedPath);
    if (fileSuccess) {
      try {
        const {sendFileOption: fileOpt, extendOptions: extendOpt} = data
        // 设置扩展功能
        for (const key in extendOpt) {
          if (Object.prototype.hasOwnProperty.call(extendOpt, key)) {
            extendOptions[key] = extendOpt[key];
          }
        }
        // 底部发送配置
        for (const key in fileOpt) {
          if (Object.prototype.hasOwnProperty.call(fileOpt, key)) {
            sendFileOption[key] = fileOpt[key];
          }
        }
        ElMessage.success('导入配置成功')
      } catch (err) {
        ElMessage.warning(`部分配置设置失败，请检查导入的配置文件：${err.message}`)
      }
    } else {
      ElMessage.error(`读取配置文件失败: ${error}`)
    }
  }
}

/**
 * 关闭时保存配置到本地
 */
window.onbeforeunload = () => {
  localStorage.setItem('sendFileOption', JSON.stringify(sendFileOption));
  localStorage.setItem('extendOptions', JSON.stringify(extendOptions));
}
</script>

<template>
  <el-splitter class="st-container">
    <el-splitter-panel :size="175" :max="175" :min="175" collapsible>
      <el-form inline>
        <el-form-item>
          <el-button :type="serialOptions.connected ? 'success' : 'default'"
                     :disabled="serialOptions.selectedPortName === ''"
                     :icon="serialOptions.connected ? SuccessFilled : CircleCloseFilled"
                     @click="handleSerialConnection(!serialOptions.connected)">
            {{ serialOptions.connected ? '断开连接' : '连接串口' }}
          </el-button>
          <el-button tag="刷新串口列表" type="primary" plain :icon="Refresh" @click="getSerialPorts"/>
        </el-form-item>
        <el-form-item>
          <el-select placeholder="选择串口设备" style="width: 168px;" v-model="serialOptions.selectedPortName">
            <template #empty>点击
              <el-icon style="margin-top: 2px;" color="#409EFF">
                <Refresh/>
              </el-icon>
              刷新串口设备列表
            </template>
            <el-option v-for="port in serialOptions.portList" :key="port.portId" :label="port.displayName"
                       :value="port.portId" @click="seriaOptionClick(port)">
              <span style="float: left">{{ port.displayName }}</span>
              <span style="float: right;color: var(--el-text-color-secondary);font-size: 13px;">{{
                  port.portName
                }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="波特率">
          <el-select style="width: 114px;" v-model="serialOptions.baudRate">
            <el-option :value="9600">9600</el-option>
            <el-option :value="115200">115200</el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="数据位">
          <el-select style="width: 114px;" v-model="serialOptions.dataBits">
            <el-option :value="8">8</el-option>
            <el-option :value="7">7</el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="停止位">
          <el-select style="width: 114px;" v-model="serialOptions.stopBits">
            <el-option :value="1">1</el-option>
            <el-option :value="2">2</el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="校检位">
          <el-select style="width: 114px;" v-model="serialOptions.parity">
            <el-option value="none">none</el-option>
            <el-option value="even">even</el-option>
            <el-option value="odd">odd</el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="流控制">
          <el-select style="width: 114px;" v-model="serialOptions.flowControl">
            <el-option value="none">none</el-option>
            <el-option value="hardware">hardware</el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="缓冲区">
          <el-input style="width: 114px;" type="number" v-model="serialOptions.bufferSize"/>
        </el-form-item>
        <el-divider style="margin-top: 0;margin-bottom: 12px;"/>
        <el-form-item label="发送文件">
          <el-switch v-model="serialOptions.isSendFile"/>
        </el-form-item>
      </el-form>
    </el-splitter-panel>
    <el-splitter-panel :resizable="false">
      <el-splitter layout="vertical">
        <el-splitter-panel size="100%">
          <div class="st-sp-log-toolbar">
            <el-form inline>
              <el-form-item label="类型">
                <el-select style="width: 127px;" v-model="serialOptions.logDataType">
                  <el-option label="文本" value="text"/>
                  <el-option label="16进制" value="hex"/>
                  <el-option label="16进制&文本" value="hex&text"/>
                </el-select>
              </el-form-item>
              <el-form-item label="间隔">
                <el-input style="width: 100px;" type="number" v-model="serialOptions.logTimeout">
                  <template #append>毫秒</template>
                </el-input>
              </el-form-item>
            </el-form>
            <el-button-group>
              <el-button :type="serialOptions.logAutoScroll ? 'primary' : 'default'"
                         @click="serialOptions.logAutoScroll? serialOptions.logAutoScroll = false : serialOptions.logAutoScroll = true">
                {{ serialOptions.logAutoScroll ? '自动滚动' : '暂停滚动' }}
              </el-button>
              <el-button @click="removeLog">清空</el-button>
              <el-button @click="copyLog">复制</el-button>
              <el-button @click="exportLog">导出</el-button>
            </el-button-group>
          </div>
          <el-scrollbar class="st-sp-log-container" ref="logContainer">
            <div v-if="showLogComputed" style="width: 100%; margin: 6px 0;"
                 v-for="(item, index) in serialOptions.logs" :key="index">
              <div style="color: green;display: inline-block;"><span>[{{ item.time }}]</span>
                <el-icon :size="20" style="vertical-align: middle;" v-if="item.transferType === 'rx'" color="#409EFF">
                  <Back/>
                </el-icon>
                <el-icon :size="20" style="vertical-align: middle;" v-if="item.transferType === 'tx'" color="#E6A23C">
                  <Right/>
                </el-icon>
              </div>
              <template v-if="item.logType === 'serial'">
                <template v-if="serialOptions.logDataType === 'hex&text'">
                  <el-text>
                    <el-tag disableTransitions style="margin-top: -3px;" type="primary" effect="dark" size="small">HEX
                    </el-tag>
                    {{ item.hex }}
                  </el-text>
                  <br>
                  <el-text>
                    <el-tag disableTransitions style="margin-top: -3px;" type="info" effect="dark" size="small">TEXT
                    </el-tag>
                    {{ item.text }}
                  </el-text>
                </template>
                <template v-if="serialOptions.logDataType === 'hex'">
                  <el-text>
                    <el-tag disableTransitions style="margin-top: -3px;" type="primary" effect="dark" size="small">HEX
                    </el-tag>
                    {{ item.hex }}
                  </el-text>
                </template>
                <template v-if="serialOptions.logDataType === 'text'">
                  <el-text>
                    <el-tag disableTransitions style="margin-top: -3px;" type="info" effect="dark" size="small">TEXT
                    </el-tag>
                    {{ item.text }}
                  </el-text>
                </template>
              </template>
              <template v-else-if="item.logType === 'system'">
                <el-text style="color: #E6A23C;">
                  <el-tag disableTransitions style="margin-top: -3px;" type="warning" effect="dark" size="small">
                    系统信息
                  </el-tag>
                  {{ item.text }}
                </el-text>
              </template>
            </div>
          </el-scrollbar>
        </el-splitter-panel>
        <el-splitter-panel class="st-bottom-panel" :size="80" :resizable="false">
          <template v-if="serialOptions.isSendFile">
            <el-row style="margin: 0 0.5%">
              <el-col :span="17" style="display: flex; align-items: center;">
                <el-input :title="sendFileOption.filePath" readonly style="flex: 1;" v-model="sendFileOption.filePath">
                  <template #append>
                    <el-button @click="selectSendFile">选择文件</el-button>
                  </template>
                </el-input>
              </el-col>
              <el-col style="display: flex;" :span="3">
                <SerialFileConfigWin :file-options="sendFileOption"/>
              </el-col>
              <el-col style="display: flex;" :span="4">
                <el-button :loading="serialOptions.isSending" :disabled="serialOptions.isSending"
                           @click="bottomSendData"
                           style="margin-left: 8px;flex: 1;" :icon="Promotion" type="primary">发送
                </el-button>
              </el-col>
            </el-row>
            <el-row v-if="sendFileOption.fileProgress > 0" style="margin: 6px 0.5% 0 0.5%">
              <el-col :span="20">
                <el-progress :percentage="sendFileOption.fileProgress" :text-inside="true"
                             :stroke-width="20" :status="sendFileOption.fileProgress >= 100 ? 'success' : ''"/>
              </el-col>
              <el-col :span="4">
                <el-text style="margin-left: 10px;vertical-align: text-top;">
                  {{ formatSize(sendFileOption.fileSize) }}
                </el-text>
              </el-col>
            </el-row>
          </template>
          <template v-else>
            <el-row style="margin: 0 0.5%">
              <el-col :span="serialOptions.isLoop ? 19 : 20">
                <el-input v-model="sendText"/>
              </el-col>
              <el-col style="display: flex;" :span="serialOptions.isLoop ? 5 : 4">
                <el-button v-if="!serialOptions.isLoopSending" :loading="serialOptions.isSending"
                           @click="bottomSendData" style="margin-left: 8px;flex: 1;"
                           :icon="Promotion" type="primary">
                  {{ !serialOptions.isLoop ? '发送' : '循环发送' }}
                </el-button>
                <el-button v-else @click="serialOptions.isLoopSending = false" style="margin-left: 8px;flex: 1;"
                           type="danger" :icon="Promotion">
                  停止循环
                </el-button>
              </el-col>
            </el-row>
            <el-row style="margin: 0 0.5%">
              <el-col :span="24" style="display: flex; align-items: center;">
                <div style="display: inline-block;margin-right: 20px;margin-top: 4px;">
                  <el-checkbox trueValue="hex" falseValue="text" v-model="serialOptions.sendType" label="HEX发送"/>
                  <el-checkbox v-model="serialOptions.isCRLF" label="末尾添加回车换行"/>
                  <el-checkbox v-model="serialOptions.isLoop" label="循环发送"/>
                </div>
                <div v-if="serialOptions.isLoop" style="display: inline-flex; align-items: center;">
                  <label style="font-size: 14px; width: 35px;color: var(--el-text-color-regular);">间隔</label>
                  <el-input size="small" style="width: 110px;" type="number" v-model="serialOptions.loopTime">
                    <template #append>毫秒</template>
                  </el-input>
                </div>
              </el-col>
            </el-row>
          </template>
        </el-splitter-panel>
      </el-splitter>
    </el-splitter-panel>
    <el-splitter-panel :size="390" collapsible>
      <el-tabs class="st-extend-tabs" type="border-card">
        <el-tab-pane label="扩展功能" style="height: 100%">
          <el-form>
            <el-form-item label="选择分组">
              <el-select v-model="extendOptions.groupIndex">
                <el-option style="display: flex;align-items: center; " v-for="(item, index) in extendOptions.extendList"
                           :key="index" :label="item.groupName"
                           :value="index">
                  <span style="flex: 1;">{{ item.groupName }}</span>
                  <div style="display: inline-block; margin-top: -3px; margin-right: -10px;">
                    <el-button @click.stop="extendGroupRename(item)" title="重命名" circle type="warning" size="small"
                               :icon="EditPen"></el-button>
                    <el-button v-if="extendOptions.extendList.length > 1" @click.stop="extendGroupRemove(index)"
                               title="删除" circle type="danger" size="small"
                               :icon="DeleteFilled"></el-button>
                  </div>
                </el-option>
                <template #footer>
                  <el-button size="small" v-if="!extendOptions.isAddGroup"
                             @click="() => (extendOptions.isAddGroup = true, extendOptions.addGroupName = '')"
                             :icon="Plus">
                    新增分组
                  </el-button>
                  <template v-else>
                    <el-input style="margin-bottom: 8px;" v-model="extendOptions.addGroupName"
                              placeholder="请输入分组名称" size="small"/>
                    <el-button type="primary" size="small" @click="extendGroupAdd">
                      确认
                    </el-button>
                    <el-button size="small" @click="extendGroupAddCannel">取消</el-button>
                  </template>
                </template>
              </el-select>
            </el-form-item>
          </el-form>
          <div class="st-extend-list">
            <el-table width="100%" :height="selectCodeList.length === 0 ? 'calc(100% - 50px)' : 'calc(100% - 90px)'"
                      @selection-change="extendListSelectionChange"
                      :data="extendOptions.extendList[extendOptions.groupIndex].list">
              <el-table-column type="selection" width="25"/>
              <el-table-column label="HEX" width="40">
                <template #default="{row}">
                  <el-switch v-if="row.type === 'code'" size="small" v-model="row.isHex"/>
                  <el-text v-else-if="row.type === 'file'">文件</el-text>
                </template>
              </el-table-column>
              <el-table-column>
                <template #header>
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span>发送内容</span>
                    <div>
                      <el-dropdown style="margin-right: 4px;">
                        <el-button :icon="Plus" type="primary">新增</el-button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item @click="extendListAdd('code')" :icon="ScaleToOriginal">新增发送指令
                            </el-dropdown-item>
                            <el-dropdown-item @click="extendListAdd('file')" :icon="Files">新增发送文件
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                      <el-button-group type="primary">
                        <el-button @click="extendListExport" type="warning">导出</el-button>
                        <el-button @click="extendListImport" type="success">导入</el-button>
                      </el-button-group>
                    </div>
                  </div>
                </template>
                <template #default="{row, $index}">
                  <div v-if="row.type === 'code'"
                       style="display: flex; align-items: center;justify-content: space-between">
                    <el-input style="flex: 1;" v-model="row.data"
                              placeholder="要发送的内容"/>
                    <el-dropdown :disabled="isExtendRowSelected(row)" style="display: block;margin-left: 4px;"
                                 title="发送指令" split-button
                                 @click="sendExtendCode(row)" type="primary">
                      {{ row.name === '' ? '发送' : row.name }}
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item @click="extendListRename(row)" :icon="EditPen">重命名
                          </el-dropdown-item>
                          <el-dropdown-item @click="extendListRemove($index)" :icon="DeleteFilled">删除
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                  <div v-else-if="row.type === 'file'">
                    <div style="display: flex; align-items: center;justify-content: space-between">
                      <el-input :title="row.fileOptions.filePath" readonly style="flex: 1;"
                                v-model="row.fileOptions.filePath" placeholder="请选择文件">
                        <template #append>
                          <el-button @click="extendListSelectSendFile(row)">选择</el-button>
                        </template>
                      </el-input>
                      <el-dropdown :disabled="isExtendRowSelected(row)" style="display: block;margin-left: 4px;"
                                   title="发送文件" split-button
                                   @click="sendExtendCode(row)" type="primary">
                        <el-text truncated style="color: white;max-width: 150px;">{{
                            row.name === '' ? '发送' : row.name
                          }}
                        </el-text>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item @click="extendListRename(row)" :icon="EditPen">重命名
                            </el-dropdown-item>
                            <el-dropdown-item :icon="SetUp">
                              <SerialFileConfigWin btn-type="text" btn-is-text :file-options="row.fileOptions"/>
                            </el-dropdown-item>
                            <el-dropdown-item @click="extendListRemove($index)" :icon="DeleteFilled">删除
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                    <div v-if="row.fileOptions.fileProgress > 0" style="display: flex;margin-top: 4px;">
                      <el-progress style="flex: 1;" :percentage="row.fileOptions.fileProgress"
                                   :stroke-width="10" :status="row.fileOptions.fileProgress >= 100 ? 'success' : ''"/>
                      <el-text style="margin-left: 4px;vertical-align: text-top;">
                        {{ formatSize(row.fileOptions.fileSize) }}
                      </el-text>
                    </div>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            <div class="st-extend-list-multi-send-toolbar" v-if="selectCodeList.length > 0">
              <div>
                <label style="font-size: 14px;display: inline-block; width: 35px;">间隔</label>
                <el-input style="width: 110px;" type="number" v-model="extendOptions.batchIntervalTime">
                  <template #append>毫秒</template>
                </el-input>
              </div>
              <el-button :loading="serialOptions.isBatchSending" :disabled="serialOptions.isBatchSending"
                         type="primary" @click="batchSendExtendCode">发送
              </el-button>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="配置">
          <div style="display: flex;flex-direction: column;">
            <el-button @click="handleDefaultConfig" style="margin: 5px 0;" type="primary">恢复默认配置</el-button>
            <el-button @click="handleExportConfig" style="margin: 5px 0;" type="warning">导出配置</el-button>
            <el-button @click="handleImportConfig" style="margin: 5px 0;" type="success">导入配置</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-splitter-panel>
  </el-splitter>
</template>

<style scoped>
.st-container {
  width: 100%;
  background-color: #ffffff;
  height: calc(100vh - 101px);
  margin: 0;
  padding: 8px 8px 0 8px;
}

:deep(.el-splitter-bar__dragger:before) {
  background-color: transparent;
}

:deep(.el-form--inline .el-form-item) {
  margin-right: 4px;
}

.st-sp-log-toolbar {
  width: 99%;
  min-height: 35px;
  display: flex;
  justify-content: space-between;
  margin: 0 0.5% 0 0.5%;
}

.st-bottom-panel {
  padding: 0;
}

:deep(.st-bottom-panel .el-input-group__append, .el-input-group__prepend) {
  padding: 0 8px;
}

:deep(.st-sp-log-toolbar .el-form-item) {
  margin-bottom: 0;
}

:deep(.st-sp-log-toolbar .el-input-group__append, .el-input-group__prepend) {
  padding: 0 8px;
}

.st-sp-log-container {
  width: 99%;
  height: calc(98% - 40px);
  margin: 5px 0.5% 1% 0.5%;
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color);
  padding: 2px 6px;
}

.st-extend-tabs {
  margin-left: 4px;
  border-bottom-left-radius: var(--el-border-radius-base);
  border-bottom-right-radius: var(--el-border-radius-base);
  height: calc(100% - 8px);
  position: relative;
}

.st-extend-list {
  width: 370px;
  position: relative;
  height: 100%;
}

:deep(.st-extend-list .el-table .cell) {
  padding: 0 4px;
}

:deep(.st-extend-tabs.el-tabs--border-card>.el-tabs__content) {
  padding: 8px;
}

.st-extend-list-multi-send-toolbar {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

:deep(.st-extend-list .el-input-group__append, .el-input-group__prepend) {
  padding: 0 8px;
}
</style>