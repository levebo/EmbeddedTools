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