// トップの動き(TB-465 で TB-456 の案2の試しから、選んだ形だけを本物にした。決まりは docs/homepage/design.md の「動き」)
// ①昼夜の切り替え(画面写真・動画も昼の版・夜の版に) ②動画は見えている物だけ再生(音なし) ③旅のガイドの新しい記事(読めたときだけ)
// ④押すと開く窓(押した所から大きく)と仕掛け(ひとめぐり・押した手ごたえ・ちら見せ)・バッジの場所 は下の2つ目のまとまり
(function(){
  var root = document.documentElement, KEY = 'tc-theme';
  function theme(){ return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function applyMedia(){
    var t = theme();
    Array.prototype.forEach.call(document.querySelectorAll('[data-light][data-dark]'), function(el){
      var want = el.getAttribute('data-' + t);
      if (el.tagName === 'VIDEO'){
        var poster = el.getAttribute('data-poster-' + t);
        if (poster && el.getAttribute('poster') !== poster) el.setAttribute('poster', poster);
        if (el.getAttribute('src') !== want){ var was = !el.paused; el.setAttribute('src', want); el.load(); if (was) play(el); }
      } else if (el.tagName === 'SOURCE'){
        // <picture> の端末の設定で選ぶ版(TB-466):上の帯のボタンで切り替えたときは、source も選んだ版にする(端末の設定と違う版を選んだときも替わる)
        if (el.getAttribute('srcset') !== want) el.setAttribute('srcset', want);
      } else {
        // 小さい版のある画像(TB-467):srcset も選んだ版にする(src だけ替えると、srcset の版が出たままになる)
        var ss = el.getAttribute('data-srcset-' + t);
        if (ss && el.getAttribute('srcset') !== ss) el.setAttribute('srcset', ss);
        if (el.getAttribute('src') !== want) el.setAttribute('src', want);
      }
    });
    var b = document.getElementById('themeBtn');
    if (b) b.setAttribute('aria-label', t === 'dark' ? '昼の見た目に切り替える' : '夜の見た目に切り替える');
  }
  window.tcTheme = theme;
  var btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', function(){
    var next = theme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { sessionStorage.setItem(KEY, next); } catch (e) {}
    applyMedia();
  });
  try {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var follow = function(){ var s = null; try { s = sessionStorage.getItem(KEY); } catch (e) {} if (s) return; root.setAttribute('data-theme', mq.matches ? 'dark' : 'light'); applyMedia(); };
    if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
  } catch (e) {}
  applyMedia();

  // ---- 動画:data-auto の付いた物は、画面に半分以上見えている間だけ再生(終わったら最後の画面で止まる。data-loop は繰り返す) ----
  function play(v){ var p = v.play(); if (p && p.catch) p.catch(function(){}); }
  window.tcPlay = play;
  if ('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        var v = e.target;
        if (e.isIntersecting && e.intersectionRatio >= 0.5){ if (v.ended){ v.currentTime = 0; } play(v); }
        else if (!v.paused) v.pause();
      });
    }, { threshold: [0, 0.5] });
    Array.prototype.forEach.call(document.querySelectorAll('video[data-auto]'), function(v){ io.observe(v); });
  }

  // ---- 旅のガイド:新しい記事の一覧を読み、先頭の3本(住所と写真が base で始まる物だけ)。読めないときは見出しと「旅のガイドを見る ›」だけ ----
  var sec = document.querySelector('[data-guide-src]');
  if (!sec || !window.fetch) return;
  var src = sec.getAttribute('data-guide-src'), base = sec.getAttribute('data-guide-base'), more = sec.querySelector('.guide-more');
  function ok(v){ if (typeof v !== 'string') return null; try { var u = new URL(v); return (u.protocol === 'https:' && u.href.indexOf(base) === 0) ? u.href : null; } catch (e) { return null; } }
  function txt(v){ return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; }
  var ctl = window.AbortController ? new AbortController() : null;
  var timer = setTimeout(function(){ if (ctl) ctl.abort(); }, 10000);
  fetch(src, { credentials: 'omit', signal: ctl ? ctl.signal : undefined })
    .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
    .then(function(j){
      clearTimeout(timer);
      var picked = [];
      ((j && Array.isArray(j.articles)) ? j.articles : []).forEach(function(a){
        a = a || {};
        // 写真は縮めた表紙(imageSmall。旅のガイドの latest.json に TB-478 で足した)があればそれ、無ければ元の表紙(image)。元の表紙が使えない記事は出さない(前と同じ)
        var big = ok(a.image);
        var one = { url: ok(a.url), image: big && (ok(a.imageSmall) || big), title: txt(a.title), country: txt(a.country) };
        if (picked.length < 3 && one.url && one.image && one.title) picked.push(one);
      });
      if (!picked.length) return;
      var ul = document.createElement('ul'); ul.className = 'guide-list';
      picked.forEach(function(a){
        var li = document.createElement('li'), l = document.createElement('a'), im = document.createElement('img'), bx = document.createElement('span'), t = document.createElement('span'), c = document.createElement('span');
        l.className = 'guide-item'; l.href = a.url;
        im.className = 'guide-photo'; im.alt = ''; im.width = 96; im.height = 64; im.loading = 'lazy'; im.src = a.image;
        t.className = 'guide-title'; t.textContent = a.title; c.className = 'guide-country'; c.textContent = a.country;
        bx.appendChild(t); bx.appendChild(c); l.appendChild(im); l.appendChild(bx); li.appendChild(l); ul.appendChild(li);
      });
      sec.insertBefore(ul, more);
    })
    .catch(function(){ clearTimeout(timer); });
})();


