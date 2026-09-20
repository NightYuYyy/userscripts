// ==UserScript==
// @name         ReClaude 额度悬浮角标
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  任意网页右下角悬浮显示 ReClaude 拼车 5h 剩余额度 + 刷新倒计时 + 号状态。走 API Key(Bearer),不依赖 cookie,全局可用。菜单里设置 Key / 显隐。
// @author       DSH
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      www.reclaude.ai
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';
  // 只在顶层窗口跑,避免每个 iframe 都弹一个角标
  if (window.top !== window.self) return;

  const API = 'https://www.reclaude.ai/api/v1/carpool/quota';
  const REFRESH_MS = 60000;

  GM_registerMenuCommand('设置 API Key', setKey);
  GM_registerMenuCommand('显示/隐藏角标', toggle);

  let key = GM_getValue('api_key', '');

  // ---- 角标 DOM ----
  const box = document.createElement('div');
  box.textContent = '…';
  Object.assign(box.style, {
    position: 'fixed', zIndex: 2147483647,
    left: GM_getValue('x', '') || 'auto',
    top: GM_getValue('y', '') || 'auto',
    right: GM_getValue('x', '') ? 'auto' : '16px',
    bottom: GM_getValue('y', '') ? 'auto' : '16px',
    padding: '6px 10px', borderRadius: '8px',
    font: '12px/1.35 -apple-system,Segoe UI,sans-serif',
    color: '#fff', background: 'rgba(32,32,32,.88)',
    whiteSpace: 'pre', textAlign: 'center', cursor: 'grab',
    userSelect: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.3)',
    display: GM_getValue('hidden', false) ? 'none' : 'block',
  });
  const mount = () => (document.body || document.documentElement).appendChild(box);
  document.body ? mount() : addEventListener('DOMContentLoaded', mount);

  // ---- 拖动,记住位置 ----
  let drag = null;
  box.addEventListener('mousedown', (e) => {
    drag = { dx: e.clientX - box.offsetLeft, dy: e.clientY - box.offsetTop };
    box.style.cursor = 'grabbing';
  });
  addEventListener('mousemove', (e) => {
    if (!drag) return;
    const x = e.clientX - drag.dx, y = e.clientY - drag.dy;
    box.style.left = x + 'px'; box.style.top = y + 'px';
    box.style.right = 'auto'; box.style.bottom = 'auto';
  });
  addEventListener('mouseup', () => {
    if (!drag) return;
    drag = null; box.style.cursor = 'grab';
    GM_setValue('x', box.style.left); GM_setValue('y', box.style.top);
  });

  function setKey() {
    const v = prompt('粘贴 ReClaude API Key(rck_ 开头):', key || '');
    if (v == null) return;
    key = v.trim(); GM_setValue('api_key', key); update();
  }
  function toggle() {
    const hidden = box.style.display !== 'none';
    box.style.display = hidden ? 'none' : 'block';
    GM_setValue('hidden', hidden);
  }

  function paint(text, bad) {
    box.textContent = text;
    box.style.background = bad ? 'rgba(150,32,32,.9)' : 'rgba(32,32,32,.88)';
  }
  function countdown(ms) {
    const s = Math.floor((ms - Date.now()) / 1000);
    if (s <= 0) return '即将刷新';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }

  function update() {
    if (!key) { paint('未设置 Key\n菜单里设置', true); return; }
    GM_xmlhttpRequest({
      method: 'GET', url: API,
      headers: { Authorization: 'Bearer ' + key },
      onload: (r) => {
        if (r.status !== 200) { paint('HTTP ' + r.status, true); return; }
        let d; try { d = JSON.parse(r.responseText); } catch { paint('解析失败', true); return; }
        const remain = (+d.quota_usd) - (+d.used_usd);
        const ok = d.state === 'active';
        paint(`剩余 $${remain.toFixed(0)} / ${(+d.quota_usd).toFixed(0)}\n刷新 ${countdown(+d.resets_at_ms)}${ok ? '' : '\n⚠ ' + d.state}`, !ok);
      },
      onerror: () => paint('离线', true),
      ontimeout: () => paint('超时', true),
      timeout: 15000,
    });
  }

  update();
  setInterval(update, REFRESH_MS);
})();
