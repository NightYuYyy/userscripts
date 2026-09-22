// ==UserScript==
// @name         qh 域名池同步 → GPT_Execl
// @namespace    https://github.com/NightYuYyy/userscripts
// @version      1.1.0
// @description  从 mail.aixhan.com(qh) 拉取域名列表，按上传日期筛选后导入 GPT_Execl(:8000) 的 MoeMail 域名池。本地缓存 + 增量拉取（只取新头部），支持覆盖/追加，凭据仅存本地。
// @match        http://152.53.54.94:8000/*
// @match        https://152.53.54.94:8000/*
// @connect      mail.aixhan.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

/*
 * 数据来源 qh(mail.aixhan.com)：
 *   - 登录 POST /api/v1/auth/login {username,password} → data.token (JWT, ~30d)
 *   - 列域名 GET /api/v1/domains?limit=200&offset=N + Authorization: Bearer <JWT>
 *     每页封顶 200；data.total 总数；data.items[].{name,createdAt,enabled,catchAll}
 *     列表按 createdAt 倒序（最新在前）且跨页单调 —— 增量拉取的前提。
 *   - API Key 不能读域名（只认 JWT），故用账号密码换 JWT；跨域用 GM_xmlhttpRequest 绕 CSP
 * 缓存策略：
 *   - 全量域名（{name,createdAt}）存 GM 本地，开面板秒开、不重复拉。
 *   - 「增量刷新」从 offset 0 往下翻，遇到已缓存域名即停 —— 通常只拉 1 页而非 26 页。
 *   - 「全量重建」忽略缓存整表重拉（用于同步 qh 上的删除）。
 * 导入目标 GPT_Execl(本页 :8000)：
 *   - 读池 GET /api/settings → settings.moemail_domains（换行分隔）
 *   - 写池 POST /api/settings {settings:{moemail_domains,moemail_domain}}（按键增量 upsert）
 *   - 鉴权靠浏览器已登录的 httponly session cookie（fetch credentials:'include' 自动带）
 * 凭据：qh 用户名/密码用 GM_setValue 存本地浏览器，不进仓库、不外发第三方。
 */

