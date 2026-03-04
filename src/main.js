import { button, option, select, subscribe, ValueSubject, h1, main, p, section, tag, tagElement } from "taggedjs";

const appRoot = document.querySelector("#app");

const status$ = new ValueSubject("Checking...");
const color$ = new ValueSubject("#f59e0b");
const failures$ = new ValueSubject(0);
const lastCheckedAt$ = new ValueSubject("--");
const soundsEnabled$ = new ValueSubject(false);
const soundButtonLabel$ = new ValueSubject("🔊 Enable no internet sounds");
const intervalSeconds$ = new ValueSubject(5);
const failureLog$ = new ValueSubject([]);
const failureLogText$ = new ValueSubject("No failures logged yet.");

const ENDPOINTS = [
  "https://www.google.com/generate_204",
  "https://www.youtube.com/generate_204",
];

let audioContext;
const FAILURE_LOG_LIMIT = 20;
const FAILURE_LOG_DEDUP_MS = 60 * 1000;
let isOfflineState = false;

function formatDateToMinute(date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function syncFailureLogText(entries) {
  if (!entries.length) {
    failureLogText$.next("No failures logged yet.");
    return;
  }

  failureLogText$.next(
    entries.map((entry, index) => `${index + 1}. ${entry.label}`).join("\n"),
  );
}

function recordFailure() {
  const now = Date.now();
  const entries = failureLog$.value;
  const lastEntry = entries[0];

  if (lastEntry && now - lastEntry.timestamp < FAILURE_LOG_DEDUP_MS) {
    return;
  }

  const nextEntries = [
    { timestamp: now, label: `🛑 ${formatDateToMinute(new Date(now))}` },
    ...entries,
  ].slice(0, FAILURE_LOG_LIMIT);

  failureLog$.next(nextEntries);
  syncFailureLogText(nextEntries);
}

function recordRestored() {
  const now = Date.now();
  const entries = failureLog$.value;
  const nextEntries = [
    { timestamp: now, label: `🟢 ${formatDateToMinute(new Date(now))}` },
    ...entries,
  ].slice(0, FAILURE_LOG_LIMIT);

  failureLog$.next(nextEntries);
  syncFailureLogText(nextEntries);
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

function onIntervalChange(event) {
  const nextSeconds = Number.parseInt(event?.target?.value ?? "", 10);
  if (!Number.isFinite(nextSeconds) || nextSeconds <= 0) {
    return;
  }

  intervalSeconds$.next(nextSeconds);
  startPolling();
}

const App = tag(() =>
  main.attr('style.background', subscribe(color$))
    .style`
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      color: #111827;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      transition: background 200ms ease;
    `(
    section.style`text-align: center; padding: 24px;`(
      h1.style`margin: 0 0 8px; font-size: 2rem;`
        (subscribe(status$)),
      
      p.style`margin: 0; font-size: 1rem;`
        ("Consecutive failures: ", subscribe(failures$)),
      
      p.style`margin: 8px 0 0; font-size: 0.9rem; opacity: 0.8;`
        ("Last checked: ", subscribe(lastCheckedAt$)),
      section.style`margin-top: 14px;`(
        p.style`margin: 0 0 6px; font-size: 0.95rem;`("Check every"),
        select
          .onChange(onIntervalChange)
          .attr("value", subscribe(intervalSeconds$))
          .style`padding: 8px 10px; border-radius: 8px; border: 0; font-size: 0.95rem;`(
            option.attr("value", "1")("1 second"),
            option.attr("value", "2")("2 seconds"),
            option.attr("value", "5")("5 seconds"),
            option.attr("value", "10")("10 seconds"),
            option.attr("value", "30")("30 seconds"),
          ),
      ),
      button
        .onClick(toggleSounds)
        .style`margin-top: 16px; padding: 10px 14px; border: 0; border-radius: 8px; cursor: pointer; font-size: 0.95rem;`
        (subscribe(soundButtonLabel$)),
      section.style`margin-top: 16px; text-align: left; max-width: 420px;`(
        p.style`margin: 0 0 6px; font-size: 0.95rem; font-weight: 600;`("Last 20 history"),
        p.style`margin: 0; font-size: 0.9rem; white-space: pre-line; line-height: 1.35;`(
          subscribe(failureLogText$),
        ),
      ),
    ),
  ),
);

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
  const results = await Promise.allSettled(ENDPOINTS.map((url) => probe(url)));

  const anySucceeded = results.some(
    (result) => result.status === "fulfilled" && result.value === true,
  );

  if (anySucceeded) {
    if (isOfflineState) {
      recordRestored();
    }
    isOfflineState = false;
    failures$.next(0);
    status$.next("Online");
    color$.next("#22c55e");
    console.log("Online")
  } else {
    recordFailure();
    const nextFailures = failures$.value + 1;
    failures$.next(nextFailures);

    if (nextFailures >= 2) {
      isOfflineState = true;
      status$.next("Offline");
      console.log("🛑 Offline")
      color$.next("#ef4444");
      playNegativeSound();
    } else {
      console.log("🟠 Retrying...")
      status$.next("Retrying...");
      color$.next("#f59e0b");
    }
  }

  lastCheckedAt$.next(new Date().toLocaleTimeString());
}

tagElement(App, appRoot);

let pollIntervalId;

function startPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
  }

  pollIntervalId = setInterval(checkInternet, intervalSeconds$.value * 1000);
}

checkInternet();
startPolling();
