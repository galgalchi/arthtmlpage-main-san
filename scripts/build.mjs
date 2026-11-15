import { readFile, mkdir, copyFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function build(projectRoot = root, output = path.join(projectRoot, 'dist')) {
  const context = vm.createContext({ URL });
  for (const name of ['setting.js', 'settings-data.js']) vm.runInContext(await readFile(path.join(projectRoot, name), 'utf8'), context, { filename: name });
  const settings = context.SanData.normalize(context.SAN_SETTINGS);
  const images = settings.images;
  const resolvedRoot = await realpath(projectRoot);
  const files = [];
  // 목록은 setting.js에서만 가져옵니다. 사진 폴더를 탐색하거나 설정을 생성하지 않습니다.
  for (const category of images) for (const url of category.images) {
    if (url.startsWith('https://')) continue;
    const relative = url.slice(2).split('/').map(decodeURIComponent).join(path.sep);
    const source = path.join(projectRoot, relative);
    let resolvedSource;
    try { resolvedSource = await realpath(source); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error('setting.js에 등록한 이미지 파일을 찾을 수 없습니다: ' + relative);
      throw error;
    }
    const location = path.relative(resolvedRoot, resolvedSource);
    if (location === '..' || location.startsWith('..' + path.sep) || path.isAbsolute(location)) throw new Error('이미지 파일은 저장소 안에 있어야 합니다: ' + relative);
    files.push({ source, relative });
  }
  await mkdir(output, { recursive: true });
  for (const name of ['index.html', 'style.css', 'setting.js', 'settings-data.js', 'portfolio-carousel.js', 'app.js', '.nojekyll']) await copyFile(path.join(projectRoot, name), path.join(output, name));
  for (const { source, relative } of files) {
    const destination = path.join(output, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  console.log(`빌드 완료: 수동 등록 이미지 ${images.reduce((count, category) => count + category.images.length, 0)}개, 사진 카테고리 ${images.length}개`);
  return { images, settings };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await build();
