import type {ParsedPath} from "node:path";

declare global {
    interface Window {
        electronAPI: {
            /*通过系统协议打开链接*/
            openExternalWindow: (url: string) => Promise<void>;
            /**
             * 转换图像
             * @param options 配置选项
             * @param options.inputPath 输入目录
             * @param options.outputDir 输出目录
             * @param options.isRLE 是否开启RLE编码
             * @param options.littleEndian 是否小端序
             * @param options.isArrayChunk 是否分割总数组
             * @param options.arrayChunkSize 分割大小 单位KB
             * @param options.colorCodedType 颜色编码类型
             */
            convertImage: (options: {
                inputPath: string,
                outputDir: string,
                isRLE: boolean,
                littleEndian: boolean,
                colorCodedType: string
            }) => Promise<{
                success: boolean;
                result?: {
                    fileName: string;
                    originalFileName: string;
                    fileBase64: string;
                    width: number;
                    height: number;
                    originalSize: number;
                    rleSize: number;
                    arrayData: Uint16Array<ArrayBuffer> | Buffer<ArrayBuffer>;
                    compressionRatio: number;
                };
                error?: string;
            }>;
            generateMasterFile: (outputDir: string, images: Array<{
                fileName: string;
                width: number;
                height: number;
                isRLE: boolean;
                littleEndian: boolean;
                colorCodedType: string;
                rleSize: number;
                arrayData: Uint16Array<ArrayBuffer> | Buffer<ArrayBuffer>;
            }>, isArrayChunk: boolean, arrayChunkSize: number) => Promise<{ success: boolean; error?: string }>;
            /**
             * 打开选择文件相关窗口
             * @param title 标题
             * @param openTypes openFile - 允许选择文件
             * openDirectory - 允许选择文件夹
             * multiSelections-允许多选。
             * showHiddenFiles-显示对话框中的隐藏文件。
             * createDirectory macOS -允许你通过对话框的形式创建新的目录。
             * promptToCreate Windows-如果输入的文件路径在对话框中不存在, 则提示创建。 这并不是真的在路径上创建一个文件，而是允许返回一些不存在的地址交由应用程序去创建。
             * noResolveAliases macOS-禁用自动的别名路径(符号链接) 解析。 所选别名现在将会返回别名路径而非其目标路径。
             * treatPackageAsDirectory_ macOS _-将包 (如 .app 文件夹) 视为目录而不是文件。
             * dontAddToRecent Windows - 不要将正在打开的项目添加到最近的文档列表中。
             */
            selectDirectory: (title: string, openTypes?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent'>) => Promise<{
                success: boolean
                path?: string
                /** 选择多个文件时返回 */
                paths?: ParsedPath[]
            }>;
            getDirectoryFiles: (dirPath: string) => Promise<{ success: boolean; data?: string[]; error?: string }>;
            /**
             * 通过Windows资源管理器打开目录
             * @param path 路径
             */
            openPath: (path: string) => Promise<{ success: boolean; path: string; error?: string }>;
            processImages: (options: {
                files: { fileName: string, filePath: string }[],
                outputDir: string,
                mergedFileName: string
                showRLE: boolean,
                isEnumMapping: boolean
            }) => Promise<{
                results: {
                    success: boolean,
                    fileName: string,
                    path: string,
                    width: number,
                    height: number,
                    size: number,
                    offset: number,
                    fileBase64: string,
                    error?: string
                }[],
                source: { name: string, desc: string, path: string, size: number, createTime: number },
                mergedFile: { name: string, desc: string, path: string, size: number, createTime: number },
                /**生成过程中的告警（例如枚举名冲突）*/
                warnings?: string[]
            }>;
            /* 串口工具类 */
            /**
             * 获取文件大小
             * @param filePath 文件路径
             */
            getFileSize: (filePath: string) => Promise<{ success: boolean; fileSize: number }>;
            /**
             * 分片读取文件数据
             * @param filePath 文件路径
             * @param chunkIndex 当前分片索引
             * @param chunkSize 分片大小
             */
            readFileChunk: (filePath: string, chunkIndex: number, chunkSize: number) => Promise<{
                success: boolean,
                data: Uint8Array,
                isLast?: boolean,
            }>,
            /**
             * 读取文件字节数据
             * @param filePath 文件路径
             */
            readFileBytes: (filePath: string) => Promise<{
                success: boolean;
                fileSize: number;
                data?: Uint8Array
            }>;
            /**
             * 读取json文件数据
             * @param filePath 文件路径
             */
            readJSONFile: (filePath: string) => Promise<{ success: boolean, data: any, error?: string }>
            /**
             * 读取 用户数据保存目录 json文件数据
             * @param fileName 文件名
             */
            readUserJSONFile: <T>(fileName: string) => Promise<{ success: boolean, data: T, error?: string }>
            /**
             * 流式读取 用户数据保存目录 json文件数据
             * @param fileName 文件名
             * @param type 自定义类型用于区分后续的数据回调是谁发起的
             * @param jsonPath json读取规则可以指定读取某些内容
             */
            readStreamUserJSONFile: (fileName: string, type: string, jsonPath: any) => Promise<{
                success: boolean,
                error?: string
            }>
            /**
             * 监听读取json数据 流式传输
             * @param callback 回调数据
             */
            onReadStreamUserJSONData: (callback: (data: any, type: string) => void) => void
            /**
             * 监听读取json数据 流式传输 数据完成回调
             * @param callback
             */
            onReadStreamUserJSONEnd: (callback: (type: string) => void) => void
            /**
             * 写入json数据到用户数据保存目录
             * @param fileName 文件名
             * @param data 写入数据
             */
            writeUserJSONFile: (fileName: string, data: any) => Promise<{ success: boolean, error?: string }>
            /**
             * 读取界面布局数据（旧版格式会自动迁移）
             */
            loadUILayout: () => Promise<{
                success: boolean
                data?: UILayoutProject
                error?: string
                migrated?: boolean
            }>
            /**
             * 保存界面布局数据
             * @param store 布局数据
             */
            saveUILayout: (store: UILayoutProject) => Promise<{ success: boolean, error?: string }>
            /**
             * 流式修改json数据到用户数据保存目录
             * @param fileName 文件名
             * @param jsonPath json读取规则可以指定读取某些内容
             * @param modify 需要修改的数据
             */
            modifyStreamUserJSONFile: (fileName: string, jsonPath: any, modify: Object) => Promise<{
                success: boolean,
                error?: string
            }>
            /**
             * 读取base64 图片文件
             * @param filePath 文件路径
             * @param fileName 文件名
             */
            readImageBase64: (filePath: string, fileName: string) => Promise<{
                success: boolean
                error?: string
                filePath: string
                enumName: string
                width: number
                height: number
                size: number
                fileBase64: string
            }>;
            /**
             * 获取串口列表
             * @param callback
             */
            onSerialPortList: (callback: (...args: any[]) => void) => void;
            /**
             * 移除串口设备回调事件
             * @param callback
             */
            onRemoveSerialPort: (callback: (...args: any[]) => void) => void;
            /**
             * 重新连接已配对串口设备回调事件
             * @param callback
             */
            onReconnectSerialPort: (callback: (...args: any[]) => void) => void;
            /**
             * 选择串口设备
             * @param port 串口设备信息
             */
            selectSerialPort: (port: SerialPort) => Promise<void>;
            /**
             * 复制文本到系统剪切板
             * @param text
             */
            copyText: (text: string) => void;
            /**
             * 把 String写入 文件
             * @param data
             * @param filename 文件名
             */
            downloadFile: (data: string | Uint8Array, filename: string) => Promise<{ success: boolean }>;
        };
    }

    interface SerialPortInfo {
        // 对应 unsigned short usbVendorId
        usbVendorId: number;
        // 对应 unsigned short usbProductId
        usbProductId: number;
        // 对应 BluetoothServiceUUID bluetoothServiceClassId
        bluetoothServiceClassId: BluetoothServiceUUID;
    }

    type ParityType = "none" | "even" | "odd";
    type FlowControlType = "none" | "hardware";

    interface SerialOptions {
        // 对应 required unsigned long baudRate
        baudRate: number;

        // 对应 octet dataBits = 8
        dataBits?: number;

        // 对应 octet stopBits = 1
        stopBits?: number;

        // 对应 ParityType parity = "none"
        parity?: ParityType;

        // 对应 unsigned long bufferSize = 255
        bufferSize?: number;

        // 对应 FlowControlType flowControl = "none"
        flowControl?: FlowControlType;
    }

    interface SerialOutputSignals {
        dataTerminalReady: boolean;
        requestToSend: boolean;
        break: boolean;
    }

    interface SerialInputSignals {
        // 对应 required boolean dataCarrierDetect
        dataCarrierDetect: boolean;
        // 对应 required boolean clearToSend
        clearToSend: boolean;
        // 对应 required boolean ringIndicator
        ringIndicator: boolean;
        // 对应 required boolean dataSetReady
        dataSetReady: boolean;
    }

    interface SerialPort extends EventTarget {
        // 对应 onconnect 属性
        onconnect: ((this: SerialPort, ev: Event) => any) | null;
        // 对应 ondisconnect 属性
        ondisconnect: ((this: SerialPort, ev: Event) => any) | null;
        // 对应 connected 只读属性
        readonly connected: boolean;
        // 对应 readable 只读属性
        readonly readable: ReadableStream;
        // 对应 writable 只读属性
        readonly writable: WritableStream;

        // 对应 getInfo 方法
        getInfo?(): SerialPortInfo;

        // 对应 open 方法
        open?(options: SerialOptions): Promise<void>;

        // 对应 setSignals 方法
        setSignals?(signals?: SerialOutputSignals): Promise<void>;

        // 对应 getSignals 方法
        getSignals?(): Promise<SerialInputSignals>;

        // 对应 close 方法
        close?(): Promise<void>;

        // 对应 forget 方法
        forget?(): Promise<void>;

        // Docs: https://electronjs.org/docs/api/structures/serial-port

        /**
         * A stable identifier on Windows that can be used for device permissions.
         *
         * @platform win32
         */
        deviceInstanceId?: string;
        /**
         * A string suitable for display to the user for describing this device.
         */
        displayName?: string;
        /**
         * Unique identifier for the port.
         */
        portId: string;
        /**
         * Name of the port.
         */
        portName: string;
        /**
         * The USB product ID.
         */
        productId?: string;
        /**
         * The USB device serial number.
         */
        serialNumber?: string;
        /**
         * Represents a single serial port on macOS can be enumerated by multiple drivers.
         *
         * @platform darwin
         */
        usbDriverName?: string;
        /**
         * The USB vendor ID.
         */
        vendorId?: string;
    }

    interface SerialPortFilter {
        // 对应 unsigned short usbVendorId
        usbVendorId?: number;
        // 对应 unsigned short usbProductId
        usbProductId?: number;
        // 对应 BluetoothServiceUUID bluetoothServiceClassId
        bluetoothServiceClassId?: BluetoothServiceUUID;
    }

    interface SerialPortRequestOptions {
        filters: SerialPortFilter[];
        allowedBluetoothServiceClassIds: BluetoothServiceUUID[];
    }

    interface Serial extends EventTarget {
        onconnect: ((this: Serial, ev: Event) => any) | null;
        ondisconnect: ((this: Serial, ev: Event) => any) | null;

        getPorts(): Promise<SerialPort[]>;

        requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    }

    // 扩展 Navigator 接口
    interface Navigator {
        readonly serial: Serial;
    }

    /**
     * 发送文件配置
     */
    interface SendFileOptions {
        /*文件路径*/
        filePath: string,
        /*文件大小字节*/
        fileSize: number,
        /*文件传输进度*/
        fileProgress: number,
        /*是否开启文件发送添加自定义脚本处理发送数据格式*/
        isSendCode: boolean,
        /*文件发送脚本代码*/
        sendCode: string,
        /*当前发送的文件数据 u8数组*/
        currentSendBytes: Uint8Array,
        /*当前发送的文件数据是否正确返回响应信息 配合自定义脚本处理时生效*/
        currentReceiveSuccess: boolean,
        /*是否分片发送*/
        isChunkSend: boolean,
        /*分片发送大小 字节 byte*/
        chunkSize: number,
        /*分片发送间隔时间 毫秒 ms*/
        chunkSpeed: number,
        /*开启配置后每次分片接收到指定命令后才发送下一片数据。在响应指令配置*/
        isReceiveCode: boolean,
        /*多长时间未接收到有效响应重试*/
        receiveRetryTime: number,
        /*未接收到响应时重试次数*/
        receiveRetryNum: number,
        /*响应指令脚本代码*/
        receiveCode: string,
        /*是否记录发送文件串口数据*/
        isFileSendDataLog: boolean
    }

    /** 图片信息 */
    interface ImgOptions {
        filePath: string
        fileName: string
        originalFileName: string
        index: number
        enumName?: string
        base64?: string
        width?: number
        height?: number
        size?: number
    }

    /** 界面布局配置信息 */
    interface UILayoutOption {
        inputDir: string
        inputWidth: number
        inputHeight: number
        /**屏幕宽度*/
        width: number
        /**屏幕高度*/
        height: number
        /**是否显示X轴居中辅助线*/
        showXCenter: boolean
        /**是否显示Y轴居中辅助线*/
        showYCenter: boolean
        zoomScale: number
        bgColor: string
        imgList: ImgOptions[]
        imgListLoading: boolean
    }

    /**UI界面布局信息*/
    interface UILayout {
        /**布局项唯一标识（同一张图片允许放置多次）*/
        id?: string
        /**当前是否选中*/
        active: boolean
        /**图片宽度*/
        width: number
        /**图片高度*/
        height: number
        /**图片的X轴起始坐标*/
        x: number,
        /**图片的Y轴起始坐标*/
        y: number,
        /**X轴方向是否居中*/
        isXCenter: boolean
        /**Y轴方向是否居中*/
        isYCenter: boolean
        /**图片名称*/
        fileName: string
        /**图片在原数据的下标*/
        index: number
        /**图片的枚举名称*/
        enumName?: string
        /**图片的base64数据*/
        base64?: string
        /**图片大小*/
        size?: number
    }

    /**UI界面数据*/
    interface UILayoutData {
        /**当前选中的图片信息*/
        select?: UILayout
        /**布局列表*/
        list: UILayout[]
    }

    /**布局快照中的单个图片位置*/
    interface UILayoutSnapshotItem {
        /**布局项唯一标识*/
        id: string
        /**图片枚举名（资源契约的稳定键）*/
        enumName: string
        /**图片文件名（不含扩展名，枚举名缺失时兜底）*/
        fileName: string
        /**X轴起始坐标*/
        x: number
        /**Y轴起始坐标*/
        y: number
    }

    /**一次保存的界面布局快照*/
    interface UILayoutSnapshot {
        id: string
        /**布局名称*/
        name: string
        /**图片资源目录*/
        inputDir: string
        /**屏幕宽度*/
        width: number
        /**屏幕高度*/
        height: number
        /**背景色*/
        bgColor: string
        /**最后更新时间（毫秒时间戳）*/
        updateTime: number
        /**图片位置列表*/
        items: UILayoutSnapshotItem[]
    }

    /**界面布局持久化数据*/
    interface UILayoutStore {
        version: 2
        history: UILayoutSnapshot[]
    }

    /**一个界面的布局*/
    interface UILayoutScreen {
        id: string
        /**界面名称（可中文）*/
        name: string
        /**生成的 C 标识，如 SCREEN_1*/
        codeName: string
        /**屏幕宽度*/
        width: number
        /**屏幕高度*/
        height: number
        /**背景色*/
        bgColor: string
        /**图片位置列表*/
        items: UILayoutSnapshotItem[]
    }

    /**界面工程数据*/
    interface UILayoutProject {
        version: 3
        /**工程名称*/
        name: string
        /**图片资源目录*/
        inputDir: string
        /**当前编辑的界面 id*/
        activeScreenId: string
        /**界面列表*/
        screens: UILayoutScreen[]
    }
}

export {ParityType, FlowControlType, SendFileOptions};