(function () {
  'use strict';

  const K = { base: 'qh_base', user: 'qh_user', pass: 'qh_pass', jwt: 'qh_jwt', cache: 'qh_domains', cacheTs: 'qh_domains_ts' };
  const DEFAULT_BASE = 'https://mail.aixhan.com';
  const PAGE = 200;

  const get = (k, d) => GM_getValue(k, d);
  const set = (k, v) => GM_setValue(k, v);

  const loadCache = () => { try { return JSON.parse(get(K.cache, '')) || null; } catch { return null; } };
  const saveCache = (items) => { set(K.cache, JSON.stringify(items)); set(K.cacheTs, Date.now()); };

  // ---------- cross-origin request to qh (GM_xmlhttpRequest, bypasses page CSP) ----------
  function gmReq(method, url, { headers = {}, data } = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url, headers, data,
        onload: (r) => resolve({ status: r.status, text: r.responseText }),
        onerror: () => reject(new Error('网络错误: ' + url)),
        ontimeout: () => reject(new Error('超时: ' + url)),
        timeout: 30000,
      });
    });
  }

  const jwtExp = (t) => {
    try { return (JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0) * 1000; }
    catch { return 0; }
  };

  async function credentials() {
    let user = get(K.user, ''), pass = get(K.pass, '');
    if (!user || !pass) {
      user = (prompt('qh 用户名', user || 'qh') || '').trim();
      pass = prompt('qh 密码', pass || '') || '';
      if (!user || !pass) throw new Error('已取消：需要 qh 用户名和密码');
      set(K.user, user); set(K.pass, pass);
    }
    return { user, pass };
  }

  // ---------- qh: get a valid JWT (cached until <1d to expiry) ----------
  async function getJwt(force) {
    const base = get(K.base, DEFAULT_BASE);
    const cached = get(K.jwt, '');
    if (!force && cached && jwtExp(cached) - Date.now() > 86400e3) return cached;
    const { user, pass } = await credentials();
    const r = await gmReq('POST', base + '/api/v1/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ username: user, password: pass }),
    });
    if (r.status !== 200) throw new Error('登录失败 (' + r.status + ')：' + r.text.slice(0, 200));
    const tok = JSON.parse(r.text)?.data?.token;
    if (!tok) throw new Error('登录响应无 token');
    set(K.jwt, tok);
    return tok;
  }

  // ---------- qh: one page (retry + 401 refresh) ----------
  async function pageData(base, ref, offset) {
    for (let a = 0; a < 3; a++) {
      const r = await gmReq('GET', `${base}/api/v1/domains?limit=${PAGE}&offset=${offset}`,
        { headers: { Authorization: 'Bearer ' + ref.jwt } });
      if (r.status === 401 && a === 0) { ref.jwt = await getJwt(true); continue; }
      if (r.status !== 200) { if (a === 2) throw new Error('拉取失败 (' + r.status + ')'); continue; }
      return JSON.parse(r.text).data;
    }
  }

  // 从 offset 0 往下翻，收集 name 不在 knownNames 里的可收件域名。
  // knownNames 为空 = 全量拉；非空则翻到某页 0 个新域名即停（已进入缓存区间）。
  async function fetchNew(knownNames, onProgress) {
    const base = get(K.base, DEFAULT_BASE);
    const ref = { jwt: await getJwt(false) };
    const out = [];
    let total = 0;
    for (let off = 0; ; off += PAGE) {
      const d = await pageData(base, ref, off);
      total = d.total || total;
      const items = d.items || [];
      let fresh = 0;
      for (const it of items) {
        if (!(it.enabled && it.catchAll)) continue;
        if (knownNames.has(it.name)) continue;
        out.push({ name: it.name, createdAt: it.createdAt });
        fresh++;
      }
      onProgress?.(out.length, total);
      if (items.length < PAGE) break;               // 最后一页
      if (knownNames.size && fresh === 0) break;     // 已重叠进缓存区间
      if (off + PAGE >= total) break;                // 兜底
    }
    return out;
  }

  const mergeItems = (fresh, cached) => {
    const seen = new Set(), out = [];
    for (const it of [...fresh, ...cached]) { if (seen.has(it.name)) continue; seen.add(it.name); out.push(it); }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  };

  // ---------- GPT_Execl (:8000, same-origin, session cookie) ----------
  const localGet = (path) => fetch('/api' + path, { credentials: 'include' })
    .then((r) => r.ok ? r.json() : Promise.reject(new Error('本站 ' + path + ' → ' + r.status + (r.status === 401 ? '（请先登录 :8000 后台）' : ''))));
  const localPost = (path, body) => fetch('/api' + path, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.ok ? r.json() : Promise.reject(new Error('本站 ' + path + ' → ' + r.status)));

  const splitPool = (s) => (s || '').split(/[\n,，;；]+/).map((v) => v.trim()).filter(Boolean);
  const localDay = (iso) => new Date(iso).toLocaleDateString('sv-SE'); // YYYY-MM-DD 本地时区
  const fmtTs = (ms) => ms ? new Date(ms).toLocaleString('sv-SE') : '从未';

  // ---------- UI ----------
  const $ = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
  const btn = (t, primary) => $('button', `padding:6px 10px;border-radius:8px;border:1px solid ${primary ? '#2563eb' : '#d0d5dd'};` +
    `background:${primary ? '#2563eb' : '#fff'};color:${primary ? '#fff' : '#111'};cursor:pointer;font-size:13px`, t);

  let panel;
  function togglePanel() { if (panel) { panel.remove(); panel = null; } else openPanel(); }

  async function openPanel() {
    panel = $('div', `position:fixed;top:16px;right:16px;width:390px;max-height:90vh;z-index:2147483000;
      display:flex;flex-direction:column;background:#fff;color:#111;border:1px solid #d0d5dd;border-radius:12px;
      box-shadow:0 12px 40px rgba(0,0,0,.18);font:13px/1.5 system-ui,sans-serif;overflow:hidden`);

    const head = $('div', 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #eee;background:#f8fafc');
    head.append($('b', 'font-size:13px', 'qh 域名池同步'));
    const closeBtn = $('span', 'cursor:pointer;color:#888;font-size:18px;line-height:1', '×');
    closeBtn.onclick = togglePanel; head.append(closeBtn);
    panel.append(head);

    const status = $('div', 'padding:8px 12px;color:#475467;border-bottom:1px solid #f2f2f2');
    panel.append(status);
    const content = $('div', 'padding:10px 12px;overflow:auto;flex:1'); // 列表区(可重绘)
    panel.append(content);
    const foot = $('div', 'padding:10px 12px;border-top:1px solid #eee;background:#f8fafc');
    panel.append(foot);
    document.body.append(panel);

    // 现有池：用于「池中已有」与追加合并
    let existing = new Set();
    localGet('/settings').then((s) => { existing = new Set(splitPool(s.settings?.moemail_domains)); if (items) renderList(items); })
      .catch(() => {});

    let items = loadCache(); // [{name,createdAt}] 或 null

    async function refresh(full) {
      const known = full ? new Set() : new Set((items || []).map((d) => d.name));
      status.textContent = full ? '全量重建中…' : '增量刷新中…';
      try {
        const fresh = await fetchNew(known, (n, t) => { status.textContent = `${full ? '全量' : '增量'}拉取 ${n}${t ? '/' + t : ''}…`; });
        items = full ? mergeItems(fresh, []) : mergeItems(fresh, items || []);
        saveCache(items);
        renderList(items, fresh.length);
      } catch (e) { status.textContent = '❌ ' + e.message; }
    }

    function renderList(list, addedNote) {
      content.textContent = '';
      const byDay = new Map();
      for (const d of list) { const day = localDay(d.createdAt); if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push(d.name); }
      const days = [...byDay.keys()].sort().reverse();
      status.textContent = `缓存 ${list.length} 个域名 · 上次刷新 ${fmtTs(get(K.cacheTs, 0))}` +
        (addedNote != null ? ` · 本次新增 ${addedNote}` : '') + ` · 共 ${days.length} 天`;

      const listBox = $('div', 'border:1px solid #eee;border-radius:8px;max-height:46vh;overflow:auto');
      const checks = [];
      for (const day of days) {
        const names = byDay.get(day);
        const inPool = names.filter((n) => existing.has(n)).length;
        const row = $('label', 'display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #f2f2f2;cursor:pointer');
        const cb = $('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.day = day; checks.push(cb);
        row.append(cb, $('span', 'flex:1', day),
          $('span', 'color:#98a2b3;font-size:12px', `${names.length} 个${inPool ? ` · 池中 ${inPool}` : ''}`));
        listBox.append(row);
      }
      content.append(listBox);

      const selCount = $('div', 'margin:8px 0;color:#475467');
      content.append(selCount);
      const refreshCount = () => {
        const sel = new Set();
        checks.filter((c) => c.checked).forEach((c) => byDay.get(c.dataset.day).forEach((n) => sel.add(n)));
        selCount.textContent = `已选 ${sel.size} 个域名`;
        return sel;
      };
      checks.forEach((c) => c.addEventListener('change', refreshCount));

      // footer 重绘
      foot.textContent = '';
      const bar = $('div', 'display:flex;gap:8px;margin-bottom:8px');
      const allBtn = btn('全选'), noneBtn = btn('全不选'), incBtn = btn('增量刷新'), fullBtn = btn('全量重建');
      [allBtn, noneBtn, incBtn, fullBtn].forEach((b) => (b.style.flex = '1'));
      allBtn.onclick = () => { checks.forEach((c) => (c.checked = true)); refreshCount(); };
      noneBtn.onclick = () => { checks.forEach((c) => (c.checked = false)); refreshCount(); };
      incBtn.onclick = () => refresh(false);
      fullBtn.onclick = () => refresh(true);
      bar.append(allBtn, noneBtn); foot.append(bar);
      const bar2 = $('div', 'display:flex;gap:8px;margin-bottom:10px'); bar2.append(incBtn, fullBtn); foot.append(bar2);

      const modeRow = $('div', 'display:flex;gap:14px;margin-bottom:10px');
      const mk = (val, txt, checked) => { const l = $('label', 'display:flex;align-items:center;gap:5px;cursor:pointer'); const r = $('input'); r.type = 'radio'; r.name = 'qhmode'; r.value = val; r.checked = checked; l.append(r, $('span', null, txt)); return l; };
      modeRow.append(mk('overwrite', '覆盖池', true), mk('append', '追加去重', false));
      foot.append(modeRow);

      const importBtn = btn('导入到 :8000 域名池', true); importBtn.style.width = '100%';
      foot.append(importBtn);
      const result = $('div', 'margin-top:8px;color:#475467'); foot.append(result);
      const resetLink = $('div', 'margin-top:8px;font-size:12px;color:#98a2b3;cursor:pointer', '重置 qh 凭据（并清缓存）');
      resetLink.onclick = () => { [K.user, K.pass, K.jwt, K.cache, K.cacheTs].forEach(GM_deleteValue); result.textContent = '已清除本地凭据与缓存。'; };
      foot.append(resetLink);

      refreshCount();
      importBtn.onclick = async () => {
        const chosen = refreshCount();
        if (!chosen.size) { result.textContent = '⚠ 未选择任何域名'; return; }
        const mode = foot.querySelector('input[name=qhmode]:checked').value;
        let names = [...chosen];
        if (mode === 'append') names = [...new Set([...existing, ...names])];
        importBtn.disabled = true; result.textContent = '写入中…';
        try {
          await localPost('/settings', { settings: { moemail_domains: names.join('\n'), moemail_domain: names[0] } });
          result.textContent = `✅ 已写入 ${names.length} 个域名（${mode === 'append' ? '追加' : '覆盖'}）。3 秒后刷新…`;
          setTimeout(() => location.reload(), 3000);
        } catch (e) { result.textContent = '❌ ' + e.message; importBtn.disabled = false; }
      };
    }

    if (items && items.length) renderList(items);
    else await refresh(true); // 首次无缓存：全量拉一次
  }

  // launcher
  const launcher = $('button', `position:fixed;bottom:18px;right:18px;z-index:2147483000;padding:9px 14px;border-radius:22px;
    border:none;background:#2563eb;color:#fff;cursor:pointer;font:13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(37,99,235,.35)`, '⇪ 同步 qh 域名');
  launcher.onclick = togglePanel;
  (document.body ? Promise.resolve() : new Promise((r) => addEventListener('DOMContentLoaded', r))).then(() => document.body.append(launcher));
})();
