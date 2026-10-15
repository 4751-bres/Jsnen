// Offline shell for the installed app. Network first, so a new GitHub Pages deploy is picked up on the next
// online load; the cached copy is used only when the network fails. API calls (other origins) are never cached.
const CACHE = "ds-agents-shell-v6";
const SHELL = ["./", "index.html", "styles.css", "core.js", "app.js", "manifest.json", "icon-192.png", "icon-96.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE && key !== SHARE_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Android share sheet → this app (installed PWA): keep the shared text and images for the page, then open it.
const SHARE_CACHE = "ds-share";
async function receiveShare(request) {
  try {
    const form = await request.formData(), cache = await caches.open(SHARE_CACHE);
    await Promise.all((await cache.keys()).map(key => cache.delete(key)));
    const images = form.getAll("images").filter(file => file && typeof file === "object" && file.size);
    const text = [form.get("title"), form.get("text"), form.get("url")].map(v => String(v || "").trim()).filter(Boolean)
      .filter((v, i, all) => all.indexOf(v) === i).join("\n");
    await cache.put("share.json", new Response(JSON.stringify({ text, count: images.length, at: Date.now() }), { headers: { "Content-Type": "application/json" } }));
    for (const [i, file] of images.slice(0, 4).entries())
      await cache.put("image-" + i, new Response(file, { headers: { "Content-Type": file.type || "image/png", "X-Name": encodeURIComponent(file.name || "shared-" + i) } }));
  } catch (error) { /* Open the app anyway. */ }
  return Response.redirect("./?shared=1", 303);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method === "POST" && new URL(request.url).searchParams.has("share-target")) { event.respondWith(receiveShare(request)); return; }
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request.url, { cache: "no-cache", credentials: "same-origin" })
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then(hit => hit || (request.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});

// Background replies. The page hands each chat request to this worker, which keeps the stream going while the
// page is hidden, frozen or closed, relays every chunk on a BroadcastChannel, and keeps a copy (without the
// API key) in IndexedDB so a reply that finishes after the page was closed is added on the next visit.
const JOB_CHANNEL = "ds-jobs";
const activeJobs = new Map();

function openJobs() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ds-jobs", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("jobs", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function writeJob(job, remove) {
  try {
    const db = await openJobs();
    const tx = db.transaction("jobs", "readwrite");
    if (remove) tx.objectStore("jobs").delete(job); else tx.objectStore("jobs").put(job);
    await new Promise(done => { tx.oncomplete = tx.onerror = tx.onabort = done; });
    db.close();
  } catch (error) { /* The live stream still reaches an open page. */ }
}

self.addEventListener("message", event => {
  const message = event.data || {};
  if (message.type === "generate") event.waitUntil(runJob(message));
  else if (message.type === "abort") activeJobs.get(message.id)?.abort();
  else if (message.type === "forget") event.waitUntil(writeJob(message.id, true));
});

// The reply text from a saved event stream, without the hidden tags the app strips.
function replyPreview(raw) {
  let text = "";
  for (const line of String(raw).split("\n")) {
    if (!line.startsWith("data:")) continue;
    try { text += JSON.parse(line.slice(5)).choices?.[0]?.delta?.content || ""; } catch (e) { /* keep-alive or [DONE] */ }
  }
  text = text.replace(/\[\s*(?:mood|thoughts?|inner thoughts?|bond|relationship|affection)\s*:[^\]]*\]/gi, "").replace(/^\s*\[char\]\s*:\s*/i, "").replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
  return text.length > 160 ? text.slice(0, 157) + "…" : text;
}
async function notifyReply(meta, raw) {
  try {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some(w => w.visibilityState === "visible")) return;
    await self.registration.showNotification(meta.notify, {
      body: replyPreview(raw) || "Your reply is ready.", icon: "icon-192.png", badge: "icon-96.png",
      tag: "reply-" + (meta.convId || "chat"), renotify: true, data: { convId: meta.convId || "" }
    });
  } catch (error) { /* Notifications are optional. */ }
}
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find(w => new URL(w.url).pathname.startsWith(new URL(self.registration.scope).pathname));
    if (open) { await open.focus(); open.postMessage({ type: "open-chat", convId: event.notification.data?.convId || "" }); }
    else await self.clients.openWindow(self.registration.scope + (event.notification.data?.convId ? "#chat=" + encodeURIComponent(event.notification.data.convId) : ""));
  })());
});

async function runJob(message) {
  const controller = new AbortController();
  activeJobs.set(message.id, controller);
  const channel = new BroadcastChannel(JOB_CHANNEL);
  const post = data => channel.postMessage({ id: message.id, ...data });
  const job = { id: message.id, meta: message.meta || null, raw: "", status: "running", httpStatus: 0, startedAt: Date.now(), heartbeat: Date.now() };
  await writeJob(job);
  try {
    const response = await fetch(message.url, { method: "POST", headers: message.headers, body: message.body, signal: controller.signal });
    job.httpStatus = response.status;
    post({ type: "head", status: response.status, contentType: response.headers.get("Content-Type") || "" });
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let savedAt = Date.now();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (!text) continue;
      job.raw += text;
      post({ type: "chunk", chunk: text });
      if (Date.now() - savedAt > 1500) { savedAt = job.heartbeat = Date.now(); await writeJob(job); }
    }
    const tail = decoder.decode();
    if (tail) { job.raw += tail; post({ type: "chunk", chunk: tail }); }
    job.status = response.ok ? "done" : "error";
    post({ type: "end" });
    if (response.ok && message.meta?.notify) await notifyReply(message.meta, job.raw);
  } catch (error) {
    job.status = error.name === "AbortError" ? "aborted" : "failed";
    job.error = String(error.message || error);
    post({ type: "fail", error: job.error, aborted: error.name === "AbortError" });
  } finally {
    activeJobs.delete(message.id);
    job.heartbeat = Date.now();
    await writeJob(job);
    channel.close();
  }
}
