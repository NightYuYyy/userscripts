// ==UserScript==
// @name:en         [MWI]Inventory Items Quick Sell Assistant (WebSocket Version)
// @name            [银河奶牛]库存物品一键自动出售（接口版）v3
// @namespace       mwi-auto-sell-v3
// @version         3.1.0
// @description:en  Select an inventory item, press S to list the whole stack at the lowest ask, or D to instantly sell into the best bid. Talks to the game's WebSocket directly, no UI clicking.
// @description     选中库存物品后按 S 按最低卖价挂牌整组，按 D 即时卖给最高买单。直接走游戏 WebSocket，不点任何按钮。
// @author          zhengjiyong
// @license         MIT
// @match           https://www.milkywayidle.com/game*
// @icon            https://www.milkywayidle.com/favicon.svg
// @grant           none
// @run-at          document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const zh = navigator.language.startsWith('zh');
    const t = (z, e) => (zh ? z : e);
    const CONFIG = { listKey: 's', instantKey: 'd', replyTimeout: 3000 };

    // ---- WebSocket 拦截：拿到游戏 socket，维护库存映射，分发等待中的回复 ----
    let socket = null;
    const inventory = new Map();   // "itemHrid:level" -> count
    const waiters = [];            // { match(msg) -> bool, resolve }

    const NativeWS = window.WebSocket;
    window.WebSocket = class extends NativeWS {
        constructor(...args) {
            super(...args);
            if (String(args[0]).includes('api.milkywayidle.com')) {
                socket = this;
                this.addEventListener('message', onMessage);
            }
        }
    };

    function track(item) {
        if (item.itemLocationHrid !== '/item_locations/inventory') return;
        const key = `${item.itemHrid}:${item.enhancementLevel || 0}`;
        item.count > 0 ? inventory.set(key, item.count) : inventory.delete(key);
    }

    function onMessage(ev) {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'init_character_data') { inventory.clear(); (msg.characterItems || []).forEach(track); }
        else if (msg.type === 'items_updated') (msg.endCharacterItems || []).forEach(track);
        for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].match(msg)) waiters.splice(i, 1)[0].resolve(msg);
        }
    }

    function send(msg) {
        msg.ts = Date.now();
        socket.send(JSON.stringify(msg));
    }

    function waitFor(match) {
        return new Promise((resolve, reject) => {
            const w = { match, resolve };
            waiters.push(w);
            setTimeout(() => {
                const i = waiters.indexOf(w);
                if (i >= 0) { waiters.splice(i, 1); reject(new Error(t('等待服务器回复超时', 'Server reply timed out'))); }
            }, CONFIG.replyTimeout);
        });
    }

    // ---- 从选中的物品 DOM 读取 itemHrid / 强化等级 ----
    function selectedItem() {
        const el = document.querySelector('[class*="Item_selected__"]');
        if (!el) return null;
        const href = el.querySelector('use')?.getAttribute('href') || '';
        const id = href.split('#')[1];
        if (!id) return null;
        const level = parseInt(el.querySelector('[class*="Item_enhancementLevel__"]')?.textContent) || 0;
        return { itemHrid: `/items/${id}`, level };
    }

    // ---- 主流程 ----
    let running = false;
    async function run(instant) {
        if (running) return;
        const item = selectedItem();
        if (!item) return notify(t('请先选择一个物品！', 'Select an item first!'), 'error');
        if (!socket || socket.readyState !== 1) return notify(t('游戏连接未就绪', 'Game socket not ready'), 'error');
        const owned = inventory.get(`${item.itemHrid}:${item.level}`);
        if (!owned) return notify(t('未找到该物品的库存数量（请刷新页面）', 'Inventory count unknown (reload page)'), 'error');

        running = true;
        const start = performance.now();
        try {
            const bookReply = waitFor(m => m.type === 'market_item_order_books_updated' && m.marketItemOrderBooks?.itemHrid === item.itemHrid);
            send({ type: 'get_market_item_order_books', getMarketItemOrderBooksData: { itemHrid: item.itemHrid } });
            const book = (await bookReply).marketItemOrderBooks.orderBooks?.[item.level] || {};
            let price, quantity;
            if (instant) {
                // 右侧"出售"：吃最高买单，数量不超过该价位的买单总量
                price = book.bids?.[0]?.price;
                if (!price) throw new Error(t('该物品当前没有买单', 'No bids for this item'));
                quantity = Math.min(owned, book.bids.filter(b => b.price >= price).reduce((n, b) => n + b.quantity, 0));
            } else {
                // 与手动点"+"一致：挂在当前最低卖价；无卖单时退到最高买价
                price = book.asks?.[0]?.price ?? book.bids?.[0]?.price;
                if (!price) throw new Error(t('该物品当前没有市场报价', 'No market price for this item'));
                quantity = owned;
            }

            const ack = waitFor(m => m.type === 'market_listings_updated' || m.type === 'error');
            send({ type: 'post_market_order', postMarketOrderData: { isSell: true, itemHrid: item.itemHrid, enhancementLevel: item.level, quantity, price, isInstantOrder: !!instant } });
            const reply = await ack;
            if (reply.type === 'error') throw new Error(reply.message);
            const what = `${quantity} × ${item.itemHrid.slice(7)}${item.level ? ' +' + item.level : ''} @ ${price.toLocaleString()}`;
            const ms = Math.round(performance.now() - start);
            notify(instant ? t(`已即时卖出 ${what}，耗时 ${ms}ms`, `Sold ${what} in ${ms}ms`) : t(`已挂牌 ${what}，耗时 ${ms}ms`, `Listed ${what} in ${ms}ms`), 'success');
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
        setTimeout(() => el.remove(), 3000);
    }

    // 捕获阶段 + 阻止传播：旧版 UI 点击脚本若未禁用，S 键也不会再触发它
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if ((key !== CONFIG.listKey && key !== CONFIG.instantKey) || e.ctrlKey || e.altKey || e.metaKey) return;
        if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return; // 聊天框里打字不触发
        e.preventDefault();
        e.stopPropagation();
        run(key === CONFIG.instantKey);
    }, true);

    console.log('[MWI AutoSell v3] loaded, hotkeys:', CONFIG.listKey.toUpperCase(), '=list', CONFIG.instantKey.toUpperCase(), '=instant sell');
})();
