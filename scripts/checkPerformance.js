import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

// 手机首次打开最在意的是需要下载的网页资源大小。
// 这些上限不是网速测试，而是防止后续改动意外让包体明显膨胀。
const LIMITS = {
    javascriptGzip: 250 * 1024,
    cssGzip: 150 * 1024,
    themeImages: 3 * 1024 * 1024
};

async function listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(path));
        } else {
            files.push(path);
        }
    }

    return files;
}

const files = await listFiles('dist');
let javascriptGzip = 0;
let cssGzip = 0;
let themeImages = 0;

for (const file of files) {
    const content = await readFile(file);
    if (file.endsWith('.js')) javascriptGzip += gzipSync(content).length;
    if (file.endsWith('.css')) cssGzip += gzipSync(content).length;
    if (/theme_.*\.png$/i.test(file)) themeImages += (await stat(file)).size;
}

const results = { javascriptGzip, cssGzip, themeImages };
for (const [name, limit] of Object.entries(LIMITS)) {
    if (results[name] > limit) {
        throw new Error(`${name} 超出性能上限：${results[name]} / ${limit} 字节`);
    }
}

console.log(`性能检查通过：脚本压缩后 ${javascriptGzip}B，样式压缩后 ${cssGzip}B，主题图片 ${themeImages}B。`);
