import {getHomeShareCopy} from './home-share-copy.js';

const PAGE_URL = "https://platform.example.invalid/games/homeworld/home-share.html";
const SHARE_TITLE = "My Little World | Learning Studio";
const SHARE_DESCRIPTION = "Every small effort can be seen.";
const SHARE_IMAGE = "https://platform.example.invalid/games/homeworld/assets/home-share/share-bunny-v2.jpg";

// The signature uses the unchanged browser URL. Only the outgoing share link
// is canonicalized to this public snapshot; sample/review pages never sign.
function publicShareLink(value) {
  try {
    const url = new URL(value);
    if (url.origin !== "https://platform.example.invalid" || url.pathname !== "/games/homeworld/home-share.html"
      || url.username || url.password || url.searchParams.has("sample")
      || url.searchParams.getAll("share").length !== 1) return null;
    const token = url.searchParams.get("share");
    return /^[A-Za-z0-9_-]{43}$/.test(token || "") ? `${PAGE_URL}?share=${token}` : null;
  } catch { return null; }
}

const SDK_URLS = Object.freeze([
  "https://res.wx.qq.com/open/js/jweixin-1.6.0.js",
  "https://res2.wx.qq.com/open/js/jweixin-1.6.0.js",
]);
const SHARE_APIS = Object.freeze(["updateAppMessageShareData", "updateTimelineShareData"]);
const initializationTasks = new WeakMap();

const diagnostics = new WeakMap();
const DIAGNOSTIC_STAGES = Object.freeze(["init", "config", "sdk", "ready", "friend", "timeline"]);
const DIAGNOSTIC_STATES = new Set(["not-started", "skipped", "requesting", "received", "valid", "disabled", "invalid-response", "http-error", "loading", "available", "failed", "waiting", "ready", "pending", "success", "cancelled", "timeout", "configured", "unconfirmed"]);
const DIAGNOSTIC_ERRORS = new Set(["permission-denied", "invalid-signature", "invalid-domain", "unsupported", "cancelled", "generic", "load-failed"]);

// Only fixed categories cross the diagnostic boundary. Never retain an SDK
// error object, arbitrary errMsg, URL, account ID, signature or share token.
function errorCategory(value) {
  let message = "";
  try { message = String(value?.errMsg || value?.message || "").slice(0, 300).toLowerCase(); } catch { /* Untrusted bridge object. */ }
  if (/invalid[ _-]*signature/.test(message)) return "invalid-signature";
  if (/permission|access denied|not authorized/.test(message)) return "permission-denied";
  if (/invalid.{0,12}(domain|url)|url.{0,12}(whitelist|white list)|domain.{0,12}(whitelist|white list)/.test(message)) return "invalid-domain";
  if (/not support|unsupported|function not exist/.test(message)) return "unsupported";
  if (/cancel/.test(message)) return "cancelled";
  return "generic";
}

function diagnosticMode(browserWindow) {
  try {
    const values = new URL(browserWindow.location.href).searchParams.getAll("wxdiag");
    return values.length === 1 && values[0] === "1";
  } catch { return false; }
}

/** Sanitized snapshot for the temporary on-device diagnostic panel. */
export function getWeChatShareDiagnostics(browserWindow = globalThis.window) {
  const value = browserWindow && diagnostics.get(browserWindow);
  return value ? { client: value.client, stages: Object.fromEntries(Object.entries(value.stages).map(([key, stage]) => [key, { ...stage }])), events: value.events.map(event => ({ ...event })) } : null;
}

