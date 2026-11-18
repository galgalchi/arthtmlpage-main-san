// iframe 안에서 본문 높이를 측정해 부모 페이지에 전달합니다.
(() => {
  if (window.parent === window || new URLSearchParams(location.search).get('embed') !== 'full') return;
  const content = document.querySelector('main');
  if (!content) return;

  const channel = 'artmug-embed-v1';
  let parentOrigin;
  let lastHeight = 0;

  function reportHeight(force = false) {
    // iframe의 현재 높이와 무관하게 본문을 측정하면 섹션을 닫을 때도 줄어듭니다.
    const height = Math.ceil(content.getBoundingClientRect().height);
    if (height <= 0 || (!force && height === lastHeight)) return;
    lastHeight = height;
    window.parent.postMessage({ channel, type: 'content-height', height }, parentOrigin);
  }

  const observer = new ResizeObserver(() => reportHeight());
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !/^https?:\/\//.test(event.origin)) return;
    if (event.data?.channel !== channel || event.data.type !== 'request-content-height') return;

    parentOrigin = event.origin;
    observer.observe(content, { box: 'border-box' });
    reportHeight(true);
  });
})();
