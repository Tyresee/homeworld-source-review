import {getHomeShareCopy} from './home-share-copy.js';

const PAGE_URL = "https://platform.example.invalid/games/homeworld/home-share.html";
const SHARE_TITLE = "My Little World · Home Showcase | Learning Studio";
const SHARE_DESCRIPTION = "Explore a little world built through learning and steady progress.";
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

async function loadSdk(browserWindow, browserDocument, duration) {
  if (hasSdk(browserWindow.wx)) return browserWindow.wx;
  for (const source of SDK_URLS) {
    try { return await loadScript(browserWindow, browserDocument, source, duration); }
    catch { /* Try the second official host, then leave ordinary viewing available. */ }
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

function configureSharing(sdk, settings, readyDuration, callbackDuration) {
  return new Promise(resolve => {
    let settled = false;
    let readyReceived = false;
    let stopped = false;
    let timer;
    const completed = new Set();
    const finish = success => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve(success);
    };
    const fail = () => { stopped = true; finish(false); };
    // Resolve the observation deadline, but still accept a legitimate late ready.
    timer = setTimeout(() => finish(false), readyDuration);
    try {
      sdk.error(fail);
      // Register the bridge callbacks before config, including synchronous SDKs.
      sdk.ready(() => {
        if (stopped || readyReceived) return;
        readyReceived = true;
        clearTimeout(timer);
        timer = setTimeout(fail, callbackDuration);
        try {
          for (const name of SHARE_APIS) {
            if (stopped) break;
            const result = sdk[name]({
              ...settings.share,
              success: () => {
                if (stopped) return;
                completed.add(name);
                if (completed.size === SHARE_APIS.length) finish(true);
              },
              fail,
              cancel: fail,
            });
            // The official API uses callbacks; a returned rejection also fails safely.
            if (result && typeof result.then === "function") {
              Promise.resolve(result).catch(fail);
            }
          }
        } catch { fail(); }
      });
      sdk.config(settings.config);
    } catch { fail(); }
  });
}

async function initialize(browserWindow, browserDocument, fetchImpl, sdkDuration, configDuration, readyDuration, callbackDuration) {
  try {
    const url = browserWindow.location.href.split("#")[0];
    const renderedCopy = readRenderedCopy(browserDocument);
    const AbortControllerImpl = browserWindow.AbortController || globalThis.AbortController;
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
    const payload = await withTimeout(async () => {
      const response = await fetchImpl("/api/wechat/home-share-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ url }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) throw new Error("wechat_config_unavailable");
      return response.json();
    }, configDuration, () => controller?.abort());
    if (payload?.enabled !== true) return false;
    const settings = readSettings(payload, url);
    if (!settings) return false;
    settings.share = { ...settings.share, ...renderedCopy };
    const sdk = await loadSdk(browserWindow, browserDocument, sdkDuration);
    return sdk ? await configureSharing(sdk, settings, readyDuration, callbackDuration) : false;
  } catch {
    // Browser sharing is optional. Never surface account/configuration errors
    // to parents, or couple SDK/network failure to the viewer or its controls.
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
    if (!browserWindow || !/MicroMessenger/iu.test(browserWindow.navigator?.userAgent || "") || !browserDocument || typeof fetchImpl !== "function"
      || !publicShareLink(browserWindow.location?.href)) return false;
    if (!initializationTasks.has(browserWindow)) {
      // A cold token/ticket refresh can make several serial server requests.
      // Its budget is independent of the short script and bridge deadlines.
      const sdkDuration = timeoutDuration(options.timeoutMs, 5000);
      const configDuration = timeoutDuration(options.configTimeoutMs ?? options.timeoutMs, 45000);
      const readyDuration = timeoutDuration(options.readyTimeoutMs ?? options.timeoutMs, 5000);
      const callbackDuration = timeoutDuration(options.callbackTimeoutMs ?? options.timeoutMs, 5000);
      initializationTasks.set(browserWindow, initialize(browserWindow, browserDocument, fetchImpl, sdkDuration, configDuration, readyDuration, callbackDuration));
    }
    return await initializationTasks.get(browserWindow);
  } catch { return false; }
}

// Optional enhancement: the independent viewer script never waits for it.
void initializeWeChatSharing();
