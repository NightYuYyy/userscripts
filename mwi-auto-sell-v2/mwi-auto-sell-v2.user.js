// ==UserScript==
// @name:en         [MWI]Inventory Items Quick Sell Assistant v2
// @name            [银河奶牛]库存物品一键自动出售（极速版）v2
// @namespace       mwi-auto-sell-v2
// @version         2.0.0
// @description:en  Select an inventory item, press S: Go to Market → New Sell Listing → price +1 → Max → Post → close. Polls for each button instead of fixed delays.
// @description     选中库存物品后按 S：前往市场 → 新出售挂牌 → 价格+1 → 最多 → 发布 → 关闭。逐步轮询等待按钮出现，无固定延迟。
// @author          zhengjiyong
// @license         MIT
// @match           https://www.milkywayidle.com/game*
// @icon            https://www.milkywayidle.com/favicon.svg
// @grant           none
// @run-at          document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const zh = navigator.language.startsWith('zh');
    const t = (z, e) => (zh ? z : e);

    const CONFIG = {
        hotkey: 's',
        stepTimeout: 3000,   // 每步最多等待按钮出现的毫秒数
        pollInterval: 50,
        priceClicks: 1,      // 点击价格 "+" 的次数（0 = 按最佳出售报价挂牌）
    };

    // 选择器均来自 2026-09 实际 DOM 抓取；英文按钮文本未实机验证
    const STEPS = [
        { name: t('前往市场', 'Go to Market'), scope: '[class*="Item_actionMenu__"]', text: t('前往市场', 'Go to Market') },
        { name: t('新出售挂牌', 'New Sell Listing'), scope: '[class*="MarketplacePanel_newListingButtonsContainer__"]', text: t('+ 新出售挂牌', '+ New Sell Listing') },
        { name: t('价格 +', 'Price +'), scope: '[class*="MarketplacePanel_priceInputs__"]', text: '+', repeat: CONFIG.priceClicks },
        { name: t('最多', 'Max'), scope: '[class*="MarketplacePanel_quantityInputs__"]', text: t('最多', 'Max') },
        { name: t('发布出售挂牌', 'Post Sell Listing'), scope: '[class*="MarketplacePanel_postButtonContainer__"]', text: t('发布出售挂牌', 'Post Sell Listing') },
        { name: t('关闭市场', 'Close Market'), selector: '[class*="MainPanel_marketplaceModalCloseButton__"]',
          // 发布后挂牌弹窗先消失，再关市场面板，否则会点到弹窗遮罩
          ready: () => !document.querySelector('[class*="MarketplacePanel_modalContent__"]') },
    ];

    function find(step) {
        if (step.selector) return document.querySelector(step.selector);
        for (const scope of document.querySelectorAll(step.scope)) {
            for (const btn of scope.querySelectorAll('button')) {
                if (btn.textContent.trim() === step.text) return btn;
            }
        }
        return null;
    }

    function waitFor(step) {
        return new Promise((resolve, reject) => {
            const deadline = performance.now() + CONFIG.stepTimeout;
            (function poll() {
                const el = find(step);
                if (el && (!step.ready || step.ready())) return resolve(el);
                if (performance.now() > deadline) return reject(new Error(t(`未找到"${step.name}"按钮`, `"${step.name}" button not found`)));
                setTimeout(poll, CONFIG.pollInterval);
            })();
        });
    }

    let running = false;
    async function run() {
        if (running) return;
        if (!document.querySelector('[class*="Item_selected__"]')) return notify(t('请先选择一个物品！', 'Select an item first!'), 'error');
        running = true;
        const start = performance.now();
        try {
            for (const step of STEPS) {
                for (let i = 0; i < (step.repeat ?? 1); i++) {
                    (await waitFor(step)).click();
                }
            }
            notify(t(`出售完成，耗时 ${Math.round(performance.now() - start)}ms`, `Sold in ${Math.round(performance.now() - start)}ms`), 'success');
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            running = false;
        }
    }

    function notify(msg, type) {
        const el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999;padding:10px 14px;border-radius:6px;color:#fff;font:14px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);background:${type === 'error' ? '#f44336' : '#4caf50'}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2500);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== CONFIG.hotkey || e.ctrlKey || e.altKey || e.metaKey) return;
        if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return; // 聊天框里打字不触发
        e.preventDefault();
        run();
    });

    console.log('[MWI AutoSell v2] loaded, hotkey:', CONFIG.hotkey.toUpperCase());
})();
