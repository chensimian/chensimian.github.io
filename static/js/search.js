// search script — 完全修复版

// 防抖函数
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

  sentences.forEach((sentence) => {
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
      index += word.length + 1;
    });
    index += 1;
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
  link.classList.add("search-results__title");
  link.innerText = item.doc.title;

  const teaser = document.createElement("div");
  teaser.classList.add("search-results__teaser");
  teaser.innerHTML = makeTeaser(item.doc.body, terms);

  li.appendChild(link);
  li.appendChild(teaser);
  
  return li;
}

// 打开搜索
function openSearch() {
  const overlay = document.querySelector(".search-overlay");
  if (overlay) {
    overlay.style.display = "flex";
    setTimeout(() => {
      const input = document.getElementById("search");
      if (input) input.focus();
    }, 100);
  }
}

// 关闭搜索
function closeSearch() {
  const overlay = document.querySelector(".search-overlay");
  const input = document.getElementById("search");
  const resultsItems = document.querySelector(".search-results__items");
  const resultsHeader = document.querySelector(".search-results__header");

  if (overlay) overlay.style.display = "none";
  if (input) input.value = "";
  if (resultsItems) resultsItems.innerHTML = "";
  if (resultsHeader) resultsHeader.innerText = "";
}

// ====== 初始化入口：等所有脚本都加载完成后再执行 ======
document.addEventListener('DOMContentLoaded', function() {

  // ---- 绑定搜索图标点击事件 ----
  const searchIcon = document.getElementById("search-ico");
  if (searchIcon) {
    searchIcon.addEventListener("click", function(e) {
      e.preventDefault();
      openSearch();
    });
  }

  // ---- 绑定关闭按钮 ----
  const closeBtn = document.getElementById("close-search");
  if (closeBtn) {
    closeBtn.addEventListener("click", function(e) {
      e.preventDefault();
      closeSearch();
    });
  }

  // ==== 绑定 ESC 键关闭搜索 ====
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      const overlay = document.querySelector(".search-overlay");
      if (overlay && overlay.style.display !== "none") {
        closeSearch();
      }
    }
  });

  // ==== 绑定 Ctrl/Cmd + K 快捷键打开搜索 ====
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openSearch();
    }
  });

  // ==== 初始化搜索索引和输入监听 ====
  // 确保 elasticlunr 和 searchIndex 都已加载
  const searchInput = document.getElementById("search");
  if (!searchInput) return;

  // 用一个定时器轮询等待 elasticlunr 加载完成
  let attempts = 0;
  const maxAttempts = 50; // 最多等 5 秒

  function tryInitSearch() {
    if (typeof elasticlunr === 'undefined' || typeof window.searchIndex === 'undefined') {
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryInitSearch, 100);
      } else {
        console.warn('[Search] elasticlunr 或 search_index 未加载，搜索功能不可用');
      }
      return;
    }

    // elasticlunr 已就绪，正式初始化
    const searchResults = document.querySelector(".search-results");
    const searchResultsItems = document.querySelector(".search-results__items");
    const searchResultsHeader = document.querySelector(".search-results__header");
    
    if (!searchResultsItems) return;

    const MAX_ITEMS = 50;
    const options = {
      bool: "OR",
      fields: {
        title: { boost: 3 },
        body: { boost: 1 }
      }
    };
    let currentTerm = "";
    let index = null;

    try {
      index = elasticlunr.Index.load(window.searchIndex);
    } catch (err) {
      console.error('[Search] 加载搜索索引失败:', err);
      return;
    }

    // 监听输入
    searchInput.addEventListener("input", debounce(function() {
      const term = searchInput.value.trim();

      // 清空旧结果
      searchResultsItems.innerHTML = "";

      if (term === "") {
        if (searchResults) searchResults.style.display = "none";
        currentTerm = "";
        return;
      }

      if (!index) return;

      if (searchResults) searchResults.style.display = "block";

      const results = index.search(term, options);

      if (results.length === 0) {
        if (searchResultsHeader) {
          searchResultsHeader.innerText = `Nothing like «${term}»`;
        }
        currentTerm = "";
        return;
      }

      currentTerm = term;
      if (searchResultsHeader) {
        searchResultsHeader.innerText = `${results.length} found for «${term}»:`;
      }

      results.slice(0, MAX_ITEMS).forEach(result => {
        if (result.doc && result.doc.body) {
          searchResultsItems.appendChild(formatSearchResultItem(result, term.split(/\s+/)));
        }
      });
    }, 150));

    // 回车键选择第一个结果
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const firstLink = searchResultsItems.querySelector('.search-results__title');
        if (firstLink) {
          window.location.href = firstLink.href;
        }
      }
    });
  }

  // 开始尝试初始化
  tryInitSearch();
});


// 移动端导航菜单切换
function burger() {
  const trees = document.querySelector("#trees");
  const mobileIcon = document.querySelector("#mobile");
  if (!trees || !mobileIcon) return;
  
  const isVisible = trees.style.display === "block";
  trees.style.display = isVisible ? "none" : "block";
  mobileIcon.className = isVisible ? "ms-Icon--GlobalNavButton" : "ms-Icon--ChromeClose";
}
