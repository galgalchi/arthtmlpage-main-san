import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { build } from '../scripts/build.mjs';

const dataSource = await readFile(new URL('../settings-data.js', import.meta.url), 'utf8');
const context = vm.createContext({ URL });
vm.runInContext(dataSource, context);
const api = context.SanData;
const base = cal => api.normalize({ 캘린더: cal, 사진포트폴리오: [] });

async function fixture(config) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'san-manual-images-'));
  for (const name of ['index.html', 'style.css', 'portfolio-carousel.js', 'app.js', '.nojekyll']) await writeFile(path.join(dir, name), 'fixture');
  await writeFile(path.join(dir, 'settings-data.js'), dataSource);
  await writeFile(path.join(dir, 'setting.js'), 'globalThis.SAN_SETTINGS = ' + JSON.stringify(config) + ';\n');
  return dir;
}

const missing = file => assert.rejects(access(file), { code: 'ENOENT' });

test('과거 날짜는 휴무나 작업가능 설정보다 우선하여 마감', () => {
  const data = base({ 휴무일: '2026.01.03,2026.07.08', 작업가능일: '2026.01.02' });
  assert.equal(api.statusFor('2026-01-03', data, '2026-01-04'), 'closed');
  assert.equal(api.statusFor('2026-01-02', data, '2026-01-04'), 'closed');
  assert.equal(api.statusFor('2026-07-08', data, '2026-01-04'), 'holiday');
  assert.equal(api.statusFor('2026-01-04', data, '2026-01-04'), 'available');
});

test('상태 우선순위와 기본상태, 개별 열기', () => {
  const data = base({ 기본상태: '휴무', 작업가능일: '2026.07.01', 휴무일: '2026.07.02', 마감임박일: '2026.07.02,2026.07.03', 마감일: '2026.07.03' });
  assert.equal(api.statusFor('2026-07-01', data, '2026-01-01'), 'available');
  assert.equal(api.statusFor('2026-07-02', data, '2026-01-01'), 'holiday');
  assert.equal(api.statusFor('2026-07-03', data, '2026-01-01'), 'closed');
  assert.equal(api.statusFor('2026-07-04', data, '2026-01-01'), 'holiday');
});

test('문자열·객체 메모, 콜론, 쉼표, 여러 줄과 긴 내용 보존', () => {
  const string = base({ 메모: '2026.01.03:김나나님 작업: 수정,2026.09.12:제갈금자님 작업' });
  assert.equal(string.notes['2026-01-03'], '김나나님 작업: 수정');
  assert.equal(string.notes['2026-09-12'], '제갈금자님 작업');
  const text = '작업, 수정\n상세 내용 '.repeat(100);
  assert.equal(base({ 메모: { '2026.01.03': text } }).notes['2026-01-03'], text.trim());
});

test('한국 시간 자정 경계와 윤년 날짜 검사', () => {
  assert.equal(api.seoulToday(new Date('2026-01-02T14:59:59Z')), '2026-01-02');
  assert.equal(api.seoulToday(new Date('2026-01-02T15:00:00Z')), '2026-01-03');
  assert.equal(api.dateKey('2028.2.29'), '2028-02-29');
  for (const value of ['2026.02.29', '2026.13.01', '2026.04.31', '2026.01.00', '26.01.01']) assert.throws(() => api.dateKey(value));
  assert.throws(() => base({ 기본상태: '오류' }));
});

test('카테고리와 이미지는 설정 배열 순서를 그대로 사용', () => {
  const data = api.normalize({ 사진포트폴리오: [
    { 카테고리: '두 번째 폴더를 먼저', 이미지: ['./사진 포트폴리오/B/10.png', './사진 포트폴리오/B/01.gif'] },
    { 카테고리: '빈 카테고리', 이미지: [] },
  ] });
  assert.equal(data.images[0].title, '두 번째 폴더를 먼저');
  assert.ok(data.images[0].images[0].endsWith('/10.png'));
  assert.ok(data.images[0].images[1].endsWith('/01.gif'));
  assert.equal(data.images[1].images.length, 0);
});

