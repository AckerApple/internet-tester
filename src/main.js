import { p, tagElement, ValueSubject } from "taggedjs";
import { createAppTag } from "./app.tag.js";
import { createHistoryManager } from "./logic/history-manager.js";
import { createEndpointsManager } from "./logic/endpoints-manager.js";
import {
  detectLocalNetworkIp,
  fetchJsonWithTimeout,
  formatDuration,
  formatTimestamp,
  normalizeAsn,
  normalizeIpv4,
  normalizeIpv6,
} from "./utils.js";

const appRoot = document.querySelector("#app");
const runtime = window;

if (runtime.__internetTesterPollIntervalId) {
  clearInterval(runtime.__internetTesterPollIntervalId);
}
if (runtime.__internetTesterPublicIpIntervalId) {
  clearInterval(runtime.__internetTesterPublicIpIntervalId);
}
if (runtime.__internetTesterNextCheckTickerId) {
  clearInterval(runtime.__internetTesterNextCheckTickerId);
}

const DEFAULT_ENDPOINTS = [
  "https://www.google.com/generate_204",
  "https://www.youtube.com/generate_204",
];
const ENDPOINT_STORAGE_KEY = "internet-tester-endpoints-v1";
const HISTORY_EVENTS = [];

const status$ = new ValueSubject("Checking...");
const color$ = new ValueSubject("#f59e0b");
const failures$ = new ValueSubject(0);
const lastCheckedAt$ = new ValueSubject("--");
const soundsEnabled$ = new ValueSubject(false);
const soundButtonLabel$ = new ValueSubject("🔊 Enable sounds");
const intervalSeconds$ = new ValueSubject(5);
const historyView$ = new ValueSubject([]);
const historyDetails$ = new ValueSubject([]);
const nextCheckCountdownMs$ = new ValueSubject(intervalSeconds$.value * 1000);
const nextCheckProgressPercent$ = new ValueSubject(0);

const localIp$ = new ValueSubject("--");
const publicIpv4$ = new ValueSubject("Checking...");
const publicIpv6$ = new ValueSubject("Checking...");
const DEFAULT_GEO_PROFILE = {
  city: "--",
  region: "--",
  postal: "--",
  country: "--",
  isp: "--",
  asn: "--",
  timezone: "--",
};
const userGeo$ = new ValueSubject(DEFAULT_GEO_PROFILE);
const browserOnline$ = new ValueSubject(navigator.onLine ? "Yes" : "No");
const connectionType$ = new ValueSubject("Unknown");
const connectionRtt$ = new ValueSubject("Unknown");
const connectionDownlink$ = new ValueSubject("Unknown");
const totalChecks$ = new ValueSubject(0);
const successfulChecks$ = new ValueSubject(0);
const failedChecks$ = new ValueSubject(0);
const uptimePercent$ = new ValueSubject("0.0%");
const lastOutageDuration$ = new ValueSubject("--");

const lastEndpointChecked$ = new ValueSubject("--");
const endpointInput$ = new ValueSubject("");
const endpointInputError$ = new ValueSubject("");
const endpointListView$ = new ValueSubject([
  p.style`margin: 0; font-size: 0.85rem; opacity: 0.85;`("No websites configured."),
]);

const HISTORY_STORAGE_LIMIT = 600;
const HISTORY_VIEW_LIMIT = 20;
const FAILURE_LOG_DEDUP_MS = 60 * 1000;
const PUBLIC_IP_LOOKUP_INTERVAL_MS = 30 * 1000;

let endpointStates = [];
let audioContext;
let isOfflineState = false;
let checkInProgress = false;
let lastIpLookupAt = 0;
let nextEndpointIndex = 0;
let pollIntervalId;
let publicIpIntervalId;
let nextCheckTickerId;
let nextCheckDueAt = Date.now() + intervalSeconds$.value * 1000;
let initialOnlineLogged = false;

