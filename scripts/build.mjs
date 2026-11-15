import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const formats = /\.(png|jpe?g|gif|webp|avif)$/i;
const compare = (a,b) => a.localeCompare(b,'ko',{numeric:true,sensitivity:'base'}) || a.localeCompare(b);

export async function collectImages(projectRoot, order=[]) {
  const base=path.join(projectRoot,'사진 포트폴리오');
  let folders;
  try { folders=await readdir(base,{withFileTypes:true}); }
  catch(error){if(error.code==='ENOENT') return [];throw error;}
  const categories=[];
  async function scan(dir,segments) {
    const result=[];
    const entries=(await readdir(dir,{withFileTypes:true})).sort((a,b)=>compare(a.name,b.name));
    for(const entry of entries) {
      if(entry.name.startsWith('.'))continue;
      if(entry.isDirectory())result.push(...await scan(path.join(dir,entry.name),[...segments,entry.name]));
      else if(entry.isFile() && formats.test(entry.name))result.push('./'+['사진 포트폴리오',...segments,entry.name].map(encodeURIComponent).join('/'));
    }
    return result;
  }
  for(const folder of folders.filter(f=>f.isDirectory()&&!f.name.startsWith('.'))) {
    categories.push({title:folder.name,images:await scan(path.join(base,folder.name),[folder.name])});
  }
  categories.sort((a,b)=>{
    const ai=order.indexOf(a.title),bi=order.indexOf(b.title);
    return (ai<0?Infinity:ai)-(bi<0?Infinity:bi) || compare(a.title,b.title);
  });
  return categories;
}

export async function build(projectRoot=root, output=path.join(projectRoot,'dist')) {
  const context=vm.createContext({});
  for(const name of ['setting.js','settings-data.js'])vm.runInContext(await readFile(path.join(projectRoot,name),'utf8'),context,{filename:name});
  const settings=context.SanData.normalize(context.SAN_SETTINGS); // 잘못된 설정은 기존 공개본을 대체하지 않고 배포 실패로 알립니다.
  const images=await collectImages(projectRoot,Array.from(settings.imageOrder));
  const manifest='/* 사진 폴더에서 자동 생성됩니다. 직접 수정하지 마세요. */\nglobalThis.SAN_IMAGE_CATEGORIES = '+JSON.stringify(images,null,2)+';\n';
  await mkdir(output,{recursive:true});
  for(const name of ['index.html','style.css','setting.js','settings-data.js','portfolio-carousel.js','app.js','.nojekyll'])await copyFile(path.join(projectRoot,name),path.join(output,name));
  await writeFile(path.join(output,'image-manifest.js'),manifest);
  // 개발용 원본에서도 같은 목록을 사용합니다. 실제 공개본은 매 배포마다 새로 생성합니다.
  await writeFile(path.join(projectRoot,'image-manifest.js'),manifest);
  for(const category of images)for(const url of category.images) {
    const relative=url.slice(2).split('/').map(decodeURIComponent).join(path.sep);
    const destination=path.join(output,relative);
    await mkdir(path.dirname(destination),{recursive:true});
    await copyFile(path.join(projectRoot,relative),destination);
  }
  console.log(`빌드 완료: 영상 ${settings.videos.reduce((n,c)=>n+c.videos.length,0)}개, 이미지 ${images.reduce((n,c)=>n+c.images.length,0)}개, 사진 카테고리 ${images.length}개`);
  return {images,settings};
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await build();
