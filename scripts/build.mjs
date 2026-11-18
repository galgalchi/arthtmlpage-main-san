import { readFile, writeFile, mkdir, copyFile, realpath, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const formats = /\.(png|jpe?g|gif|webp|avif)$/i;
const compare = (a, b) => a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' }) || a.localeCompare(b);
const relativeFromUrl = url => url.slice(2).split('/').map(decodeURIComponent).join(path.sep);
const imageUrl = relative => './' + relative.split(path.sep).map(encodeURIComponent).join('/');

function assertInside(rootPath, target, relative) {
  const location = path.relative(rootPath, target);
  if (location === '..' || location.startsWith('..' + path.sep) || path.isAbsolute(location)) throw new Error('사진 폴더와 파일은 저장소 안에 있어야 합니다: ' + relative);
}

export async function build(projectRoot = root, output = path.join(projectRoot, 'dist')) {
  const context = vm.createContext({ URL });
  for (const name of ['setting.js', 'settings-data.js']) vm.runInContext(await readFile(path.join(projectRoot, name), 'utf8'), context, { filename: name });
  const settings = context.SanData.normalize(context.SAN_SETTINGS);
  const resolvedRoot = await realpath(projectRoot);
  const files = new Map();
  const images = [];

  async function scan(directory) {
    const result = [];
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => compare(a.name, b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const source = path.join(directory, entry.name);
      const relative = path.relative(projectRoot, source);
      if (entry.isDirectory()) {
        assertInside(resolvedRoot, await realpath(source), relative);
        result.push(...await scan(source));
      } else if (entry.isFile() && formats.test(entry.name)) {
        assertInside(resolvedRoot, await realpath(source), relative);
        result.push(imageUrl(relative));
        files.set(relative, source);
      }
    }
    return result;
  }

  // 카테고리는 설정 순서 그대로 유지하고, 등록한 폴더 안의 이미지만 읽습니다.
  for (const category of settings.images) {
    const relative = relativeFromUrl(category.folder);
    const directory = path.join(projectRoot, relative);
    let info;
    try { info = await lstat(directory); }
    catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new Error('setting.js에 등록한 사진 폴더를 찾을 수 없습니다: ' + relative);
      throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('등록한 사진 경로는 실제 폴더여야 합니다: ' + relative);
    assertInside(resolvedRoot, await realpath(directory), relative);
    images.push({ ...category, images: await scan(directory) });
  }

  // 사용자 설정 원본은 그대로 두고, 공개되는 같은 setting.js에만 이미지 목록을 채웁니다.
  const publishedSettings = JSON.parse(JSON.stringify(context.SAN_SETTINGS));
  publishedSettings.사진포트폴리오 = (publishedSettings.사진포트폴리오 || []).map((category, index) => ({ ...category, 이미지: images[index].images }));
  const compiled = '/* 배포 시 등록 폴더에서 이미지 목록을 채운 설정입니다. 원본은 저장소의 setting.js에서 수정하세요. */\n' +
    'globalThis.SAN_SETTINGS = ' + JSON.stringify(publishedSettings, null, 2) + ';\n';
  await mkdir(output, { recursive: true });
  for (const name of ['index.html', 'style.css', 'settings-data.js', 'portfolio-carousel.js', 'app.js', 'embed-client.js', 'artmug-embed.js', '.nojekyll']) await copyFile(path.join(projectRoot, name), path.join(output, name));
  await writeFile(path.join(output, 'setting.js'), compiled);
  for (const [relative, source] of files) {
    const destination = path.join(output, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  console.log(`빌드 완료: 등록 폴더 이미지 ${images.reduce((count, category) => count + category.images.length, 0)}개, 수동 카테고리 ${images.length}개`);
  return { images, settings: { ...settings, images } };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await build();