function diagnosticReporter(browserWindow, browserDocument) {
  if (!browserWindow || !diagnosticMode(browserWindow)) return () => {};
  let entry = diagnostics.get(browserWindow);
  if (entry) return entry.record;
  const ua = browserWindow.navigator?.userAgent || "";
  const client = !/MicroMessenger/iu.test(ua) ? "non-wechat" : /Android|iPhone|iPad|iPod|Mobile/iu.test(ua) ? "wechat-mobile" : "wechat-desktop";
  entry = { client, stages: Object.fromEntries(DIAGNOSTIC_STAGES.map(stage => [stage, { state: "not-started" }])), events: [], panel: null, record: null };
  const paint = () => {
    try {
      if (!entry.panel) {
        const parent = browserDocument?.body;
        if (!parent || typeof browserDocument.createElement !== "function") return;
        const panel = browserDocument.createElement("aside");
        panel.id = "wechat-share-diagnostics";
        panel.setAttribute("aria-label", "WeChat share check");
        Object.assign(panel.style, { position: "fixed", left: "8px", right: "8px", bottom: "8px", zIndex: "2147483647", maxHeight: "42vh", overflow: "auto", margin: "0", padding: "12px", border: "1px solid #65806a", borderRadius: "8px", background: "#fffef8", color: "#20291f", boxShadow: "0 2px 18px #0002", font: "12px/1.6 monospace", whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "left" });
        parent.appendChild(panel);
        entry.panel = panel;
      }
      const lines = ["WeChat share check (temporary)", `Device: ${entry.client}`, ...DIAGNOSTIC_STAGES.map(stage => { const result = entry.stages[stage]; return `${stage}: ${result.state}${result.error ? " / " + result.error : ""}${result.httpStatus ? " / HTTP " + result.httpStatus : ""}${result.attempt ? " / " + result.attempt : ""}`; }), "Configured share data only confirms readiness; check the received card separately."];
      entry.panel.textContent = lines.join("\n");
    } catch { /* Diagnostics must never affect the viewer or SDK. */ }
  };
  entry.record = (stage, state, error, extra = {}) => {
    if (!DIAGNOSTIC_STAGES.includes(stage) || !DIAGNOSTIC_STATES.has(state)) return;
    const result = { state, ...(DIAGNOSTIC_ERRORS.has(error) ? { error } : {}), ...(Number.isInteger(extra.httpStatus) && extra.httpStatus >= 100 && extra.httpStatus <= 599 ? { httpStatus: extra.httpStatus } : {}), ...([1, 2].includes(extra.attempt) ? { attempt: extra.attempt } : {}) };
    entry.stages[stage] = result;
    entry.events.push({ stage, ...result });
    if (entry.events.length > 40) entry.events.shift();
    paint();
  };
  diagnostics.set(browserWindow, entry);
  // Modules normally run after parsing, but still mount if a host loads early.
  try { browserDocument?.addEventListener?.("DOMContentLoaded", paint, { once: true }); } catch { /* Optional diagnostic hook. */ }
  paint();
  return entry.record;
}

function hasSdk(sdk) {
  return sdk && ["config", "ready", "error", ...SHARE_APIS].every(name => typeof sdk[name] === "function");
}

function timeoutDuration(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function withTimeout(operation, duration, onTimeout = () => {}) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      try { onTimeout(); } catch { /* Optional sharing must never affect the viewer. */ }
      reject(new Error("wechat_share_timeout"));
    }, duration);
  });
  // Promise.race observes late rejections too, including an aborted fetch.
  return Promise.race([Promise.resolve().then(operation), deadline]).finally(() => clearTimeout(timer));
}

function loadScript(browserWindow, browserDocument, source, duration) {
  return new Promise((resolve, reject) => {
    let script;
    let timer;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (script) {
        script.onload = null;
        script.onerror = null;
        if (error) script.remove?.();
      }
      if (error) reject(error);
      else resolve(browserWindow.wx);
    };
    try {
      script = browserDocument.createElement("script");
      script.async = true;
      script.src = source;
      script.onload = () => finish(hasSdk(browserWindow.wx) ? null : new Error("wechat_sdk_unavailable"));
      script.onerror = () => finish(new Error("wechat_sdk_unavailable"));
      timer = setTimeout(() => finish(new Error("wechat_sdk_timeout")), duration);
      const parent = browserDocument.head || browserDocument.body || browserDocument.documentElement;
      parent.appendChild(script);
    } catch (error) {
      finish(error);
    }
  });
}

