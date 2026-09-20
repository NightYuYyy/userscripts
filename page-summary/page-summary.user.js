// ==UserScript==
// @name         网页智能总结 通用版
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  任意网页 AI 总结 + 追问 - 论坛/文章/整页自动识别，Discourse 站点走专线 API
// @author       半杯无糖、WolfHolo、徐夏烟（原 linux.do 版）；通用化改造 by DSH
// @match        *://*/*
// @icon         https://linux.do/uploads/default/optimized/1X/3a18b4b0da3e8cf96f7eea15241c3d251f28a39b_2_180x180.png
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js
// @require      https://cdn.jsdelivr.net/npm/@mozilla/readability@0.6.0/Readability.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      *
// @license      MIT
// ==/UserScript==

/*
 * 与 linux-do-summary.user.js 的差异：
 *  1. @match 全网；内容提取改成分层 Extractor：选中文字 > Discourse API > Readability > 内置启发式 > 整页兜底
 *     （Readability 走 @require；若 CDN 不可用，第 4 层内置提取零依赖顶上，不阻塞使用）
 *  2. Discourse 检测不再写死域名，任何 Discourse 论坛都走 JSON API（保留楼层/回复链）
 *  3. 请求改用 GM_xmlhttpRequest（不受页面 CSP 限制），fetch 仅作兜底
 *  4. 修复 SSE 跨包切断丢字（buffer 拼接）；修复流式渲染 O(n²)（120ms 节流）；新增「停止」按钮
 *  5. 对话历史滑动窗口，超长内容自动截断（头 70% + 尾 30%）
 */

