declare module '@/util/dataUtil' {
    export const formatDate: (date: number) => string
    export const formatTime: (date: Date, isMillis?: boolean) => string

    /**
     * 分割字节数组
     * @param byteArr 字节数组
     * @param len 按多大分割默认 8 个字节
     */
    export function splitBytes(byteArr: any[], len?: number | number[]): any[]
}

declare module '@/util/convertUtil' {
    export function isHexString(str: string): boolean

    export function hexStringToUint8Array(hexString: string): Uint8Array<ArrayBuffer>

    export function uint8ArrayToString(uint8Array: Uint8Array): string

    export function uint8ArrayToHexString(uint8Array: Uint8Array, separator?: string): string

    export function uint8ArrayToAscii(uint8Array: Uint8Array): string

    export function formatSize(bytes: number): string

    export function convertToByte(value: string, type: "text" | "hex" | "dec" | "bin", toType: "hex" | "dec", toByteLen?: number): string
}

declare module '@/util/SerialUtil' {
    export interface SendCustomScriptOptions {
        /**当前分片索引*/
        readonly chunkIndex: number
        /**分片大小*/
        readonly chunkSize: number
    }

    /**
     * 执行发送自定义脚本
     * @param sendData 数据
     * @param options 参数
     * @param scriptCode 脚本代码
     */
    export function execSendCustomScript(sendData: Uint8Array, options: SendCustomScriptOptions, scriptCode: string): Uint8Array

    /**
     * 执行接收自定义脚本
     * @param sendData 发送数据
     * @param receiveData 接收数据
     * @param scriptCode 脚本代码
     */
    export function execReceiveCustomScript(sendData: Uint8Array, receiveData: Uint8Array, scriptCode: string): {
        success: boolean,
        sendData: Uint8Array,
        receiveData: Uint8Array
    }

    export function awaitTime(timeout: number): Promise<void>

    export function awaitTimeout(timeout: number, interval: number, callback: (elapsed: number) => (boolean | Promise<boolean>)): Promise<void>
}