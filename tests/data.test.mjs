import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { collectImages } from '../scripts/build.mjs';

const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../settings-data.js',import.meta.url),'utf8'),context);
const api=context.SanData;
const base=cal=>api.normalize({캘린더:cal,영상포트폴리오:[]});

test('과거 날짜는 휴무나 작업가능 설정보다 우선하여 마감',()=>{
  const data=base({휴무일:'2026.01.03,2026.07.08',작업가능일:'2026.01.02'});
  assert.equal(api.statusFor('2026-01-03',data,'2026-01-04'),'closed');
  assert.equal(api.statusFor('2026-01-02',data,'2026-01-04'),'closed');
  assert.equal(api.statusFor('2026-07-08',data,'2026-01-04'),'holiday');
  assert.equal(api.statusFor('2026-01-04',data,'2026-01-04'),'available');
});
test('상태 우선순위와 기본상태, 개별 열기',()=>{
  const data=base({기본상태:'휴무',작업가능일:'2026.07.01',휴무일:'2026.07.02',마감임박일:'2026.07.02,2026.07.03',마감일:'2026.07.03'});
  assert.equal(api.statusFor('2026-07-01',data,'2026-01-01'),'available');
  assert.equal(api.statusFor('2026-07-02',data,'2026-01-01'),'holiday');
  assert.equal(api.statusFor('2026-07-03',data,'2026-01-01'),'closed');
  assert.equal(api.statusFor('2026-07-04',data,'2026-01-01'),'holiday');
});
test('문자열·객체 메모, 콜론, 쉼표, 여러 줄과 긴 내용 보존',()=>{
  const string=base({메모:'2026.01.03:김나나님 작업: 수정,2026.09.12:제갈금자님 작업'});
  assert.equal(string.notes['2026-01-03'],'김나나님 작업: 수정');
  assert.equal(string.notes['2026-09-12'],'제갈금자님 작업');
  const text='작업, 수정\n상세 내용 '.repeat(100);
  assert.equal(base({메모:{'2026.01.03':text}}).notes['2026-01-03'],text.trim());
});
test('한국 시간 자정 경계와 윤년 날짜 검사',()=>{
  assert.equal(api.seoulToday(new Date('2026-01-02T14:59:59Z')),'2026-01-02');
  assert.equal(api.seoulToday(new Date('2026-01-02T15:00:00Z')),'2026-01-03');
  assert.equal(api.dateKey('2028.2.29'),'2028-02-29');
  for(const value of ['2026.02.29','2026.13.01','2026.04.31','2026.01.00','26.01.01'])assert.throws(()=>api.dateKey(value));
});
test('유튜브 ID만 허용하고 설정 오류를 배포 전에 검출',()=>{
  assert.equal(api.normalize({영상포트폴리오:[{카테고리:'영상',영상:['yTuLEahnNWk']}]}).videos[0].videos[0],'yTuLEahnNWk');
  assert.throws(()=>api.normalize({영상포트폴리오:[{카테고리:'영상',영상:['https://youtube.com/watch?v=yTuLEahnNWk']}]}));
  assert.throws(()=>base({기본상태:'오류'}));
  assert.throws(()=>base({휴무일:'2026.02.30'}));
});
test('사진 폴더명 자동 카테고리·GIF·한글/공백/특수문자·빈 폴더·신규 폴더',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'san-gallery-test-'));
  const photos=path.join(dir,'사진 포트폴리오');
  for(const folder of ['방송 디자인','새 카테고리','빈 폴더'])await mkdir(path.join(photos,folder),{recursive:true});
  for(const file of ['10.png','2.gif','01 #&한글.JPG','skip.txt','.hidden.png'])await writeFile(path.join(photos,'방송 디자인',file),'fixture');
  await writeFile(path.join(photos,'새 카테고리','01.webp'),'fixture');
  const cats=await collectImages(dir,['방송 디자인']);
  assert.equal(cats[0].title,'방송 디자인');assert.equal(cats[0].images.length,3);
  assert.match(cats[0].images[0],/01%20%23%26/);
  assert.ok(cats[0].images[1].endsWith('2.gif'));assert.ok(cats[0].images[2].endsWith('10.png'));
  assert.equal(cats.find(c=>c.title==='빈 폴더').images.length,0);
  await mkdir(path.join(photos,'추가 폴더'));
  assert.equal((await collectImages(dir)).length,4);
});
