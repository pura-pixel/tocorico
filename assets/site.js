// トコリコのホームページの動き(TB-335)。外のライブラリは使わない。
// ① 昼・夜:最初は端末の設定(prefers-color-scheme)。上の帯の丸いボタンを押した人だけ切り替わる(このタブの間は覚える=sessionStorage)。
//    <html data-theme> は頭の小さな文(build.mjs の THEME_BOOT)が先に付ける。動画・画面写真も昼の版・夜の版を切り替える(data-light・data-dark)。
// ② 動くもの(本物の動画 video.media-video・絵の版 .ill):見えている中で画面の真ん中に一番近い1つだけ動かし、ほかは最初のコマで止める
//    (decisions.md 2026-11-01「画面のまわりに浮かべる部品と動画の動かし方」)。動き出したら最初から1回だけ再生し、最後の画面で止める
//    (TB-339。decisions.md 2026-11-04「動画・絵の再生のしかた」)。再生中はスマホの下に進み具合の線(見るだけ)、終わったら同じ場所に「↻ もう一度見る」。
//    最後まで見たものは、真ん中に戻ってきても自動では動かさない(最後の画面とボタンのまま)。途中で真ん中から外れたものは最初のコマに戻し、次は最初から。
//    状態は枠(.phone-wrap)の data-play に持つ(idle=まだ・途中で外れた/playing/ended)。絵の版は作り直すたびに要素が替わるため
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
          var playing = el === active && stateOf(el) === 'playing';
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

  // ---- 動くもの:真ん中に一番近い1つだけ。1回で止める ----
  var players = Array.prototype.slice.call(document.querySelectorAll('video.media-video, .ill[data-ill]'));
  var active = null;
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function wrapOf(el){ return el.closest('.phone-wrap'); }
  function stateOf(el){ var w = wrapOf(el); return (w && w.getAttribute('data-play')) || 'idle'; }
  function isVideo(el){ return el.tagName === 'VIDEO'; }
  function floatsOf(el){
    var wrap = wrapOf(el);
    return wrap ? Array.prototype.slice.call(wrap.querySelectorAll('.vfloat')) : [];
  }
  // 状態と、下の操作の場所(線・もう一度見る)を合わせる
  function setState(el, st){
    var w = wrapOf(el);
    if (!w) return;
    w.setAttribute('data-play', st);
    var ctl = w.querySelector('.play-ctl');
    if (!ctl) return;
    ctl.classList.toggle('is-playing', st === 'playing');
    ctl.querySelector('.replay').hidden = st !== 'ended';
    if (st !== 'playing') setBar(el, 0);
  }
  function setBar(el, p){
    var w = wrapOf(el), bar = w && w.querySelector('.play-bar i');
    if (bar) bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, p)) + ')';
  }
  var illTimer = 0, illStart = 0;
  // 最後まで見た:最後の画面で止める(動画はそのまま止まる・絵の版は最後のコマ --end-at で止める)
  function finish(el){
    if (!isVideo(el)){
      clearTimeout(illTimer);
      el.classList.add('is-ended');
    }
    setState(el, 'ended');
  }
  // 真ん中から外れた:最後まで見たものはそのまま。途中のものは最初のコマに戻す
  function stop(el){
    if (!el) return;
    if (isVideo(el)){
      if (stateOf(el) === 'ended'){ el.pause(); return; }
      el.pause();
      try { el.currentTime = 0; } catch (e) {}
      floatsOf(el).forEach(function(f){ f.classList.remove('is-on'); });
    } else {
      if (stateOf(el) === 'ended') return;
      clearTimeout(illTimer);
      // 絵の版:止めて、決めた時刻のコマ(--still-at)を見せる
      el.classList.add('is-still');
    }
    setState(el, 'idle');
  }
  // 動かす。again=true は「もう一度見る」(最後まで見たものも最初から)
  function start(el, again){
    if (!el || reduce) return;
    if (stateOf(el) === 'ended' && !again) return;
    setState(el, 'playing');
    if (isVideo(el)){
      try { el.currentTime = 0; } catch (e) {}
      var p = el.play();
      if (p && p.catch) p.catch(function(){ if (el.paused) setState(el, 'idle'); });
    } else {
      // 絵の版:CSS の動きを最初から(作り直すと最初から動く)。決めた秒(data-end)で最後のコマに止める
      var fresh = el.cloneNode(true);
      fresh.classList.remove('is-still', 'is-ended');
      el.parentNode.replaceChild(fresh, el);
      players[players.indexOf(el)] = fresh;
      if (active === el) active = fresh;
      clearTimeout(illTimer);
      illStart = performance.now();
      var end = parseFloat(fresh.getAttribute('data-end')) || 0;
      illTimer = setTimeout(function(){ if (active === fresh) finish(fresh); }, end * 1000);
      el = fresh;
    }
    tick();
    return el;
  }
  // 進み具合の線
  var ticking = false;
  function tick(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function step(){
      if (!active || stateOf(active) !== 'playing'){ ticking = false; return; }
      var p;
      if (isVideo(active)) p = active.duration ? active.currentTime / active.duration : 0;
      else p = (performance.now() - illStart) / ((parseFloat(active.getAttribute('data-end')) || 1) * 1000);
      setBar(active, p);
      requestAnimationFrame(step);
    });
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
    var now = start(best);
    if (now) active = now;
  }
  var queued = false;
  function soon(){ if (queued) return; queued = true; requestAnimationFrame(function(){ queued = false; pick(); }); }
  addEventListener('scroll', soon, { passive: true });
  addEventListener('resize', soon);

  // 「↻ もう一度見る」:最初から1回。ほかに動いているものがあれば止める
  Array.prototype.forEach.call(document.querySelectorAll('.play-ctl .replay'), function(b){
    b.addEventListener('click', function(){
      var w = b.closest('.phone-wrap');
      var el = w.querySelector('video.media-video, .ill[data-ill]');
      if (!el) return;
      if (active && active !== el) stop(active);
      active = el;
      var now = start(el, true);
      if (now) active = now;
    });
  });

  players.forEach(function(el){
    if (!isVideo(el)) return;
    // 最後まで見た(繰り返さない)
    el.addEventListener('ended', function(){ if (stateOf(el) === 'playing') finish(el); });
    // 最後まで見た動画の昼夜を替えたときは、替えた動画も最後の画面にする
    el.addEventListener('loadedmetadata', function(){
      if (stateOf(el) === 'ended' && el.duration){ try { el.currentTime = Math.max(0, el.duration - 0.05); } catch (e) {} }
    });
    // 浮かべる部品:動画の再生位置で出す
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
