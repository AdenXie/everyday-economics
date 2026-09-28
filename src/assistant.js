// Floating AI assistant (bottom-right). The conversation lives only in this module's
// memory: nothing is written to localStorage, cookies or a server, so reloading the
// page discards it. The panel opens and closes only from the floating button (or the
// close button inside the panel); moving the pointer or focus back to the page never
// closes it.

const ENDPOINT = "/api/chat";
const MAX_HISTORY = 16;
const MAX_INPUT = 1500;

let messages = {};
let locale = "zh";
const history = [];
let busy = false;
let controller = null;
const ui = {};

function t(key, values = {}) {
  const template = messages[key] ?? key;
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), template);
}

function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value == null) continue;
    if (name === "text") node.textContent = value;
    else if (name === "className") node.className = value;
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

const icon = (paths, size = 20) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
};

const ICONS = {
  chat: ["M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z", "M8.5 8.5h7", "M8.5 12h4.5"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  send: ["M4 12l16-8-6 16-2.5-6.5z", "M11.5 13.5L20 4"],
  stop: ["M7 7h10v10H7z"],
  copy: ["M9 9h10v11H9z", "M5 15V4h10"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  clear: ["M4 7h16", "M9 7V4.5h6V7", "M6.5 7l1 13h9l1-13"],
};

// ---------- tiny, safe Markdown renderer (DOM nodes only, never innerHTML) ----------

function appendInline(parent, text) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parent.append(text.slice(last, match.index));
    const token = match[0];
    parent.append(token.startsWith("**") ? el("strong", { text: token.slice(2, -2) }) : el("code", { text: token.slice(1, -1) }));
    last = match.index + token.length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

export function renderMarkdown(container, source) {
  container.replaceChildren();
  const lines = source.replace(/\r/g, "").split("\n");
  let list = null;
  let paragraph = [];
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = el("p");
    paragraph.forEach((line, index) => {
      if (index) p.append(el("br"));
      appendInline(p, line);
    });
    container.append(p);
    paragraph = [];
  };
  const closeList = () => { list = null; };

  for (const line of lines) {
    if (code) {
      if (/^```/.test(line.trim())) { container.append(el("pre", {}, el("code", { text: code.join("\n") }))); code = null; }
      else code.push(line);
      continue;
    }
    if (/^```/.test(line.trim())) { flushParagraph(); closeList(); code = []; continue; }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== tag) { list = el(tag); container.append(list); }
      const item = el("li");
      appendInline(item, bullet ? bullet[1] : ordered[2]);
      list.append(item);
    } else if (heading) {
      flushParagraph(); closeList();
      const h = el("p", { className: "ai-md-heading" });
      appendInline(h, heading[1]);
      container.append(h);
    } else if (!line.trim()) {
      flushParagraph(); closeList();
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  if (code) container.append(el("pre", {}, el("code", { text: code.join("\n") })));
  flushParagraph();
}

export function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s+/, "");
}

// ---------- page context ----------

function textOf(selector) {
  const node = document.querySelector(selector);
  return node && !node.closest("[hidden]") ? node.textContent.replace(/\s+/g, " ").trim() : "";
}

export function pageContext() {
  const view = new URLSearchParams(window.location.search).get("view") || "AUS";
  const tab = textOf(".country-tabs [aria-selected='true']");
  const lines = [`${t("ai.contextTab")}: ${tab || view}`];
  const add = (label, selector) => {
    const value = textOf(selector);
    if (value && value !== "—") lines.push(`${label}: ${value}`);
  };
  if (view === "compare") {
    add(t("ai.contextRange"), "#compare-range");
    for (const row of document.querySelectorAll("#compare-rows tr")) {
      const name = row.querySelector("th")?.textContent.trim() ?? "";
      const bars = [...row.querySelectorAll(".bar-value")].map((node) => node.textContent.trim());
      const real = row.querySelector(".compare-real")?.textContent.trim() ?? "";
      const detail = bars.length ? `${bars.join("; ")}; ${t("ai.contextReal")} ${real}` : row.querySelector(".compare-bars")?.textContent.trim();
      lines.push(`- ${name}: ${detail}`);
    }
  } else {
    if (view === "AUS") {
      add(t("ai.contextAbsRange"), "#selected-range");
      add("ABS CPI", "#cpi-growth");
      add("ABS WPI", "#wpi-growth");
      add(t("ai.contextGap"), "#comparison-result");
    }
    add(t("ai.contextRange"), "#world-range");
    add(t("ai.contextCpi"), "#world-cpi-growth");
    add(t("ai.contextIncome"), "#world-income-growth");
    add(t("ai.contextReal"), "#world-real");
  }
  return lines.join("\n").slice(0, 1400);
}

