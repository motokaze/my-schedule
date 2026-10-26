// マイスケジュール: アプリ本体をスマホの中に保存して、すぐ開けるようにする
// ・開くときは、スマホの中に保存した版をすぐに使う(ネットを待たない)
// ・同時に裏で GitHub から最新版を取ってきて保存。中身が変わっていたら、画面に「新しい版があります」と知らせる
const CACHE = "myschedule-v2";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function notifyUpdated(){
  const cs = await self.clients.matchAll({type: "window"});
  cs.forEach((c) => c.postMessage({type: "updated"}));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const cached = await c.match(isPage ? "index.html" : req, {ignoreSearch: true});
    // 比べるために、保存してある版の中身を先に読んでおく(画面に渡したあとは読めなくなるため)
    const oldText = isPage && cached ? cached.clone().text() : Promise.resolve(null);
    // 裏で最新版を取ってくる(ネットのキャッシュは使わず、必ず GitHub に確認)
    // (ページを開くときの要求はそのままでは作り直せないので、アドレスから取り直す)
    const latest = fetch(isPage ? url.href : req.url, {cache: "no-cache", credentials: "same-origin"}).then(async (res) => {
      if (!res || !res.ok || res.type !== "basic") return res;
      if (isPage){
        const text = await res.clone().text();
        const old = await oldText;
        await c.put("index.html", new Response(text, {headers: {"Content-Type": "text/html; charset=utf-8"}}));
        if (old !== null && old !== text) await notifyUpdated();
      } else {
        await c.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    if (cached){ e.waitUntil(latest); return cached; }
    const res = await latest;
    return res || (await c.match("index.html")) || new Response("オフラインです", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}});
  })());
});