test('한글·공백·특수문자와 이미 인코딩한 이미지 경로 처리', () => {
  const normalized = api.imageUrl('./사진 포트폴리오/방송 디자인/01 #&한글.JPG');
  assert.equal(normalized, './%EC%82%AC%EC%A7%84%20%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4/%EB%B0%A9%EC%86%A1%20%EB%94%94%EC%9E%90%EC%9D%B8/01%20%23%26%ED%95%9C%EA%B8%80.JPG');
  assert.equal(api.imageUrl(normalized), normalized);
  assert.equal(api.imageUrl('images/02.gif'), './images/02.gif');
  assert.equal(api.imageUrl('https://example.com/image.webp?size=large'), 'https://example.com/image.webp?size=large');
});

test('잘못된 카테고리와 위험하거나 지원하지 않는 이미지 경로는 거부', () => {
  for (const value of ['../outside.png', './a/../b.png', './%2e%2e/outside.jpg', './a/%2foutside.jpg', '/absolute.png', 'C:\\images\\a.png', 'images\\a.gif', 'http://example.com/a.png', 'data:image/png;base64,abc', 'javascript:alert(1)', './a.txt', './a.svg', './a/%ZZ.png', '']) assert.throws(() => api.imageUrl(value), value);
  assert.throws(() => api.normalize({ 사진포트폴리오: {} }));
  assert.throws(() => api.normalize({ 사진포트폴리오: [{ 카테고리: '', 이미지: [] }] }));
  assert.throws(() => api.normalize({ 사진포트폴리오: [{ 카테고리: '사진', 이미지: [null] }] }));
  assert.throws(() => api.imageUrl('https://name:password@example.com/a.png'));
});

test('수동 등록한 GIF·한글 파일만 복사하고 새 폴더는 자동 등록하지 않음', async () => {
  const config = { 캘린더: { 휴무일: '2026.11.20', 메모: { '2026.11.20': '테스트' } }, 사진포트폴리오: [
    { 카테고리: '수동 이름', 이미지: ['./사진 포트폴리오/방송 디자인/01 #&한글.gif', 'https://example.com/remote.avif'] },
    { 카테고리: '빈 카테고리', 이미지: [] },
  ] };
  const dir = await fixture(config);
  const folder = path.join(dir, '사진 포트폴리오', '방송 디자인');
  await mkdir(folder, { recursive: true });
  const bytes = Buffer.from('R0lGODlhAQABAIAAAAwBUAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  await writeFile(path.join(folder, '01 #&한글.gif'), bytes);
  await writeFile(path.join(folder, '02-unlisted.png'), 'unlisted');
  await mkdir(path.join(dir, '사진 포트폴리오', '새 폴더'));
  await writeFile(path.join(dir, '사진 포트폴리오', '새 폴더', 'new.png'), 'unlisted folder');
  const originalSettings = await readFile(path.join(dir, 'setting.js'), 'utf8');
  const obsoleteManifest = path.join(dir, 'image-manifest.js');
  await writeFile(obsoleteManifest, 'unused source fixture');
  const result = await build(dir);
  assert.equal(result.images.length, 2);
  assert.equal(result.images[0].title, '수동 이름');
  assert.equal(result.images[0].images.length, 2);
  assert.deepEqual(await readFile(path.join(dir, 'dist', '사진 포트폴리오', '방송 디자인', '01 #&한글.gif')), bytes);
  await missing(path.join(dir, 'dist', '사진 포트폴리오', '방송 디자인', '02-unlisted.png'));
  await missing(path.join(dir, 'dist', '사진 포트폴리오', '새 폴더'));
  await missing(path.join(dir, 'dist', 'image-manifest.js'));
  assert.equal(await readFile(path.join(dir, 'setting.js'), 'utf8'), originalSettings);
  assert.equal(await readFile(obsoleteManifest, 'utf8'), 'unused source fixture');
  assert.equal(await readFile(path.join(dir, 'dist', 'setting.js'), 'utf8'), originalSettings);
});

test('등록된 로컬 파일이 없으면 경로를 명시하고 빌드 실패', async () => {
  const dir = await fixture({ 사진포트폴리오: [{ 카테고리: '사진', 이미지: ['./사진 포트폴리오/없는 파일.png'] }] });
  await assert.rejects(build(dir), /setting\.js에 등록한 이미지 파일을 찾을 수 없습니다: .*없는 파일\.png/);
});