// ---------- chat log ----------

function scrollToEnd() {
  ui.log.scrollTop = ui.log.scrollHeight;
}

function addUserMessage(text) {
  ui.empty.hidden = true;
  const bubble = el("div", { className: "ai-msg ai-msg-user" }, el("p", { text }));
  ui.log.append(bubble);
  scrollToEnd();
}

function addAssistantMessage() {
  const body = el("div", { className: "ai-msg-body" });
  const status = el("span", { className: "ai-typing", text: t("ai.thinking") });
  body.append(status);
  const copy = el("button", { type: "button", className: "ai-copy", hidden: true, "aria-label": t("ai.copy") }, [icon(ICONS.copy, 15), el("span", { text: t("ai.copy") })]);
  const wrapper = el("div", { className: "ai-msg ai-msg-assistant" }, [body, copy]);
  ui.log.append(wrapper);
  scrollToEnd();
  return { wrapper, body, copy };
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = el("textarea", { className: "ai-copy-buffer", readonly: true });
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const label = button.querySelector("span");
  button.replaceChildren(icon(ICONS.check, 15), label);
  label.textContent = t("ai.copied");
  setTimeout(() => {
    button.replaceChildren(icon(ICONS.copy, 15), label);
    label.textContent = t("ai.copy");
  }, 1600);
}

function errorMessage(status, code) {
  if (code === "not_configured" || status === 404 || status === 405) return t("ai.errorNotConfigured");
  if (status === 429) return t("ai.errorBusy");
  if (status === 413 || code === "message_too_long") return t("ai.errorTooLong", { max: MAX_INPUT });
  if (status === 403) return t("ai.errorOrigin");
  return t("ai.errorGeneric");
}

async function readStream(response, onText) {
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("text/event-stream")) {
    const data = await response.json();
    onText(data?.choices?.[0]?.message?.content ?? "");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const piece = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (piece) {
          text += piece;
          onText(text);
        }
      } catch {
        // Ignore keep-alive or partial lines.
      }
    }
  }
}

async function send(question) {
  const text = question.trim().slice(0, MAX_INPUT);
  if (!text || busy) return;
  busy = true;
  setBusy(true);
  ui.input.value = "";
  autoGrow();
  addUserMessage(text);
  history.push({ role: "user", content: text });
  const reply = addAssistantMessage();
  let answer = "";
  let frame = 0;
  const paint = () => {
    frame = 0;
    const visible = stripThinking(answer);
    if (visible) renderMarkdown(reply.body, visible);
    scrollToEnd();
  };

  controller = new AbortController();
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, context: pageContext(), messages: history.slice(-MAX_HISTORY) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      let code = "";
      try { code = (await response.json()).error; } catch {}
      throw Object.assign(new Error("request_failed"), { status: response.status, code });
    }
    await readStream(response, (full) => {
      answer = full;
      if (!frame) frame = requestAnimationFrame(paint);
    });
    if (frame) cancelAnimationFrame(frame);
    paint();
    const finalText = stripThinking(answer).trim();
    if (!finalText) throw Object.assign(new Error("empty"), { status: 0 });
    history.push({ role: "assistant", content: finalText });
    reply.copy.hidden = false;
    reply.copy.addEventListener("click", () => copyText(finalText, reply.copy));
  } catch (error) {
    history.pop();
    const stopped = error.name === "AbortError";
    const partial = stripThinking(answer).trim();
    if (stopped && partial) {
      history.push({ role: "user", content: text }, { role: "assistant", content: partial });
      reply.body.append(el("p", { className: "ai-note", text: t("ai.stopped") }));
      reply.copy.hidden = false;
      reply.copy.addEventListener("click", () => copyText(partial, reply.copy));
    } else {
      reply.wrapper.classList.add("ai-msg-error");
      renderMarkdown(reply.body, stopped ? t("ai.stopped") : errorMessage(error.status, error.code));
    }
  } finally {
    busy = false;
    controller = null;
    setBusy(false);
    scrollToEnd();
  }
}

