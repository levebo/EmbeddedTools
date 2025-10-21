import path from "path";

import {accessSync, createWriteStream, mkdirSync, readFileSync, statSync, writeFileSync} from "fs";
import {Jimp} from "jimp";
import {pinyin} from "pinyin";

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
/**
 * RLE解码
 * @param encoded 编码后的数据
 * @param littleEndian 是否小端序 默认小端序
 * @returns {Uint8Array<ArrayBuffer>} 解码后的像素数据
 */
export const rleDecodeRgb565 = (encoded, littleEndian = true) => {
    const decoded = [];
    let i = 0;
    const len = encoded.length;

    // 从两个字节读取一个 RGB565 像素值（根据字节序处理）
    const readPixel = () => {
        const byte1 = encoded[i++];
        const byte2 = encoded[i++];
        if (littleEndian) {
            return (byte2 << 8) | byte1;
        } else {
            return (byte1 << 8) | byte2;
        }
    };

    while (i < len) {
        const count = encoded[i++];
        if (count >= 128) {
            // 重复序列
            const repeatCount = count - 128;
            const pixel = readPixel();
            for (let j = 0; j < repeatCount; j++) {
                decoded.push(pixel);
            }
        } else {
            // 非重复序列
            for (let j = 0; j < count; j++) {
                decoded.push(readPixel());
            }
        }
    }
    const u8Data = new Uint8Array(decoded.length * 2);
    const u16Data = new Uint16Array(decoded)
    // 遍历 uint16Array，使用 DataView 读取每个 16 位元素
    for (let i = 0; i < decoded.length; i++) {
        const value = u16Data[i];
        if (littleEndian) {
            // 交换高低字节顺序
            u8Data[i * 2] = value & 0xFF;
            u8Data[i * 2 + 1] = (value >> 8) & 0xFF;
        } else {
            // 正常提取高低字节
            u8Data[i * 2] = (value >> 8) & 0xFF;
            u8Data[i * 2 + 1] = value & 0xFF;
        }
    }
    return u8Data;
};

// RGB565 转 RGB888
const RGB565_TO_RGB888 = (rgb565) => {
    const r5 = (rgb565 >> 11) & 0x1F;  // 取高5位 (红色)
    const g6 = (rgb565 >> 5) & 0x3F;  // 取中间6位(绿色)
    const b5 = rgb565 & 0x1F;           // 取低5位 (蓝色)
    // 通过线性插值扩展到 8 位
    const r = Math.round((r5 / 31) * 255);
    const g = Math.round((g6 / 63) * 255);
    const b = Math.round((b5 / 31) * 255);
    return {r, g, b}
};

/**
 * 处理图片数组
 * @param inputDir
 * @param outputDir
 * @param mergedFileName
 * @param showRLE
 * @returns {Promise<{results: *[], source: Object, mergedFile: Object}>}
 */
