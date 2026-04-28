// Search script for mixed Chinese/English content.

(function() {
  'use strict';

  var MAX_ITEMS = 30;

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

  function normalizeText(text) {
    return (text || '')
      .toString()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getTerms(term) {
    return normalizeText(term)
      .split(/[\s,，。.!?;；:：、/\\|()[\]{}"'`~@#$%^&*+=<>-]+/)
      .filter(Boolean);
  }

  function isSubsequence(needle, haystack) {
    if (!needle) return false;
    var pos = 0;
    for (var i = 0; i < haystack.length && pos < needle.length; i++) {
      if (haystack[i] === needle[pos]) pos++;
    }
    return pos === needle.length;
  }

  function scoreDoc(doc, term) {
    var terms = getTerms(term);
    var fullTerm = normalizeText(term);
    var title = normalizeText(doc.title);
    var body = normalizeText(doc.body);
    var ref = normalizeText(doc.id || doc.ref || '');
    var haystack = [title, body, ref].join(' ');
    var score = 0;

    if (!terms.length) return 0;
    if (title === fullTerm) score += 120;
    if (title.indexOf(fullTerm) !== -1) score += 80;
    if (haystack.indexOf(fullTerm) !== -1) score += 45;
    if (ref.indexOf(fullTerm) !== -1) score += 25;
    if (isSubsequence(fullTerm.replace(/\s/g, ''), title.replace(/\s/g, ''))) score += 28;

    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (title.indexOf(t) !== -1) score += 55;
      else if (body.indexOf(t) !== -1) score += 20;
      else if (ref.indexOf(t) !== -1) score += 14;
      else if (isSubsequence(t, title)) score += 10;
      else if (t.length >= 3 && isSubsequence(t, haystack)) score += 5;
      else return 0;
    }

    if (doc.body) score += Math.min(10, doc.body.length / 300);
    if (title === 'index' && !doc.body) score -= 40;
    return score;
  }

  function getDocs(searchIndex) {
    var store = searchIndex && searchIndex.documentStore && searchIndex.documentStore.docs;
    if (!store) return [];
    return Object.keys(store).map(function(ref) {
      var doc = store[ref] || {};
      doc.ref = ref;
      return doc;
    }).filter(isArticleDoc);
  }

  function isArticleDoc(doc) {
    var ref = doc && (doc.ref || doc.id);
    if (!ref) return false;

    try {
      var path = new URL(ref, window.location.href).pathname;
      return /^\/(Blog|Essay|Weekly)\/\d{4}\/[^/]+\/$/.test(path);
    } catch(e) {
      return false;
    }
  }

  function localizeUrl(url) {
    if (!url) return '#';
    try {
      var parsed = new URL(url, window.location.href);
      if (
        parsed.hostname === 'chensimian.github.io' &&
        window.location.hostname !== 'chensimian.github.io'
      ) {
        return window.location.origin + parsed.pathname + parsed.search + parsed.hash;
      }
      return parsed.href;
    } catch(e) {
      return url;
    }
  }

  function searchDocs(docs, term) {
    return docs.map(function(doc) {
      if (!doc || !doc.title) return;
      return {
        ref: doc.ref || doc.id,
        doc: doc,
        score: scoreDoc(doc, term)
      };
    })
      .filter(function(result) { return result && result.score > 0; })
      .sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return (a.doc.title || '').localeCompare(b.doc.title || '');
      });
  }

  function makeTeaser(body, terms) {
    if (!body) return '';
    var lowerBody = body.toLowerCase();
    var matchAt = -1;

    for (var i = 0; i < terms.length; i++) {
      if (!terms[i]) continue;
      matchAt = lowerBody.indexOf(terms[i].toLowerCase());
      if (matchAt !== -1) break;
    }

    var start = matchAt === -1 ? 0 : Math.max(0, matchAt - 45);
    var end = Math.min(body.length, start + 160);
    var teaser = body.substring(start, end);
    var prefix = start > 0 ? '…' : '';
    var suffix = end < body.length ? '…' : '';
    var escaped = escapeHtml(teaser);

    terms
      .filter(function(term) { return term && term.length; })
      .sort(function(a, b) { return b.length - a.length; })
      .forEach(function(term) {
        var safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        escaped = escaped.replace(new RegExp('(' + safeTerm + ')', 'gi'), '<b>$1</b>');
      });

    return prefix + escaped + suffix;
  }

  function createResultItem(item, terms) {
    const li = document.createElement('li');
    li.className = 'search-results__item';

    const a = document.createElement('a');
    a.href = localizeUrl(item.ref || (item.doc && item.doc.id) || '#');
    a.className = 'search-results__title';
    a.textContent = item.doc.title || '(Untitled)';
    li.appendChild(a);

    const div = document.createElement('div');
    div.className = 'search-results__teaser';
    div.innerHTML = makeTeaser(item.doc.body || '', terms);
    li.appendChild(div);

    return li;
  }

  var overlay = null;
  var searchInput = null;
  var resultsHeader = null;
  var resultsList = null;
  var resultsArea = null;
  var activeIndex = -1;

  function setActiveResult(index) {
    if (!resultsList) return;
    var items = resultsList.querySelectorAll('.search-results__item');
    if (!items.length) {
      activeIndex = -1;
      return;
    }

    activeIndex = (index + items.length) % items.length;
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-active', i === activeIndex);
    }
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function openSearch() {
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('search-open');
    requestAnimationFrame(function() {
      if (searchInput) {
        searchInput.focus();
        searchInput.value = '';
      }
      if (resultsList) resultsList.innerHTML = '';
      if (resultsHeader) resultsHeader.textContent = '';
      if (resultsArea) resultsArea.style.display = 'none';
      activeIndex = -1;
    });
  }

  function closeSearch() {
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('search-open');
    if (searchInput) searchInput.value = '';
    if (resultsList) resultsList.innerHTML = '';
    if (resultsHeader) resultsHeader.textContent = '';
    if (resultsArea) resultsArea.style.display = 'none';
    activeIndex = -1;
  }

  function init() {
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
      if ((e.key === 'Escape' || e.keyCode === 27) && overlay.classList.contains('is-open')) {
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
      if (typeof window.searchIndex === 'undefined') {
        attempts++;
        if (attempts < MAX_WAIT) { setTimeout(tryLoadIndex, 100); }
        else { console.error('[Search] search_index 未加载'); }
        return;
      }

      var docs = getDocs(window.searchIndex);
      if (!docs.length) {
        console.error('[Search] search_index 文档为空');
        return;
      }
      console.log('[Search] 索引加载成功，文档数:', docs.length);

      var currentTerm = '';

      // 输入监听
      searchInput.addEventListener('input', debounce(function() {
        var term = searchInput.value.trim();

        resultsList.innerHTML = '';

        if (!term) {
          if (resultsArea) resultsArea.style.display = 'none';
          currentTerm = '';
          activeIndex = -1;
          return;
        }

        if (resultsArea) resultsArea.style.display = 'block';

        var results = searchDocs(docs, term);

        if (results.length === 0) {
          if (resultsHeader) resultsHeader.textContent = 'Nothing like «' + term + '»';
          if (resultsArea) resultsArea.style.display = 'block';
          currentTerm = '';
          activeIndex = -1;
          return;
        }

        currentTerm = term;
        if (resultsHeader) resultsHeader.textContent = results.length + ' articles found for «' + term + '»:';

        var terms = getTerms(term);
        for (var i = 0; i < results.length && i < MAX_ITEMS; i++) {
          var item = createResultItem(results[i], terms);
          (function(index, node) {
            node.addEventListener('mouseenter', function() {
              setActiveResult(index);
            });
          })(i, item);
          resultsList.appendChild(item);
        }
        setActiveResult(0);
      }, 150));

      // 回车跳转第一个结果
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveResult(activeIndex + 1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveResult(activeIndex - 1);
          return;
        }
        if (e.key === 'Enter') {
          var items = resultsList.querySelectorAll('.search-results__item');
          var activeItem = activeIndex >= 0 ? items[activeIndex] : null;
          var link = activeItem ? activeItem.querySelector('.search-results__title') : resultsList.querySelector('.search-results__title');
          if (link && link.href) window.location.href = link.href;
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
