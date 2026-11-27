// 配信と同時にアプリのお知らせを出す(TB-479。TB-478 ■2 の案C)。公開用リポジトリ pura-pixel/tocorico の GitHub Actions が5分ごとに動かす。
// 元はアプリのリポジトリ travel-marker-app の docs/news-release/(ここを直して公開用リポジトリの .github/ へ写す。試験は tests/news-release-test.mjs)。
//
// 待たせる置き場:公開用リポジトリの一番上の _news-waiting.json(頭が _ のファイルは GitHub Pages〔Jekyll〕が出さない=tocorico.jp からは読めない。
//   ただしリポジトリは公開なので GitHub では見える)。形:
//   { "items": [ { "version": "1.5", "news": { "id": "…", "title": "…", "body": "…", "push": true, … } } ] }
//   version … App Store のこの版(以上)が見えたら出す / news … news.json の1件(書き方は NEWS.md。date は書かなくてよい=出した日〔日本時間〕を入れる)
// 1回の動き(MODE=run):
//   1 置き場が無い・空なら何もしない(App Store にも聞かない)
//   2 置き場と news.json の形を確かめる。違えば何も書かずに失敗で終わる(GitHub が失敗のメールを送る)
//   3 iTunes の検索 API で App Store(日本)の今の版を2回読む(60秒あける・取りに行く先の古い写しを避ける印を付ける)。
//     2回とも version 以上なら出す。読めない(3回試しても)ときは何も書かずに失敗で終わる
//   4 出す物を news.json の終わりに足し(同じ id がもうあれば足さない)、置き場から消してコミット・push
//   5 GitHub Pages の組み立てを頼み(GITHUB_TOKEN の push では組み立てが始まらないため)、tocorico.jp/news.json に出たかを15分まで見る。出なければ失敗で終わる
// MODE=check … 2・3 まで(書かない。手で動かして確かめる用)/ MODE=pages … Pages の組み立てを頼めるかだけ確かめる(中身は変えない)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const APP_ID = '6820119341';
export const LOOKUP_URL = 'https://itunes.apple.com/lookup?id=' + APP_ID + '&country=jp';
export const WAIT_FILE = '_news-waiting.json';
export const NEWS_FILE = 'news.json';
export const LIVE_URL = 'https://tocorico.jp/news.json';
export const SECOND_READ_MS = 60 * 1000;
export const LIVE_WAIT_MS = 15 * 60 * 1000;
// news.json の1件に書ける項目(アプリ src/js/app/news.js と中継役 relay/src/news-push.js が読む物)
export const NEWS_KEYS = ['id', 'date', 'title', 'body', 'important', 'update', 'olderThan', 'updateOlderThan', 'push', 'pushForce'];
const VER_RE = /^\d+(\.\d+){0,2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PUSH_TITLE_MAX = 40; // 中継役が通知で送る題名の長さの上限(超えると送らない。relay/README-news.md)

// 版の比べ('1.10' > '1.9'・'1.5' = '1.5.0')。a が新しければ正
export function verCmp(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
// 日本時間の日付 'YYYY-MM-DD'
export function jstDate(ms) { return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); }

// 置き場と news.json の形を確かめる。戻り値:問題の文の並び(無ければ空)
export function checkWaiting(waiting, news) {
  const p = [];
  if (!Array.isArray(news)) p.push('news.json が [ … ] の形でない');
  if (!waiting || typeof waiting !== 'object' || Array.isArray(waiting) || !Array.isArray(waiting.items)) { p.push(WAIT_FILE + ' が { "items": [ … ] } の形でない'); return p; }
  const extra = Object.keys(waiting).filter((k) => k !== 'items');
  if (extra.length) p.push(WAIT_FILE + ' に items のほかの項目がある(' + extra.join('・') + ')');
  const ids = new Set();
  waiting.items.forEach((it, i) => {
    const at = WAIT_FILE + ' の ' + (i + 1) + ' 件目';
    if (!it || typeof it !== 'object' || Array.isArray(it)) return p.push(at + ':{ "version": …, "news": { … } } の形でない');
    const ek = Object.keys(it).filter((k) => k !== 'version' && k !== 'news');
    if (ek.length) p.push(at + ':version・news のほかの項目がある(' + ek.join('・') + ')');
    if (typeof it.version !== 'string' || !VER_RE.test(it.version)) p.push(at + ':version が「1.5」の形でない(' + JSON.stringify(it.version) + ')');
    const n = it.news;
    if (!n || typeof n !== 'object' || Array.isArray(n)) return p.push(at + ':news が { … } の形でない');
    const bad = Object.keys(n).filter((k) => NEWS_KEYS.indexOf(k) === -1);
    if (bad.length) p.push(at + ':news に書けない項目がある(' + bad.join('・') + '。書けるのは ' + NEWS_KEYS.join('・') + ')');
    if (typeof n.id !== 'string' || !n.id.trim()) p.push(at + ':id が無い');
    else {
      if (ids.has(n.id)) p.push(at + ':id「' + n.id + '」が置き場の中で重なる');
      ids.add(n.id);
    }
    if (typeof n.title !== 'string' || !n.title.trim()) p.push(at + ':title が無い');
    if (typeof n.body !== 'string' || !n.body.trim()) p.push(at + ':body が無い');
    if (n.date !== undefined && (typeof n.date !== 'string' || !DATE_RE.test(n.date))) p.push(at + ':date が「2026-12-01」の形でない(書かなければ出した日)');
    ['important', 'update', 'push', 'pushForce'].forEach((k) => { if (n[k] !== undefined && typeof n[k] !== 'boolean') p.push(at + ':' + k + ' は true か false'); });
    ['olderThan', 'updateOlderThan'].forEach((k) => { if (n[k] !== undefined && (typeof n[k] !== 'string' || !VER_RE.test(n[k]))) p.push(at + ':' + k + ' が「1.5」の形でない'); });
    if (n.push === true && typeof n.title === 'string' && [...n.title].length > PUSH_TITLE_MAX) p.push(at + ':push の題名が' + PUSH_TITLE_MAX + '字を超える(中継役が通知を送らない)');
  });
  return p;
}

// 出す物を決める。戻り値 { publish:[news.json に足す1件], drop:[もう news.json にある id(足さずに置き場から消す)], keep:[置き場に残す物], news:[新しい news.json] }
export function plan(waiting, news, storeVersion, nowMs) {
  const have = new Set(news.map((x) => x && x.id));
  const out = { publish: [], drop: [], keep: [], news: news.slice() };
  waiting.items.forEach((it) => {
    if (!storeVersion || verCmp(storeVersion, it.version) < 0) { out.keep.push(it); return; }
    if (have.has(it.news.id)) { out.drop.push(it.news.id); return; }
    const one = {};
    NEWS_KEYS.forEach((k) => { if (k === 'date') one.date = it.news.date || jstDate(nowMs); else if (it.news[k] !== undefined) one[k] = it.news[k]; });
    out.publish.push(one); out.news.push(one); have.add(one.id);
  });
  return out;
}

// iTunes の検索 API の答えから版を取る(1件で version が版の形のときだけ。ほかは null)
export function versionOf(json) {
  if (!json || json.resultCount !== 1 || !Array.isArray(json.results) || !json.results[0]) return null;
  const v = json.results[0].version;
  return typeof v === 'string' && VER_RE.test(v) ? v : null;
}

// ---------------- ここから下は GitHub Actions の中で動く部分 ----------------
// 待ち時間の倍率(試験だけが NEWS_RELEASE_TIME_SCALE で縮める。GitHub Actions では 1)
const SCALE = Number(process.env.NEWS_RELEASE_TIME_SCALE || 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SCALE));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const fail = (msg) => { console.log('::error::' + msg); process.exitCode = 1; };

