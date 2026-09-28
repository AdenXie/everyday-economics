import test from "node:test";
import assert from "node:assert/strict";
import { handleChat, validatePayload, buildUpstreamBody, createRateLimiter, modelSettings, LIMITS } from "../server/ai-proxy.js";
import vercelFunction from "../api/chat.js";

const origin = "https://econ.adenxie.com.cn";
const env = { RADEON_API_KEY: "rc-test", UPSTREAM_URL: "https://upstream.test/v1/chat/completions" };

function request(body, headers = {}, method = "POST") {
  return new Request("https://econ.adenxie.com.cn/api/chat", {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, Host: "econ.adenxie.com.cn", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}
const hi = { messages: [{ role: "user", content: "hi" }] };

test("the Vercel function exports a fetch handler", () => {
  assert.equal(typeof vercelFunction.fetch, "function");
});

test("rejects requests from other sites and non-POST methods", async () => {
  assert.equal((await handleChat(request(hi, { Origin: "https://evil.test" }), env, { limiter: null })).status, 403);
  assert.equal((await handleChat(request(hi, { Origin: "" }), env, { limiter: null })).status, 403);
  assert.equal((await handleChat(request(null, {}, "DELETE"), env, { limiter: null })).status, 405);
});

test("accepts the site's own origin, including Vercel preview hosts", async () => {
  const preview = request(hi, { Origin: "https://econ-abc.vercel.app", Host: "econ-abc.vercel.app" });
  const response = await handleChat(preview, { ...env, RADEON_API_KEY: "" }, { limiter: null });
  assert.equal(response.status, 503, "passes the origin check and stops at the missing key");
});

test("per-IP limiter blocks bursts and recovers after the window", () => {
  let clock = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => clock });
  assert.ok(limiter.check("a"));
  assert.ok(limiter.check("a"));
  assert.equal(limiter.check("a"), false);
  assert.ok(limiter.check("b"));
  clock = 1001;
  assert.ok(limiter.check("a"));
});

test("rate-limited visitors get 429", async () => {
  const response = await handleChat(request(hi), env, { limiter: { check: () => false } });
  assert.equal(response.status, 429);
});

test("validation trims history, keeps roles, and rejects bad input", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `m${index}` }));
  many.push({ role: "user", content: "last" });
  const result = validatePayload({ messages: many, locale: "en", context: "x".repeat(5000) });
  assert.ok(result.messages.length <= LIMITS.maxMessages);
  assert.equal(result.messages[0].role, "user");
  assert.equal(result.messages.at(-1).content, "last");
  assert.equal(result.context.length, LIMITS.maxContextChars);
  assert.throws(() => validatePayload({ messages: [{ role: "system", content: "x" }] }), /invalid_message/);
  assert.throws(() => validatePayload({ messages: [{ role: "user", content: "x".repeat(LIMITS.maxUserChars + 1) }] }), /message_too_long/);
  assert.throws(() => validatePayload({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }), /last_message_not_user/);
});

test("system prompt and model are set by the server, not the browser", () => {
  const body = buildUpstreamBody(validatePayload({ locale: "zh", context: "正在看：日本", messages: [{ role: "user", content: "什么是 CPI？" }] }), "Qwen3.8-27B");
  assert.equal(body.model, "Qwen3.8-27B");
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[0].content, /页面上下文/);
  assert.match(body.messages[0].content, /正在看：日本/);
  assert.equal(body.stream, true);
  assert.equal(body.reasoning_effort, "low");
});

test("forwards with the secret key and streams the answer back", async () => {
  const original = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url, init };
    return new Response("data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\ndata: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const response = await handleChat(request({ messages: [{ role: "user", content: "hi", extra: "ignored" }], model: "other" }), env, { limiter: null });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /\[DONE\]/);
    assert.equal(seen.url, env.UPSTREAM_URL);
    assert.equal(seen.init.headers.Authorization, "Bearer rc-test");
    const sent = JSON.parse(seen.init.body);
    assert.equal(sent.model, "Qwen3.8-27B");
    assert.deepEqual(Object.keys(sent.messages[1]), ["role", "content"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("upstream failures are reported without leaking details", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("secret upstream detail", { status: 500 });
  try {
    const response = await handleChat(request(hi), env, { limiter: null });
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /secret upstream detail/);
  } finally {
    globalThis.fetch = original;
  }
});

test("assistant hides the model's <think> block from readers", async () => {
  const { stripThinking } = await import("../src/assistant.js");
  assert.equal(stripThinking("<think>internal</think>\n答案"), "答案");
  assert.equal(stripThinking("<think>still thinking"), "");
  assert.equal(stripThinking("plain"), "plain");
});

test("the model and reasoning effort come from environment variables", () => {
  assert.deepEqual(modelSettings({}), { model: "Qwen3.8-27B", reasoningEffort: "low" });
  assert.deepEqual(modelSettings({ AI_MODEL: " DeepSeek-V4-Flash ", AI_REASONING_EFFORT: "medium" }), { model: "DeepSeek-V4-Flash", reasoningEffort: "medium" });
  const body = buildUpstreamBody(validatePayload({ messages: [{ role: "user", content: "hi" }] }), modelSettings({ AI_MODEL: "GLM-5.3-Flash", AI_REASONING_EFFORT: "none" }));
  assert.equal(body.model, "GLM-5.3-Flash");
  assert.equal("reasoning_effort" in body, false);
});

test("GET reports the configured model without exposing the key", async () => {
  const response = await handleChat(request(null, {}, "GET"), { ...env, AI_MODEL: "Qwen3.8-27B" }, { limiter: null });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { model: "Qwen3.8-27B", configured: true });
  assert.doesNotMatch(text, /rc-test/);
});

test("the upstream request uses AI_MODEL from the environment", async () => {
  const original = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } }); };
  try {
    await handleChat(request(hi), { ...env, AI_MODEL: "MiMo-V2.6-Flash" }, { limiter: null });
    assert.equal(sent.model, "MiMo-V2.6-Flash");
  } finally {
    globalThis.fetch = original;
  }
});
