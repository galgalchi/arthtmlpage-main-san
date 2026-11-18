import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp, access, unlink, symlink } from 'node:fs/promises';
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
  const dir = await mkdtemp(path.join(os.tmpdir(), 'san-registered-images-'));
  for (const name of ['index.html', 'style.css', 'portfolio-carousel.js', 'app.js', 'embed-client.js', 'artmug-embed.js', '.nojekyll']) await writeFile(path.join(dir, name), 'fixture');
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


test('카테고리 이름과 순서는 수동 설정을 유지하고 원본에는 이미지 경로가 필요 없음', () => {
  const data = api.normalize({ 사진포트폴리오: [
    { 카테고리: '먼저 표시', 폴더: '사진 포트폴리오/B' },
    { 카테고리: '나중 표시', 폴더: './사진 포트폴리오/A', 이미지: ['./사진 포트폴리오/A/01.gif'] },
  ] });
  assert.equal(data.images[0].title, '먼저 표시');
  assert.equal(data.images[0].images.length, 0);
  assert.equal(data.images[1].title, '나중 표시');
  assert.ok(data.images[1].folder.endsWith('/A'));
  assert.ok(data.images[1].images[0].endsWith('/01.gif'));
});

test('한글·공백·특수문자와 이미 인코딩한 폴더/이미지 경로 처리', () => {
  const folder = api.folderPath('사진 포트폴리오/방송 #디자인');
  assert.ok(folder.includes('%20'));
  assert.ok(folder.includes('%23'));
  assert.equal(api.folderPath(folder), folder);
  const normalized = api.imageUrl('./사진 포트폴리오/방송 디자인/01 #&한글.JPG');
  assert.equal(api.imageUrl(normalized), normalized);
  assert.equal(api.imageUrl('images/02.gif'), './images/02.gif');
});

test('잘못된 카테고리와 저장소 밖 폴더/이미지 경로는 거부', () => {
  for (const value of ['../outside', './a/../b', './%2e%2e/outside', './a/%2foutside', '/absolute', 'C:\\images', 'images\\a', 'https://example.com/a', '.', './', './a/%ZZ', '']) assert.throws(() => api.folderPath(value), value);
  for (const value of ['../outside.png', './a/../b.png', './%2e%2e/outside.jpg', '/absolute.png', './a.txt', './a.svg']) assert.throws(() => api.imageUrl(value), value);
  assert.throws(() => api.normalize({ 사진포트폴리오: {} }));
  assert.throws(() => api.normalize({ 사진포트폴리오: [{ 카테고리: '', 폴더: 'images' }] }));
  assert.throws(() => api.normalize({ 사진포트폴리오: [{ 카테고리: '사진' }] }));
  assert.throws(() => api.normalize({ 사진포트폴리오: [{ 카테고리: '사진', 폴더: 'images', 이미지: {} }] }));
});

