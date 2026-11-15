/* 브라우저와 배포 스크립트가 공통으로 사용하는 설정 검사·변환 함수. */
globalThis.SanData = (() => {
  const types = { 작업가능: 'available', 마감임박: 'deadline', 휴무: 'holiday', 휴일: 'holiday', 마감: 'closed' };
  const labels = { available: '작업가능', deadline: '마감임박', holiday: '휴무', closed: '마감' };
  function dateKey(value) {
    const m = String(value).trim().match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
    if (!m) throw new Error('날짜 형식을 확인해주세요: ' + value);
    const [y, mo, d] = m.slice(1).map(Number);
    const check = new Date(Date.UTC(y, mo - 1, d));
    if (y < 1000 || y > 9999 || check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw new Error('존재하지 않는 날짜: ' + value);
    return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function dates(value) {
    if (value == null || value === '') return [];
    if (typeof value !== 'string' && !Array.isArray(value)) throw new Error('날짜 목록은 쉼표로 구분한 문자열 또는 배열이어야 합니다.');
    return (Array.isArray(value) ? value : value.split(/[,\n]/)).filter(v => String(v).trim()).map(dateKey);
  }
  function imageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('이미지 경로는 비어 있지 않은 문자열이어야 합니다.');
    const input = value.trim();
    const formats = /\.(png|jpe?g|gif|webp|avif)$/i;
    if (/^https:\/\//i.test(input)) {
      let url;
      try { url = new URL(input); } catch (_) { throw new Error('이미지 주소를 확인해주세요: ' + value); }
      if (url.username || url.password || !formats.test(url.pathname)) throw new Error('지원하지 않는 이미지 주소입니다: ' + value);
      return url.href;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(input) || input.startsWith('/') || input.includes('\\')) throw new Error('이미지는 저장소 상대경로 또는 HTTPS 주소로 입력해주세요: ' + value);
    const relative = input.startsWith('./') ? input.slice(2) : input;
    const segments = relative.split('/').map(segment => {
      let decoded;
      try { decoded = decodeURIComponent(segment); } catch (_) { throw new Error('이미지 경로의 인코딩을 확인해주세요: ' + value); }
      if (!decoded || decoded === '.' || decoded === '..' || /[\/\\\u0000-\u001f\u007f]/.test(decoded)) throw new Error('허용하지 않는 이미지 경로입니다: ' + value);
      return decoded;
    });
    if (!formats.test(segments[segments.length - 1])) throw new Error('지원하는 이미지 형식은 jpg, jpeg, png, gif, webp, avif입니다: ' + value);
    return './' + segments.map(encodeURIComponent).join('/');
  }
  function normalize(settings) {
    if (!settings || typeof settings !== 'object') throw new Error('setting.js의 SAN_SETTINGS를 확인해주세요.');
    const cal = settings.캘린더 || {};
    const defaultType = types[cal.기본상태 || '작업가능'];
    if (!defaultType) throw new Error('지원하지 않는 캘린더 기본상태입니다.');
    const statuses = {};
    for (const [field, type] of [['작업가능일','available'],['마감임박일','deadline'],['휴무일','holiday'],['마감일','closed']]) {
      for (const key of dates(cal[field])) statuses[key] = type;
    }
    const notes = {};
    const addNote = (date, text) => {
      if (typeof text !== 'string') throw new Error('메모 내용은 문자열이어야 합니다: ' + date);
      if (text.trim()) {
        const key = dateKey(date);
        notes[key] = notes[key] ? notes[key] + '\n' + text.trim() : text.trim();
      }
    };
    if (typeof cal.메모 === 'string') {
      for (const entry of cal.메모.split(/,(?=\s*\d{4}[.-]\d{1,2}[.-]\d{1,2}\s*:)/).filter(v=>v.trim())) {
        const pos = entry.indexOf(':');
        if (pos < 0) throw new Error('메모는 날짜:내용 형식이어야 합니다.');
        addNote(entry.slice(0,pos), entry.slice(pos+1));
      }
    } else if (cal.메모 != null) {
      if (typeof cal.메모 !== 'object' || Array.isArray(cal.메모)) throw new Error('메모는 날짜:내용 객체 또는 문자열이어야 합니다.');
      for (const [date, text] of Object.entries(cal.메모)) addNote(date, text);
    }
    if (settings.사진포트폴리오 != null && !Array.isArray(settings.사진포트폴리오)) throw new Error('사진포트폴리오는 카테고리 배열이어야 합니다.');
    const images = (settings.사진포트폴리오 || []).map((cat, i) => {
      if (!cat || typeof cat.카테고리 !== 'string' || !cat.카테고리.trim() || !Array.isArray(cat.이미지)) throw new Error('사진 카테고리 이름과 이미지 배열을 확인해주세요: ' + (i + 1));
      return { title: cat.카테고리.trim(), images: cat.이미지.map(imageUrl) };
    });
    return { name: settings.이름 || '샨', defaultType, statuses, notes, images };
  }
  function seoulToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
    const get = type => parts.find(p=>p.type===type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  const statusFor = (key, data, current = seoulToday()) => key < current ? 'closed' : data.statuses[key] || data.defaultType;
  return { normalize, dateKey, seoulToday, statusFor, labels, imageUrl };
})();
