// search script — 最终修复版 v3

(function() {
  'use strict';

  // ====== 工具函数 ======
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  // ====== 搜索摘要高亮 ======
  function makeTeaser(body, terms) {
    if (!body) return '';
    const TERM_WEIGHT = 40, NORMAL_WORD = 2, FIRST_WORD = 8, MAX_WORDS = 30;

    try {
      const stemmedTerms = terms.map(w => elasticlunr.stemmer(w.toLowerCase()));
      let termFound = false, idx = 0, weighted = [];
      const sentences = body.toLowerCase().split('. ');

      for (let s = 0; s < sentences.length; s++) {
        const words = sentences[s].split(' ');
        let value = FIRST_WORD;
        for (let w = 0; w < words.length; w++) {
          if (words[w].length > 0) {
            if (stemmedTerms.some(t => elasticlunr.stemmer(words[w]).startsWith(t))) {
              value = TERM_WEIGHT;
              termFound = true;
            }
            weighted.push([words[w], value, idx]);
            value = NORMAL_WORD;
          }
          idx += words[w].length + 1;
        }
        idx += 1;
      }

      if (!weighted.length) return body.substring(0, 120);

      const winSz = Math.min(weighted.length, MAX_WORDS);
      let curSum = weighted.slice(0, winSz).reduce((s, [,w]) => s + w, 0);
      const wins = [curSum];
      for (let i = 0; i < weighted.length - winSz; i++) {
        curSum = curSum - weighted[i][1] + weighted[i + winSz][1];
        wins.push(curSum);
      }
      const maxIdx = termFound ? wins.lastIndexOf(Math.max(...wins)) : 0;
      let teaser = [], startIdx = weighted[maxIdx][2];

      for (let i = maxIdx; i < maxIdx + winSz && i < weighted.length; i++) {
        const [word, wt, wIdx] = weighted[i];
        if (startIdx < wIdx) teaser.push(escapeHtml(body.substring(startIdx, wIdx)));
        teaser.push(wt === TERM_WEIGHT ? '<b>' + escapeHtml(word) + '</b>' : escapeHtml(word));
        startIdx = wIdx + word.length;
      }
      teaser.push('…');
      return teaser.join('');
    } catch(e) {
      return body.substring(0, 120);
    }
  }

  // ====== 创建结果条目 ======
  function createResultItem(item, terms) {
    const li = document.createElement('li');
    li.className = 'search-results__item';

    const a = document.createElement('a');
    a.href = item.ref || '#';
    a.className = 'search-results__title';
    a.textContent = item.doc.title || '(Untitled)';
    li.appendChild(a);

    const div = document.createElement('div');
    div.className = 'search-results__teaser';
    div.innerHTML = makeTeaser(item.doc.body || '', terms);
    li.appendChild(div);

    return li;
  }

  // ====== UI 控制 ======
  var overlay = null;
  var searchInput = null;
  var resultsHeader = null;
  var resultsList = null;
  var resultsArea = null;

  function openSearch() {
    if (!overlay) return;
    overlay.style.display = 'flex';
    setTimeout(function() {
      if (searchInput) { searchInput.focus(); searchInput.value = ''; }
      if (resultsList) resultsList.innerHTML = '';
      if (resultsHeader) resultsHeader.textContent = '';
      if (resultsArea) resultsArea.style.display = 'none';
    }, 50);
  }

  function closeSearch() {
    if (overlay) overlay.style.display = 'none';
    if (searchInput) searchInput.value = '';
    if (resultsList) resultsList.innerHTML = '';
    if (resultsHeader) resultsHeader.textContent = '';
    if (resultsArea) resultsArea.style.display = 'none';
  }

  // ====== 初始化 ======
  function init() {
    // 缓存 DOM 引用
    overlay = document.querySelector('.search-overlay');
    searchInput = document.getElementById('search');
    resultsHeader = document.querySelector('.search-results__header');
    resultsList = document.querySelector('.search-results__items');
    resultsArea = document.querySelector('.search-results');

    if (!overlay || !searchInput || !resultsList) {
      console.warn('[Search] DOM 元素缺失，搜索功能不可用');
      return;
    }

    // 搜索图标点击
    var icon = document.getElementById('search-ico');
    if (icon) icon.addEventListener('click', function(e) { e.preventDefault(); openSearch(); });

    // 关闭按钮
    var closeBtn = document.getElementById('close-search');
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);

    // ESC 关闭
    document.addEventListener('keydown', function(e) {
      if ((e.key === 'Escape' || e.keyCode === 27) && overlay.style.display !== 'none') {
        closeSearch();
      }
    });

    // Ctrl+K / Cmd+K 打开
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openSearch();
      }
    });

    // 点击遮罩层关闭（点击 container 外部）
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeSearch();
    });

    // ====== 加载索引并启动搜索 ======
    var attempts = 0;
    var MAX_WAIT = 80; // 8 秒

    function tryLoadIndex() {
      if (typeof elasticlunr === 'undefined') {
        attempts++;
        if (attempts < MAX_WAIT) { setTimeout(tryLoadIndex, 100); }
        else { console.error('[Search] elasticlunr 未加载'); }
        return;
      }
      if (typeof window.searchIndex === 'undefined') {
        attempts++;
        if (attempts < MAX_WAIT) { setTimeout(tryLoadIndex, 100); }
        else { console.error('[Search] search_index 未加载'); }
        return;
      }

      // 全部就绪，初始化索引
      var index = null;
      try {
        index = elasticlunr.Index.load(window.searchIndex);
        console.log('[Search] 索引加载成功，文档数:', Object.keys(index.documentStore.docs).length);
      } catch(err) {
        console.error('[Search] 索引解析失败:', err);
        return;
      }

      var currentTerm = '';
      var options = { bool: "OR", fields: { title: { boost: 3 }, body: { boost: 1 } } };

      // 输入监听
      searchInput.addEventListener('input', debounce(function() {
        var term = searchInput.value.trim();

        resultsList.innerHTML = '';

        if (!term) {
          if (resultsArea) resultsArea.style.display = 'none';
          currentTerm = '';
          return;
        }

        if (!index) return;

        if (resultsArea) resultsArea.style.display = 'block';

        var rawResults = index.search(term, options);
        // 不过滤 body 为空的结果 — Zola 的 body 有时为空字符串
        var results = rawResults.filter(function(r) { 
          return r.doc && r.doc.title; 
        });

        if (results.length === 0) {
          if (resultsHeader) resultsHeader.textContent = 'Nothing like «' + term + '»';
          if (resultsArea) resultsArea.style.display = 'block';
          currentTerm = '';
          return;
        }

        currentTerm = term;
        if (resultsHeader) resultsHeader.textContent = results.length + ' found for «' + term + '»:';

        for (var i = 0; i < results.length && i < 30; i++) {
          resultsList.appendChild(createResultItem(results[i], term.split(/\s+/)));
        }
      }, 150));

      // 回车跳转第一个结果
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          var firstLink = resultsList.querySelector('.search-results__title');
          if (firstLink && firstLink.href) window.location.href = firstLink.href;
        }
      });
    }

    tryLoadIndex();
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// 移动端导航菜单切换（保留兼容）
function burger() {
  var trees = document.querySelector('#trees');
  var mobileIcon = document.querySelector('#mobile');
  if (!trees || !mobileIcon) return;
  var isVisible = trees.style.display === 'block';
  trees.style.display = isVisible ? 'none' : 'block';
  mobileIcon.className = isVisible ? 'ms-Icon--GlobalNavButton' : 'ms-Icon--ChromeClose';
}
