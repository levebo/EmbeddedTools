declare module '@/util/dataUtil' {
    export const formatDate: (date: number) => string
    export const formatTime: (date: Date, isMillis: boolean) => string
}

declare module '@/util/convertUtil' {
    export function isHexString(str: string): boolean

    export function hexStringToUint8Array(hexString: string): Uint8Array<ArrayBuffer>

    export function uint8ArrayToString(uint8Array: Uint8Array): string

    export function uint8ArrayToHexString(uint8Array: Uint8Array): string

    export function formatSize(bytes: number): string
}

declare module '@/util/SerialUtil' {
    export function execSendCustomScript(sendData: Uint8Array, scriptCode: string): Uint8Array

    export function execReceiveCustomScript(sendData: Uint8Array, receiveData: Uint8Array, scriptCode: string): {
        success: boolean,
        sendData: Uint8Array,
        receiveData: Uint8Array
    }

    export function awaitTime(timeout: number): Promise<void>

    export function awaitTimeout(timeout: number, interval: number, callback: (elapsed: number) => (boolean | Promise<boolean>)): Promise<void>
}