export const processImages = async ({files, outputDir, mergedFileName, showRLE, isEnumMapping}) => {
    const results = [];
    const imageInfos = [];
    let totalOffset = 0;

    // 确保输出目录存在
    try {
        accessSync(outputDir);
    } catch {
        mkdirSync(outputDir, {recursive: true});
    }

    // 创建合并文件
    const mergedFileFillName = `${mergedFileName}.bin`;
    const mergedFilePath = path.join(outputDir, mergedFileFillName);
    const mergedStream = createWriteStream(mergedFilePath);

    // 处理每个文件
    for (const inputFile of files) {
        try {
            const file = readFileSync(inputFile.filePath, "utf-8");
            const {width, height, bytesPerPixel, isRLE, littleEndian, byteArray} = extractImageData(file);
            const fileName = path.basename(inputFile.fileName, '.c');

            // 写入单个bin文件
            const singleFilePath = path.join(outputDir, `${fileName}.bin`);
            writeFileSync(singleFilePath, byteArray);

            // 追加到合并文件
            mergedStream.write(byteArray);

            // 记录图像信息
            const imageInfo = {
                offset: totalOffset,
                size: byteArray.length,
                width,
                height,
                fileName,
                bytesPerPixel,
                isRLE,
                littleEndian
            };

            imageInfos.push(imageInfo);


            // 处理返回结果
            let items = {
                success: true,
                fileName,
                path: singleFilePath,
                width,
                height,
                size: byteArray.length,
                offset: totalOffset,
            };
            if (bytesPerPixel === 2) {// RGB565 数据
                let rgbData = null;
                if (isRLE) {
                    rgbData = rleDecodeRgb565(byteArray, littleEndian);
                } else {
                    rgbData = byteArray;
                }
                if (rgbData) {
                    const image = await new Jimp({width, height})
                    image.scan(0, 0, width, height, (x, y, idx) => {
                        // 计算当前像素在二进制数据中的偏移量
                        const offset = (y * width + x) * 2;

                        // 读取 2 个字节的数据
                        let rgb565;
                        const byte1 = rgbData[offset];
                        const byte2 = rgbData[offset + 1];
                        if (littleEndian) {
                            rgb565 = (byte2 << 8) | byte1;
                        } else {
                            rgb565 = (byte1 << 8) | byte2;
                        }

                        // 提取 RGB 通道值
                        const {r, g, b} = RGB565_TO_RGB888(rgb565);
                        image.bitmap.data[idx] = r;
                        image.bitmap.data[idx + 1] = g;
                        image.bitmap.data[idx + 2] = b;
                        image.bitmap.data[idx + 3] = 255;
                    })
                    items.fileBase64 = await image.getBase64("image/png")
                }
            } else if (bytesPerPixel === 3) { // RGB888
                const image = await new Jimp({width, height})
                // 解析 RGB888 数据并设置像素颜色
                image.scan(0, 0, width, height, (x, y, idx) => {
                    // 计算当前像素在二进制数据中的偏移量
                    const offset = (y * width + x) * 3;
                    // 提取 RGB 通道值
                    const r = byteArray[offset];
                    const g = byteArray[offset + 1];
                    const b = byteArray[offset + 2];
                    image.bitmap.data[idx] = r;
                    image.bitmap.data[idx + 1] = g;
                    image.bitmap.data[idx + 2] = b;
                    image.bitmap.data[idx + 3] = 255;
                })
                items.fileBase64 = await image.getBase64("image/png")
            }
            results.push(items);
            totalOffset += byteArray.length;
        } catch (error) {
            results.push({
                success: false,
                fileName: inputFile.fileName,
                error: error.message,
            });
        }
    }

    mergedStream.end();

    // 生成图片信息源文件
    const sourceContent = generateSourceContent(imageInfos, showRLE, isEnumMapping);

    const sourceName = 'images_info.c';
    const sourcePath = path.join(outputDir, sourceName);

    writeFileSync(sourcePath, sourceContent);

    const wait = async (ms) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    await wait(100);

    const sourceStats = statSync(sourcePath);
    const mergedFileStats = statSync(mergedFilePath);

    const source = {
        name: sourceName,
        desc: '图片和内存地址偏移信息',
        path: sourcePath,
        size: sourceStats.size,
        createTime: sourceStats.mtime
    }
    const mergedFile = {
        name: mergedFileFillName,
        desc: '合并后的二进制文件',
        path: mergedFilePath,
        size: mergedFileStats.size,
        createTime: mergedFileStats.mtime
    }
    return {results, source, mergedFile};
};

