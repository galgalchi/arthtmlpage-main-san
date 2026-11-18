// 부모 페이지에서 실행하며, 앞에 삽입한 샨 iframe에 보고받은 높이를 적용합니다.
(() => {
  const script = document.currentScript;
  if (!script?.src) return;
  const site = new URL('.', script.src);
  const frame = Array.from(document.querySelectorAll('iframe[src]')).reverse().find(candidate => {
    if (!(script.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_PRECEDING)) return false;
    let url;
    try { url = new URL(candidate.src); } catch { return false; }
    return url.origin === site.origin &&
      [site.pathname, site.pathname.slice(0, -1), site.pathname + 'index.html'].includes(url.pathname) &&
      url.searchParams.get('embed') === 'full';
  });
  const attached = Symbol.for('san.embed.height');
  if (!frame || frame[attached]) return;
  frame[attached] = true;

  const channel = 'artmug-embed-v1';
  function requestHeight() {
    frame.contentWindow?.postMessage({ channel, type: 'request-content-height' }, site.origin);
  }

  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== site.origin) return;
    if (event.data?.channel !== channel || event.data.type !== 'content-height') return;
    const { height } = event.data;
    if (!Number.isSafeInteger(height) || height <= 0) return;
    frame.scrolling = 'no';
    frame.style.height = `${height}px`;
  });

  frame.addEventListener('load', requestHeight);
  requestHeight();
})();
