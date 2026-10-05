(function (global) {
  'use strict';

  function softenUnverifiedFinalLabel() {
    const root = global.document && global.document.getElementById('resultTable');
    if (!root) return;
    const tags = root.querySelectorAll('.tag');
    for (const tag of tags) {
      if (String(tag.textContent || '').trim() === 'ĐÃ CHỐT') {
        tag.textContent = 'ĐÃ ĐỦ KQ · CHỜ ĐỐI CHIẾU';
        tag.classList.remove('ok');
        tag.classList.add('warn');
      }
    }
  }

  function install() {
    const root = global.document && global.document.getElementById('resultTable');
    if (!root || typeof global.MutationObserver !== 'function') return;
    softenUnverifiedFinalLabel();
    const observer = new global.MutationObserver(softenUnverifiedFinalLabel);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

  global.KTS_RESULT_VERIFICATION_UI = Object.freeze({ softenUnverifiedFinalLabel });
})(typeof window !== 'undefined' ? window : globalThis);