// ==== 押すと開く窓と仕掛け ====
// 動きを減らす設定(prefers-reduced-motion)では動かさない(ひとめぐり・ちら見せはしない・窓はすぐ開く。CSS の動きは top.css の最後の決まりで止まる)
(function(){
  var root = document.documentElement;
  var $ = function(s, el){ return (el || document).querySelector(s); };
  var $$ = function(s, el){ return [].slice.call((el || document).querySelectorAll(s)); };
  var still = false;
  try { still = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (still) root.classList.add('still');
  var anim = function(el, kf, o){ if (still || !el.animate) return { finished: Promise.resolve() }; return el.animate(kf, o); };
  var wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var whenSeen = function(el, ratio, fn){
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function(es){ if (es[0].isIntersecting && es[0].intersectionRatio >= ratio) { io.disconnect(); fn(); } }, { threshold: [ratio] });
    io.observe(el);
  };
  // 画像を読み終えたら(読めなかったときも)
  var loaded = function(img){
    if (!img || img.complete) return Promise.resolve();
    return new Promise(function(r){ img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
  };

  // ---- バッジの場所:大きな見出しの右。入りきらない幅では見出しの下(TB-461・TB-463) ----
  (function(){
    var hero = $('.s2-hero'), store = $('.s2-store');
    if (!hero || !store) return;
    var fit = function(){
      root.classList.remove('b-below');
      var hr = hero.getBoundingClientRect(), pr = parseFloat(getComputedStyle(hero).paddingRight) || 0;
      if (store.getBoundingClientRect().right > hr.right - pr + 0.5) root.classList.add('b-below');
    };
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    addEventListener('resize', fit);
  })();

  // ---- 動画の最初のコマ(.vposter)は、ページを読み終えたあとに読んでおく(窓を開いた直後に枠が空にならないように。ページの最初の表示は遅らせない) ----
  addEventListener('load', function(){ setTimeout(function(){ $$('img.vposter[loading="lazy"]').forEach(function(im){ im.loading = 'eager'; }); }, 300); });

  // ---- 押すと開く窓:押した所から大きく広がり、上を少し空けたカードになる(TB-461) ----
  // 開いている間は、うしろのページを今の位置で止める(TB-461:中が短い窓では、指やホイールの動き・iPhone の引っぱりがうしろへ渡り、閉じたあとも動いたままだった)
  var lockY = null;
  function lockPage(){
    if (lockY !== null) return;
    lockY = window.scrollY;
    document.body.style.top = -lockY + 'px';
    root.classList.add('lock');
  }
  function unlockPage(){
    if (lockY === null) return;
    var y = lockY; lockY = null;
    root.classList.remove('lock');
    document.body.style.top = '';
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    root.style.scrollBehavior = '';
  }
  // 窓の動画(TB-339 の形を TB-466 で戻した。decisions.md 2026-11-04「動画・絵の再生のしかた」):開いたら最初から1回だけ再生して最後の画面で止まる。
  // 再生中はスマホの下に進み具合の線(見るだけ)・終わったら同じ場所に「↻ もう一度見る」(最初から1回)。真ん中に再生のマークは出さない。
  // 状態は .vwrap の data-play(idle/playing/ended)。動きを減らす設定では自動で再生しない(前と同じ。線もボタンも出さず、最初のコマのまま)
  function wrapOf(v){ return v.closest('.vwrap'); }
  function setBar(v, p){ var w = wrapOf(v), i = w && $('.play-bar i', w); if (i) i.style.transform = 'scaleX(' + Math.max(0, Math.min(1, p)) + ')'; }
  function setState(v, st){
    var w = wrapOf(v); if (!w) return;
    w.setAttribute('data-play', st);
    var b = $('.replay', w); if (b) b.hidden = st !== 'ended';
    if (st !== 'playing') setBar(v, 0);
  }
  function tick(v){
    requestAnimationFrame(function step(){
      var w = wrapOf(v);
      if (!w || w.getAttribute('data-play') !== 'playing') return;
      setBar(v, v.duration ? v.currentTime / v.duration : 0);
      requestAnimationFrame(step);
    });
  }
  function startVideo(v){
    if (still) return;
    if (v.preload === 'none') v.preload = 'auto';
    setState(v, 'playing');
    try { v.currentTime = 0; } catch (e) {}
    var p = v.play();
    if (p && p.catch) p.catch(function(){ if (v.paused) setState(v, 'idle'); });
    tick(v);
  }
  function playIn(el){ $$('video', el).forEach(startVideo); }
  function stopIn(el){ $$('video', el).forEach(function(v){ v.pause(); setState(v, 'idle'); }); }
  $$('.vwrap video').forEach(function(v){
    v.addEventListener('ended', function(){ var w = wrapOf(v); if (w && w.getAttribute('data-play') === 'playing') setState(v, 'ended'); });
    // 最後まで見た動画の昼夜を替えたときは、替えた動画も最後の画面にする
    v.addEventListener('loadedmetadata', function(){ var w = wrapOf(v); if (w && w.getAttribute('data-play') === 'ended' && v.duration) { try { v.currentTime = Math.max(0, v.duration - 0.05); } catch (e) {} } });
  });
  $$('.vwrap .replay').forEach(function(b){ b.addEventListener('click', function(){ var v = $('video', b.closest('.vwrap')); if (v) startVideo(v); }); });
  // 下へはらって閉じる(指でも、マウスでも)。カードの中が上の端にあるときだけ
  function swipe(dlg, card, done){
    var s = null;
    function start(x, y){ if (card.scrollTop > 2) return; s = { x: x, y: y, d: 0, ok: null }; }
    function move(x, y, ev){
      if (!s) return;
      var dx = x - s.x, dy = y - s.y;
      if (s.ok === null && Math.abs(dx) + Math.abs(dy) > 8) s.ok = dy > 0 && Math.abs(dy) > Math.abs(dx);
      if (s.ok === false) { s = null; return; }
      if (!s.ok) return;
      if (ev && ev.cancelable) ev.preventDefault();
      s.d = Math.max(0, dy);
      dlg.style.transition = 'none';
      dlg.style.transform = 'translateY(' + s.d + 'px)';
    }
    function end(){
      if (!s) return;
      var d = s.d; s = null;
      dlg.style.transition = 'transform .2s ease-out';
      if (d > 90) done('translateY(100%)'); else dlg.style.transform = '';
    }
    var onMM = function(e){ move(e.clientX, e.clientY, e); }, onMU = function(){ end(); removeEventListener('mousemove', onMM); removeEventListener('mouseup', onMU); };
    dlg.addEventListener('mousedown', function(e){ if (e.target.closest('img,video')) e.preventDefault(); start(e.clientX, e.clientY); if (s) { addEventListener('mousemove', onMM); addEventListener('mouseup', onMU); } });
    dlg.addEventListener('touchstart', function(e){ var t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
    dlg.addEventListener('touchmove', function(e){ var t = e.touches[0]; move(t.clientX, t.clientY, e); }, { passive: false });
    dlg.addEventListener('touchend', end); dlg.addEventListener('touchcancel', end);
  }
  // 中が短くて下が空くときは、1台だけのスマホの画面を空いた高さに合わせて大きくし(元の画像の大きさまで・横幅まで)、
  // それでも余るときは中身全体を上下の真ん中に置く(TB-461)。中が長いときは何もしない(カードの中を送って読む)
  function fit(card, inner){
    unfit(inner);
    var ph = $$('.sh-body > .sh-phone, .sh-body > .vwrap > .sh-phone', inner);
    if (ph.length === 1) {
      var p = ph[0], spare = card.clientHeight - inner.offsetHeight;
      var m = $('.scr', p) || p, w0 = p.offsetWidth, h0 = p.offsetHeight;
      if (spare > 0) {
        var frame = w0 - m.offsetWidth, ratio = (h0 - frame) / (w0 - frame);
        // 元の大きさ:画像・動画の width の値(読み込み前でも分かる)。分からないときは 600
        var media = $('video', m) || $('img', m), nat = media && (+media.getAttribute('width') || media.naturalWidth || media.videoWidth) || 600;
        var cs = getComputedStyle(inner), room = inner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var w = Math.min(w0 + spare / ratio, room, nat + frame);
        if (w > w0 + 1) p.style.width = Math.floor(w) + 'px';
      }
    }
    if (card.clientHeight - inner.offsetHeight > 0) { inner.classList.add('is-mid'); inner.style.minHeight = card.clientHeight + 'px'; }
  }
  function unfit(inner){ inner.classList.remove('is-mid'); inner.style.minHeight = ''; $$('.sh-body > .sh-phone, .sh-body > .vwrap > .sh-phone', inner).forEach(function(p){ p.style.width = ''; }); }
  function rectClip(r){ return 'inset(' + Math.max(0, r.top) + 'px ' + Math.max(0, innerWidth - r.right) + 'px ' + Math.max(0, innerHeight - r.bottom) + 'px ' + Math.max(0, r.left) + 'px round 12px)'; }

  var cur = null;
  // quiet:押さずに開いた(住所の #booking)。広がる動きをせず、閉じるときは下へ下がる(押した物が画面の外のことがあるため)
  function open(dlg, trigger, quiet){
    if (!dlg || dlg.open) return;
    var card = $('.zoom-card', dlg), inner = $('.sheet-in', dlg);
    var closing = false;
    var refit = function(){ fit(card, inner); };
    var cardClip = function(){ return 'inset(' + card.offsetTop + 'px 0 0 0 round 30px 30px 0 0)'; };
    function finish(){
      removeEventListener('resize', refit);
      unfit(inner); stopIn(inner);
      dlg.style.transform = ''; dlg.style.transition = '';
      unlockPage();
      cur = null;
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    }
    function shut(fromTransform){
      if (closing) return; closing = true;
      var a;
      if (!fromTransform && !quiet) a = anim(dlg, [{ clipPath: cardClip() }, { clipPath: rectClip(trigger.getBoundingClientRect()) }], { duration: 260, easing: 'ease-in' });
      else { dlg.style.transition = 'transform .2s ease-in'; dlg.style.transform = fromTransform || 'translateY(100%)'; a = still ? { finished: Promise.resolve() } : { finished: wait(200) }; }
      a.finished.then(function(){ dlg.close(); finish(); });
    }
    cur = { dlg: dlg, shut: shut };
    lockPage();
    dlg.showModal();
    fit(card, inner); addEventListener('resize', refit);
    if (!quiet) anim(dlg, [{ clipPath: rectClip(trigger.getBoundingClientRect()) }, { clipPath: cardClip() }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    var h = $('.sh-h', inner); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    playIn(inner);
  }
  $$('dialog.zoom').forEach(function(dlg){
    var card = $('.zoom-card', dlg);
    var shut = function(t){ if (cur && cur.dlg === dlg) cur.shut(t); };
    dlg.addEventListener('cancel', function(e){ e.preventDefault(); shut(); }); // Esc
    dlg.addEventListener('click', function(e){
      if (e.target === dlg) { shut(); return; } // カードの上のすき間を押した
      if (e.target.closest('[data-close]')) shut();
    });
    swipe(dlg, card, function(to){ shut(to); });
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-sheet]');
    if (!b) return;
    e.preventDefault();
    open(document.getElementById(b.getAttribute('data-sheet')), b);
  });
  // 住所の #booking:予約の窓を開いた形で着く(/booking・/booking-review から移ってきた人。TB-465)
  function fromHash(){
    if (location.hash !== '#booking' || cur) return;
    open(document.getElementById('sh-booking'), $('[data-sheet="sh-booking"]'), true);
  }
  fromHash();
  addEventListener('hashchange', fromHash);

  // ---- 押した手ごたえ:押した所が沈み、指の所から波が出る(動きを減らす設定では色が変わるだけ) ----
  var downEl = null;
  document.addEventListener('pointerdown', function(e){
    var b = e.target.closest('[data-sheet]');
    if (!b) return;
    downEl = b; b.classList.add('is-down');
    if (still || b.classList.contains('pin')) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2, w = document.createElement('span');
    w.className = 'wave';
    w.style.width = w.style.height = s + 'px';
    w.style.left = (e.clientX - r.left - s / 2) + 'px'; w.style.top = (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(w); setTimeout(function(){ w.remove(); }, 600);
  });
  var up = function(){ if (downEl) { var b = downEl; setTimeout(function(){ b.classList.remove('is-down'); }, 90); downEl = null; } };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);

  if (still) return;

  // ---- ひとめぐり:①②③が見えたら1回だけ、①→②→③の順に画面の上の丸に輪(1つにつき1回)・右の一言が白い線の枠で光る。③のあとは止まる。タイルは灯らない(TB-458) ----
  // 一番上の画面の写真を読み終えてから始める(読む前に光ると、丸だけが空の枠の上で光るため)
  var anno = $('.anno'), pins = $$('.pin'), items = $$('.anno-item');
  if (anno && pins.length === 3 && items.length === 3) {
    whenSeen(anno, .6, function(){
      loaded($('.anno-map')).then(function(){
        var p = Promise.resolve();
        [0, 1, 2].forEach(function(i){
          p = p.then(function(){ pins[i].classList.add('is-ring'); items[i].classList.add('is-lit'); return wait(1400); })
            .then(function(){ pins[i].classList.remove('is-ring'); items[i].classList.remove('is-lit'); return wait(200); });
        });
      });
    });
  }

  // ---- ちら見せ:「今日の旅程と旅先のこと」のタイルの枠全体が画面に入ったら1回だけ、中の画面が下へ少し流れて戻る(TB-458) ----
  var t1img = $('.tile[data-sheet="sh-t1"] .tile-img img');
  if (t1img) whenSeen(t1img.closest('.tile'), .98, function(){
    var base = getComputedStyle(t1img).transform; base = base === 'none' ? '' : base;
    t1img.style.transform = (base ? base + ' ' : '') + 'translateY(-16%)';
    wait(500).then(function(){ t1img.style.transform = ''; });
  });
})();