async function loadSdk(browserWindow, browserDocument, duration, report) {
  if (hasSdk(browserWindow.wx)) { report("sdk", "available"); return browserWindow.wx; }
  for (const [index, source] of SDK_URLS.entries()) {
    const extra = { attempt: index + 1 };
    report("sdk", "loading", undefined, extra);
    try {
      const sdk = await loadScript(browserWindow, browserDocument, source, duration);
      report("sdk", "available", undefined, extra);
      return sdk;
    } catch (error) {
      report("sdk", error?.message === "wechat_sdk_timeout" ? "timeout" : "failed", "load-failed", extra);
      // Try the second official host, then leave ordinary viewing available.
    }
  }
  return null;
}

function readSettings(payload, browserUrl) {
  const config = payload.config || payload;
  const share = payload.share;
  if (!["appId", "nonceStr", "signature"].every(name => typeof config[name] === "string" && config[name].length > 0)
    || !Number.isFinite(Number(config.timestamp)) || Number(config.timestamp) <= 0
    || !share || !["title", "link", "imgUrl"].every(name => typeof share[name] === "string" && share[name].length > 0)
    || typeof share.desc !== "string") return null;
  if (share.link !== publicShareLink(browserUrl) || share.imgUrl !== SHARE_IMAGE
    || share.title !== SHARE_TITLE || share.desc !== SHARE_DESCRIPTION) return null;
  return {
    config: { debug: false, appId: config.appId, timestamp: Number(config.timestamp), nonceStr: config.nonceStr, signature: config.signature, jsApiList: [...SHARE_APIS] },
    share: { title: share.title, desc: share.desc, link: share.link, imgUrl: share.imgUrl },
  };
}

// The server renders the frozen snapshot title before this module starts.
// Derive both fields through the same copy helper as the HTML; neither URL
// query text nor a signature-service payload can supply a child's identity.
function readRenderedCopy(browserDocument) {
  let title;
  try {
    const meta = browserDocument.getElementById?.("share-meta-title");
    title = meta?.getAttribute?.("content") ?? meta?.content;
  } catch { /* Missing metadata uses the generic, identity-free copy. */ }
  const copy = getHomeShareCopy(title);
  return { title: copy.title, desc: copy.description };
}

function configureSharing(sdk, settings, readyDuration, callbackDuration, report) {
  return new Promise(resolve => {
    let settled = false;
    let readyReceived = false;
    let stopped = false;
    let timer;
    const completed = new Set();
    const stageFor = name => name === SHARE_APIS[0] ? "friend" : "timeline";
    const finish = success => {
      clearTimeout(timer);
      report("init", success ? "configured" : "unconfirmed");
      if (settled) return;
      settled = true;
      resolve(success);
    };
    const fail = () => { stopped = true; finish(false); };
    report("ready", "waiting");
    // Resolve the observation deadline, but still accept a legitimate late ready.
    timer = setTimeout(() => { report("ready", "timeout"); finish(false); }, readyDuration);
    try {
      sdk.error(error => { report("ready", "failed", errorCategory(error)); fail(); });
      // Register the bridge callbacks before config, including synchronous SDKs.
      sdk.ready(() => {
        if (stopped || readyReceived) return;
        readyReceived = true;
        clearTimeout(timer);
        report("ready", "ready");
        timer = setTimeout(() => {
          for (const name of SHARE_APIS) if (!completed.has(name)) report(stageFor(name), "timeout");
          fail();
        }, callbackDuration);
        for (const name of SHARE_APIS) {
          if (stopped) break;
          const stage = stageFor(name);
          report(stage, "pending");
          const failed = error => { report(stage, "failed", errorCategory(error)); fail(); };
          try {
            const result = sdk[name]({
              ...settings.share,
              success: () => {
                report(stage, "success");
                if (stopped) return;
                completed.add(name);
                if (completed.size === SHARE_APIS.length) finish(true);
              },
              fail: failed,
              cancel: () => { report(stage, "cancelled", "cancelled"); fail(); },
            });
            // The official API uses callbacks; a returned rejection also fails safely.
            if (result && typeof result.then === "function") Promise.resolve(result).catch(failed);
          } catch (error) { failed(error); }
        }
      });
      sdk.config(settings.config);
    } catch (error) { report("ready", "failed", errorCategory(error)); fail(); }
  });
}