const history = createHistoryManager({
  historyEvents: HISTORY_EVENTS,
  historyView$,
  historyDetails$,
  lastOutageDuration$,
  formatTimestamp,
  formatDuration,
  storageLimit: HISTORY_STORAGE_LIMIT,
  viewLimit: HISTORY_VIEW_LIMIT,
  dedupMs: FAILURE_LOG_DEDUP_MS,
});

const endpoints = createEndpointsManager({
  defaults: DEFAULT_ENDPOINTS,
  storageKey: ENDPOINT_STORAGE_KEY,
  endpointInput$,
  endpointInputError$,
  endpointListView$,
  lastEndpointChecked$,
  ValueSubject,
});

function addEndpoint() {
  endpoints.addEndpoint();
  endpointStates = endpoints.getStates();
}

function onEndpointInput(event) {
  endpoints.onEndpointInput(event);
}

function applyGeoProfile(profile) {
  userGeo$.next({
    city: profile.city || "--",
    region: profile.region || "--",
    postal: profile.postal || "--",
    country: profile.country || "--",
    isp: profile.isp || "--",
    asn: profile.asn || "--",
    timezone: profile.timezone || "--",
  });
}

async function fetchGeoProfile() {
  const providers = [
    {
      url: "https://ipwho.is/",
      map: (info) => {
        if (!info?.success) {
          return null;
        }
        return {
          city: info.city,
          region: info.region,
          postal: info.postal,
          country: info.country,
          isp: info.connection?.isp,
          asn: info.connection?.asn ? `AS${info.connection.asn}` : "--",
          timezone: info.timezone?.utc || info.timezone?.id,
        };
      },
    },
    {
      url: "https://ipapi.co/json/",
      map: (info) => {
        if (!info || info.error) {
          return null;
        }
        return {
          city: info.city,
          region: info.region,
          postal: info.postal,
          country: info.country_name,
          isp: info.org,
          asn: normalizeAsn(info.asn),
          timezone: info.timezone || (info.utc_offset ? `UTC ${info.utc_offset}` : "--"),
        };
      },
    },
    {
      url: "https://ipinfo.io/json",
      map: (info) => {
        if (!info || info.bogon) {
          return null;
        }
        return {
          city: info.city,
          region: info.region,
          postal: info.postal,
          country: info.country,
          isp: info.org,
          asn: normalizeAsn(info.org),
          timezone: info.timezone,
        };
      },
    },
  ];

  for (const provider of providers) {
    try {
      const info = await fetchJsonWithTimeout(provider.url);
      const mapped = provider.map(info);
      if (mapped) {
        return mapped;
      }
    } catch {
      // Try next provider.
    }
  }

  return null;
}

function updateConnectionDetails() {
  browserOnline$.next(navigator.onLine ? "Yes" : "No");

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) {
    connectionType$.next("Unsupported");
    connectionRtt$.next("Unsupported");
    connectionDownlink$.next("Unsupported");
    return;
  }

  connectionType$.next(connection.effectiveType || "Unknown");
  connectionRtt$.next(Number.isFinite(connection.rtt) ? `${connection.rtt} ms` : "Unknown");
  connectionDownlink$.next(Number.isFinite(connection.downlink) ? `${connection.downlink} Mbps` : "Unknown");
}

async function refreshPublicIp(force = false) {
  const now = Date.now();
  if (!force && now - lastIpLookupAt < PUBLIC_IP_LOOKUP_INTERVAL_MS) {
    return;
  }
  lastIpLookupAt = now;

  const ipv4Providers = [
    "https://api4.ipify.org?format=json",
    "https://v4.ident.me/.json",
  ];
  const ipv6Providers = [
    "https://api6.ipify.org?format=json",
    "https://v6.ident.me/.json",
  ];

  let ipv4 = navigator.onLine ? "Unavailable" : "Unavailable (offline)";
  let ipv6 = navigator.onLine ? "Unavailable" : "Unavailable (offline)";

  for (const provider of ipv4Providers) {
    try {
      const data = await fetchJsonWithTimeout(provider);
      const parsedIpv4 = normalizeIpv4(data?.ip);
      if (parsedIpv4) {
        ipv4 = parsedIpv4;
        break;
      }
    } catch {
      // Try next provider.
    }
  }

  for (const provider of ipv6Providers) {
    try {
      const data = await fetchJsonWithTimeout(provider);
      const parsedIpv6 = normalizeIpv6(data?.ip);
      if (parsedIpv6) {
        ipv6 = parsedIpv6;
        break;
      }
    } catch {
      // Try next provider.
    }
  }

  publicIpv4$.next(ipv4);
  publicIpv6$.next(ipv6);

  const geoProfile = await fetchGeoProfile();
  if (geoProfile) {
    applyGeoProfile(geoProfile);
  }
}

