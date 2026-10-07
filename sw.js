// Offline shell for the installed app. Network first, so a new GitHub Pages deploy is picked up on the next
// online load; the cached copy is used only when the network fails. API calls (other origins) are never cached.
const CACHE = "ds-agents-shell-v4";
const SHELL = ["./", "index.html", "styles.css", "core.js", "app.js", "manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
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