async function initialize(browserWindow, browserDocument, fetchImpl, sdkDuration, configDuration, readyDuration, callbackDuration, report) {
  let phase = "config";
  let configErrorRecorded = false;
  try {
    const url = browserWindow.location.href.split("#")[0];
    const renderedCopy = readRenderedCopy(browserDocument);
    const AbortControllerImpl = browserWindow.AbortController || globalThis.AbortController;
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
    report("config", "requesting");
    const payload = await withTimeout(async () => {
      const response = await fetchImpl("/api/wechat/home-share-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ url }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        configErrorRecorded = true;
        report("config", "http-error", undefined, { httpStatus: response.status });
        throw new Error("wechat_config_unavailable");
      }
      report("config", "received");
      return response.json();
    }, configDuration, () => { configErrorRecorded = true; report("config", "timeout"); controller?.abort(); });
    if (payload?.enabled !== true) { report("config", "disabled"); return false; }
    const settings = readSettings(payload, url);
    if (!settings) { report("config", "invalid-response"); return false; }
    settings.share = { ...settings.share, ...renderedCopy };
    report("config", "valid");
    phase = "sdk";
    const sdk = await loadSdk(browserWindow, browserDocument, sdkDuration, report);
    phase = "ready";
    return sdk ? await configureSharing(sdk, settings, readyDuration, callbackDuration, report) : false;
  } catch (error) {
    if (phase !== "config" || !configErrorRecorded) report(phase, "failed", errorCategory(error));
    // Browser sharing is optional. The temporary panel shows fixed categories
    // only, and never couples SDK/network failure to the viewer or its controls.
    return false;
  }
}

// Fire-and-forget safely: `void initializeWeChatSharing()`.
// Resolves true only after both share-data APIs report success;
// this does not claim that a parent has completed a real WeChat share.
export async function initializeWeChatSharing(options = {}) {
  try {
    const browserWindow = options.window || globalThis.window;
    const browserDocument = options.document || globalThis.document;
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const report = diagnosticReporter(browserWindow, browserDocument);
    if (!browserWindow || !/MicroMessenger/iu.test(browserWindow.navigator?.userAgent || "") || !browserDocument || typeof fetchImpl !== "function"
      || !publicShareLink(browserWindow.location?.href)) { report("init", "skipped"); return false; }
    if (!initializationTasks.has(browserWindow)) {
      // A cold token/ticket refresh can make several serial server requests.
      // Its budget is independent of the short script and bridge deadlines.
      const sdkDuration = timeoutDuration(options.timeoutMs, 5000);
      const configDuration = timeoutDuration(options.configTimeoutMs ?? options.timeoutMs, 45000);
      const readyDuration = timeoutDuration(options.readyTimeoutMs ?? options.timeoutMs, 5000);
      const callbackDuration = timeoutDuration(options.callbackTimeoutMs ?? options.timeoutMs, 5000);
      initializationTasks.set(browserWindow, initialize(browserWindow, browserDocument, fetchImpl, sdkDuration, configDuration, readyDuration, callbackDuration, report));
    }
    return await initializationTasks.get(browserWindow);
  } catch { return false; }
}

// Optional enhancement: the independent viewer script never waits for it.
void initializeWeChatSharing();
