const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function inlineScript() {
  const html = fs.readFileSync("index.html", "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length, "index.html must contain an inline script");
  return scripts.at(-1)[1];
}

function streamCompletionSource(script) {
  const match = script.match(
    /async function streamCompletion\(agent,apiMessages,meta=\{\}\)\{[\s\S]*?(?=\n\/\* ---------- Stream one response from a specific agent ---------- \*\/)/
  );
  assert.ok(match, "streamCompletion must remain extractable");
  return match[0];
}

test("an in-flight response stays bound to its originating conversation", async () => {
  let resolveFetch;
  const pendingFetch = new Promise(resolve => { resolveFetch = resolve; });
  const saved = new Map();
  const context = {
    AbortController,
    TextDecoder,
    fetch: () => pendingFetch,
    store: {
      k: "test-key",
      base: "https://example.invalid",
      saveConv(id, value) { saved.set(id, structuredClone(value)); },
    },
    renderChat() {},
    renderResponders() {},
    setSending() {},
    toast() {},
    $() { return { click() {} }; },
  };
  vm.createContext(context);
  vm.runInContext(`
    let currentId = "agent-a";
    let messages = [{role:"user",content:"message for A"}];
    let controller = null;
    this.switchConversation = () => {
      currentId = "agent-b";
      messages = [{role:"user",content:"message for B"}];
    };
    ${streamCompletionSource(inlineScript())}
    this.streamCompletion = streamCompletion;
  `, context);

  const response = context.streamCompletion(
    { model: "test-model", temp: 0, think: "off" },
    [{ role: "user", content: "message for A" }]
  );
  context.switchConversation();
  resolveFetch({
    ok: true,
    body: { getReader: () => ({ read: async () => ({ done: true }) }) },
  });
  await response;

  assert.deepEqual(
    saved.get("agent-a").map(message => message.content),
    ["message for A", "(empty response)"]
  );
  assert.equal(saved.has("agent-b"), false);
});

test("all conversation selectors block switching while a response is active", () => {
  const script = inlineScript();
  for (const name of ["selectAgent", "selectGroup", "selectWorkflow"]) {
    const match = script.match(new RegExp(`function ${name}\\(id\\)\\{([^\\n]+)\\}`));
    assert.ok(match, `${name} must remain defined`);
    assert.match(match[1], /if\(controller\)\{toast\("Stop the response before switching"\);return;\}/);
  }
});
