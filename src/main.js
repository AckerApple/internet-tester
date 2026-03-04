import { callback, button, div, option, select, subscribe, ValueSubject, h1, main, p, section, tag, tagElement } from "taggedjs";

const appRoot = document.querySelector("#app");

const ENDPOINTS = [
  "https://www.google.com/generate_204",
  "https://www.youtube.com/generate_204",
];

const status$ = new ValueSubject("Checking...");
const color$ = new ValueSubject("#f59e0b");
const failures$ = new ValueSubject(0);
const lastCheckedAt$ = new ValueSubject("--");
const soundsEnabled$ = new ValueSubject(false);
const soundButtonLabel$ = new ValueSubject("🔊 Enable no internet sounds");
const intervalSeconds$ = new ValueSubject(5);
const failureLog$ = new ValueSubject([]);
const historyView$ = new ValueSubject([
  p.style`margin: 0; font-size: 0.9rem; opacity: 0.85;`("No history yet."),
]);
const localIp$ = new ValueSubject("--");
const publicIp$ = new ValueSubject("Checking...");
const publicIpv4$ = new ValueSubject("Checking...");
const publicIpv6$ = new ValueSubject("Checking...");
const geoCity$ = new ValueSubject("--");
const geoRegion$ = new ValueSubject("--");
const geoPostal$ = new ValueSubject("--");
const geoCountry$ = new ValueSubject("--");
const geoIsp$ = new ValueSubject("--");
const geoAsn$ = new ValueSubject("--");
const geoTimezone$ = new ValueSubject("--");
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
const endpointStates = ENDPOINTS.map((url) => ({
  url,
  name: new URL(url).hostname,
  result$: new ValueSubject("Pending"),
  lastCheckedAt$: new ValueSubject("--"),
}));

let audioContext;
const FAILURE_LOG_LIMIT = 20;
const FAILURE_LOG_DEDUP_MS = 60 * 1000;
const PUBLIC_IP_LOOKUP_INTERVAL_MS = 30 * 1000;
let isOfflineState = false;
let restorePending = false;
let checkInProgress = false;
let lastIpLookupAt = 0;
let nextEndpointIndex = 0;

function formatDateToMinute(date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "--";
  }

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function syncHistoryView(entries) {
  if (!entries.length) {
    historyView$.next([
      p.style`margin: 0; font-size: 0.9rem; opacity: 0.85;`("No history yet."),
    ]);
    return;
  }

  historyView$.next(entries.map((entry, index) =>
    p.style`
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.35;
      color: ${entry.type === "failure" ? "#b91c1c" : "#166534"};
      font-weight: ${entry.type === "failure" ? "700" : "500"};
    `(
      `${index + 1}. ${entry.icon} ${entry.label}${entry.delta ? ` (delta ${entry.delta})` : ""}`,
    ),
  ));
}

function recordFailure() {
  const now = Date.now();
  const entries = failureLog$.value;
  const lastFailureEntry = entries.find((entry) => entry.type === "failure");

  if (lastFailureEntry && now - lastFailureEntry.timestamp < FAILURE_LOG_DEDUP_MS) {
    return false;
  }

  const nextEntries = [
    {
      type: "failure",
      icon: "🛑",
      timestamp: now,
      label: formatDateToMinute(new Date(now)),
    },
    ...entries,
  ].slice(0, FAILURE_LOG_LIMIT);

  failureLog$.next(nextEntries);
  syncHistoryView(nextEntries);
  return true;
}

function recordRestored() {
  const now = Date.now();
  const entries = failureLog$.value;
  const lastFailureEntry = entries.find((entry) => entry.type === "failure");
  const deltaMs = lastFailureEntry ? now - lastFailureEntry.timestamp : null;
  const delta = deltaMs ? formatDuration(deltaMs) : null;

  const nextEntries = [
    {
      type: "restored",
      icon: "🟢",
      timestamp: now,
      label: formatDateToMinute(new Date(now)),
      delta,
    },
    ...entries,
  ].slice(0, FAILURE_LOG_LIMIT);

  failureLog$.next(nextEntries);
  syncHistoryView(nextEntries);

  if (delta) {
    lastOutageDuration$.next(delta);
  }
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
  connectionDownlink$.next(
    Number.isFinite(connection.downlink) ? `${connection.downlink} Mbps` : "Unknown",
  );
}

