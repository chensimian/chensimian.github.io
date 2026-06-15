<<<<<<< HEAD
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
      var options = { 
      bool: "OR",          // OR 模式：任一关键词匹配即可（模糊搜索）
      expand: true,        // 展开搜索：包含子词/部分匹配
      fields: { 
        title: { boost: 3, bool: "OR", expand: true }, 
        body: { boost: 1, bool: "OR", expand: true } 
      }
    };

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
=======
// search script, optimized

// 防抖函数：避免频繁触发函数执行，提高性能
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 生成搜索结果摘要，高亮显示搜索词
function makeTeaser(body, terms) {
  const TERM_WEIGHT = 40, NORMAL_WORD_WEIGHT = 2, FIRST_WORD_WEIGHT = 8, TEASER_MAX_WORDS = 30;
  const stemmedTerms = terms.map(w => elasticlunr.stemmer(w.toLowerCase()));
  let termFound = false, index = 0, weighted = [], sentences = body.toLowerCase().split(". ");

  sentences.forEach((sentence, i) => {
    let words = sentence.split(" ");
    let value = FIRST_WORD_WEIGHT;

    words.forEach(word => {
      if (word.length > 0) {
        if (stemmedTerms.some(term => elasticlunr.stemmer(word).startsWith(term))) {
          value = TERM_WEIGHT;
          termFound = true;
        }
        weighted.push([word, value, index]);
        value = NORMAL_WORD_WEIGHT;
      }
      index += word.length + 1; // include space or punctuation
    });
    index += 1; // sentence boundary
  });

  if (!weighted.length) return body;

  // 滑动窗口计算最高权重的片段
  let windowSize = Math.min(weighted.length, TEASER_MAX_WORDS);
  let curSum = weighted.slice(0, windowSize).reduce((sum, [_, weight]) => sum + weight, 0);
  let windowWeights = [curSum];
  for (let i = 0; i < weighted.length - windowSize; i++) {
    curSum = curSum - weighted[i][1] + weighted[i + windowSize][1];
    windowWeights.push(curSum);
  }

  let maxSumIndex = termFound ? windowWeights.lastIndexOf(Math.max(...windowWeights)) : 0;
  let teaser = [], startIndex = weighted[maxSumIndex][2];
  
  for (let i = maxSumIndex; i < maxSumIndex + windowSize; i++) {
    let [word, weight, wordIndex] = weighted[i];
    if (startIndex < wordIndex) teaser.push(body.substring(startIndex, wordIndex));
    teaser.push(weight === TERM_WEIGHT ? `<b>${word}</b>` : word);
    startIndex = wordIndex + word.length;
  }
  
  teaser.push("…");
  return teaser.join("");
}

// 格式化搜索结果
function formatSearchResultItem(item, terms) {
  const li = document.createElement("li");
  li.classList.add("search-results__item");

  const link = document.createElement("a");
  link.href = item.ref;
  link.classList.add("search-results__title"); // 添加类名以便于样式调整
  link.innerText = item.doc.title;

  const teaser = document.createElement("div");
  teaser.classList.add("search-results__teaser");
  teaser.innerHTML = makeTeaser(item.doc.body, terms);

  li.appendChild(link);
  li.appendChild(teaser);
  
  return li;
}

// 切换搜索框和毛玻璃效果
function toggleSearchMode() {
  const searchOverlay = document.querySelector(".search-overlay");
  const searchIcon = document.querySelector("#search-ico");
  const closeSearch = document.querySelector("#close-search");

  // 显示搜索页面
  searchIcon.addEventListener("click", () => {
    searchOverlay.style.display = "flex"; // 显示搜索页面
    document.getElementById("search").focus(); // 让输入框获得焦点
  });

  // 关闭搜索页面
  closeSearch.addEventListener("click", () => {
    searchOverlay.style.display = "none"; // 隐藏搜索页面
    document.getElementById("search").value = ""; // 清空输入框
    document.querySelector(".search-results__items").innerHTML = ""; // 清空搜索结果
  });
}

// 初始化搜索
function initSearch() {
  const searchInput = document.getElementById("search");
  const searchResults = document.querySelector(".search-results");
  const searchResultsItems = document.querySelector(".search-results__items");
  const searchResultsHeader = document.querySelector(".search-results__header");
  const MAX_ITEMS = 100;
  const options = {
    bool: "AND",
    fields: {
      title: {boost: 2},
      body: {boost: 1}
    }
  };
  let currentTerm = "";
  const index = elasticlunr.Index.load(window.searchIndex);

  searchInput.addEventListener("keyup", debounce(() => {
    const term = searchInput.value.trim();
    if (term === currentTerm || !index) {
      return;
    }
    searchResultsItems.innerHTML = "";
    if (term === "") {
      searchResults.style.display = "none";
      return;
    }

    const results = index.search(term, options).filter(r => r.doc.body !== "");
    if (results.length === 0) {
      searchResultsHeader.innerText = `Nothing like «${term}»`;
      return;
    }

    currentTerm = term;
    searchResultsHeader.innerText = `${results.length} found for «${term}»:`;
    results.slice(0, MAX_ITEMS).forEach(result => {
      if (result.doc.body) {
        searchResultsItems.appendChild(formatSearchResultItem(result, term.split(" ")));
      }
    });
  }, 150));
}

// 调用搜索模式切换
toggleSearchMode();
initSearch();

// 初始化搜索功能在页面加载后触发
if (document.readyState === "complete" || (document.readyState !== "loading" && !document.documentElement.doScroll)) {
  initSearch();
} else {
  document.addEventListener("DOMContentLoaded", initSearch);
}

// 移动端导航菜单切换
function burger() {
  const trees = document.querySelector("#trees");
  const mobileIcon = document.querySelector("#mobile");
  const isVisible = trees.style.display === "block";
  trees.style.display = isVisible ? "none" : "block";
  mobileIcon.className = isVisible ? "ms-Icon--GlobalNavButton" : "ms-Icon--ChromeClose";
>>>>>>> 69099d6 (Initial commit: Zola blog for smianlovecoding.site)
}