(function() {
    'use strict';

    const DEFAULT_API_URL = 'https://api.deepseek.com/v1/chat/completions';
    const DEFAULT_MODEL = 'deepseek-chat';

    // SVG 图标定义
    const ICONS = {
        brain: `<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm0-7a1 1 0 0 1 0 2 1 1 0 0 1 0-2zm-2 7a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm0-7a1 1 0 0 1 0 2 1 1 0 0 1 0-2z" fill="currentColor"/></svg>`,
        summary: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
        chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
        settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
        moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
        sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
        copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
        sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
        arrowLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
        arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`,
        arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`,
        arrowDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`,
        send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
        robot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>`,
        check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`
    };

    const STYLES = `
        :host {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

            --brand-gold: #E3A043;
            --brand-gold-hover: #d48f35;

            --primary: #222222;
            --primary-hover: #000000;
            --primary-light: #f0f0f0;

            --success: #2d9d78;
            --success-light: #d1fae5;
            --danger: #d93025;
            --danger-light: #fef2f2;
            --warning: #f2c04d;

            --bg-base: #F9FAFB;
            --bg-card: #FFFFFF;
            --bg-glass: rgba(255, 255, 255, 0.95);
            --bg-glass-dark: rgba(255, 255, 255, 0.98);
            --bg-hover: #F2F2F2;
            --bg-active: #E5E7EB;
            --bg-setting: #F9FAFB;
            --bg-input: #FFFFFF;

            --border-light: #E5E7EB;
            --border-medium: #D1D5DB;

            --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            --shadow-glow: 0 0 0 1px rgba(0,0,0,0.05);

            --text-main: #111827;
            --text-sec: #4B5563;
            --text-muted: #9CA3AF;
            --text-inverse: #FFFFFF;

            --sidebar-width: 420px;
            --btn-size: 42px;

            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 8px;
            --radius-xl: 12px;
            --radius-full: 9999px;

            --transition-fast: 0.15s ease;
            --transition-normal: 0.25s ease;
            --transition-slow: 0.35s ease;
        }

        :host(.dark-theme) {
            --primary: #E3A043;
            --primary-hover: #ffb85c;
            --primary-light: #2D2D2D;

            --bg-base: #111111;
            --bg-card: #1E1E1E;
            --bg-glass: rgba(30, 30, 30, 0.95);
            --bg-glass-dark: rgba(20, 20, 20, 0.98);
            --bg-hover: #2D2D2D;
            --bg-active: #374151;
            --bg-setting: #111111;
            --bg-input: #2D2D2D;

            --border-light: #374151;
            --border-medium: #4B5563;

            --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.5);

            --text-main: #F3F4F6;
            --text-sec: #D1D5DB;
            --text-muted: #6B7280;
            --text-inverse: #111827;
        }

        * { box-sizing: border-box; }

        .sidebar-panel {
            position: fixed;
            top: 0; bottom: 0;
            width: var(--sidebar-width);
            background: var(--bg-card);
            box-shadow: var(--shadow-xl);
            z-index: 9998;
            display: flex;
            flex-direction: column;
            transition: transform var(--transition-slow);
            border: 1px solid var(--border-light);
        }
        .panel-left {
            left: 0; border-left: none;
            transform: translateX(-100%);
        }
        .panel-left.open { transform: translateX(0); }
        .panel-right {
            right: 0; border-right: none;
            transform: translateX(100%);
        }
        .panel-right.open { transform: translateX(0); }

        #toggle-btn {
            position: fixed;
            width: var(--btn-size);
            height: var(--btn-size);
            background: var(--bg-card);
            color: var(--text-sec);
            box-shadow: var(--shadow-md);
            z-index: 9999;
            cursor: grab;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            transition: all var(--transition-normal);
            border: 1px solid var(--border-light);
            outline: none;
        }
        #toggle-btn:hover {
            background: var(--bg-hover);
            color: var(--brand-gold);
            transform: scale(1.05);
        }
        #toggle-btn:active {
            cursor: grabbing;
            transform: scale(0.96);
        }
        #toggle-btn svg {
            width: 20px; height: 20px;
            fill: none; stroke: currentColor;
        }

        .btn-snap-left { border-radius: 0 var(--radius-md) var(--radius-md) 0; border-left: none; }
        .btn-snap-right { border-radius: var(--radius-md) 0 0 var(--radius-md); border-right: none; }
        .btn-floating { border-radius: 50%; box-shadow: var(--shadow-lg); }

        .resize-handle {
            position: absolute; top: 0; bottom: 0; width: 4px;
            cursor: col-resize; z-index: 10001; background: transparent;
            transition: background var(--transition-fast);
        }
        .resize-handle:hover { background: var(--brand-gold); }
        .handle-left { right: -2px; }
        .handle-right { left: -2px; }

        .header {
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-light);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--bg-card);
            flex-shrink: 0;
        }
        .header-title {
            font-size: 16px; font-weight: 600;
            color: var(--text-main);
            display: flex; align-items: center; gap: 10px;
        }
        .header-title-icon {
            color: var(--brand-gold);
            display: flex; align-items: center; justify-content: center;
        }
        .header-title-icon svg { width: 22px; height: 22px; }

        .header-actions { display: flex; gap: 4px; }

        .icon-btn {
            background: transparent; border: none; cursor: pointer;
            padding: 8px; border-radius: var(--radius-sm);
            color: var(--text-muted);
            transition: all var(--transition-fast);
            display: flex; align-items: center; justify-content: center;
            position: relative;
        }
        .icon-btn svg { width: 18px; height: 18px; }
        .icon-btn:hover {
            background: var(--bg-hover);
            color: var(--text-main);
        }

        .icon-btn[data-tooltip]::after {
            content: attr(data-tooltip);
            position: absolute; bottom: -30px; left: 50%;
            transform: translateX(-50%);
            background: #333; color: white;
            padding: 4px 8px; border-radius: 4px;
            font-size: 11px; white-space: nowrap;
            opacity: 0; pointer-events: none;
            transition: opacity var(--transition-fast);
            z-index: 100;
        }
        .icon-btn[data-tooltip]:hover::after { opacity: 1; }

        .tab-bar {
            display: flex; padding: 0 16px; gap: 24px;
            border-bottom: 1px solid var(--border-light);
            background: var(--bg-card);
            flex-shrink: 0;
        }
        .tab-item {
            padding: 14px 4px;
            text-align: center; font-size: 14px; font-weight: 500;
            color: var(--text-sec); cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all var(--transition-fast);
            display: flex; align-items: center; gap: 6px;
        }
        .tab-item svg { width: 16px; height: 16px; opacity: 0.8; }
        .tab-item:hover { color: var(--text-main); }
        .tab-item.active {
            color: var(--brand-gold);
            border-bottom-color: var(--brand-gold);
            font-weight: 600;
        }
        .tab-item.active svg { opacity: 1; stroke-width: 2.5; }

        .content-area {
            flex: 1; overflow-y: auto;
            position: relative; background: var(--bg-base);
        }
        .view-page {
            padding: 20px; display: none;
            animation: fadeIn 0.2s ease;
        }
        .view-page.active { display: block; }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .form-group { margin-bottom: 20px; }
        .form-label {
            display: block; font-size: 12px; color: var(--text-sec);
            margin-bottom: 8px; font-weight: 600;
        }

        input, textarea, select {
            width: 100%; padding: 10px 12px;
            border: 1px solid var(--border-medium);
            border-radius: var(--radius-md);
            font-size: 14px; font-family: inherit;
            background: var(--bg-input); color: var(--text-main);
            box-sizing: border-box;
            transition: all var(--transition-fast);
        }
        input:focus, textarea:focus, select:focus {
            outline: none; border-color: var(--brand-gold);
            box-shadow: 0 0 0 2px rgba(227, 160, 67, 0.15);
        }
        input::placeholder, textarea::placeholder { color: var(--text-muted); }
        textarea { resize: vertical; min-height: 100px; line-height: 1.6; }

        .btn {
            width: 100%; padding: 10px 16px;
            border: none; border-radius: var(--radius-md);
            background: var(--primary); color: var(--text-inverse);
            font-weight: 600; font-size: 14px; cursor: pointer;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            transition: all var(--transition-normal);
            box-shadow: var(--shadow-sm);
        }
        .btn svg { width: 16px; height: 16px; }
        .btn:hover {
            background: var(--primary-hover);
            transform: translateY(-1px);
            box-shadow: var(--shadow-md);
        }
        .btn:active { transform: translateY(0); }
        .btn:disabled {
            opacity: 0.6; cursor: not-allowed;
            transform: none; box-shadow: none;
        }
        .btn.stop-mode {
            background: var(--danger);
        }
        .btn.stop-mode:hover { background: #b9261c; }

        :host(.dark-theme) .btn { color: #111; }

        .btn-xs {
            padding: 4px 10px; font-size: 12px;
            background: var(--bg-card); color: var(--text-sec);
            border-radius: var(--radius-sm);
            border: 1px solid var(--border-medium);
            cursor: pointer; white-space: nowrap;
            transition: all var(--transition-fast);
        }
        .btn-xs:hover {
            color: var(--brand-gold);
            border-color: var(--brand-gold);
        }

        /* 提取来源徽标 */
        .source-badge {
            display: inline-flex; align-items: center; gap: 6px;
            font-size: 12px; color: var(--text-sec);
            background: var(--bg-hover);
            border: 1px solid var(--border-light);
            padding: 4px 10px; border-radius: var(--radius-full);
            margin-bottom: 14px;
        }
        .source-badge svg { width: 13px; height: 13px; color: var(--brand-gold); }

        .result-box {
            margin-top: 16px; padding: 16px;
            background: var(--bg-card);
            border: 1px solid var(--border-light);
            border-radius: var(--radius-lg);
            font-size: 14px; line-height: 1.7;
            color: var(--text-main);
            min-height: 150px;
            max-height: calc(100vh - 350px);
            overflow-y: auto; overflow-x: hidden;
            word-break: break-word;
            overflow-wrap: break-word;
            white-space: normal;
            width: 100%;
            box-sizing: border-box;
            position: relative;
        }
        .result-box.empty {
            display: flex; align-items: center; justify-content: center;
            background: var(--bg-base);
        }

        .result-actions {
            position: absolute; top: 10px; right: 10px;
            opacity: 0; transition: opacity var(--transition-fast);
        }
        .result-box:hover .result-actions { opacity: 1; }
        .result-action-btn {
            padding: 4px 10px; font-size: 12px;
            background: var(--bg-card); color: var(--text-sec);
            border: 1px solid var(--border-light);
            border-radius: var(--radius-sm); cursor: pointer;
            display: flex; align-items: center; gap: 4px;
            box-shadow: var(--shadow-sm);
        }
        .result-action-btn:hover { border-color: var(--brand-gold); color: var(--brand-gold); }
        .result-action-btn.copied { border-color: var(--success); color: var(--success); }
        .result-action-btn svg { width: 12px; height: 12px; }

        .result-box h1, .result-box h2, .result-box h3 {
            margin: 16px 0 8px; font-weight: 600;
            color: var(--text-main);
        }
        .result-box h1 { font-size: 1.4em; }
        .result-box h2 { font-size: 1.2em; border-bottom: 1px solid var(--border-light); padding-bottom: 6px; }
        .result-box h3 { font-size: 1.1em; color: var(--text-sec); }
        .result-box p { margin-bottom: 10px; }
        .result-box ul, .result-box ol { padding-left: 20px; margin: 10px 0; }
        .result-box li { margin-bottom: 6px; }
        .result-box li::marker { color: var(--brand-gold); }

        .result-box code,
        .bubble-ai code,
        .thinking-content code,
        .result-box pre code,
        .bubble-ai pre code,
        .thinking-content pre code {
            font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace !important;
            font-size: 13px !important;
            line-height: 1.5 !important;
            font-variant-ligatures: none;
            letter-spacing: 0;
        }

        .result-box code,
        .bubble-ai code,
        .thinking-content code:not(pre code) {
            background: var(--bg-hover);
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--text-main);
            border: 1px solid var(--border-medium);
            word-break: break-all;
            overflow-wrap: break-word;
            max-width: 100%;
            display: inline-block;
            margin: 0 2px;
        }

        :host(.dark-theme) .result-box code,
        :host(.dark-theme) .bubble-ai code,
        :host(.dark-theme) .thinking-content code:not(pre code) {
            background: rgba(255,255,255,0.1);
            color: #e0e0e0;
            border-color: rgba(255,255,255,0.2);
        }

        .result-box pre,
        .bubble-ai pre,
        .thinking-content-inner pre {
            background: var(--bg-card);
            padding: 16px !important;
            margin: 12px 0 !important;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-medium);
            overflow-x: auto;
            overflow-y: auto;
            color: var(--text-main);
            white-space: pre-wrap !important;
            word-break: break-all;
            word-wrap: break-word;
            tab-size: 4;
            max-width: 100%;
            box-sizing: border-box;
            font-size: 13px !important;
            line-height: 1.5 !important;
        }

        :host(.dark-theme) .result-box pre,
        :host(.dark-theme) .bubble-ai pre,
        :host(.dark-theme) .thinking-content-inner pre {
            background: #1e1e1e;
            color: #d4d4d4;
            border-color: #404040;
        }

        .result-box pre::-webkit-scrollbar,
        .bubble-ai pre::-webkit-scrollbar,
        .thinking-content-inner pre::-webkit-scrollbar {
            width: 8px; height: 8px;
        }
        .result-box pre::-webkit-scrollbar-track,
        .bubble-ai pre::-webkit-scrollbar-track,
        .thinking-content-inner pre::-webkit-scrollbar-track {
            background: rgba(0,0,0,0.1);
            border-radius: 4px;
        }
        .result-box pre::-webkit-scrollbar-thumb,
        .bubble-ai pre::-webkit-scrollbar-thumb,
        .thinking-content-inner pre::-webkit-scrollbar-thumb {
            background: rgba(0,0,0,0.3);
            border-radius: 4px;
        }
        :host(.dark-theme) .result-box pre::-webkit-scrollbar-thumb,
        :host(.dark-theme) .bubble-ai pre::-webkit-scrollbar-thumb,
        :host(.dark-theme) .thinking-content-inner pre::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.3);
        }
        .result-box pre code {
            background: none; color: inherit;
            padding: 0; border: none;
        }
        .result-box blockquote {
            border-left: 3px solid var(--brand-gold);
            margin: 12px 0; padding: 6px 16px;
            color: var(--text-sec); background: var(--bg-hover);
            font-style: italic;
        }
        .result-box a {
            color: var(--brand-gold); text-decoration: none;
            border-bottom: 1px solid transparent;
        }
        .result-box a:hover { border-bottom-color: var(--brand-gold); }
        .result-box strong { color: var(--text-main); font-weight: 600; }

        .chat-container {
            display: flex; flex-direction: column;
            height: 100%; position: relative;
        }
        .chat-toolbar {
            display: flex; justify-content: space-between;
            align-items: center; padding-bottom: 12px;
            border-bottom: 1px solid var(--border-light);
            margin-bottom: 12px;
        }
        .chat-toolbar-title {
            font-size: 13px; color: var(--text-sec);
            font-weight: 600; display: flex; align-items: center; gap: 8px;
        }
        .msg-count {
            background: var(--bg-active); color: var(--text-sec);
            font-size: 11px; padding: 2px 8px;
            border-radius: 10px; font-weight: normal;
        }
        .btn-clear {
            padding: 6px 12px; font-size: 12px;
            background: transparent; color: var(--danger);
            border-radius: var(--radius-sm); border: none;
            cursor: pointer; display: flex; align-items: center; gap: 5px;
        }
        .btn-clear:hover { background: var(--danger-light); }
        .btn-clear svg { width: 14px; height: 14px; }

        .chat-messages-wrapper { flex: 1; position: relative; overflow: hidden; }
        .chat-messages { height: 100%; overflow-y: auto; padding: 10px 0; }
        .chat-list { display: flex; flex-direction: column; gap: 16px; }

        .bubble {
            padding: 12px 16px; border-radius: var(--radius-lg);
            font-size: 14px; line-height: 1.6; max-width: 90%;
            word-break: break-word;
            overflow-wrap: break-word;
            white-space: normal;
            overflow-x: hidden;
            box-shadow: var(--shadow-sm);
            position: relative;
            box-sizing: border-box;
        }
        .bubble-user {
            align-self: flex-end;
            background: var(--primary); color: var(--text-inverse);
            border-bottom-right-radius: 2px;
        }
        :host(.dark-theme) .bubble-user { color: #111; }

        .bubble-ai {
            align-self: flex-start;
            background: var(--bg-card); border: 1px solid var(--border-light);
            color: var(--text-main); border-bottom-left-radius: 2px;
        }

        .bubble-ai h1, .bubble-ai h2 { font-size: 1.1em; margin: 8px 0; }

        .thinking-block {
            margin: 4px 0 10px; border-radius: var(--radius-md);
            background: var(--bg-setting);
            border: 1px solid var(--border-light);
            overflow: hidden;
        }
        .thinking-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 12px; cursor: pointer; user-select: none;
            transition: background var(--transition-fast);
        }
        .thinking-header:hover { background: rgba(0,0,0,0.03); }
        .thinking-header-left { display: flex; align-items: center; gap: 8px; }

        .thinking-icon {
            width: 16px; height: 16px;
            display: flex; align-items: center; justify-content: center;
            color: var(--text-muted);
        }
        .thinking-icon svg { width: 14px; height: 14px; }

        .thinking-title { font-size: 12px; font-weight: 600; color: var(--text-sec); }
        .thinking-status {
            font-size: 10px; color: var(--text-muted);
            background: rgba(0,0,0,0.05); padding: 1px 6px;
            border-radius: 4px;
        }
        .thinking-toggle {
            width: 18px; height: 18px;
            display: flex; align-items: center; justify-content: center;
            color: var(--text-muted);
        }
        .thinking-toggle svg { width: 12px; height: 12px; transition: transform 0.2s; }
        .thinking-block.expanded .thinking-toggle svg { transform: rotate(180deg); }

        .thinking-preview {
            padding: 0 12px 8px; font-size: 11px;
            color: var(--text-muted); line-height: 1.4;
            max-height: 3.5em; overflow: hidden;
            word-break: break-word;
            overflow-wrap: break-word;
            white-space: normal;
        }
        .thinking-content {
            max-height: 0; overflow: hidden;
            transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .thinking-block.expanded .thinking-content { max-height: 5000px; }
        .thinking-content-inner {
            padding: 10px 12px; font-size: 12px;
            color: var(--text-sec); border-top: 1px dashed var(--border-medium);
            background: var(--bg-card);
            word-break: break-word;
            overflow-wrap: break-word;
            white-space: normal;
            overflow-x: hidden;
            width: 100%;
            box-sizing: border-box;
        }

        .scroll-buttons {
            position: absolute; right: 10px; z-index: 10;
        }
        .scroll-buttons.top-area { top: 10px; }
        .scroll-buttons.bottom-area { bottom: 10px; }
        .scroll-btn {
            width: 32px; height: 32px;
            border-radius: 50%; background: var(--bg-card);
            border: 1px solid var(--border-light);
            box-shadow: var(--shadow-md); cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: var(--text-sec); opacity: 0; transform: scale(0.8);
            pointer-events: none; transition: all var(--transition-fast);
        }
        .scroll-btn.visible { opacity: 1; transform: scale(1); pointer-events: auto; }
        .scroll-btn:hover { color: var(--brand-gold); border-color: var(--brand-gold); }
        .scroll-btn svg { width: 16px; height: 16px; }

        .chat-input-area {
            border-top: 1px solid var(--border-light);
            padding: 16px 0 0; flex-shrink: 0;
        }
        .chat-input-row { display: flex; gap: 10px; align-items: flex-end; }
        .chat-input {
            flex: 1; min-height: 44px; max-height: 120px;
            border-radius: 22px; padding: 10px 18px;
            resize: none; border: 1px solid var(--border-medium);
            font-size: 14px; line-height: 1.5;
        }
        .chat-input:focus { border-color: var(--brand-gold); }

        .send-btn {
            width: 44px; height: 44px; border-radius: 50%;
            padding: 0; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            background: var(--primary); border: none; cursor: pointer;
            transition: all var(--transition-fast);
        }
        .send-btn svg { width: 20px; height: 20px; fill: none; stroke: var(--text-inverse); }
        :host(.dark-theme) .send-btn svg { stroke: #111; }
        .send-btn:hover { transform: scale(1.05); }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .send-btn.stop-mode { background: var(--danger); }
        .send-btn.stop-mode svg { stroke: #fff; }

        .settings-page { background: var(--bg-setting); min-height: 100%; padding: 20px; }
        .settings-group {
            background: var(--bg-card); border-radius: var(--radius-lg);
            overflow: hidden; margin-bottom: 20px;
            box-shadow: var(--shadow-sm); border: 1px solid var(--border-light);
        }
        .settings-group-title {
            font-size: 11px; color: var(--text-muted);
            text-transform: uppercase; padding: 16px 20px 8px;
            font-weight: 700; letter-spacing: 0.05em;
        }
        .setting-item {
            padding: 14px 20px; border-bottom: 1px solid var(--border-light);
        }
        .setting-item:last-child { border-bottom: none; }
        .setting-label { font-size: 14px; font-weight: 500; color: var(--text-main); margin-bottom: 4px; display: block; }
        .setting-desc { font-size: 12px; color: var(--text-sec); margin-bottom: 10px; }
        .setting-item-row { display: flex; justify-content: space-between; align-items: center; }
        .setting-item-row .setting-info { flex: 1; margin-right: 16px; }

        .toggle-switch { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .toggle-slider {
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
            background: var(--border-medium); border-radius: 24px;
            transition: .3s;
        }
        .toggle-slider::before {
            content: ''; position: absolute; height: 18px; width: 18px;
            left: 3px; bottom: 3px; background: white;
            border-radius: 50%; transition: .3s;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .toggle-switch input:checked + .toggle-slider { background: var(--brand-gold); }
        .toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); }

        .spinner {
            width: 16px; height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff; border-radius: 50%;
            animation: spin 0.8s linear infinite; display: none;
        }
        .btn.loading .spinner { display: inline-block; }
        .btn.loading .btn-text { display: none; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .thinking { display: flex; gap: 4px; padding: 4px 0; }
        .thinking-dot {
            width: 6px; height: 6px; background: var(--text-muted);
            border-radius: 50%; animation: thinking 1.4s ease-in-out infinite;
        }
        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes thinking {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40% { transform: scale(1); opacity: 1; }
        }

        .tip-text {
            text-align: center; color: var(--text-muted);
            font-size: 13px; padding: 40px 20px; line-height: 1.8;
        }
        .tip-text strong { color: var(--text-main); }
        .tip-icon { display: block; margin-bottom: 12px; color: var(--border-medium); }
        .tip-icon svg { width: 40px; height: 40px; }
        .hidden { display: none !important; }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
            background: rgba(0,0,0,0.1); border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
        :host(.dark-theme) ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }

        input[type="number"] { -moz-appearance: textfield; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        .range-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .range-buttons { display: flex; gap: 6px; }
        .range-inputs { display: flex; gap: 10px; align-items: center; }
        .range-inputs input { flex: 1; text-align: center; }
        .range-separator { color: var(--text-muted); }

        .shortcut-hint {
            display: flex; align-items: center; justify-content: center;
            gap: 6px; font-size: 11px; color: var(--text-muted); margin-top: 16px;
        }
        .kbd {
            display: inline-flex; padding: 2px 5px;
            background: var(--bg-card); border: 1px solid var(--border-medium);
            border-radius: 4px; font-family: ui-monospace, monospace;
            font-size: 10px;
        }

        .toast {
            position: absolute; bottom: 20px; left: 50%;
            transform: translateX(-50%) translateY(10px);
            background: #333; color: white;
            padding: 8px 16px; border-radius: 4px;
            font-size: 13px; font-weight: 500;
            box-shadow: var(--shadow-lg); z-index: 10000;
            opacity: 0; pointer-events: none;
            transition: all 0.2s; display: flex; align-items: center; gap: 8px;
        }
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast.error { background: var(--danger); }
    `;

    const Core = {
        // ---------- 页面识别 ----------
        isDiscourseTopic() {
            const gen = document.querySelector('meta[name="generator"]')?.content || '';
            return /discourse/i.test(gen) && /\/t\/([^/]+\/)?\d+/.test(location.pathname);
        },

        getTopicId() {
            return location.pathname.match(/\/t\/(?:[^/]+\/)?(\d+)/)?.[1];
        },

        getReplyCount: () => {
            const el = document.querySelector('.timeline-replies');
            if (!el) return 0;
            const txt = el.textContent.trim();
            return parseInt(txt.includes('/') ? txt.split('/')[1] : txt) || 0;
        },

        // ---------- 思考链解析（原版逻辑） ----------
        parseThinkingContent(text) {
            if (!text) return { thinking: '', content: '' };
            let thinkingParts = [];
            let mainContent = text;

            const thinkingPatterns = [
                /<think>([\s\S]*?)<\/think>/gi,
                /<thinking>([\s\S]*?)<\/thinking>/gi,
                /<reason>([\s\S]*?)<\/reason>/gi,
                /<reasoning>([\s\S]*?)<\/reasoning>/gi,
                /<reflection>([\s\S]*?)<\/reflection>/gi,
                /<inner_thought>([\s\S]*?)<\/inner_thought>/gi,
                /<think>([\s\S]*?)<\\think>/gi,
                /<thinking>([\s\S]*?)<\\thinking>/gi,
                /<\|think\|>([\s\S]*?)<\|\/think\|>/gi,
                /<\|thinking\|>([\s\S]*?)<\|\/thinking\|>/gi,
                /\[think\]([\s\S]*?)\[\/think\]/gi,
                /\[thinking\]([\s\S]*?)\[\/thinking\]/gi,
            ];
            for (const pattern of thinkingPatterns) {
                pattern.lastIndex = 0;
                let match;
                while ((match = pattern.exec(mainContent)) !== null) {
                    const thinkContent = match[1].trim();
                    if (thinkContent) {
                        thinkingParts.push(thinkContent);
                    }
                    mainContent = mainContent.replace(match[0], '');
                    pattern.lastIndex = 0;
                }
            }

            const unclosedPatterns = [
                { start: /<think>/i, end: /<\/think>|<\\think>/i },
                { start: /<thinking>/i, end: /<\/thinking>|<\\thinking>/i },
                { start: /<\|think\|>/i, end: /<\|\/think\|>/i },
            ];
            for (const { start, end } of unclosedPatterns) {
                const startMatch = mainContent.match(start);
                if (startMatch && !end.test(mainContent)) {
                    const startIdx = mainContent.indexOf(startMatch[0]);
                    const thinkContent = mainContent.slice(startIdx + startMatch[0].length).trim();
                    if (thinkContent) {
                        thinkingParts.push(thinkContent + ' ⏳');
                        mainContent = mainContent.slice(0, startIdx);
                    }
                    break;
                }
            }

            return {
                thinking: thinkingParts.join('\n\n'),
                content: mainContent.trim()
            };
        },

        renderWithThinking(text, isStreaming = false, keepExpanded = false) {
            const { thinking, content } = this.parseThinkingContent(text);
            const arrowIcon = ICONS.arrowDown;

            let html = '';
            if (thinking) {
                const charCount = thinking.length;
                const streamingClass = isStreaming ? ' streaming' : '';
                const expandedClass = keepExpanded ? ' expanded' : '';
                const statusText = isStreaming ? '思考中...' : `${charCount} 字符`;
                const lines = thinking.split('\n').filter(l => l.trim());
                const previewLines = lines.slice(-4).join('\n');
                const previewText = previewLines.length > 150
                    ? '...' + previewLines.slice(-150)
                    : previewLines;
                const thinkingHtml = DOMPurify.sanitize(marked.parse(thinking));
                const previewHtml = DOMPurify.sanitize(marked.parse(previewText));

                html += `
                    <div class="thinking-block${streamingClass}${expandedClass}" data-thinking-block>
                        <div class="thinking-header" data-thinking-toggle>
                            <div class="thinking-header-left">
                                <div class="thinking-icon">${ICONS.brain}</div>
                                <span class="thinking-title">思考过程</span>
                                <span class="thinking-status">${statusText}</span>
                            </div>
                            <div class="thinking-toggle">${arrowIcon}</div>
                        </div>
                        <div class="thinking-preview">${previewHtml}</div>
                        <div class="thinking-content">
                            <div class="thinking-content-inner">${thinkingHtml}</div>
                        </div>
                    </div>
                `;
            }

            if (content) {
                html += DOMPurify.sanitize(marked.parse(content));
            }

            return html;
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        // ---------- Discourse 抓取（域名泛化，逻辑同原版） ----------
        async fetchDiscourseDialogues(start, end) {
            const origin = location.origin;
            const tid = this.getTopicId();
            const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
            const opts = { headers: { 'x-csrf-token': csrf, 'x-requested-with': 'XMLHttpRequest' } };

            const idRes = await fetch(`${origin}/t/${tid}/post_ids.json?post_number=0&limit=99999`, opts);
            const idData = await idRes.json();
            let pIds = idData.post_ids.slice(Math.max(0, start - 1), end);

            if (start <= 1) {
                const mainRes = await fetch(`${origin}/t/${tid}.json`, opts);
                const mainData = await mainRes.json();
                const firstId = mainData.post_stream.posts[0].id;
                if (!pIds.includes(firstId)) pIds.unshift(firstId);
            }

            let text = "";
            for (let i = 0; i < pIds.length; i += 500) {
                const chunk = pIds.slice(i, i + 500);
                const q = chunk.map(id => `post_ids[]=${id}`).join('&');
                const res = await fetch(`${origin}/t/${tid}/posts.json?${q}&include_suggested=false`, opts);
                const data = await res.json();

                text += data.post_stream.posts.map(p => {
                    let content = p.cooked;

                    content = content.replace(/<div class="lightbox-wrapper">\s*<a class="lightbox" href="([^"]+)"(?:\s+data-download-href="([^"]+)")?[^>]*title="([^"]*)"[^>]*>[\s\S]*?<\/a>\s*<\/div>/gi, (match, hrefUrl, downloadHref, title) => {
                        let imgUrl = hrefUrl || `${origin}${downloadHref || ''}`;
                        const filename = title || '图片';
                        return `\n[图片: ${filename}](${imgUrl})\n`;
                    });

                    content = content.replace(/<a class="attachment" href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, (match, url, name) => {
                        return `\n[附件: ${name.trim()}](${url})\n`;
                    });

                    content = content.replace(/<img[^>]+class="emoji[^>]*alt="([^"]*)"[^>]*>/gi, '$1 ');

                    content = content.replace(/<aside class="quote(?:-modified)?[^>]*>[\s\S]*?<blockquote>([\s\S]*?)<\/blockquote>[\s\S]*?<\/aside>/gi, (match, quoteInner) => {
                        let cleanQuote = quoteInner.replace(/<[^>]+>/g, '').trim();
                        return `\n[引用]\n${cleanQuote}\n[/引用]\n`;
                    });

                    content = content.replace(/<[^>]+>/g, '').trim();

                    const userName = p.name || p.username;
                    const userPart = `${userName}（${p.username}）`;

                    let replyPart = '';
                    if (p.reply_to_post_number && p.reply_to_user) {
                        const replyToName = p.reply_to_user.name || p.reply_to_user.username;
                        const replyToUsername = p.reply_to_user.username;
                        replyPart = `-回复[${p.reply_to_post_number}楼] ${replyToName}（${replyToUsername}）`;
                    }

                    return `[${p.post_number}楼] ${userPart}${replyPart}:\n${content}`;
                }).join('\n\n');
            }
            return text;
        },

        // ---------- 通用内容提取（分层兜底） ----------
        async extract(opts = {}) {
            const mode = GM_getValue('extractMode', 'auto');
            const sel = (window.getSelection()?.toString() || '').trim();

            // 第 1 层：用户选中文字
            if (mode === 'selection' || (mode === 'auto' && sel.length > 50)) {
                if (!sel) throw new Error('当前为「仅选中内容」模式，请先在页面上选中一段文字');
                return { text: sel, source: '选中文字', isForum: false };
            }

            // 第 2 层：Discourse 论坛专线
            if (mode !== 'page' && this.isDiscourseTopic()) {
                const start = opts.start || 1;
                const end = opts.end || this.getReplyCount() || 50;
                const text = await this.fetchDiscourseDialogues(start, end);
                if (text) {
                    return { text, source: `论坛帖子 ${start}-${end} 楼`, isForum: true };
                }
            }

            // 第 3 层：Readability 正文识别（Firefox 阅读模式同款算法）
            if (typeof Readability === 'function') {
                try {
                    const docClone = document.cloneNode(true);
                    const article = new Readability(docClone).parse();
                    const articleText = (article?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
                    if (articleText.length > 200) {
                        const title = article.title || document.title;
                        return { text: `${title}\n\n${articleText}`, source: '正文识别', isForum: false };
                    }
                } catch (e) { /* Readability 失败则继续兜底 */ }
            }

            // 第 4 层：内置启发式正文提取（不依赖任何 CDN，Readability 不可用时顶上）
            const heuristicText = this.heuristicExtract();
            if (heuristicText.length > 200) {
                return { text: `${document.title}\n\n${heuristicText}`, source: '正文识别（内置）', isForum: false };
            }

            // 第 5 层：整页文本兜底
            const bodyText = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
            if (!bodyText) throw new Error('未能从页面提取到任何文字内容');
            return { text: bodyText, source: '整页文本', isForum: false };
        },

        /**
         * 内置正文提取：在常见「正文容器」选择器里按文本量 + 段落数打分，取最优者。
         * 这是 Readability 的简化替代品——精度略低，但零依赖、必定可用。
         */
        heuristicExtract() {
            const selectors = [
                'article', 'main', '[role="main"]',
                '.markdown-body', '.entry-content', '.post-content', '.article-content',
                '.article-body', '.rich_media_content', '.RichText', '.content', '#content'
            ];
            let best = null;
            const seen = new Set();
            for (const sel of selectors) {
                let nodes = [];
                try { nodes = document.querySelectorAll(sel); } catch (e) { continue; }
                for (const el of nodes) {
                    if (seen.has(el)) continue;
                    seen.add(el);
                    const text = (el.innerText || '').trim();
                    if (text.length < 300) continue;
                    const paras = el.querySelectorAll('p').length;
                    const score = text.length + paras * 80;
                    if (!best || score > best.score) best = { score, text };
                }
            }
            return best ? best.text : '';
        },

        truncateContent(text, maxChars) {
            if (text.length <= maxChars) return { text, truncated: false };
            const headLen = Math.floor(maxChars * 0.7);
            const tailLen = maxChars - headLen;
            return {
                text: text.slice(0, headLen) + `\n\n...[中间省略约 ${text.length - maxChars} 字]...\n\n` + text.slice(-tailLen),
                truncated: true
            };
        },

        // ---------- SSE 解析器（修复跨包切断丢字） ----------
        createSSEParser(onData) {
            let buffer = '';
            const handleLine = (line) => {
                line = line.trim();
                if (!line.startsWith('data: ') || line === 'data: [DONE]') return;
                try {
                    const json = JSON.parse(line.slice(6));
                    onData(json);
                } catch (e) { /* 单行解析失败忽略 */ }
            };
            return {
                push(text) {
                    buffer += text;
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // 最后一段可能不完整，留给下次拼接
                    for (const line of lines) handleLine(line);
                },
                flush() {
                    if (buffer.trim()) handleLine(buffer);
                    buffer = '';
                }
            };
        },

        // ---------- GM_xmlhttpRequest 流式请求（绕开页面 CSP），fetch 兜底 ----------
        gmStream({ url, headers, body, onChunk, signal }) {
            return new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'function') {
                    return reject(new Error('__no_gm__'));
                }
                let lastIdx = 0;
                let aborted = false;
                const req = GM_xmlhttpRequest({
                    method: 'POST',
                    url,
                    headers,
                    data: body,
                    onreadystatechange(r) {
                        // Tampermonkey 在 readyState 3 阶段提供增量 responseText
                        if (r.readyState >= 3 && r.responseText && r.responseText.length > lastIdx) {
                            const chunk = r.responseText.slice(lastIdx);
                            lastIdx = r.responseText.length;
                            onChunk(chunk);
                        }
                    },
                    onload(r) {
                        if (aborted) return;
                        if (r.responseText && r.responseText.length > lastIdx) {
                            onChunk(r.responseText.slice(lastIdx));
                        }
                        if (r.status >= 400) {
                            let detail = '';
                            try { detail = JSON.parse(r.responseText)?.error?.message || ''; } catch (e) {}
                            reject(new Error(`HTTP ${r.status}${detail ? ': ' + detail : ''}`));
                        } else {
                            resolve();
                        }
                    },
                    onerror() { if (!aborted) reject(new Error('网络请求失败（可能被目标站 CSP 拦截或网络不通）')); },
                    ontimeout() { if (!aborted) reject(new Error('请求超时')); }
                });
                if (signal) {
                    signal.addEventListener('abort', () => {
                        aborted = true;
                        try { req.abort(); } catch (e) {}
                        reject(new Error('__aborted__'));
                    });
                }
            });
        },

        async fetchStream({ url, headers, body, onChunk, signal }) {
            const resp = await fetch(url, { method: 'POST', headers, body, signal });
            if (!resp.ok) {
                let detail = '';
                try { detail = (await resp.json())?.error?.message || ''; } catch (e) {}
                throw new Error(`HTTP ${resp.status}${detail ? ': ' + detail : ''}`);
            }
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                onChunk(decoder.decode(value, { stream: true }));
            }
        },

        // ---------- 调 AI ----------
        async streamChat(messages, onChunk, onDone, onError, signal) {
            const key = GM_getValue('apiKey', '');
            const url = GM_getValue('apiUrl', DEFAULT_API_URL);
            const model = GM_getValue('model', DEFAULT_MODEL);
            const useStream = GM_getValue('useStream', true);
            if (!key) return onError('未配置 API Key，请先在设置中配置');

            const body = JSON.stringify({ model, messages, stream: useStream });
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };

            let thinkTagSent = false;
            let contentStarted = false;

            const handleDelta = (json) => {
                const delta = json.choices?.[0]?.delta;
                if (delta?.reasoning_content) {
                    if (!thinkTagSent) { onChunk('<think>'); thinkTagSent = true; }
                    onChunk(delta.reasoning_content);
                }
                if (delta?.content) {
                    if (thinkTagSent && !contentStarted) { onChunk('</think>'); contentStarted = true; }
                    onChunk(delta.content);
                }
            };

            try {
                if (useStream) {
                    const parser = this.createSSEParser(handleDelta);
                    try {
                        await this.gmStream({ url, headers, body, onChunk: t => parser.push(t), signal });
                    } catch (e) {
                        if (e.message === '__no_gm__') {
                            await this.fetchStream({ url, headers, body, onChunk: t => parser.push(t), signal });
                        } else {
                            throw e;
                        }
                    }
                    parser.flush();
                    if (thinkTagSent && !contentStarted) onChunk('</think>');
                } else {
                    let respText;
                    try {
                        respText = await new Promise((resolve, reject) => {
                            if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('__no_gm__'));
                            GM_xmlhttpRequest({
                                method: 'POST', url, headers, data: body,
                                onload(r) {
                                    if (r.status >= 400) {
                                        let detail = '';
                                        try { detail = JSON.parse(r.responseText)?.error?.message || ''; } catch (e) {}
                                        reject(new Error(`HTTP ${r.status}${detail ? ': ' + detail : ''}`));
                                    } else resolve(r.responseText);
                                },
                                onerror() { reject(new Error('网络请求失败')); },
                                ontimeout() { reject(new Error('请求超时')); }
                            });
                        });
                    } catch (e) {
                        if (e.message !== '__no_gm__') throw e;
                        const resp = await fetch(url, { method: 'POST', headers, body, signal });
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        respText = await resp.text();
                    }
                    const data = JSON.parse(respText);
                    const message = data.choices?.[0]?.message;
                    let fullContent = '';
                    if (message?.reasoning_content) {
                        fullContent += `<think>${message.reasoning_content}</think>`;
                    }
                    if (message?.content) fullContent += message.content;
                    if (fullContent) onChunk(fullContent);
                }
                onDone();
            } catch (e) {
                if (e.message === '__aborted__' || e.name === 'AbortError') {
                    onError('__aborted__');
                } else {
                    onError(e.message);
                }
            }
        }
    };

    class AppUI {
        constructor() {
            this.host = document.createElement('div');
            this.host.id = 'ld-summary-pro';
            document.body.appendChild(this.host);
            this.shadow = this.host.attachShadow({ mode: 'open' });

            this.isOpen = false;
            this.btnPos = GM_getValue('btnPos', { side: 'right', top: '50%' });
            this.side = this.btnPos.side;
            this.sidebarWidth = GM_getValue('sidebarWidth', 420);
            this.isDarkTheme = GM_getValue('isDarkTheme', false);
            this.chatHistory = [];
            this.postContent = '';
            this.lastSummary = '';
            this.isGenerating = false;
            this.currentTab = 'summary';
            this.userMessageCount = 0;
            this.userScrolledUp = false;
            this.isProgrammaticScroll = false;
            this.abortCtrl = null;
            this._renderTimer = null;

            this.init();
        }

        init() {
            const style = document.createElement('style');
            style.textContent = STYLES;
            this.shadow.appendChild(style);
            this.render();
            this.restoreState();
            this.bindEvents();
            this.bindKeyboardShortcuts();
        }

        Q(s) { return this.shadow.querySelector(s); }

        render() {
            this.shadow.innerHTML += `
                <div id="toggle-btn" title="拖动改变位置，点击展开/关闭 (Ctrl+Shift+S)">${ICONS.arrowLeft}</div>

                <div class="sidebar-panel" id="sidebar">
                    <div class="resize-handle" id="resizer"></div>

                    <div class="toast" id="toast"></div>

                    <div class="header">
                        <div class="header-title">
                            <div class="header-title-icon">${ICONS.brain}</div>
                            智能总结
                        </div>
                        <div class="header-actions">
                            <button class="icon-btn" id="btn-theme" data-tooltip="切换主题">${ICONS.moon}</button>
                            <button class="icon-btn" id="btn-close" data-tooltip="关闭">${ICONS.close}</button>
                        </div>
                    </div>

                    <div class="tab-bar">
                        <div class="tab-item active" data-tab="summary">${ICONS.summary}<span>总结</span></div>
                        <div class="tab-item" data-tab="chat">${ICONS.chat}<span>对话</span></div>
                        <div class="tab-item" data-tab="settings">${ICONS.settings}<span>设置</span></div>
                    </div>

                    <div class="content-area">

                        <div id="page-summary" class="view-page active">
                            <div class="form-group" id="range-group" style="display:none;">
                                <div class="range-header">
                                    <label class="form-label" style="margin:0;">楼层范围</label>
                                    <div class="range-buttons">
                                        <button class="btn-xs" id="range-all">全部</button>
                                        <button class="btn-xs" id="range-recent">最近<span id="recent-count">50</span></button>
                                    </div>
                                </div>
                                <div class="range-inputs">
                                    <input type="number" id="inp-start" placeholder="起始" min="1">
                                    <span class="range-separator">→</span>
                                    <input type="number" id="inp-end" placeholder="结束" min="1">
                                </div>
                            </div>

                            <div class="source-badge" id="source-badge">${ICONS.target}<span id="source-text">自动识别页面内容</span></div>

                            <button class="btn" id="btn-summary">
                                <span class="btn-text" style="display:flex;align-items:center;gap:6px;">${ICONS.sparkles} 开始智能总结</span>
                            </button>

                            <div id="summary-result" class="result-box empty">
                                <div class="tip-text">
                                    <span class="tip-icon">${ICONS.robot}</span>
                                    点击「开始智能总结」后，<br>AI 将分析当前页面内容并生成摘要<br><br>
                                    💡 在页面上<strong>选中一段文字</strong>再点总结，<br>可只对选中部分提问
                                </div>
                            </div>

                            <div class="shortcut-hint">
                                <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">S</span> 快速打开
                            </div>
                        </div>

                        <div id="page-chat" class="view-page">
                            <div class="chat-container">
                                <div class="chat-toolbar">
                                    <div class="chat-toolbar-title">
                                        对话记录
                                        <span class="msg-count" id="msg-count">0</span>
                                    </div>
                                    <button class="btn-clear" id="btn-clear-chat" title="清空对话">
                                        ${ICONS.trash} 清空
                                    </button>
                                </div>

                                <div class="chat-messages-wrapper">
                                    <div class="scroll-buttons top-area">
                                        <button class="scroll-btn" id="btn-scroll-top" title="滚动到顶部">
                                            ${ICONS.arrowUp}
                                        </button>
                                    </div>

                                    <div class="chat-messages" id="chat-messages">
                                        <div id="chat-list" class="chat-list"></div>
                                        <div id="chat-empty" class="tip-text">
                                            <span class="tip-icon">${ICONS.chat}</span>
                                            请先在<strong>「总结」</strong>页面生成内容摘要，<br>然后即可基于上下文进行对话
                                        </div>
                                    </div>

                                    <div class="scroll-buttons bottom-area">
                                        <button class="scroll-btn" id="btn-scroll-bottom" title="滚动到底部">
                                            ${ICONS.arrowDown}
                                        </button>
                                    </div>
                                </div>

                                <div class="chat-input-area">
                                    <div class="chat-input-row">
                                        <textarea id="chat-input" class="chat-input" placeholder="输入你的问题... (Enter 发送)" rows="1"></textarea>
                                        <button class="send-btn" id="btn-send" title="发送消息">${ICONS.send}</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="page-settings" class="view-page settings-page">
                            <div class="settings-group">
                                <div class="settings-group-title">API 配置</div>
                                <div class="setting-item">
                                    <label class="setting-label">API 地址</label>
                                    <input type="text" id="cfg-url" placeholder="${DEFAULT_API_URL}">
                                </div>
                                <div class="setting-item">
                                    <label class="setting-label">API Key</label>
                                    <input type="password" id="cfg-key" placeholder="sk-...">
                                </div>
                                <div class="setting-item">
                                    <label class="setting-label">模型名称</label>
                                    <input type="text" id="cfg-model" placeholder="${DEFAULT_MODEL}">
                                </div>
                            </div>

                            <div class="settings-group">
                                <div class="settings-group-title">内容提取</div>
                                <div class="setting-item">
                                    <label class="setting-label">提取方式</label>
                                    <div class="setting-desc">自动=优先选中文字，其次论坛/正文识别，最后整页兜底</div>
                                    <select id="cfg-extract-mode">
                                        <option value="auto">自动（推荐）</option>
                                        <option value="selection">仅选中内容</option>
                                        <option value="page">仅整页内容</option>
                                    </select>
                                </div>
                                <div class="setting-item setting-item-row">
                                    <div class="setting-info">
                                        <label class="setting-label">最大字符数</label>
                                        <div class="setting-desc">超出后保留开头 70% + 结尾 30%</div>
                                    </div>
                                    <input type="number" id="cfg-max-chars" min="5000" max="500000" step="5000" style="width:100px; text-align:center; padding:6px 10px;">
                                </div>
                                <div class="setting-item setting-item-row">
                                    <div class="setting-info">
                                        <label class="setting-label">快捷楼层数</label>
                                        <div class="setting-desc">论坛页「最近N楼」按钮的楼层数量</div>
                                    </div>
                                    <input type="number" id="cfg-recent-floors" min="10" max="500" style="width:80px; text-align:center; padding:6px 10px;">
                                </div>
                            </div>

                            <div class="settings-group">
                                <div class="settings-group-title">提示词配置</div>
                                <div class="setting-item">
                                    <label class="setting-label">总结提示词</label>
                                    <div class="setting-desc">用于生成内容摘要时的系统指令</div>
                                    <textarea id="cfg-prompt-sum" rows="4"></textarea>
                                </div>
                                <div class="setting-item">
                                    <label class="setting-label">对话提示词</label>
                                    <div class="setting-desc">用于后续追问时的系统指令</div>
                                    <textarea id="cfg-prompt-chat" rows="4"></textarea>
                                </div>
                            </div>

                            <div class="settings-group">
                                <div class="settings-group-title">高级设置</div>
                                <div class="setting-item setting-item-row">
                                    <div class="setting-info">
                                        <label class="setting-label">流式输出</label>
                                        <div class="setting-desc">开启后内容会逐字显示，关闭则等待完成后一次性显示</div>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="cfg-stream" checked>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="setting-item setting-item-row">
                                    <div class="setting-info">
                                        <label class="setting-label">自动滚动</label>
                                        <div class="setting-desc">生成内容时自动滚动到最新位置</div>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="cfg-autoscroll" checked>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>

                            <button class="btn" id="btn-save">${ICONS.check} 保存设置</button>
                        </div>

                    </div>
                </div>
            `;
        }

        restoreState() {
            this.host.style.setProperty('--sidebar-width', `${this.sidebarWidth}px`);
            const btn = this.Q('#toggle-btn');
            btn.style.top = this.btnPos.top;
            this.applySideState();
            if (this.isDarkTheme) {
                this.host.classList.add('dark-theme');
                this.Q('#btn-theme').innerHTML = ICONS.sun;
            } else {
                this.Q('#btn-theme').innerHTML = ICONS.moon;
            }

            this.Q('#cfg-url').value = GM_getValue('apiUrl', DEFAULT_API_URL);
            this.Q('#cfg-key').value = GM_getValue('apiKey', '');
            this.Q('#cfg-model').value = GM_getValue('model', DEFAULT_MODEL);
            this.Q('#cfg-prompt-sum').value = GM_getValue('prompt_sum', '请总结以下网页内容。使用 Markdown 格式，条理清晰，重点突出主要观点、争议点和结论。适当使用标题、列表和引用来组织内容。如果是论坛帖子，注意梳理不同楼层的观点交锋。');
            this.Q('#cfg-prompt-chat').value = GM_getValue('prompt_chat', '你是一个网页阅读助手。基于上文中的页面内容，回答用户的问题。回答要准确、简洁，必要时引用原文。');
            this.Q('#cfg-extract-mode').value = GM_getValue('extractMode', 'auto');
            this.Q('#cfg-max-chars').value = GM_getValue('maxChars', 60000);
            const recentFloors = GM_getValue('recentFloors', 50);
            this.Q('#cfg-recent-floors').value = recentFloors;
            this.Q('#recent-count').textContent = recentFloors;
            this.Q('#cfg-stream').checked = GM_getValue('useStream', true);
            this.Q('#cfg-autoscroll').checked = GM_getValue('autoScroll', true);
        }

        applySideState() {
            const btn = this.Q('#toggle-btn');
            const sidebar = this.Q('#sidebar');
            const resizer = this.Q('#resizer');

            btn.style.left = '';
            btn.style.right = '';

            if (this.side === 'left') {
                sidebar.className = 'sidebar-panel panel-left' + (this.isOpen ? ' open' : '');
                resizer.className = 'resize-handle handle-left';
                btn.className = 'btn-snap-left' + (this.isOpen ? ' arrow-flip' : '');
                btn.innerHTML = ICONS.arrowRight;
            } else {
                sidebar.className = 'sidebar-panel panel-right' + (this.isOpen ? ' open' : '');
                resizer.className = 'resize-handle handle-right';
                btn.className = 'btn-snap-right' + (this.isOpen ? ' arrow-flip' : '');
                btn.innerHTML = ICONS.arrowLeft;
            }

            this.updateButtonPosition();
        }

        updateButtonPosition(useTransition = true) {
            const btn = this.Q('#toggle-btn');
            if (!useTransition) {
                btn.style.transition = 'none';
            } else {
                btn.style.transition = '';
            }

            if (this.side === 'left') {
                btn.style.right = 'auto';
                btn.style.left = this.isOpen ? `${this.sidebarWidth}px` : '0';
            } else {
                btn.style.left = 'auto';
                btn.style.right = this.isOpen ? `${this.sidebarWidth}px` : '0';
            }

            if (!useTransition) {
                btn.offsetHeight;
                requestAnimationFrame(() => {
                    btn.style.transition = '';
                });
            }
        }

        bindEvents() {
            const btn = this.Q('#toggle-btn');
            this.shadow.addEventListener('click', (e) => {
                const toggle = e.target.closest('[data-thinking-toggle]');
                if (toggle) {
                    const block = toggle.closest('[data-thinking-block]');
                    if (block) {
                        block.classList.toggle('expanded');
                    }
                }
            });
            let isDrag = false, hasMoved = false, startX, startY, startRect;
            btn.addEventListener('mousedown', (e) => {
                isDrag = true;
                hasMoved = false;
                startX = e.clientX;
                startY = e.clientY;
                startRect = btn.getBoundingClientRect();

                if (!this.isOpen) {
                    btn.style.transition = 'none';
                }
                btn.style.cursor = 'grabbing';
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => {
                if (!isDrag) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;

                if (!this.isOpen && hasMoved) {
                    btn.style.left = `${startRect.left + dx}px`;
                    btn.style.top = `${startRect.top + dy}px`;
                    btn.style.right = 'auto';
                    btn.className = 'btn-floating';
                }
            });
            window.addEventListener('mouseup', (e) => {
                if (!isDrag) return;
                isDrag = false;
                btn.style.cursor = 'grab';
                btn.style.transition = '';

                if (hasMoved && !this.isOpen) {
                    const winW = window.innerWidth;
                    const btnRect = btn.getBoundingClientRect();
                    const centerX = btnRect.left + btnRect.width / 2;

                    this.side = centerX < winW / 2 ? 'left' : 'right';

                    let newTop = btnRect.top;
                    if (newTop < 10) newTop = 10;
                    if (newTop > window.innerHeight - 60) newTop = window.innerHeight - 60;

                    this.btnPos = { side: this.side, top: `${newTop}px` };
                    GM_setValue('btnPos', this.btnPos);

                    btn.style.top = `${newTop}px`;
                    this.applySideState();
                } else if (!hasMoved) {
                    this.toggleSidebar();
                }
            });
            this.Q('#btn-close').onclick = () => this.toggleSidebar();
            this.Q('#btn-theme').onclick = () => this.toggleTheme();
            this.shadow.querySelectorAll('.tab-item').forEach(tab => {
                tab.onclick = () => {
                    const tabName = tab.dataset.tab;
                    this.switchTab(tabName);
                };
            });
            let isResizing = false;
            this.Q('#resizer').addEventListener('mousedown', (e) => {
                isResizing = true;
                document.body.style.cursor = 'col-resize';
                this.Q('#sidebar').style.transition = 'none';
                document.body.style.transition = 'none';
                e.preventDefault();
            });

            window.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                let newW = this.side === 'right' ? (window.innerWidth - e.clientX) : e.clientX;
                if (newW > 320 && newW < 700) {
                    this.sidebarWidth = newW;
                    this.host.style.setProperty('--sidebar-width', `${newW}px`);
                    if (this.isOpen) {
                        this.squeezeBody(true);
                        this.updateButtonPosition(false);
                    }
                }
            });
            window.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                    this.Q('#sidebar').style.transition = '';
                    document.body.style.transition = 'margin 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
                    GM_setValue('sidebarWidth', this.sidebarWidth);
                }
            });
            this.Q('#range-all').onclick = () => this.setRange('all');
            this.Q('#range-recent').onclick = () => this.setRange('recent');
            // 生成中点击按钮 = 停止
            this.Q('#btn-summary').onclick = () => {
                if (this.isGenerating) {
                    this.abortCtrl?.abort();
                } else {
                    this.doSummary();
                }
            };
            this.Q('#btn-send').onclick = () => {
                if (this.isGenerating) {
                    this.abortCtrl?.abort();
                } else {
                    this.doChat();
                }
            };
            this.Q('#chat-input').onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!this.isGenerating) this.doChat();
                }
            };
            this.Q('#chat-input').addEventListener('input', (e) => {
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            });
            this.Q('#btn-clear-chat').onclick = () => this.clearChat();

            this.Q('#btn-scroll-top').onclick = () => this.scrollToTop();
            this.Q('#btn-scroll-bottom').onclick = () => this.forceScrollToBottom();

            const chatMessages = this.Q('#chat-messages');
            let lastScrollTop = 0;
            chatMessages.addEventListener('scroll', () => {
                const currentScrollTop = chatMessages.scrollTop;
                const scrollHeight = chatMessages.scrollHeight;
                const clientHeight = chatMessages.clientHeight;
                const isNearBottom = scrollHeight - currentScrollTop - clientHeight < 80;
                if (this.isGenerating && !this.isProgrammaticScroll) {
                    if (currentScrollTop < lastScrollTop - 10) {
                        this.userScrolledUp = true;
                    } else if (isNearBottom) {
                        this.userScrolledUp = false;
                    }
                }
                lastScrollTop = currentScrollTop;
                this.updateScrollButtons();
            });
            this.Q('#btn-save').onclick = () => {
                GM_setValue('apiUrl', this.Q('#cfg-url').value.trim());
                GM_setValue('apiKey', this.Q('#cfg-key').value.trim());
                GM_setValue('model', this.Q('#cfg-model').value.trim());
                GM_setValue('prompt_sum', this.Q('#cfg-prompt-sum').value);
                GM_setValue('prompt_chat', this.Q('#cfg-prompt-chat').value);
                GM_setValue('extractMode', this.Q('#cfg-extract-mode').value);
                const maxChars = parseInt(this.Q('#cfg-max-chars').value) || 60000;
                GM_setValue('maxChars', Math.max(5000, Math.min(500000, maxChars)));
                const recentFloors = parseInt(this.Q('#cfg-recent-floors').value) || 50;
                GM_setValue('recentFloors', Math.max(10, Math.min(500, recentFloors)));
                this.Q('#recent-count').textContent = GM_getValue('recentFloors', 50);
                GM_setValue('useStream', this.Q('#cfg-stream').checked);
                GM_setValue('autoScroll', this.Q('#cfg-autoscroll').checked);
                this.showToast('设置已保存', 'success');
                this.switchTab('summary');
            };
        }

        bindKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    this.toggleSidebar();
                }
                if (e.key === 'Escape' && this.isOpen) {
                    this.toggleSidebar();
                }
            });
        }

        toggleTheme() {
            this.isDarkTheme = !this.isDarkTheme;
            GM_setValue('isDarkTheme', this.isDarkTheme);

            if (this.isDarkTheme) {
                this.host.classList.add('dark-theme');
                this.Q('#btn-theme').innerHTML = ICONS.sun;
            } else {
                this.host.classList.remove('dark-theme');
                this.Q('#btn-theme').innerHTML = ICONS.moon;
            }
        }

        showToast(message, type = '') {
            const toast = this.Q('#toast');
            toast.textContent = message;
            toast.className = 'toast' + (type ? ` ${type}` : '');
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
            setTimeout(() => {
                toast.classList.remove('show');
            }, 2500);
        }

        copyToClipboard(text) {
            try {
                GM_setClipboard(text, 'text');
                return true;
            } catch (e) {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            }
        }

        bindCopyButton(container, getText) {
            const copyBtn = container.querySelector('#btn-copy-summary');
            if (!copyBtn) return;
            copyBtn.onclick = () => {
                this.copyToClipboard(getText());
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = `${ICONS.check} 已复制`;
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = `${ICONS.copy} 复制`;
                }, 2000);
            };
        }

        updateScrollButtons() {
            const chatMessages = this.Q('#chat-messages');
            const scrollTop = chatMessages.scrollTop;
            const scrollHeight = chatMessages.scrollHeight;
            const clientHeight = chatMessages.clientHeight;
            const distanceToBottom = scrollHeight - scrollTop - clientHeight;
            const btnTop = this.Q('#btn-scroll-top');
            const btnBottom = this.Q('#btn-scroll-bottom');

            if (scrollTop > 50) {
                btnTop.classList.add('visible');
            } else {
                btnTop.classList.remove('visible');
            }

            if (this.isGenerating && this.userScrolledUp) {
                btnBottom.classList.add('visible', 'generating');
            } else if (distanceToBottom > 50) {
                btnBottom.classList.add('visible');
                btnBottom.classList.remove('generating');
            } else {
                btnBottom.classList.remove('visible', 'generating');
            }
        }

        scrollToTop() {
            const chatMessages = this.Q('#chat-messages');
            chatMessages.scrollTo({ top: 0, behavior: 'smooth' });
        }

        scrollToBottom(force = false) {
            if (!force && !GM_getValue('autoScroll', true)) {
                this.updateScrollButtons();
                return;
            }
            if (!force && this.userScrolledUp) {
                this.updateScrollButtons();
                return;
            }
            const chatMessages = this.Q('#chat-messages');
            this.isProgrammaticScroll = true;
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
                setTimeout(() => {
                    this.isProgrammaticScroll = false;
                    this.updateScrollButtons();
                }, 50);
            }, 0);
        }

        forceScrollToBottom() {
            this.userScrolledUp = false;
            const chatMessages = this.Q('#chat-messages');
            this.isProgrammaticScroll = true;
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
                setTimeout(() => {
                    this.isProgrammaticScroll = false;
                    this.updateScrollButtons();
                }, 50);
            }, 0);
        }

        clearChat() {
            if (this.chatHistory.length === 0) return;
            if (confirm('确定要清空所有对话记录吗？\n（总结上下文将保留，可以继续提问）')) {
                if (this.chatHistory.length > 3) {
                    this.chatHistory = this.chatHistory.slice(0, 3);
                }
                this.Q('#chat-list').innerHTML = '';
                this.userMessageCount = 0;
                this.updateMessageCount();
                if (this.chatHistory.length <= 3) {
                    const emptyDiv = this.Q('#chat-empty');
                    emptyDiv.classList.remove('hidden');
                    emptyDiv.innerHTML = `<span class="tip-icon">${ICONS.chat}</span>对话已清空<br>可以继续基于页面内容提问`;
                }

                this.showToast('对话已清空');
            }
        }

        updateMessageCount() {
            this.Q('#msg-count').textContent = this.userMessageCount;
        }

        toggleSidebar() {
            this.isOpen = !this.isOpen;
            const sidebar = this.Q('#sidebar');
            const btn = this.Q('#toggle-btn');

            if (this.isOpen) {
                sidebar.classList.add('open');
                btn.classList.add('arrow-flip');
                this.squeezeBody(true);
                this.refreshSummaryPageHints();
            } else {
                sidebar.classList.remove('open');
                btn.classList.remove('arrow-flip');
                this.squeezeBody(false);
            }

            this.updateButtonPosition();
        }

        squeezeBody(active) {
            const body = document.body;
            body.style.transition = 'margin 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
            if (!active) {
                body.style.marginLeft = '';
                body.style.marginRight = '';
            } else {
                if (this.side === 'left') {
                    body.style.marginLeft = `${this.sidebarWidth}px`;
                    body.style.marginRight = '';
                } else {
                    body.style.marginRight = `${this.sidebarWidth}px`;
                    body.style.marginLeft = '';
                }
            }
        }

        switchTab(tabName) {
            this.shadow.querySelectorAll('.tab-item').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === tabName);
            });
            this.shadow.querySelectorAll('.view-page').forEach(p => {
                p.classList.toggle('active', p.id === `page-${tabName}`);
            });
            this.currentTab = tabName;
            if (tabName === 'chat') {
                setTimeout(() => this.updateScrollButtons(), 100);
            }
        }

        // 打开面板时刷新「楼层范围」显隐和来源提示
        refreshSummaryPageHints() {
            const isForum = Core.isDiscourseTopic();
            const sel = (window.getSelection()?.toString() || '').trim();
            const mode = GM_getValue('extractMode', 'auto');

            this.Q('#range-group').style.display = isForum ? '' : 'none';
            if (isForum) {
                const max = Core.getReplyCount();
                const start = this.Q('#inp-start');
                const end = this.Q('#inp-end');
                if (!start.value) start.value = 1;
                if (max && !end.value) end.value = max;
            }

            let hint;
            if (mode === 'selection' || (mode === 'auto' && sel.length > 50)) {
                hint = `将总结选中文字（${sel.length} 字）`;
            } else if (isForum) {
                hint = '检测到论坛帖子，走楼层 API 提取';
            } else if (mode === 'page') {
                hint = '将提取整页内容';
            } else {
                hint = '将自动识别页面正文';
            }
            this.Q('#source-text').textContent = hint;
        }

        setRange(type) {
            const max = Core.getReplyCount();
            if (!max) return;
            this.Q('#inp-end').value = max;
            const recentFloors = GM_getValue('recentFloors', 50);
            this.Q('#inp-start').value = type === 'all' ? 1 : Math.max(1, max - recentFloors + 1);
        }

        setLoading(btnId, isLoading) {
            const btn = this.Q(btnId);
            this.isGenerating = isLoading;

            if (btnId === '#btn-summary') {
                const textEl = btn.querySelector('.btn-text');
                if (isLoading) {
                    btn.classList.add('stop-mode');
                    textEl.innerHTML = `${ICONS.close} 停止`;
                } else {
                    btn.classList.remove('stop-mode');
                    textEl.innerHTML = `${ICONS.sparkles} 开始智能总结`;
                }
            } else if (btnId === '#btn-send') {
                if (isLoading) {
                    btn.classList.add('stop-mode');
                    btn.innerHTML = ICONS.close;
                    btn.title = '停止生成';
                } else {
                    btn.classList.remove('stop-mode');
                    btn.innerHTML = ICONS.send;
                    btn.title = '发送消息';
                }
                const input = this.Q('#chat-input');
                if (input) {
                    input.placeholder = isLoading ? '正在生成回复... (点右侧按钮停止)' : '输入你的问题... (Enter 发送)';
                }
            }
        }

        // 流式渲染节流：攒 120ms 渲染一次，避免每个 chunk 全量重排
        scheduleRender(fn) {
            if (this._renderTimer) return;
            this._renderTimer = setTimeout(() => {
                this._renderTimer = null;
                fn();
            }, 120);
        }

        async doSummary() {
            if (this.isGenerating) return;
            const isForum = Core.isDiscourseTopic();
            const start = parseInt(this.Q('#inp-start').value) || 1;
            const end = parseInt(this.Q('#inp-end').value) || 0;

            if (isForum) {
                if (!Core.getTopicId()) return alert('检测到论坛但未识别到帖子 ID');
                if (end && start > end) return alert('楼层范围无效');
            }

            this.setLoading('#btn-summary', true);
            this.abortCtrl = new AbortController();

            const resultBox = this.Q('#summary-result');
            resultBox.classList.remove('empty');
            const loadingHtml = (msg) => `
                <div style="color:var(--text-sec); display:flex; align-items:center; gap:10px;">
                    <div class="thinking">
                        <div class="thinking-dot"></div>
                        <div class="thinking-dot"></div>
                        <div class="thinking-dot"></div>
                    </div>
                    ${msg}
                </div>
            `;
            resultBox.innerHTML = loadingHtml('正在提取页面内容...');

            try {
                const { text: rawText, source } = await Core.extract({ start, end: end || undefined });
                if (!rawText) throw new Error('未获取到内容');

                const maxChars = GM_getValue('maxChars', 60000);
                const { text, truncated } = Core.truncateContent(rawText, maxChars);
                this.postContent = text;

                const sourceInfo = `来源：${source} · ${rawText.length} 字` + (truncated ? `（已截断至 ${maxChars} 字）` : '');
                resultBox.innerHTML = loadingHtml(`AI 正在分析中... <span style="font-size:12px;color:var(--text-muted)">${sourceInfo}</span>`);

                const sysPrompt = GM_getValue('prompt_sum', '');
                const messages = [
                    { role: 'system', content: sysPrompt },
                    { role: 'user', content: `页面标题：${document.title}\n页面地址：${location.href}\n\n页面内容:\n${text}` }
                ];

                let aiText = '';
                const renderStreaming = () => {
                    const currentBlock = resultBox.querySelector('[data-thinking-block]');
                    const isExpanded = currentBlock?.classList.contains('expanded') || false;
                    resultBox.innerHTML = `
                        <div class="result-actions">
                            <button class="result-action-btn" id="btn-copy-summary">${ICONS.copy} 复制</button>
                        </div>
                        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${sourceInfo}</div>
                    ` + Core.renderWithThinking(aiText, true, isExpanded);
                    if (GM_getValue('autoScroll', true)) {
                        setTimeout(() => {
                            resultBox.scrollTop = resultBox.scrollHeight;
                            const thinkingInner = resultBox.querySelector('.thinking-content-inner');
                            if (thinkingInner && isExpanded) {
                                thinkingInner.scrollTop = thinkingInner.scrollHeight;
                            }
                        }, 0);
                    }
                    this.bindCopyButton(resultBox, () => aiText);
                };

                const finishRender = (stopped = false) => {
                    resultBox.innerHTML = `
                        <div class="result-actions">
                            <button class="result-action-btn" id="btn-copy-summary">${ICONS.copy} 复制</button>
                        </div>
                        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${sourceInfo}</div>
                    ` + Core.renderWithThinking(aiText, false)
                      + (stopped ? `<div style="color:var(--text-muted);font-size:12px;margin-top:8px;">⏹ 已手动停止，以上为部分内容</div>` : '');
                    this.bindCopyButton(resultBox, () => aiText);
                };

                await Core.streamChat(messages,
                    (chunk) => {
                        aiText += chunk;
                        this.scheduleRender(renderStreaming);
                    },
                    () => {
                        if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
                        this.setLoading('#btn-summary', false);
                        this.abortCtrl = null;
                        finishRender(false);

                        this.lastSummary = aiText;
                        const chatPrompt = GM_getValue('prompt_chat', '');
                        this.chatHistory = [
                            { role: 'system', content: chatPrompt },
                            { role: 'user', content: `页面标题：${document.title}\n页面地址：${location.href}\n\n以下是页面内容供你参考:\n${text}` },
                            { role: 'assistant', content: aiText }
                        ];
                        this.Q('#chat-list').innerHTML = '';
                        this.userMessageCount = 0;
                        this.updateMessageCount();
                        this.Q('#chat-empty').classList.remove('hidden');
                        this.Q('#chat-empty').innerHTML = `<span class="tip-icon">${ICONS.check}</span>总结已完成！<br>现在可以基于页面内容进行对话`;
                    },
                    (err) => {
                        if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
                        this.setLoading('#btn-summary', false);
                        this.abortCtrl = null;
                        if (err === '__aborted__') {
                            finishRender(true);
                            this.showToast('已停止生成');
                            // 中断的内容也允许进入对话上下文
                            if (aiText) {
                                const chatPrompt = GM_getValue('prompt_chat', '');
                                this.chatHistory = [
                                    { role: 'system', content: chatPrompt },
                                    { role: 'user', content: `页面标题：${document.title}\n页面地址：${location.href}\n\n以下是页面内容供你参考:\n${text}` },
                                    { role: 'assistant', content: aiText }
                                ];
                            }
                        } else {
                            resultBox.innerHTML = `<div style="color:var(--danger)">❌ 错误: ${Core.escapeHtml(err)}</div>`;
                            this.showToast('总结失败: ' + err, 'error');
                        }
                    },
                    this.abortCtrl.signal
                );
            } catch (e) {
                resultBox.innerHTML = `<div style="color:var(--danger)">❌ 错误: ${Core.escapeHtml(e.message)}</div>`;
                this.setLoading('#btn-summary', false);
                this.abortCtrl = null;
            }
        }

        async doChat() {
            if (this.isGenerating) return;
            if (this.chatHistory.length === 0) {
                return alert('请先在「总结」页面生成内容摘要');
            }

            const input = this.Q('#chat-input');
            const txt = input.value.trim();
            if (!txt) return;

            input.value = '';
            input.style.height = 'auto';
            this.Q('#chat-empty').classList.add('hidden');
            this.userScrolledUp = false;

            this.addBubble('user', txt);
            this.chatHistory.push({ role: 'user', content: txt });
            this.userMessageCount++;
            this.updateMessageCount();

            const msgDiv = this.addBubble('ai', '');
            msgDiv.innerHTML = `
                <div class="thinking">
                    <div class="thinking-dot"></div>
                    <div class="thinking-dot"></div>
                    <div class="thinking-dot"></div>
                </div>
            `;
            let aiText = '';

            this.setLoading('#btn-send', true);
            this.abortCtrl = new AbortController();

            // 滑动窗口：保留 [system+页面内容+总结] + 最近 10 条对话，防止 token 无限膨胀
            const historyToSend = this.chatHistory.length > 13
                ? this.chatHistory.slice(0, 3).concat(this.chatHistory.slice(-10))
                : this.chatHistory;

            const renderStreaming = () => {
                const currentBlock = msgDiv.querySelector('[data-thinking-block]');
                const isExpanded = currentBlock?.classList.contains('expanded') || false;
                msgDiv.innerHTML = Core.renderWithThinking(aiText, true, isExpanded);
                if (GM_getValue('autoScroll', true) && isExpanded) {
                    setTimeout(() => {
                        const thinkingInner = msgDiv.querySelector('.thinking-content-inner');
                        if (thinkingInner) {
                            thinkingInner.scrollTop = thinkingInner.scrollHeight;
                        }
                    }, 0);
                }
                this.scrollToBottom();
            };

            await Core.streamChat(historyToSend,
                (chunk) => {
                    aiText += chunk;
                    this.scheduleRender(renderStreaming);
                },
                () => {
                    if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
                    msgDiv.innerHTML = Core.renderWithThinking(aiText, false);
                    this.chatHistory.push({ role: 'assistant', content: aiText });
                    // 本体也做窗口修剪，防止内存里无限增长
                    if (this.chatHistory.length > 23) {
                        this.chatHistory = this.chatHistory.slice(0, 3).concat(this.chatHistory.slice(-20));
                    }
                    this.setLoading('#btn-send', false);
                    this.abortCtrl = null;
                    this.userScrolledUp = false;
                    this.updateScrollButtons();
                },
                (err) => {
                    if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
                    this.setLoading('#btn-send', false);
                    this.abortCtrl = null;
                    if (err === '__aborted__') {
                        msgDiv.innerHTML = Core.renderWithThinking(aiText, false)
                            + `<div style="color:var(--text-muted);font-size:12px;margin-top:6px;">⏹ 已手动停止</div>`;
                        if (aiText) this.chatHistory.push({ role: 'assistant', content: aiText });
                    } else {
                        msgDiv.innerHTML += `<br><span style="color:var(--danger)">❌ ${Core.escapeHtml(err)}</span>`;
                    }
                },
                this.abortCtrl.signal
            );
        }

        addBubble(role, text) {
            const div = document.createElement('div');
            div.className = `bubble bubble-${role}`;
            div.innerHTML = role === 'user' ? Core.escapeHtml(text) : Core.renderWithThinking(text);
            this.Q('#chat-list').appendChild(div);
            this.scrollToBottom();
            return div;
        }
    }

    // 延迟初始化，确保 body 存在（部分站点脚本注入时机较早）
    if (document.body) {
        new AppUI();
    } else {
        window.addEventListener('DOMContentLoaded', () => new AppUI());
    }

})();