async function fetchJsonWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function applyGeoProfile(profile) {
  geoCity$.next(profile.city || "--");
  geoRegion$.next(profile.region || "--");
  geoPostal$.next(profile.postal || "--");
  geoCountry$.next(profile.country || "--");
  geoIsp$.next(profile.isp || "--");
  geoAsn$.next(profile.asn || "--");
  geoTimezone$.next(profile.timezone || "--");
}

function normalizeAsn(value) {
  if (!value || typeof value !== "string") {
    return "--";
  }
  const direct = value.match(/AS\d+/i);
  if (direct?.[0]) {
    return direct[0].toUpperCase();
  }
  if (/^\d+$/.test(value.trim())) {
    return `AS${value.trim()}`;
  }
  return "--";
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
      // try next provider
    }
  }

  return null;
}

function getLocalIpFromHost() {
  const host = window.location.hostname;
  const ipv4Match = host.match(/^(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (!ipv4Match?.[1]) {
    return "--";
  }
  return normalizeIpv4(ipv4Match[1]) || "--";
}

function isPrivateIpv4(ip) {
  return (
    typeof ip === "string" &&
    (ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip))
  );
}

async function detectLocalNetworkIp() {
  const hostFallback = getLocalIpFromHost();
  if (isPrivateIpv4(hostFallback)) {
    return hostFallback;
  }

  const RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  if (!RTC) {
    return hostFallback !== "--" ? hostFallback : "Unavailable";
  }

  try {
    const pc = new RTC({ iceServers: [] });
    const foundIps = new Set();

    pc.createDataChannel("local-ip-probe");

    const done = new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2500);
      pc.onicecandidate = (event) => {
        if (!event.candidate || !event.candidate.candidate) {
          clearTimeout(timeout);
          resolve();
          return;
        }

        const match = event.candidate.candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
        if (match?.[1]) {
          const normalized = normalizeIpv4(match[1]);
          if (normalized) {
            foundIps.add(normalized);
          }
        }
      };
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await done;
    pc.close();

    const privateCandidate = [...foundIps].find((ip) => isPrivateIpv4(ip));
    if (privateCandidate) {
      return privateCandidate;
    }

    return hostFallback !== "--" ? hostFallback : "Unavailable";
  } catch {
    return hostFallback !== "--" ? hostFallback : "Unavailable";
  }
}

function normalizeIpv4(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.trim().match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/);
  if (!match?.[1]) {
    return null;
  }

  const parts = match[1].split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.join(".");
}

function normalizeIpv6(value) {
  if (typeof value !== "string") {
    return null;
  }
  const candidate = value.trim();
  if (!candidate.includes(":")) {
    return null;
  }
  const match = candidate.match(/\b([0-9a-fA-F:]{2,})\b/);
  return match?.[1] || null;
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
      // try next provider
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
      // try next provider
    }
  }

  publicIpv4$.next(ipv4);
  publicIp$.next(ipv4);
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
    soundButtonLabel$.next("🔊 Enable no internet sounds");
    return;
  }

  const enabled = await ensureAudioContext();
  soundsEnabled$.next(enabled);
  soundButtonLabel$.next(
    enabled ? "🔇 Disable no internet sounds" : "🔊 Enable no internet sounds",
  );
}

function detailRow(label, value) {
  return div.style`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    font-size: 0.9rem;
    min-width: 0;
  `(
    p.style`margin: 0; opacity: 0.85; font-weight: 600; min-width: 120px; flex: 0 1 120px;`(label),
    p.style`margin: 0; flex: 1 1 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word;`(value),
  );
}