async function readStore() {
  let last = '';
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(LOOKUP_URL + '&t=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } });
      if (r.ok) { const v = versionOf(await r.json()); if (v) return v; last = '版が読めない答え'; } else last = 'HTTP ' + r.status;
    } catch (e) { last = String(e && e.message || e); }
    await sleep(5000);
  }
  throw new Error('App Store の版を読めませんでした(' + LOOKUP_URL + ':' + last + ')');
}

async function requestPagesBuild() {
  const repo = process.env.GITHUB_REPOSITORY;
  const r = await fetch('https://api.github.com/repos/' + repo + '/pages/builds', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' } });
  const body = await r.text();
  console.log('Pages の組み立てを頼んだ:HTTP ' + r.status + ' ' + body.slice(0, 200));
  return r.ok;
}

async function main() {
  const mode = process.env.MODE || 'run';
  if (mode === 'pages') { if (!(await requestPagesBuild())) fail('GitHub Pages の組み立てを頼めませんでした(GITHUB_TOKEN の権限 pages: write)'); return; }
  if (!fs.existsSync(WAIT_FILE)) { console.log(WAIT_FILE + ' が無いので何もしない'); return; }
  let waiting, news;
  try { waiting = JSON.parse(fs.readFileSync(WAIT_FILE, 'utf8')); } catch (e) { return fail(WAIT_FILE + ' が JSON として読めない:' + e.message); }
  try { news = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')); } catch (e) { return fail(NEWS_FILE + ' が JSON として読めない:' + e.message); }
  const problems = checkWaiting(waiting, news);
  if (problems.length) return fail('置き場の形が違うので、news.json を書かずに止めました:\n' + problems.join('\n'));
  if (!waiting.items.length) { console.log('待っているお知らせは無い'); return; }
  let v1, v2;
  try {
    v1 = await readStore();
    console.log('App Store の版(1回目):' + v1 + '/待っている版:' + waiting.items.map((x) => x.version + '(' + x.news.id + ')').join('・'));
    if (!waiting.items.some((x) => verCmp(v1, x.version) >= 0)) return;
    await sleep(SECOND_READ_MS);
    v2 = await readStore();
    console.log('App Store の版(2回目):' + v2);
  } catch (e) { return fail(e.message + '。news.json は書いていません'); }
  // 2回とも見えた版だけで決める(古い写しが混ざっても、低いほうの版で決まる)
  const seen = verCmp(v1, v2) <= 0 ? v1 : v2;
  const p = plan(waiting, news, seen, Date.now());
  if (!p.publish.length && !p.drop.length) { console.log('2回目では新しい版が見えなかったので、次の回にもう一度見る'); return; }
  console.log('出す:' + p.publish.map((x) => x.id).join('・') + (p.drop.length ? '/もう出ていたので置き場から消すだけ:' + p.drop.join('・') : ''));
  if (mode === 'check') { console.log('(check なので書かない)'); return; }
  fs.writeFileSync(NEWS_FILE, JSON.stringify(p.news, null, 2) + '\n');
  fs.writeFileSync(WAIT_FILE, JSON.stringify({ items: p.keep }, null, 2) + '\n');
  git('config', 'user.name', 'github-actions[bot]');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git('add', NEWS_FILE, WAIT_FILE);
  git('commit', '-m', 'お知らせを出す:' + (p.publish.map((x) => x.id).join('・') || '(置き場の片付けだけ)') + '(App Store の版 ' + seen + '。.github/news-release.mjs)');
  try { git('pull', '--rebase', '--quiet'); git('push', '--quiet'); } catch (e) { return fail('push できませんでした(news.json は GitHub に出ていません):' + String(e.message).slice(0, 300)); }
  if (!p.publish.length) return;
  if (!(await requestPagesBuild())) return fail('news.json はコミットしたが、GitHub Pages の組み立てを頼めませんでした。tocorico.jp に出るのは次に誰かが push したとき');
  const want = p.publish.map((x) => x.id);
  for (let t = 0; t < LIVE_WAIT_MS; t += 30000) {
    await sleep(30000);
    try { const r = await fetch(LIVE_URL + '?t=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } }); const live = await r.json(); if (want.every((id) => live.some((x) => x && x.id === id))) { console.log('tocorico.jp/news.json に出た:' + want.join('・')); return; } } catch (e) { /* 次にもう一度 */ }
  }
  fail('news.json はコミットしたが、15分たっても tocorico.jp/news.json に出ていません(GitHub Pages の組み立てを確かめてください)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => fail(String(e && e.stack || e)));