function setBusy(state) {
  ui.submit.replaceChildren(icon(state ? ICONS.stop : ICONS.send, 18));
  ui.submit.setAttribute("aria-label", state ? t("ai.stop") : t("ai.send"));
  ui.submit.classList.toggle("is-stop", state);
  ui.submit.disabled = !state && !ui.input.value.trim();
}

function autoGrow() {
  ui.input.style.height = "auto";
  ui.input.style.height = `${Math.min(ui.input.scrollHeight, 140)}px`;
  ui.counter.textContent = ui.input.value.length > MAX_INPUT * 0.8 ? `${ui.input.value.length}/${MAX_INPUT}` : "";
  if (!busy) ui.submit.disabled = !ui.input.value.trim();
}

function clearConversation() {
  if (controller) controller.abort();
  history.length = 0;
  ui.log.querySelectorAll(".ai-msg").forEach((node) => node.remove());
  ui.empty.hidden = false;
  ui.input.focus();
}

function setOpen(open) {
  ui.panel.hidden = !open;
  ui.fab.setAttribute("aria-expanded", String(open));
  ui.fab.replaceChildren(icon(open ? ICONS.close : ICONS.chat, 22), el("span", { className: "ai-fab-label", text: open ? t("ai.close") : t("ai.open") }));
  ui.fab.setAttribute("aria-label", open ? t("ai.closeAria") : t("ai.openAria"));
  document.documentElement.classList.toggle("ai-open", open);
  if (open) requestAnimationFrame(() => ui.input.focus());
}

export function startAssistant(localeMessages, activeLocale) {
  messages = localeMessages;
  locale = activeLocale;

  ui.fab = el("button", { type: "button", className: "ai-fab", "aria-controls": "ai-panel", "aria-expanded": "false" });
  ui.log = el("div", { className: "ai-log", role: "log", "aria-live": "polite" });
  ui.empty = el("div", { className: "ai-empty" }, [
    el("p", { className: "ai-empty-title", text: t("ai.emptyTitle") }),
    el("p", { className: "ai-empty-body", text: t("ai.emptyBody") }),
  ]);
  const chips = el("div", { className: "ai-chips" });
  for (const key of ["ai.suggest1", "ai.suggest2", "ai.suggest3"]) {
    const chip = el("button", { type: "button", className: "ai-chip", text: t(key) });
    chip.addEventListener("click", () => send(t(key)));
    chips.append(chip);
  }
  ui.empty.append(chips);
  ui.log.append(ui.empty);

  ui.input = el("textarea", { className: "ai-input", rows: 1, maxlength: MAX_INPUT, placeholder: t("ai.placeholder"), "aria-label": t("ai.inputAria") });
  ui.submit = el("button", { type: "submit", className: "ai-send", disabled: true });
  ui.counter = el("span", { className: "ai-counter", "aria-live": "polite" });
  const form = el("form", { className: "ai-form" }, [ui.input, ui.submit]);
  const clear = el("button", { type: "button", className: "ai-icon-button", "aria-label": t("ai.clear"), title: t("ai.clear") }, icon(ICONS.clear, 17));
  const close = el("button", { type: "button", className: "ai-icon-button", "aria-label": t("ai.closeAria"), title: t("ai.close") }, icon(ICONS.close, 17));

  ui.panel = el("section", { id: "ai-panel", className: "ai-panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "ai-title", hidden: true }, [
    el("header", { className: "ai-head" }, [
      el("div", {}, [
        el("h2", { id: "ai-title", text: t("ai.title") }),
        el("p", { className: "ai-sub", text: t("ai.subtitle") }),
      ]),
      el("div", { className: "ai-head-actions" }, [clear, close]),
    ]),
    ui.log,
    el("div", { className: "ai-foot" }, [form, el("p", { className: "ai-disclaimer" }, [el("span", { text: t("ai.disclaimer") }), ui.counter])]),
  ]);

  document.body.append(ui.panel, ui.fab);
  setOpen(false);
  setBusy(false);

  ui.fab.addEventListener("click", () => setOpen(ui.panel.hidden));
  close.addEventListener("click", () => { setOpen(false); ui.fab.focus(); });
  clear.addEventListener("click", clearConversation);
  ui.input.addEventListener("input", autoGrow);
  ui.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (!busy) send(ui.input.value);
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) controller?.abort();
    else send(ui.input.value);
  });
}