function updateCounters(wasSuccessful) {
  const total = totalChecks$.value + 1;
  totalChecks$.next(total);

  if (wasSuccessful) {
    successfulChecks$.next(successfulChecks$.value + 1);
  } else {
    failedChecks$.next(failedChecks$.value + 1);
  }

  const uptime = (successfulChecks$.value / total) * 100;
  uptimePercent$.next(`${uptime.toFixed(1)}%`);
}

async function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return false;
    }
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return audioContext.state === "running";
}

function playNegativeSound() {
  if (!soundsEnabled$.value || !audioContext || audioContext.state !== "running") {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(280, now);
  oscillator.frequency.exponentialRampToValueAtTime(110, now + 0.35);

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start(now);
  oscillator.stop(now + 0.42);
}

async function toggleSounds() {
  if (soundsEnabled$.value) {
    soundsEnabled$.next(false);
    soundButtonLabel$.next("🔊 Enable sounds");
    return;
  }

  const enabled = await ensureAudioContext();
  soundsEnabled$.next(enabled);
  soundButtonLabel$.next(enabled ? "🔇 Disable sounds" : "🔊 Enable sounds");
}

function onIntervalChange(event) {
  const nextSeconds = Number.parseInt(event?.target?.value ?? "", 10);
  if (!Number.isFinite(nextSeconds) || nextSeconds <= 0) {
    return;
  }

  intervalSeconds$.next(nextSeconds);
  startPolling();
}

function updateNextCheckMeter() {
  const intervalMs = intervalSeconds$.value * 1000;
  const remainingMs = Math.max(0, nextCheckDueAt - Date.now());
  const elapsedMs = intervalMs - remainingMs;
  const progress = intervalMs > 0 ? (elapsedMs / intervalMs) * 100 : 0;

  nextCheckCountdownMs$.next(remainingMs);
  nextCheckProgressPercent$.next(Math.max(0, Math.min(100, progress)));
}

function resetNextCheckMeter() {
  nextCheckDueAt = Date.now() + intervalSeconds$.value * 1000;
  updateNextCheckMeter();
}

function startNextCheckTicker() {
  if (nextCheckTickerId) {
    clearInterval(nextCheckTickerId);
  }
  if (runtime.__internetTesterNextCheckTickerId) {
    clearInterval(runtime.__internetTesterNextCheckTickerId);
  }

  updateNextCheckMeter();
  nextCheckTickerId = setInterval(() => {
    updateNextCheckMeter();
  }, 100);
  runtime.__internetTesterNextCheckTickerId = nextCheckTickerId;
}

function startPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
  }
  if (runtime.__internetTesterPollIntervalId) {
    clearInterval(runtime.__internetTesterPollIntervalId);
  }

  pollIntervalId = setInterval(() => {
    checkInternet();
    resetNextCheckMeter();
  }, intervalSeconds$.value * 1000);
  runtime.__internetTesterPollIntervalId = pollIntervalId;

  resetNextCheckMeter();
  startNextCheckTicker();
}

function startPublicIpPolling() {
  if (publicIpIntervalId) {
    clearInterval(publicIpIntervalId);
  }
  if (runtime.__internetTesterPublicIpIntervalId) {
    clearInterval(runtime.__internetTesterPublicIpIntervalId);
  }

  refreshPublicIp(true);
  publicIpIntervalId = setInterval(() => {
    refreshPublicIp(true);
  }, PUBLIC_IP_LOOKUP_INTERVAL_MS);
  runtime.__internetTesterPublicIpIntervalId = publicIpIntervalId;
}

