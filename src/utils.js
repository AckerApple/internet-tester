export function formatTimestamp(date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatDuration(ms) {
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

export function normalizeAsn(value) {
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

export function normalizeIpv4(value) {
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

export function normalizeIpv6(value) {
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

export function isPrivateIpv4(ip) {
  return (
    typeof ip === "string" &&
    (ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip))
  );
}

export function getLocalIpFromHost(hostname) {
  const ipv4Match = (hostname || "").match(/^(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (!ipv4Match?.[1]) {
    return "--";
  }
  return normalizeIpv4(ipv4Match[1]) || "--";
}

export async function detectLocalNetworkIp(win = window) {
  const hostFallback = getLocalIpFromHost(win.location?.hostname);
  if (isPrivateIpv4(hostFallback)) {
    return hostFallback;
  }

  const RTC = win.RTCPeerConnection || win.webkitRTCPeerConnection || win.mozRTCPeerConnection;
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

export async function fetchJsonWithTimeout(url, timeoutMs = 5000) {
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