test('등록 폴더의 이미지만 자동 수집하고 이름·빈 분류·일정과 원본 설정을 보존', async () => {
  const config = { 캘린더: { 휴무일: '2026.11.20', 메모: { '2026.11.20': '테스트' } }, 사진포트폴리오: [
    { 카테고리: '폴더와 다른 표시 이름', 폴더: '사진 포트폴리오/연결 폴더' },
    { 카테고리: '빈 분류', 폴더: '사진 포트폴리오/빈 폴더' },
  ] };
  const dir = await fixture(config);
  const folder = path.join(dir, '사진 포트폴리오', '연결 폴더');
  await mkdir(path.join(folder, '하위'), { recursive: true });
  await mkdir(path.join(folder, '.숨김'), { recursive: true });
  await mkdir(path.join(dir, '사진 포트폴리오', '빈 폴더'), { recursive: true });
  await mkdir(path.join(dir, '사진 포트폴리오', '미등록 분류'), { recursive: true });
  const bytes = Buffer.from('R0lGODlhAQABAIAAAAwBUAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  await writeFile(path.join(folder, '2.gif'), bytes);
  await writeFile(path.join(folder, '10.png'), 'fixture');
  await writeFile(path.join(folder, '하위', '01 #한글.JPG'), 'nested fixture');
  await writeFile(path.join(folder, '.hidden.png'), 'hidden');
  await writeFile(path.join(folder, '.숨김', 'hidden.png'), 'hidden directory');
  await writeFile(path.join(folder, 'note.txt'), 'not image');
  await writeFile(path.join(dir, '사진 포트폴리오', '미등록 분류', '01.png'), 'unregistered');
  const originalSettings = await readFile(path.join(dir, 'setting.js'), 'utf8');
  const result = await build(dir);
  for (const name of ['embed-client.js', 'artmug-embed.js']) {
    assert.equal(await readFile(path.join(dir, 'dist', name), 'utf8'), 'fixture');
  }
  assert.equal(result.images.length, 2);
  assert.equal(result.images[0].title, '폴더와 다른 표시 이름');
  assert.equal(result.images[0].images.length, 3);
  assert.ok(result.images[0].images[0].endsWith('/2.gif'));
  assert.ok(result.images[0].images[1].endsWith('/10.png'));
  assert.match(result.images[0].images[2], /01%20%23/);
  assert.equal(result.images[1].images.length, 0);
  assert.deepEqual(await readFile(path.join(dir, 'dist', '사진 포트폴리오', '연결 폴더', '2.gif')), bytes);
  await missing(path.join(dir, 'dist', '사진 포트폴리오', '연결 폴더', '.hidden.png'));
  await missing(path.join(dir, 'dist', '사진 포트폴리오', '미등록 분류'));
  await missing(path.join(dir, 'dist', 'image-manifest.js'));
  await missing(path.join(dir, 'image-manifest.js'));
  assert.equal(await readFile(path.join(dir, 'setting.js'), 'utf8'), originalSettings);
  const published = vm.createContext({ URL });
  vm.runInContext(await readFile(path.join(dir, 'dist', 'setting.js'), 'utf8'), published);
  vm.runInContext(dataSource, published);
  assert.equal(published.SanData.normalize(published.SAN_SETTINGS).images[0].images.length, 3);
  assert.equal(JSON.stringify(published.SAN_SETTINGS.캘린더), JSON.stringify(config.캘린더));
  assert.equal(published.SAN_SETTINGS.사진포트폴리오[0].폴더, config.사진포트폴리오[0].폴더);
});

test('등록 폴더의 파일 추가·삭제는 목록에 반영되고 새 폴더는 분류로 추가하지 않음', async () => {
  const dir = await fixture({ 사진포트폴리오: [{ 카테고리: '고정 분류', 폴더: 'images' }] });
  await mkdir(path.join(dir, 'images'));
  await writeFile(path.join(dir, 'images', '01.png'), 'one');
  const first = await build(dir, path.join(dir, 'first-output'));
  assert.equal(first.images[0].images.length, 1);
  await writeFile(path.join(dir, 'images', '02.gif'), 'two');
  await unlink(path.join(dir, 'images', '01.png'));
  await mkdir(path.join(dir, 'not-configured'));
  await writeFile(path.join(dir, 'not-configured', '03.png'), 'ignore');
  const second = await build(dir, path.join(dir, 'second-output'));
  assert.equal(second.images.length, 1);
  assert.equal(second.images[0].images.length, 1);
  assert.ok(second.images[0].images[0].endsWith('/02.gif'));
  await missing(path.join(dir, 'second-output', 'images', '01.png'));
});

test('없는 폴더나 파일을 폴더로 등록하면 경로를 표시하고 빌드 실패', async () => {
  const dir = await fixture({ 사진포트폴리오: [{ 카테고리: '사진', 폴더: '사진 포트폴리오/없는 폴더' }] });
  await assert.rejects(build(dir), /등록한 사진 폴더를 찾을 수 없습니다: .*없는 폴더/);
  const fileDir = await fixture({ 사진포트폴리오: [{ 카테고리: '사진', 폴더: 'folder.txt' }] });
  await writeFile(path.join(fileDir, 'folder.txt'), 'file');
  await assert.rejects(build(fileDir), /실제 폴더여야 합니다: folder.txt/);
});

test('폴더 안의 심볼릭 링크는 읽지 않고 링크 폴더 등록도 거부', async t => {
  const dir = await fixture({ 사진포트폴리오: [{ 카테고리: '사진', 폴더: 'images' }] });
  const outside = await mkdtemp(path.join(os.tmpdir(), 'san-outside-images-'));
  await mkdir(path.join(dir, 'images'));
  await writeFile(path.join(outside, 'outside.png'), 'outside');
  try { await symlink(outside, path.join(dir, 'images', 'linked'), 'junction'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('환경에서 링크 생성을 지원하지 않습니다.'); return; }
    throw error;
  }
  const result = await build(dir);
  assert.equal(result.images[0].images.length, 0);
  await writeFile(path.join(dir, 'setting.js'), 'globalThis.SAN_SETTINGS = ' + JSON.stringify({ 사진포트폴리오: [{ 카테고리: '사진', 폴더: 'images/linked' }] }) + ';');
  await assert.rejects(build(dir, path.join(dir, 'linked-output')), /실제 폴더여야 합니다/);
});
