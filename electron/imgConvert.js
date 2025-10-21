import {intToRGBA, Jimp} from "jimp";
import fs from 'fs/promises';
import path from "path";

// 检测系统字节序是否小端序
const isSystemLittleEndian = () => {
    const buffer = new ArrayBuffer(2);
    const uint16 = new Uint16Array(buffer);
    const uint8 = new Uint8Array(buffer);
    uint16[0] = 0xABCD;
    return uint8[0] === 0xCD;
}

// 系统是否小端序
const systemLittleEndian = isSystemLittleEndian();

// RGB888转RGB565
const RGB888_TO_RGB565 = (r, g, b) => {
    return (((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3));
};


/**
 * RLE编码
 * @param pixels 像素数据
 * @param littleEndian 是否小端序 默认小端序
 * @returns {Buffer<ArrayBuffer>}
 */
export const rleEncodeRgb565 = (pixels, littleEndian = true) => {
    const out = [];
    let i = 0;
    const len = pixels.length;

    // 像素写入函数（根据字节序处理）
    const writePixel = (pixel) => {
        let lowByte = null;
        let highByte = null;
        if (systemLittleEndian) {
            lowByte = pixel & 0xFF
            highByte = (pixel >> 8) & 0xFF;
        } else {
            lowByte = (pixel >> 8) & 0xFF
            highByte = pixel & 0xFF
        }
        if (littleEndian){
            out.push(lowByte);
            out.push(highByte);
        } else {
            out.push(highByte);
            out.push(lowByte);
        }
    };

    while (i < len) {
        // 查找重复序列
        let count = 1;
        const current = pixels[i];

        while (i + count < len && pixels[i + count] === current && count < 127) {
            count++;
        }

        // 处理重复序列
        if (count >= 2) {
            out.push(128 + count);
            // 写入像素（按指定字节序）
            writePixel(current);
            i += count;
            continue;
        }

        // 处理非重复序列
        let run = 0;
        let j = i;

        // 查找非重复序列
        while (j < len && run < 127) {
            if (j + 1 < len && pixels[j] === pixels[j + 1]) {
                if (run === 0) {
                    run = 1;
                    j++;
                }
                break;
            }
            run++;
            j++;
        }

        if (run === 0) run = 1;

        // 写入非重复序列头
        out.push(run);

        // 写入像素数据
        for (let k = 0; k < run; k++) {
            // 写入像素（按指定字节序）
            writePixel(pixels[i + k]);
        }
        i += run;
    }

    return Buffer.from(out);
};

/**
 * 16位数组 转 8位数组
 * @param u16Array 16位数组
 * @param littleEndian 是否小端序
 * @returns {Uint8Array<ArrayBuffer>} 8位数组
 */
function u16ArrayToU8Array(u16Array, littleEndian) {
    const buffer = u16Array.buffer
    const dataView = new DataView(buffer);
    const byteArray = []
    for (let i = 0; i < u16Array.length; i++) {
        // false 表示大端字节序
        const value = dataView.getUint16(i * 2, systemLittleEndian);

        let lowByte = null;
        let highByte = null;
        if (systemLittleEndian) {
            lowByte = value & 0xFF
            highByte = (value >> 8) & 0xFF;
        } else {
            lowByte = (value >> 8) & 0xFF
            highByte = value & 0xFF
        }
        if (littleEndian){
            byteArray.push(lowByte);
            byteArray.push(highByte);
        } else {
            byteArray.push(highByte);
            byteArray.push(lowByte);
        }
    }
    return new Uint8Array(byteArray);
}

/**
 * 转换图像
 * @param inputPath 输入目录
 * @param outputDir 输出目录
 * @param isRLE 是否开启RLE编码
 * @param littleEndian 是否小端序
 * @param colorCodedType
 * @returns {Promise<{fileName: string, originalFileName: string, fileBase64: string, width: number, height: number, originalSize: number, rleSize: number, arrayData: Buffer<ArrayBuffer>, compressionRatio: number}>}
 */
export const convertImage = async ({inputPath, outputDir, isRLE, littleEndian, colorCodedType}) => {

    // 加载图像
    const image = await Jimp.read(inputPath);
    //const image = sharp(inputPath);
    //const {data, info} = await image.raw().toBuffer({resolveWithObject: true});

    // 获取图像的宽度和高度
    const width = image.width;
    const height = image.height;

    // 获取文件名
    const fileName = path.basename(inputPath, path.extname(inputPath));
    const originalFileName = path.basename(inputPath);
    const sanitizedFileName = fileName.replace(/[/\\:*?"<>|]/g, '_');
    // const sanitizedFileName = fileName.replace(/[^a-z0-9]/gi, '_');

    // 转换为RGB565格式
    const pixelCount = width * height;

    let rgbData = null;
    if (colorCodedType === 'RGB565') {
        rgbData = new Uint16Array(pixelCount);
    } else if (colorCodedType === 'RGB888') {
        rgbData = new Uint8Array(pixelCount * 3);
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const rgba = intToRGBA(image.getPixelColor(x, y));
            const r = rgba.r;
            const g = rgba.g;
            const b = rgba.b;
            if (colorCodedType === 'RGB565') {
                rgbData[index] = RGB888_TO_RGB565(r, g, b);
            } else if (colorCodedType === 'RGB888') {
                const offset = index * 3
                rgbData[offset] = r;
                rgbData[offset + 1] = g
                rgbData[offset + 2] = b;
            }
        }
    }

    /*for (let i = 0; i < pixelCount; i++) {
        const r = data[i * info.channels];
        const g = data[i * info.channels + 1];
        const b = data[i * info.channels + 2];
        rgb565Data[i] = RGB888_TO_RGB565(r, g, b);
    }*/

    // RLE编码
    let arrayData = [];
    if (isRLE && colorCodedType === 'RGB565') {
        arrayData = rleEncodeRgb565(rgbData, littleEndian);
    } else {
        if (colorCodedType === 'RGB565') {
            arrayData = u16ArrayToU8Array(rgbData, littleEndian);
        } else if (colorCodedType === 'RGB888') {
            // RGB888 已经是用U8 存储也不存在字节序问题 所以无需在处理
            arrayData = rgbData;
        }
    }
    // 创建输出目录
    await fs.mkdir(outputDir, {recursive: true});

    // 生成C文件内容
    const cSource = `/* RGB C-Source image dump ${isRLE ? '1-byte-run-length-encoded' : ''} (${fileName}) */

#include <stdint.h>
// 字节序 1：小端序 0：大端序
#define LITTLE_ENDIAN ${littleEndian ? 1 : 0}

// 图像: ${fileName} (${width}x${height}) 转换为${colorCodedType} ${colorCodedType === 'RGB888' ? '' : littleEndian ? '小端序' : '大端序'}数组  原始大小: ${rgbData.length} 字节${isRLE ? ', RLE编码后大小: ' + arrayData.length + '字节 压缩后大小为原始数据大小的(' + ((arrayData.length / (width * height * 2)) * 100).toFixed(2) + '%)' : '数组大小: ' + arrayData.length + '字节'}
static const struct {
  unsigned int    width;
  unsigned int    height;
  unsigned int    bytes_per_pixel; /* 2:RGB16, 3:RGB, 4:RGBA */
  unsigned char   is_rle; /* 是否是RLE编码数据 */
  unsigned int    data_length; /* 数组长度 */
  unsigned char   pixel_data[${arrayData.length}];
} gimp_image = {
  ${width}, ${height}, ${colorCodedType === 'RGB565' ? 2 : 3}, ${isRLE ? 1 : 0}, ${arrayData.length}, {
    ${Array.from(arrayData).map((byte, idx) =>
        `0x${byte.toString(16).padStart(2, '0').toUpperCase()}` +
        (idx < arrayData.length - 1 ? (idx % 12 === 11 ? ',\n    ' : ', ') : '')
    ).join('')}
  }
};
`;

    // 写入文件
    const outputPath = path.join(outputDir, `${sanitizedFileName}.c`);
    await fs.writeFile(outputPath, cSource);

    return {
        fileName: sanitizedFileName,
        originalFileName,
        fileBase64: await image.getBase64(image.mime),
        width: width,
        height: height,
        originalSize: pixelCount * 2,
        rleSize: arrayData.length,
        arrayData: arrayData,
        compressionRatio: (arrayData.length / (pixelCount * 2)) * 100
    };
};
/**
 * 根据 maxSize 分割数组
 * @param arrayData 数组
 * @param maxSize 分割大小单位 KB
 * @returns {*[]}
 */
const splitArrayBySize = (arrayData, maxSize) => {
    const maxSizeBytes = maxSize * 1024;
    const result = [];
    let currentGroup = [];
    let currentSum = 0;

    for (const data of arrayData) {
        const {rleSize} = data;
        if (currentSum + rleSize > maxSizeBytes) {
            // 当前分组的 rleSize 累加值加上当前元素的 rleSize 超过阈值
            // 将当前分组添加到结果数组中
            result.push(currentGroup);
            // 重置当前分组和累加值
            currentGroup = [];
            currentSum = 0;
        }
        // 将当前元素添加到当前分组中
        currentGroup.push(data);
        // 更新当前分组的 rleSize 累加值
        currentSum += rleSize;
    }
    // 处理最后一个分组
    if (currentGroup.length > 0) {
        result.push(currentGroup);
    }
    return result;
}

export const generateMasterFile = async (outputDir, images, isArrayChunk, arrayChunkSize) => {
    const filePath = path.join(outputDir, 'all_images.c');
    const imgCount = images.length;
    let allImages = [images]
    if (isArrayChunk) {
        allImages = splitArrayBySize(images, arrayChunkSize);
    }
    let content = `#include <stdint.h>


/**
 * 图片数组信息结构体
  */
typedef struct {
    unsigned int  width; /*宽度*/
    unsigned int  height; /*高度*/
    unsigned int  bytes_per_pixel; /* 2:RGB16, 3:RGB, 4:RGBA */
    unsigned char is_rle; /* 是否是RLE编码数据 */
    unsigned int  data_length; /*数组长度*/
    const unsigned char *${images.isRLE ? 'rle_' : ''}pixel_data; /*图片RLE编码数组指针*/
} ImageData;

/* ------------------ ${imgCount} 张图片数组数据 start --------------- */

${Array.from(allImages).map((imgArr, imgArrIndex) => {
        return `static const ImageData img_array${imgArrIndex > 0 ? '_' + imgArrIndex : ''}[] = {
    ${Array.from(imgArr).map((img, imgIndex) => {
            return `// 图像 ${imgIndex}: ${img.fileName} (${img.width}x${img.height}) ${img.colorCodedType === 'RGB888' ? img.colorCodedType : img.colorCodedType + img.littleEndian ? '小端序' : '大端序'}
    {
        ${img.width}, ${img.height}, ${img.colorCodedType === 'RGB888' ? 3 : img.colorCodedType === 'RGB565' ? 2 : 4}, ${img.isRLE ? 1 : 0}, ${img.rleSize}, (const unsigned char [${img.rleSize}]){
            ${Array.from(img.arrayData).map((byte, idx) =>
                `0x${byte.toString(16).padStart(2, '0').toUpperCase()}` +
                (idx < img.arrayData.length - 1 ? (idx % 12 === 11 ? ',\n            ' : ', ') : '')
            ).join('')}
        }
    },
    `;
        }).join('')}
};

${allImages.length > 1 ? `#define  IMG_ARRAY_CHUNK${imgArrIndex > 0 ? '_' + imgArrIndex : ''}_LENGTH                          ${imgArr.length} ///< 图片分片数组长度` : ''}
`;
    }).join('')}
#define  IMG_ARRAY_LENGTH                          ${imgCount} ///< 图片数组长度
/* ------------------ 总共 ${imgCount} 张图片数组数据 end -------------------- */
`;

    await fs.writeFile(filePath, content);
};