// トコリコのホームページの動き(TB-335)。外のライブラリは使わない。
// ① 昼・夜:最初は端末の設定(prefers-color-scheme)。上の帯の丸いボタンを押した人だけ切り替わる(このタブの間は覚える=sessionStorage)。
//    <html data-theme> は頭の小さな文(build.mjs の THEME_BOOT)が先に付ける。動画・画面写真も昼の版・夜の版を切り替える(data-light・data-dark)。
// ② 動くもの(本物の動画 video.media-video・絵の版 .ill):見えている中で画面の真ん中に一番近い1つだけ動かし、ほかは最初のコマで止める
//    (decisions.md 2026-11-01「画面のまわりに浮かべる部品と動画の動かし方」)。動き出すたびに最初から。
// ③ 動画の横に浮かべる部品(.vfloat data-light-at・data-dark-at=「から,まで」の秒。昼と夜で動画の長さが違う):動画の再生位置に合わせて出す。止めている間は出さない。
(function(){
  var root = document.documentElement;
  var KEY = 'tc-theme';
  function theme(){ return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

  // ---- 昼・夜で出す物を入れ替える ----
  function applyMedia(){
    var t = theme();
    Array.prototype.forEach.call(document.querySelectorAll('[data-light][data-dark]'), function(el){
      var want = el.getAttribute('data-' + t);
      if (el.tagName === 'VIDEO'){
        var poster = el.getAttribute('data-poster-' + t);
        if (poster && el.getAttribute('poster') !== poster) el.setAttribute('poster', poster);
        if (el.getAttribute('src') !== want){
          var playing = el === active;
          el.setAttribute('src', want);
          el.load();
          if (playing) start(el);
        }
      } else if (el.getAttribute('src') !== want){
        el.setAttribute('src', want);
      }
    });
    var btn = document.getElementById('themeBtn');
    if (btn) btn.setAttribute('aria-label', t === 'dark' ? '昼の見た目に切り替える' : '夜の見た目に切り替える');
  }
  var btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', function(){
    var next = theme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { sessionStorage.setItem(KEY, next); } catch (e) {}
    applyMedia();
  });
  // 端末の設定が変わったとき(押していない人だけ合わせる)
  try {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var follow = function(){
      var saved = null;
      try { saved = sessionStorage.getItem(KEY); } catch (e) {}
      if (saved) return;
      root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      applyMedia();
    };
    if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
  } catch (e) {}

  // ---- 動くもの:真ん中に一番近い1つだけ ----
  var players = Array.prototype.slice.call(document.querySelectorAll('video.media-video, .ill[data-ill]'));
  var active = null;
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function floatsOf(el){
    var wrap = el.closest('.phone-wrap');
    return wrap ? Array.prototype.slice.call(wrap.querySelectorAll('.vfloat')) : [];
  }
  function stop(el){
    if (!el) return;
    if (el.tagName === 'VIDEO'){
      el.pause();
      try { el.currentTime = 0; } catch (e) {}
      floatsOf(el).forEach(function(f){ f.classList.remove('is-on'); });
    } else {
      // 絵の版:止めて、決めた時刻のコマ(--still-at)を見せる
      el.classList.add('is-still');
    }
  }
  function start(el){
    if (!el || reduce) return;
    if (el.tagName === 'VIDEO'){
      try { el.currentTime = 0; } catch (e) {}
      var p = el.play();
      if (p && p.catch) p.catch(function(){});
    } else {
      // 絵の版:CSS の動きを最初から(作り直すと最初から動く)
      var fresh = el.cloneNode(true);
      fresh.classList.remove('is-still');
      el.parentNode.replaceChild(fresh, el);
      players[players.indexOf(el)] = fresh;
      active = fresh;
    }
  }
  function pick(){
    var mid = innerHeight / 2, best = null, bestD = Infinity;
    players.forEach(function(el){
      var r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= innerHeight || r.height === 0) return;
      var d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestD){ bestD = d; best = el; }
    });
    if (best === active) return;
    var prev = active;
    active = best;
    stop(prev);
    start(best);
  }
  var queued = false;
  function soon(){ if (queued) return; queued = true; requestAnimationFrame(function(){ queued = false; pick(); }); }
  addEventListener('scroll', soon, { passive: true });
  addEventListener('resize', soon);

  // 浮かべる部品:動画の再生位置で出す
  players.forEach(function(el){
    if (el.tagName !== 'VIDEO') return;
    el.addEventListener('timeupdate', function(){
      if (el !== active) return;
      var t = el.currentTime;
      floatsOf(el).forEach(function(f){
        var at = (f.getAttribute('data-' + theme() + '-at') || '').split(',').map(parseFloat);
        f.classList.toggle('is-on', t >= at[0] && t < at[1]);
      });
    });
  });

  applyMedia();
  players.forEach(function(el){ if (el.tagName !== 'VIDEO') el.classList.add('is-still'); });
  pick();
})();
