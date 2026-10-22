/* Locate the playing track in the current Spotify list. No external requests. */
(function () {
  "use strict";

  function canonicalUri(value) {
    if (value && typeof value === "object" && typeof value.toURI === "function") {
      try { value = value.toURI(); } catch (_) { return null; }
    }
    if (typeof value !== "string") return null;
    try { value = decodeURIComponent(value); } catch (_) { /* Keep literal local URIs. */ }
    const uri = value.match(/^spotify:(track|episode|local):[^?#]+/);
    if (uri) return uri[0];
    const path = value.match(/(?:^|\/)\b(track|episode)\/([^/?#]+)/);
    return path ? `spotify:${path[1]}:${path[2]}` : null;
  }

  function identity(item) {
    const uris = new Set();
    const seen = new Set();
    let uid = null;
    function visit(value, depth) {
      if (!value || depth > 4) return;
      if (typeof value === "string") {
        const uri = canonicalUri(value);
        if (uri) uris.add(uri);
        return;
      }
      if (typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      const objectUri = canonicalUri(value);
      if (objectUri) uris.add(objectUri);
      if (!uid && typeof value.uid === "string") uid = value.uid;
      for (const key of ["uri", "link", "href", "originalUri", "original_uri", "trackUri", "track_uri", "associatedAudioUri", "item", "track", "data", "value", "metadata", "linked_from", "linkedFrom"]) {
        visit(value[key], depth + 1);
      }
    }
    visit(item, 0);
    return { uris, uid };
  }

  function sameTrack(a, b) {
    return Array.from(a.uris).some(uri => b.uris.has(uri));
  }

  function findTrackIndex(items, target, resolveItem) {
    let first = -1;
    for (let index = 0; index < items.length; index++) {
      if (!items[index]) continue;
      let resolved = items[index];
      if (resolveItem) {
        try { resolved = resolveItem(items[index], index) || resolved; } catch (_) { /* Raw item fallback. */ }
      }
      const candidate = identity(resolved);
      for (const uri of identity(items[index]).uris) candidate.uris.add(uri);
      if (!sameTrack(candidate, target)) continue;
      if (target.uid && candidate.uid === target.uid) return index;
      if (first === -1) first = index;
    }
    return first;
  }

  function estimateScroll(anchor, targetIndex, viewport) {
    return Math.max(0, Math.min(viewport.maxScroll,
      viewport.scrollTop + anchor.top - viewport.top +
      (targetIndex - anchor.index) * anchor.pitch - (viewport.height - anchor.height) / 2));
  }

  async function readItems(model) {
    let cacheError;
    if (typeof model.cache?.cacheAll === "function") {
      try {
        const result = await model.cache.cacheAll();
        const items = Array.isArray(result) ? result : result?.items;
        if (Array.isArray(items) && result?.cacheStatus !== "discarded") return items;
      } catch (error) { cacheError = error; }
    }
    if (typeof model.fetchTracks === "function") {
      const items = [];
      let total = Number.isFinite(model.count) ? model.count : Infinity;
      while (items.length < total) {
        if (items.length >= 50000) throw new Error("list-too-large");
        const offset = items.length;
        const result = await model.fetchTracks(offset, 200);
        if (!Array.isArray(result?.items)) throw new Error("list-unavailable");
        const declared = result.totalLength ?? result.totalCount;
        if (Number.isFinite(declared)) total = declared;
        items.push(...result.items);
        if (!result.items.length) {
          if (items.length < total && Number.isFinite(total)) throw new Error("incomplete-list");
          break;
        }
        if (!Number.isFinite(total) && result.items.length < 200) break;
      }
      return items;
    }
    const cached = model.handle?.getRows?.() || model.cache?.getItems?.(0, model.count - 1, {cachedOnly:true});
    if (Array.isArray(cached) && Number.isFinite(model.count) && cached.length >= model.count &&
        Array.from({length:model.count}, (_, index) => cached[index]).every(item => item !== undefined)) return cached;
    throw cacheError || new Error("list-unavailable");
  }

  // React may leave the DOM's fiber property pointing at the alternate tree.
  function currentFiber(fiber) {
    let root = fiber;
    for (let depth = 0; root?.return && depth < 250; depth++) root = root.return;
    return root?.alternate && root.stateNode?.current === root.alternate && fiber?.alternate ? fiber.alternate : fiber;
  }

  function discoverListModel(startFiber, stopNode) {
    const model = {};
    function inspect(value) {
      if (!value || typeof value !== "object") return;
      const cache = value.itemsCache || value;
      if (!model.cache && typeof cache.cacheAll === "function" && typeof cache.getItems === "function") {
        model.cache = cache;
        model.count = cache.nrValidItems;
      }
      if (!model.resolveItem && typeof value.resolveItem === "function") model.resolveItem = value.resolveItem;
      if (!model.fetchTracks && typeof value.fetchTracks === "function") {
        model.fetchTracks = value.fetchTracks;
        if (!Number.isFinite(model.count)) model.count = value.nrTracks;
      }
      if (typeof value.getRows === "function" && typeof value.scrollToIndex === "function") model.handle = value;
    }
    for (let fiber = currentFiber(startFiber), depth = 0; fiber && depth < 180; fiber = fiber.return, depth++) {
      for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
        inspect(props);
        inspect(props?.value);
        inspect(props?.outerRef?.current);
        inspect(props?.tracklistRef?.current);
      }
      inspect(fiber.ref?.current);
      let hook = fiber.memoizedState;
      for (let index = 0; hook && index < 90; index++, hook = hook.next) {
        inspect(hook.memoizedState);
        inspect(hook.memoizedState?.current);
      }
      let context = fiber.dependencies?.firstContext;
      for (let index = 0; context && index < 40; index++, context = context.next) inspect(context.memoizedValue);
      if (stopNode && fiber.stateNode === stopNode) break;
    }
    return model;
  }

  const core = { canonicalUri, identity, sameTrack, findTrackIndex, estimateScroll, readItems, currentFiber, discoverListModel };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const VERSION = "1.3.0";
  const LABEL = "定位当前播放歌曲（Alt+L）";
  const ROWS = '[role="row"], [data-testid="tracklist-row"]';
  const ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/></svg>';
  window.__locatePlayingTrack?.dispose?.();
  let disposed = false;
  let sequence = 0;
  let queued = false;
  let lastResult = null;
  let observer;
  let resizeObserver;
  let observedPane;
  let diagnostics = {};
  const buttons = new Map();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const behavior = () => reducedMotion() ? "auto" : "smooth";
  const mainView = () => Array.from(document.querySelectorAll('main, [role="main"]'))
    .find(element => element.getBoundingClientRect().height > 0);
  const route = () => window.Spicetify?.Platform?.History?.location?.pathname || location.pathname;
  function currentTrack() {
    const player = window.Spicetify?.Player;
    const platform = window.Spicetify?.Platform;
    const candidates = [
      ["player-data", player?.data],
      ["player-origin", player?.origin?._state],
      ["platform-state", platform?.PlayerAPI?._state]
    ];
    // Some Spotify versions no longer populate Spicetify.Player.data. The
    // semantic now-playing title link still identifies the actual track.
    for (const [source, value] of candidates) {
      const result = identity(value);
      if (result.uris.size) { result.source = source; return result; }
    }
    const titles = document.querySelectorAll('[data-testid="context-item-info-title"], [data-testid="now-playing-widget-v2"] a[href*="/track/"], [data-testid="now-playing-widget-v2"] a[href*="/episode/"], [data-testid="now-playing-widget"] a[href*="/track/"], [data-testid="now-playing-widget"] a[href*="/episode/"], .main-nowPlayingWidget-nowPlaying a[href*="/track/"]');
    for (const title of titles) {
      const result = identity(title.getAttribute("href") || title.getAttribute("data-uri"));
      if (result.uris.size) { result.source = "now-playing-link"; return result; }
    }
    // V2 can render a title as a span (local tracks or new navigation UI).
    // Read only this widget's rendered props, never queue/recommendation contexts.
    for (const widget of document.querySelectorAll('[data-testid="now-playing-widget-v2"], [data-testid="now-playing-widget"]')) {
      const result = widgetTrack(widget);
      if (result.uris.size) { result.source = "now-playing-widget-props"; return result; }
    }
    return identity(null);
  }
  function widgetTrack(widget) {
    const seen = new Set();
    function read(value, depth = 0) {
      if (!value || typeof value !== "object" || depth > 12 || seen.has(value) || seen.size > 250) return identity(null);
      seen.add(value);
      const direct = identity(value);
      if (direct.uris.size) return direct;
      const children = Array.isArray(value) ? value : [value.props, value.children];
      for (const child of children) {
        const result = read(child, depth + 1);
        if (result.uris.size) return result;
      }
      return identity(null);
    }
    for (const element of [widget, ...Array.from(widget.querySelectorAll('*')).slice(0, 60)]) {
      const fiber = fiberOf(element);
      const propsKey = Object.keys(element).find(key => key.startsWith('__reactProps$'));
      for (const value of [propsKey && element[propsKey], fiber?.memoizedProps]) {
        const result = read(value);
        if (result.uris.size) return result;
      }
    }
    return identity(null);
  }
  function notify(message) {
    window.Spicetify?.showNotification?.(message);
  }
  function diagnosticCode(error) {
    const known = ["list-unavailable", "incomplete-list", "list-too-large", "list-timeout", "row-not-rendered", "row-not-visible", "cancelled"];
    return known.includes(error?.message) ? error.message : "list-read-failed";
  }
  function fiberOf(element) {
    const key = Object.keys(element || {}).find(key => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    return key ? currentFiber(element[key]) : null;
  }
  function rowIdentity(row, grid) {
    const output = identity(row.getAttribute("data-uri"));
    for (const link of row.querySelectorAll('a[href*="/track/"], a[href*="/episode/"], [data-uri]')) {
      for (const uri of identity(link.getAttribute("href") || link.getAttribute("data-uri")).uris) output.uris.add(uri);
    }
    const nodes = [row, ...Array.from(row.children).slice(0, 4)];
    for (const node of nodes) {
      let fiber = fiberOf(node);
      for (let depth = 0; fiber && depth < 48; depth++, fiber = fiber.return) {
        if (fiber.stateNode === grid) break;
        const values = [fiber.memoizedProps, fiber.memoizedProps?.value];
        let context = fiber.dependencies?.firstContext;
        for (let index = 0; context && index < 16; index++, context = context.next) values.push(context.memoizedValue);
        for (const value of values) {
          const candidate = identity(value);
          for (const uri of candidate.uris) output.uris.add(uri);
          if (!output.uid && candidate.uid) output.uid = candidate.uid;
        }
      }
    }
    return output;
  }
  function rowsOf(grid) {
    return Array.from(grid.querySelectorAll(ROWS)).filter(row => !row.querySelector('[role="columnheader"]') &&
      row.getBoundingClientRect().height > 0 && !row.parentElement?.closest('[role="row"]'));
  }
  function findRow(grid, target) {
    const matching = rowsOf(grid).filter(row => sameTrack(rowIdentity(row, grid), target));
    return matching.find(row => target.uid && rowIdentity(row, grid).uid === target.uid) || matching[0];
  }
  function gridsOf(main) {
    return Array.from(main.querySelectorAll('[role="grid"], [data-testid="track-list"]'))
      .filter(grid => grid.getBoundingClientRect().height > 0 && !grid.parentElement?.closest('[role="grid"]') && grid.querySelector(ROWS));
  }
  function modelOf(grid) {
    return {grid, ...discoverListModel(fiberOf(grid), grid.closest('main, [role="main"]'))};
  }
  function rowIndex(row, grid) {
    let fiber = fiberOf(row);
    for (let depth = 0; fiber && depth < 48; depth++, fiber = fiber.return) {
      if (fiber.stateNode === grid) break;
      const props = fiber.memoizedProps;
      if (Number.isInteger(props?.index) && identity(props).uris.size) return props.index;
    }
    const index = Number(row.getAttribute("aria-rowindex"));
    if (index > 0) return index - 1 - Number(!!grid.querySelector('[role="columnheader"]'));
    return null;
  }
  function rowIsVisible(row) {
    const rect = row.getBoundingClientRect();
    const scroll = scrollParent(row);
    const bounds = scroll?.getBoundingClientRect() || {top:0, bottom:window.innerHeight};
    const center = rect.top + rect.height / 2;
    return rect.height > 0 && center >= Math.max(0, bounds.top) && center <= Math.min(window.innerHeight, bounds.bottom);
  }
  function scrollParent(row) {
    for (let parent = row.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/(auto|scroll|overlay|hidden)/.test(style.overflowY) && parent.clientHeight > 30 &&
          parent.scrollHeight > parent.clientHeight + 1) return parent;
    }
    return null;
  }
  function measuredJump(grid, index) {
    const rows = rowsOf(grid);
    const anchors = rows.map(row => ({ row, index: rowIndex(row, grid), rect: row.getBoundingClientRect() }))
      .filter(anchor => anchor.index !== null);
    if (!anchors.length) return false;
    const first = anchors[0];
    const scroll = scrollParent(first.row);
    if (!scroll) return false;
    const second = anchors.find(anchor => anchor.index > first.index && anchor.rect.top > first.rect.top);
    const pitch = second ? (second.rect.top - first.rect.top) / (second.index - first.index) :
      parseFloat(getComputedStyle(grid).getPropertyValue("--row-height"));
    if (!(pitch >= 16 && pitch <= 300)) return false;
    const rect = scroll.getBoundingClientRect();
    const top = estimateScroll({index:first.index, top:first.rect.top, height:first.rect.height, pitch}, index,
      {scrollTop:scroll.scrollTop, top:rect.top + scroll.clientTop, height:scroll.clientHeight,
        maxScroll:Math.max(0, scroll.scrollHeight - scroll.clientHeight)});
    scroll.scrollTo({top, behavior:behavior()});
    return true;
  }
  async function centerAndPulse(row, grid, target, active) {
    const scroll = scrollParent(row);
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const top = scroll.scrollTop + rowRect.top - rect.top - scroll.clientTop - (scroll.clientHeight - rowRect.height) / 2;
      scroll.scrollTo({top:Math.max(0, top), behavior:behavior()});
    } else row.scrollIntoView({block:"center", behavior:behavior()});
    await sleep(reducedMotion() ? 30 : 500);
    active();
    row = findRow(grid, target);
    if (!row || !rowIsVisible(row)) {
      row?.scrollIntoView({block:"center", behavior:behavior()});
      await sleep(reducedMotion() ? 30 : 600);
      active();
      row = findRow(grid, target);
    }
    if (!row || !rowIsVisible(row)) throw new Error("row-not-visible");
    row.classList.remove("locate-playing-track-pulse");
    void row.offsetWidth;
    row.classList.add("locate-playing-track-pulse");
    setTimeout(() => row.classList.remove("locate-playing-track-pulse"), 1550);
    lastResult = {status:"located", uri:Array.from(target.uris)[0], at:Date.now()};
    diagnostics.stage = "located";
    notify("已定位到当前播放歌曲");
  }
  // Compatibility fallback for list types whose private view model is unavailable.
  // Never infer membership from a selected row or from a matching title.
  async function scanVirtualList(grid, target, active) {
    const first = rowsOf(grid)[0];
    const scroll = first && scrollParent(first);
    if (!scroll) return null;
    const originalTop = scroll.scrollTop;
    const originalBehavior = scroll.style.scrollBehavior;
    scroll.style.scrollBehavior = "auto";
    let found = null;
    let cancelled = false;
    const deadline = Date.now() + 15000;
    try {
      const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      const step = Math.max(80, scroll.clientHeight * 0.65);
      for (let top = 0, count = 0; count < 400 && Date.now() < deadline; count++) {
        active();
        scroll.scrollTo({top, behavior:"instant"});
        await sleep(160);
        active();
        found = findRow(grid, target);
        if (found) return found;
        if (top >= maxScroll) break;
        top = Math.min(maxScroll, top + step);
      }
      return null;
    } catch (error) {
      cancelled = error.message === "cancelled";
      throw error;
    } finally {
      scroll.style.scrollBehavior = originalBehavior;
      if (!found && !cancelled && grid.isConnected) scroll.scrollTo({top:originalTop, behavior:"instant"});
    }
  }
  async function withTimeout(promise, ms) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("list-timeout")), ms); })]); }
    finally { clearTimeout(timer); }
  }
  async function locate() {
    const target = currentTrack();
    diagnostics = {version:VERSION, stage:"starting", playbackSource:target.source || "unavailable"};
    lastResult = null;
    if (!target.uris.size) {
      diagnostics.stage = "no-track";
      diagnostics.playbackWidgets = document.querySelectorAll('[data-testid="now-playing-widget-v2"], [data-testid="now-playing-widget"]').length;
      diagnostics.playerDataAvailable = !!window.Spicetify?.Player?.data;
      lastResult = {status:"unavailable", reason:"playback-unavailable", at:Date.now()};
      return notify("未能读取当前曲目：请按住 Shift 点击定位按钮复制诊断信息");
    }
    const main = mainView();
    const grids = main ? gridsOf(main) : [];
    diagnostics.grids = grids.length;
    if (!grids.length) { diagnostics.stage = "no-list"; return notify("请先打开要定位的歌单、专辑或歌曲列表"); }
    const token = ++sequence;
    const path = route();
    const active = () => {
      if (disposed || sequence !== token || route() !== path || !main.isConnected || !sameTrack(target, currentTrack())) throw new Error("cancelled");
    };
    for (const button of buttons.values()) button.setAttribute("aria-busy", "true");
    try {
      for (const grid of grids) {
        const row = findRow(grid, target);
        if (row) { await centerAndPulse(row, grid, target, active); return; }
      }
      let complete = 0;
      const fallbackGrids = [];
      for (const grid of grids) {
        active();
        const model = modelOf(grid);
        diagnostics = {...diagnostics, stage:"reading-list", cache:!!model.cache, handle:!!model.handle, count:model.count ?? null};
        let items;
        try { items = await withTimeout(readItems(model), 20000); }
        catch (error) {
          active();
          diagnostics.reason = diagnosticCode(error);
          fallbackGrids.push(grid);
          continue;
        }
        active();
        complete++;
        const index = findTrackIndex(items, target, model.resolveItem);
        if (index < 0) continue;
        diagnostics.stage = "scrolling";
        diagnostics.index = index;
        if (!measuredJump(grid, index)) {
          if (!model.handle) { fallbackGrids.push(grid); continue; }
          model.handle.scrollToIndex(index);
        }
        let row;
        for (let attempt = 0; attempt < 32; attempt++) {
          await sleep(100);
          active();
          row = findRow(grid, target);
          if (row) break;
          if (attempt === 15 && model.handle) model.handle.scrollToIndex(index);
        }
        if (row) {
          try { await centerAndPulse(row, grid, target, active); diagnostics.stage="located"; return; }
          catch (error) { if (error.message === "cancelled") throw error; }
        }
        fallbackGrids.push(grid);
      }
      for (const grid of fallbackGrids) {
        diagnostics.stage="scanning-virtual-list";
        notify("正在分段查找当前歌曲，请稍候…");
        const row = await scanVirtualList(grid, target, active);
        if (row) { await centerAndPulse(row, grid, target, active); diagnostics.stage="located"; return; }
      }
      const absent = complete === grids.length && !fallbackGrids.length;
      diagnostics.stage = absent ? "not-in-list" : "unavailable";
      lastResult = {status:diagnostics.stage, at:Date.now()};
      notify(absent ? "当前播放歌曲不在该列表中（也可能被当前筛选隐藏）" : "暂未定位成功：请按住 Shift 点击定位按钮复制诊断信息");
    } catch (error) {
      if (error.message === "cancelled") return;
      lastResult = {status:"error", reason:diagnosticCode(error), at:Date.now()};
      diagnostics = {...diagnostics, stage:"error", reason:diagnosticCode(error)};
      console.warn("[LocateTrack]", error.message);
      notify("定位未完成：请按住 Shift 点击定位按钮复制诊断信息");
    } finally {
      if (sequence === token) for (const button of buttons.values()) button.removeAttribute("aria-busy");
    }
  }

  async function copyDiagnostics() {
    const text = JSON.stringify({version:VERSION, ...diagnostics,
      lastResult:lastResult ? {status:lastResult.status, reason:lastResult.reason} : null}, null, 2);
    try {
      const clipboard = window.Spicetify?.Platform?.ClipboardAPI;
      if (typeof clipboard?.copy === "function") await clipboard.copy(text);
      else await navigator.clipboard.writeText(text);
      notify("已复制定位诊断信息，可直接粘贴反馈；不包含歌曲名称或登录凭据");
    } catch (_) { notify("诊断信息未能复制，请在 Spotify 开发者工具中查看 __locatePlayingTrack.getDiagnostics()"); }
  }
  function createButton(id) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = "locate-playing-track-button locate-playing-track-floating";
    button.setAttribute("aria-label", LABEL);
    button.setAttribute("aria-keyshortcuts", "Alt+L");
    button.title = LABEL + "；Shift+点击复制诊断信息";
    button.innerHTML = ICON;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) void copyDiagnostics();
      else void locate();
    });
    buttons.set(id, button);
    return button;
  }
  function mount() {
    if (disposed) return;
    const main = mainView();
    const floating = buttons.get("locate-playing-track-floating") || createButton("locate-playing-track-floating");
    if (!floating.isConnected) document.body.appendChild(floating);
    floating.hidden = !main;
    let pane = main?.closest?.('.main-view-container, .Root__main-view') || main;
    for (let parent = main; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.gridArea?.split('/')[0].trim() === 'main-view' || style.containerName?.includes('main-view-grid-area')) {
        pane = parent;
        break;
      }
    }
    if (pane !== observedPane) {
      resizeObserver?.disconnect();
      observedPane = pane;
      if (pane) resizeObserver?.observe(pane);
    }
    if (pane) {
      // Use the layout pane, never the scrolling list or its content height.
      const rect = pane.getBoundingClientRect();
      floating.style.left = `${Math.max(rect.left + 10, rect.right - 53)}px`;
      const widget = document.querySelector?.('[data-testid="now-playing-widget-v2"], [data-testid="now-playing-widget"]');
      const footer = widget?.closest?.('footer') || document.querySelector?.('.Root__now-playing-bar');
      const footerRect = footer?.getBoundingClientRect();
      const bottom = footerRect && footerRect.top > window.innerHeight * .65 && footerRect.width > window.innerWidth * .8
        ? footerRect.top : window.innerHeight - 88;
      // Vertical position must not depend on any scrolling element's rect.
      floating.style.top = `${Math.max(10, bottom - 52)}px`;
    }
    for (const id of ["locate-playing-track-action", "locate-btn-actionbar", "locate-btn-playbar"]) document.getElementById(id)?.remove();
  }
  function scheduleMount() {
    if (!queued && !disposed) {
      queued = true;
      requestAnimationFrame(() => { queued = false; mount(); });
    }
  }
  function onKey(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.shiftKey || !event.altKey || event.key.toLowerCase() !== "l") return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
    event.preventDefault();
    event.stopPropagation();
    void locate();
  }
  function dispose() {
    disposed = true;
    sequence++;
    observer?.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener?.("resize", scheduleMount);
    document.removeEventListener("keydown", onKey, true);
    for (const button of buttons.values()) button.remove();
    document.getElementById("locate-playing-track-style")?.remove();
  }
  window.__locatePlayingTrack = {version:VERSION, locate, dispose, getLastResult:() => lastResult,
    getDiagnostics:() => ({...diagnostics})};
  function start() {
    if (disposed) return;
    if (!window.Spicetify?.Player || !document.body) { setTimeout(start, 250); return; }
    const style = document.createElement("style");
    style.id = "locate-playing-track-style";
    style.textContent = `
      .locate-playing-track-button {display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:36px;height:36px;margin:0 8px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--spice-text,#fff);cursor:pointer;vertical-align:middle}
      .locate-playing-track-button:hover {color:#1ed760;background:rgba(255,255,255,.09)}
      .locate-playing-track-button:focus-visible {outline:2px solid #1ed760;outline-offset:3px}
      .locate-playing-track-button[aria-busy=true] {opacity:.6;cursor:progress}
      .locate-playing-track-floating {position:fixed;right:auto;bottom:auto;z-index:80;width:42px;height:42px;margin:0;background:#1ed760;color:#000;box-shadow:0 3px 12px #0006}
      .locate-playing-track-floating:hover {background:#3be477;color:#000}
      .locate-playing-track-floating[hidden] {display:none}
      .locate-playing-track-pulse {animation:locate-playing-track-pulse 1.5s ease-out}
      @keyframes locate-playing-track-pulse {0%,40% {background-color:rgba(29,185,84,.48)} 20%,65% {background-color:rgba(29,185,84,.16)} 100% {background-color:transparent}}
      @media(prefers-reduced-motion:reduce) {.locate-playing-track-pulse {animation:none;box-shadow:inset 0 0 0 2px #1ed760}}
    `;
    document.head.appendChild(style);
    document.addEventListener("keydown", onKey, true);
    observer = new MutationObserver(scheduleMount);
    observer.observe(document.body, {childList:true, subtree:true});
    if (typeof ResizeObserver !== "undefined") resizeObserver = new ResizeObserver(scheduleMount);
    window.addEventListener?.("resize", scheduleMount);
    mount();
    console.info("[LocateTrack] Ready", VERSION, "Alt+L");
  }
  start();
})();
