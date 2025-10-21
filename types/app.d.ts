// vue文件类型声明
declare module '*.vue' {
    import {DefineComponent} from "vue";
    const component: DefineComponent<{}, {}, any>
    export default component
}
// 图片资源文件类型声明
declare module '*.png' {
    const src: string
    export default src
}

declare module 'convertUtil.ts' {

}

declare const isHexString: (str: string) => boolean
declare const hexStringToUint8Array: (hexString: string) => Uint8Array<ArrayBuffer>
declare const uint8ArrayToString: (uint8Array: Uint8Array) => string
declare const uint8ArrayToHexString: (uint8Array: Uint8Array) => string