// 提取图像数据
function extractImageData(content) {
    let littleEndian = true;
    // 精确匹配 字节序 LITTLE_ENDIAN 宏
    const defReg = /#define\s+LITTLE_ENDIAN\s+(\d+)/;
    const defMatch = defReg.exec(content);
    if (defMatch) {
        littleEndian = Boolean(Number(defMatch[1]));
    }
    // 匹配结构体定义
    const structRegex = /static\s+const\s+struct\s*{([\s\S]+?)}\s*(\w+)\s*=\s*{([\s\S]+?)};/;
    const structMatch = content.match(structRegex);

    if (!structMatch) {
        throw new Error('未找到有效的图像结构体定义');
    }

    const structBody = structMatch[1];
    const structName = structMatch[2];
    const initValues = structMatch[3].trim();

    // 提取宽度、高度和字节/像素
    const widthMatch = structBody.match(/unsigned\s+int\s+width\s*;/);
    const heightMatch = structBody.match(/unsigned\s+int\s+height\s*;/);
    const bppMatch = structBody.match(/unsigned\s+int\s+bytes_per_pixel\s*;/);
    const isRLEMatch = structBody.match(/unsigned\s+char\s+is_rle\s*;/);
    const dataLengthMatch = structBody.match(/unsigned\s+int\s+data_length\s*;/);

    if (!widthMatch || !heightMatch || !bppMatch || !isRLEMatch || !dataLengthMatch) {
        throw new Error('结构体中缺少必要的字段(width, height, bytes_per_pixel, is_rle, data_length)');
    }

    // 改进的初始化值解析 - 处理多行和缩进
    const initLines = initValues.split('\n').map(line => line.trim());
    const firstLine = initLines[0];
    const lastLine = initLines[initLines.length - 1];

    // 提取前5个值（宽度、高度、bpp、是否RLE编码、数据大小）
    const headerValues = firstLine.split(',')
        .map(val => val.trim().replace(/,$/, ''))
        .filter(val => val !== '');

    if (headerValues.length < 5) {
        throw new Error('无法解析结构体初始化值 - 缺少必要的头部值');
    }

    const width = parseInt(headerValues[0], 10);
    const height = parseInt(headerValues[1], 10);
    const bytesPerPixel = parseInt(headerValues[2], 10);
    const isRLE = Boolean(Number(headerValues[3]));
    const dataSize = parseInt(headerValues[4], 10);

    // 提取数组数据
    const arrayStart = initValues.indexOf('{') + 1;
    const arrayEnd = initValues.lastIndexOf('}');

    if (arrayStart === -1 || arrayEnd === -1) {
        throw new Error('无法定位数组数据');
    }

    const arrayContent = initValues.slice(arrayStart, arrayEnd).trim();

    // 清理数组内容字符串
    const rleString = arrayContent
        .replace(/\s+/g, ' ') // 替换所有空白为单个空格
        .replace(/,\s*/g, ',') // 移除逗号后的空格
        .trim();

    const dataArray = rleString.split(',').filter(byte => byte.trim() !== '');

    if (dataArray.length !== dataSize) {
        throw new Error(`数组数据大小不匹配: 预期${dataSize}, 实际${dataArray.length}`);
    }

    // 转换为字节数组
    const byteArray = new Uint8Array(dataArray.map(byte => {
        const trimmed = byte.trim();
        if (trimmed.startsWith('0x')) {
            return parseInt(trimmed, 16);
        }
        return parseInt(trimmed, 10);
    }));

    return {width, height, bytesPerPixel, isRLE, littleEndian, byteArray};
}

// 生成源文件内容
function generateSourceContent(imageInfos, showRLE, isEnumMapping) {
    let sourceContent = `

// 字节序 1：小端序 0：大端序
#define LITTLE_ENDIAN       ${imageInfos[0].littleEndian ? 1 : 0}

/**
 * 图片信息结构体
 */
typedef struct {
    size_t offset;        // 图片存储地址偏移量
    size_t size;          // 图片大小
    unsigned int width;   // 图片宽度
    unsigned int height;  // 图片高度
    ${showRLE ? 'unsigned char is_rle; // 是否使用RLE编码' : ''}
} ImageInfo;

`;

    // 定义图像信息数组
    sourceContent += `static const ImageInfo image_infos[] = {\n`;

    for (let i = 0; i < imageInfos.length; i++) {
        const info = imageInfos[i];
        sourceContent += `    { ${info.offset}, ${info.size}, ${info.width}, ${info.height}${showRLE ? ', ' + (info.isRLE ? 1 : 0) : ''} }, // ${i}: ${info.fileName}\n`;
    }

    sourceContent += `};\n\n`;

    // 定义图像信息数组 地址用hex的形式
    sourceContent += `static const ImageInfo image_infos_hex[] = {\n`;

    for (let i = 0; i < imageInfos.length; i++) {
        const info = imageInfos[i];
        sourceContent += `    { 0x${info.offset.toString(16).padStart(8, '0').toUpperCase()}, ${info.size}, ${info.width}, ${info.height} }, // ${i}: ${info.fileName}\n`;
    }

    sourceContent += `};\n\n`;

    // 判断是否需要生成枚举映射信息
    if (isEnumMapping) {
        sourceContent += `// 图片枚举映射\ntypedef enum {\n`;
        for (let i = 0; i < imageInfos.length; i++) {
            const info = imageInfos[i];
            const pinyinName = pinyin(info.fileName, {style: pinyin.STYLE_NORMAL, segment: true}).flat().join('_')
            // 将拼音转换为大写
            const upperCasePinyin = pinyinName.toUpperCase();
            // 移除特殊字符，只保留字母、数字和下划线
            const validName = upperCasePinyin.replace(/[^a-zA-Z0-9_]/g, '');
            // 确保不以数字开头，如果以数字开头则添加前缀
            const finalName = /^\d/.test(validName) ? `IMG_${validName}` : validName;
            sourceContent += `  /* ${i}: ${info.fileName} */\n  ${finalName}${i === 0 ? ' = 0' : ''},\n`;
        }
        sourceContent += `} ImageMapping;\n\n`;
    }

    // 定义图像数量
    sourceContent += `#define  IMAGE_INFOS_NUM                          ${imageInfos.length} ///< 图片数量长度\n`;

    return sourceContent;
}