const App = tag(() => {
  let pollIntervalId;
  let publicIpIntervalId;

  function onIntervalChange(event) {
    const nextSeconds = Number.parseInt(event?.target?.value ?? "", 10);
    if (!Number.isFinite(nextSeconds) || nextSeconds <= 0) {
      return;
    }

    intervalSeconds$.next(nextSeconds);
    startPolling();
  }

  function startPolling() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }

    pollIntervalId = setInterval(callback(() => {
      checkInternet()
    }), intervalSeconds$.value * 1000);
  }

  function startPublicIpPolling() {
    if (publicIpIntervalId) {
      clearInterval(publicIpIntervalId);
    }

    refreshPublicIp(true);
    publicIpIntervalId = setInterval(callback(() => {
      refreshPublicIp(true);
    }), PUBLIC_IP_LOOKUP_INTERVAL_MS);
  }

  startPolling();
  startPublicIpPolling();

  return main.attr('style.background', subscribe(color$))
    .style`
      min-height: 100vh;
      margin: 0;
      display: flex;
      align-items: stretch;
      justify-content: center;
      color: #111827;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      transition: background 200ms ease;
      padding: 10px;
      box-sizing: border-box;
    `(
    section.style`
      width: min(1200px, 100%);
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: stretch;
    `(
      section.style`
        background: rgba(255,255,255,0.74);
        border-radius: 10px;
        padding: 12px;
        text-align: center;
        flex: 1 1 260px;
      `(
        h1.style`margin: 0 0 8px; font-size: clamp(1.5rem, 3.5vw, 2.2rem);`(subscribe(status$)),
        p.style`margin: 0; font-size: 1rem;`("Consecutive failures: ", subscribe(failures$)),
        p.style`margin: 6px 0 0; font-size: 0.9rem; opacity: 0.85;`("Last checked: ", subscribe(lastCheckedAt$)),
        p.style`margin: 4px 0 0; font-size: 0.9rem; opacity: 0.9;`("Last endpoint checked: ", subscribe(lastEndpointChecked$)),
      ),
      section.style`
        background: rgba(255,255,255,0.74);
        border-radius: 10px;
        padding: 12px;
        flex: 1 1 260px;
      `(
        p.style`margin: 0 0 6px; font-size: 0.95rem; font-weight: 600;`("Settings"),
        p.style`margin: 0 0 6px; font-size: 0.95rem;`("Check every"),
        select
          .onChange(onIntervalChange)
          .attr("value", subscribe(intervalSeconds$))
          .style`width: 100%; padding: 8px 10px; border-radius: 8px; border: 0; font-size: 0.95rem;`(
            option.attr("value", "1")("1 second"),
            option.attr("value", "2")("2 seconds"),
            option.attr("value", "5")("5 seconds"),
            option.attr("value", "10")("10 seconds"),
            option.attr("value", "30")("30 seconds"),
          ),
        button
          .onClick(toggleSounds)
          .style`margin-top: 10px; width: 100%; padding: 10px 14px; border: 0; border-radius: 8px; cursor: pointer; font-size: 0.95rem;`(
            subscribe(soundButtonLabel$),
          ),
      ),
      section.style`
        background: rgba(255,255,255,0.74);
        border-radius: 10px;
        padding: 12px;
        text-align: left;
        max-height: 42vh;
        overflow: auto;
        flex: 1 1 340px;
      `(
        p.style`margin: 0 0 6px; font-size: 0.95rem; font-weight: 600;`("Last 20 history"),
        div.style`display: grid; gap: 4px;`(
          subscribe(historyView$),
        ),
      ),
      section.style`
        background: rgba(255,255,255,0.74);
        border-radius: 10px;
        padding: 12px;
        text-align: left;
        flex: 1 1 300px;
      `(
        p.style`margin: 0 0 6px; font-size: 0.95rem; font-weight: 600;`("Websites checked"),
        endpointStates.length
          ? div.style`display: grid; gap: 4px;`(
            endpointStates.map((entry) =>
              div.style`padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.42);`(
                p.style`margin: 0; font-size: 1rem; font-weight: 700; color: #111827;`(entry.name),
                p.style`
                  margin: 2px 0 0;
                  font-size: 0.78rem;
                  line-height: 1.3;
                `(
                  subscribe(entry.result$),
                  " • last checked ",
                  subscribe(entry.lastCheckedAt$),
                ),
              ),
            ),
          )
          : p.style`margin: 0; font-size: 0.85rem; opacity: 0.85;`("No websites configured."),
      ),
      section.style`
        background: rgba(255,255,255,0.74);
        border-radius: 10px;
        padding: 12px;
        text-align: left;
        flex: 1 1 300px;
        max-height: 42vh;
        overflow: auto;
        overflow-x: hidden;
      `(
        p.style`margin: 0 0 6px; font-size: 0.95rem; font-weight: 600;`("Network details"),
        div.style`display: grid; gap: 4px;`(
          detailRow("Local Network IP", subscribe(localIp$)),
          detailRow("Public WAN IPv4", subscribe(publicIpv4$)),
          detailRow("Public WAN IPv6", subscribe(publicIpv6$)),
          detailRow("City", subscribe(geoCity$)),
          detailRow("State/Region", subscribe(geoRegion$)),
          detailRow("Postal Code", subscribe(geoPostal$)),
          detailRow("Country", subscribe(geoCountry$)),
          detailRow("ISP", subscribe(geoIsp$)),
          detailRow("ASN", subscribe(geoAsn$)),
          detailRow("Time Zone", subscribe(geoTimezone$)),
          detailRow("Browser online", subscribe(browserOnline$)),
          detailRow("Connection type", subscribe(connectionType$)),
          detailRow("RTT", subscribe(connectionRtt$)),
          detailRow("Downlink", subscribe(connectionDownlink$)),
          detailRow("Checks", subscribe(totalChecks$)),
          detailRow("Success / Fail", [subscribe(successfulChecks$), " / ", subscribe(failedChecks$)]),
          detailRow("Uptime ratio", subscribe(uptimePercent$)),
          detailRow("Last outage", subscribe(lastOutageDuration$)),
        ),
      ),
    ),
  ) 
})

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
    const checkTime = formatDateTime(new Date());
    const endpointState = endpointStates[nextEndpointIndex];
    if (!endpointState) {
      return;
    }

    const probeSucceeded = await probe(endpointState.url);
    endpointState.result$.next(probeSucceeded ? "Success" : "Failed");
    endpointState.lastCheckedAt$.next(checkTime);
    lastEndpointChecked$.next(endpointState.name);
    updateCounters(probeSucceeded);

    nextEndpointIndex = (nextEndpointIndex + 1) % endpointStates.length;

    if (probeSucceeded) {
      if (restorePending || isOfflineState) {
        recordRestored();
        restorePending = false;
      }
      isOfflineState = false;
      refreshPublicIp();
      failures$.next(0);
      status$.next("Online");
      color$.next("#22c55e");
      console.log("Online");
    } else {
      const failureLogged = recordFailure();
      if (failureLogged) {
        restorePending = true;
      }
      const nextFailures = failures$.value + 1;
      failures$.next(nextFailures);

      if (nextFailures >= 2) {
        isOfflineState = true;
        status$.next("Offline");
        console.log("🛑 Offline");
        color$.next("#ef4444");
        playNegativeSound();
      } else {
        console.log("🟠 Retrying...");
        status$.next("Retrying...");
        color$.next("#f59e0b");
      }
    }
    lastCheckedAt$.next(new Date().toLocaleTimeString());
  } finally {
    checkInProgress = false;
  }
}

tagElement(App, appRoot);

detectLocalNetworkIp().then((ip) => localIp$.next(ip));
checkInternet();

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
