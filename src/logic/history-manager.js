export function createHistoryManager({
  historyEvents,
  historyView$,
  historyDetails$,
  lastOutageDuration$,
  formatTimestamp,
  formatDuration,
  storageLimit = 600,
  viewLimit = 20,
  dedupMs = 60_000,
}) {
  function syncHistoryView(entries) {
    historyView$.next(entries.slice(0, viewLimit));
    if (historyDetails$) {
      historyDetails$.next([...entries]);
    }
  }

  function appendHistoryEvent(event) {
    const entries = historyEvents;
    const latest = entries[0];
    if (
      latest &&
      latest.type === event.type &&
      latest.label === event.label
    ) {
      return false;
    }
    if (
      latest &&
      latest.type === "online" &&
      event.type === "online" &&
      Math.abs((event.timestamp || 0) - (latest.timestamp || 0)) < 15_000
    ) {
      return false;
    }

    historyEvents.unshift(event);
    if (historyEvents.length > storageLimit) {
      historyEvents.length = storageLimit;
    }
    syncHistoryView(historyEvents);
    return true;
  }

  function recordFailure() {
    const now = Date.now();
    const entries = historyEvents;
    const lastFailureEntry = entries.find((entry) => entry.type === "failure");

    if (lastFailureEntry && now - lastFailureEntry.timestamp < dedupMs) {
      return false;
    }

    return appendHistoryEvent({
      type: "failure",
      icon: "🛑",
      timestamp: now,
      label: `Offline ${formatTimestamp(new Date(now))}`,
    });
  }

  function recordRetrying() {
    const now = Date.now();
    const latest = historyEvents[0];
    if (latest?.type === "retrying" && now - latest.timestamp < 15_000) {
      return false;
    }

    return appendHistoryEvent({
      type: "retrying",
      icon: "🟠",
      timestamp: now,
      label: `Retrying ${formatTimestamp(new Date(now))}`,
    });
  }

  function recordRestored() {
    const now = Date.now();
    const entries = historyEvents;
    const lastFailureEntry = entries.find((entry) => entry.type === "failure");
    const deltaMs = lastFailureEntry ? now - lastFailureEntry.timestamp : null;
    const delta = deltaMs ? formatDuration(deltaMs) : null;

    const created = appendHistoryEvent({
      type: "restored",
      icon: "🟢",
      timestamp: now,
      label: `Online ${formatTimestamp(new Date(now))}`,
      delta,
    });

    if (created && delta) {
      lastOutageDuration$.next(delta);
    }
    return created;
  }

  function recordInitialOnline() {
    const hasOnline = historyEvents.some((entry) => entry.type === "online");
    if (hasOnline) {
      return;
    }

    const now = Date.now();
    return appendHistoryEvent({
      type: "online",
      icon: "🟢",
      timestamp: now,
      label: `Online ${formatTimestamp(new Date(now))}`,
    });
  }

  function latestType() {
    return historyEvents[0]?.type || null;
  }

  function isEmpty() {
    return historyEvents.length === 0;
  }

  syncHistoryView(historyEvents);

  return {
    appendHistoryEvent,
    recordFailure,
    recordRetrying,
    recordRestored,
    recordInitialOnline,
    latestType,
    isEmpty,
    getEntries: () => [...historyEvents],
  };
}