async function probe(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkInternet() {
  if (checkInProgress) {
    return;
  }
  checkInProgress = true;

  try {
    updateConnectionDetails();
    const checkTime = formatTimestamp(new Date());
    endpointStates = endpoints.getStates();

    if (!endpointStates.length) {
      status$.next("No websites configured");
      color$.next("#f59e0b");
      lastEndpointChecked$.next("--");
      return;
    }

    const safeIndex = nextEndpointIndex % endpointStates.length;
    const endpointState = endpointStates[safeIndex];
    const offlineByNavigator = navigator.onLine === false;
    const probeSucceeded = offlineByNavigator ? false : await probe(endpointState.url);

    endpointState.result$.next(probeSucceeded ? "Success" : "Failed");
    endpointState.lastCheckedAt$.next(checkTime);
    lastEndpointChecked$.next(endpointState.name);
    updateCounters(probeSucceeded);

    nextEndpointIndex = (safeIndex + 1) % endpointStates.length;

    if (probeSucceeded) {
      if (isOfflineState) {
        const logged = history.recordRestored();
        console.log("🟢 Restored");
        console.log("History after reconnect:", history.getEntries());
        console.log("Reconnect event logged:", logged);
      } else if (!initialOnlineLogged && !runtime.__internetTesterInitialOnlineLogged && history.isEmpty()) {
        runtime.__internetTesterInitialOnlineLogged = true;
        const logged = history.recordInitialOnline();
        console.log("History after initial online:", history.getEntries());
        console.log("Initial online event logged:", logged);
        initialOnlineLogged = true;
      }

      isOfflineState = false;
      refreshPublicIp();
      failures$.next(0);
      status$.next("Online");
      color$.next("#22c55e");
      console.log("Online");
    } else {
      const nextFailures = failures$.value + 1;
      failures$.next(nextFailures);

      if (nextFailures >= 2) {
        if (!isOfflineState) {
          const logged = history.recordFailure();
          console.log("History after offline:", history.getEntries());
          console.log("Offline event logged:", logged);
        }
        isOfflineState = true;
        status$.next("Offline");
        color$.next("#ef4444");
        playNegativeSound();
        console.log("🛑 Offline");
      } else {
        const logged = history.recordRetrying();
        console.log("History after retrying:", history.getEntries());
        console.log("Retrying event logged:", logged);
        status$.next("Retrying...");
        color$.next("#f59e0b");
        console.log("🟠 Retrying...");
      }
    }

    lastCheckedAt$.next(new Date().toLocaleTimeString());
  } finally {
    checkInProgress = false;
  }
}

const App = createAppTag({
  color$,
  status$,
  failures$,
  lastCheckedAt$,
  lastEndpointChecked$,
  nextCheckCountdownMs$,
  nextCheckProgressPercent$,
  intervalSeconds$,
  onIntervalChange,
  soundButtonLabel$,
  toggleSounds,
  historyView$,
  historyDetails$,
  endpointInput$,
  endpointInputError$,
  endpointListView$,
  onEndpointInput,
  addEndpoint,
  localIp$,
  publicIpv4$,
  publicIpv6$,
  userGeo$,
  browserOnline$,
  connectionType$,
  connectionRtt$,
  connectionDownlink$,
  totalChecks$,
  successfulChecks$,
  failedChecks$,
  uptimePercent$,
  lastOutageDuration$,
});

endpoints.init();
endpointStates = endpoints.getStates();

tagElement(App, appRoot);

detectLocalNetworkIp().then((ip) => localIp$.next(ip));
checkInternet();
startPolling();
startPublicIpPolling();

window.addEventListener("online", () => {
  updateConnectionDetails();
  refreshPublicIp(true);
});

window.addEventListener("offline", () => {
  updateConnectionDetails();
});

const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
if (connection && connection.addEventListener) {
  connection.addEventListener("change", updateConnectionDetails);
}
