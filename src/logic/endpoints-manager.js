import { button, div, p, subscribe } from "taggedjs";

export function createEndpointsManager({
  defaults,
  storageKey,
  endpointInput$,
  endpointInputError$,
  endpointListView$,
  lastEndpointChecked$,
  ValueSubject,
}) {
  let endpointStates = [];

  function normalizeEndpointUrl(inputValue) {
    const raw = (inputValue || "").trim();
    if (!raw) {
      return null;
    }

    const withProtocol = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(withProtocol);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function endpointName(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  function createEndpointState(url) {
    return {
      url,
      name: endpointName(url),
      result$: new ValueSubject("Pending"),
      lastCheckedAt$: new ValueSubject("--"),
    };
  }

  function saveToStorage() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(endpointStates.map((entry) => entry.url)));
    } catch {
      // Ignore storage errors.
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return defaults;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return defaults;
      }

      const normalized = parsed.map((url) => normalizeEndpointUrl(url)).filter(Boolean);
      const unique = [...new Set(normalized)];
      return unique.length ? unique : defaults;
    } catch {
      return defaults;
    }
  }

  function removeEndpoint(url) {
    const index = endpointStates.findIndex((entry) => entry.url === url);
    if (index < 0) {
      return;
    }

    endpointStates.splice(index, 1);
    if (!endpointStates.length) {
      lastEndpointChecked$.next("--");
    }
    saveToStorage();
    syncView();
  }

  function syncView() {
    if (!endpointStates.length) {
      endpointListView$.next([
        p.style`margin: 0; font-size: 0.85rem; opacity: 0.85;`("No websites configured."),
      ]);
      return;
    }

    endpointListView$.next(
      endpointStates.map((entry) =>
        div.style`padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.42);`(
          div.style`display:flex; justify-content:space-between; align-items:flex-start; gap:8px;`(
            p.style`margin: 0; font-size: 1rem; font-weight: 700; color: #111827; overflow-wrap:anywhere;`(
              entry.name,
            ),
            button
              .onClick(() => removeEndpoint(entry.url))
              .style`padding:2px 8px; border:0; border-radius:6px; cursor:pointer; font-size:0.75rem; flex:0 0 auto;`(
                "Remove",
              ),
          ),
          p.style`margin: 2px 0 0; font-size: 0.78rem; line-height: 1.3;`(
            subscribe(entry.result$),
            " • last checked ",
            subscribe(entry.lastCheckedAt$),
          ),
        ),
      ),
    );
  }

  function addEndpoint() {
    const normalizedUrl = normalizeEndpointUrl(endpointInput$.value);
    if (!normalizedUrl) {
      endpointInputError$.next("Enter a valid website URL or hostname.");
      return;
    }

    if (endpointStates.some((entry) => entry.url === normalizedUrl)) {
      endpointInputError$.next("That website is already in the list.");
      return;
    }

    endpointStates.push(createEndpointState(normalizedUrl));
    endpointInput$.next("");
    endpointInputError$.next("");
    saveToStorage();
    syncView();
  }

  function onEndpointInput(event) {
    endpointInput$.next(event?.target?.value || "");
    if (endpointInputError$.value) {
      endpointInputError$.next("");
    }
  }

  function init() {
    endpointStates = loadFromStorage().map((url) => createEndpointState(url));
    saveToStorage();
    syncView();
  }

  return {
    init,
    addEndpoint,
    onEndpointInput,
    getStates: () => endpointStates,
  };
}
