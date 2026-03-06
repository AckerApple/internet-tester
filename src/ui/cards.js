import { a, button, dialog, div, h1, input, option, p, section, select, subscribe } from "taggedjs";

function historyColor(type) {
  if (type === "failure") {
    return "#b91c1c";
  }
  if (type === "retrying") {
    return "#b45309";
  }
  return "#166534";
}

function historyWeight(type) {
  if (type === "failure") {
    return "700";
  }
  if (type === "retrying") {
    return "600";
  }
  return "500";
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

function renderCountdown(msRemaining) {
  const seconds = Math.max(0, msRemaining) / 1000;
  return `${seconds.toFixed(1)}s`;
}

function renderProgressWidth(progress) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  return `${safeProgress}%`;
}

function resolveHistoryDialog(event) {
  const sourceElement = event?.currentTarget || event?.target || null;
  const sectionEl = sourceElement?.closest?.("section");
  const bySection = sectionEl?.querySelector?.('[data-role="history-details-dialog"]');
  if (bySection) {
    return bySection;
  }

  const documentRef = sourceElement?.ownerDocument || document;
  return (
    documentRef.querySelector('[data-role="history-details-dialog"][open]') ||
    documentRef.querySelector('[data-role="history-details-dialog"]')
  );
}

function closeDialog(dialogEl) {
  if (!dialogEl) {
    return;
  }

  if (typeof dialogEl.close === "function") {
    try {
      dialogEl.close();
      return;
    } catch (error) {
      console.warn("Failed to close history dialog with close().", error);
    }
  }

  dialogEl.removeAttribute("open");
}

function closeHistoryDetails(event) {
  const detailsDialog = resolveHistoryDialog(event);
  closeDialog(detailsDialog);
}

function openHistoryDetails(event) {
  const detailsDialog = resolveHistoryDialog(event);

  if (!detailsDialog) {
    console.warn("History details dialog not found.");
    return;
  }

  if (typeof detailsDialog.showModal === "function") {
    try {
      detailsDialog.showModal();
    } catch (error) {
      console.warn("Unable to open history details dialog with showModal.", error);
      detailsDialog.setAttribute("open", "");
    }
    return;
  }

  console.warn("History details dialog does not support showModal; using open attribute fallback.");
  detailsDialog.setAttribute("open", "");
}

function closeHistoryDetailsOnBackdrop(event) {
  const detailsDialog = event?.currentTarget || event?.target;
  if (detailsDialog && event?.target === detailsDialog && detailsDialog.open) {
    closeDialog(detailsDialog);
  }
}

export function renderHistoryCard({ historyView$, historyDetails$ }) {
  function renderHistoryEntries(history) {
    if (!history?.length) {
      return [
        p.style`margin: 0; font-size: 0.9rem; opacity: 0.85;`("No history yet."),
      ];
    }

    return history.map((entry, index) => {
      return p.style`
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.35;
        color: ${historyColor(entry.type)};
        font-weight: ${historyWeight(entry.type)};
      `(
        `${index + 1}. ${entry.icon} ${entry.label}${entry.delta ? ` (delta ${entry.delta})` : ""}`,
      ).key(entry.timestamp);
    });
  }

  return section.style`
    background: rgba(255,255,255,0.74);
    border-radius: 10px;
    padding: 12px;
    text-align: left;
    max-height: 42vh;
    overflow: auto;
    flex: 1 1 340px;
  `(
    div.style`display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;`(
      p.style`margin: 0; font-size: 0.95rem; font-weight: 600;`("Last 20 history"),
      button
        .onClick(openHistoryDetails)
        .style`padding: 4px 10px; border: 0; border-radius: 7px; cursor: pointer; font-size: 0.8rem; text-transform: lowercase;`(
          "details",
        ),
    ),
    div.style`display: grid; gap: 4px;`(
      subscribe(historyView$, renderHistoryEntries),
    ),
    dialog
      .attr("data-role", "history-details-dialog")
      .onClick(closeHistoryDetailsOnBackdrop)
      .style`
        width: min(900px, calc(100vw - 32px));
        max-height: min(80vh, 760px);
        border: 0;
        border-radius: 12px;
        padding: 14px;
      `(
        div.style`display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px;`(
          p.style`margin: 0; font-size: 1rem; font-weight: 700;`("History details (up to 600)"),
          button
            .onClick(closeHistoryDetails)
            .style`padding: 5px 10px; border: 0; border-radius: 7px; cursor: pointer; font-size: 0.82rem;`("Close"),
        ),
        div.style`display: grid; gap: 4px; max-height: min(64vh, 640px); overflow: auto;`(
          subscribe(historyDetails$, renderHistoryEntries),
        ),
      ),
  );
}

export function renderStatusCard({
  status$,
  failures$,
  lastCheckedAt$,
  lastEndpointChecked$,
  nextCheckCountdownMs$,
  nextCheckProgressPercent$,
}) {
  return section.style`
    background: rgba(255,255,255,0.74);
    border-radius: 10px;
    padding: 12px;
    text-align: center;
    flex: 1 1 260px;
  `(
    h1.style`margin: 0 0 8px; font-size: clamp(1.5rem, 3.5vw, 2.2rem);`(subscribe(status$)),
    p.style`margin: 0; font-size: 1rem;`("Consecutive failures: ", subscribe(failures$)),
    p.style`margin: 6px 0 0; font-size: 0.9rem; opacity: 0.85;`("Last checked: ", subscribe(lastCheckedAt$)),
    p.style`margin: 4px 0 0; font-size: 0.9rem; opacity: 0.9;`(
      "Last endpoint checked: ",
      subscribe(lastEndpointChecked$),
    ),
    p.style`margin: 10px 0 4px; font-size: 0.85rem; opacity: 0.9;`(
      "Next check in: ",
      subscribe(nextCheckCountdownMs$, renderCountdown),
    ),
    div.style`
      width: 100%;
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(17, 24, 39, 0.14);
    `(
      div
        .attr("style.width", subscribe(nextCheckProgressPercent$, renderProgressWidth))
        .style`
          height: 100%;
          background: linear-gradient(90deg, #0ea5e9, #22c55e);
          transition: width 120ms linear;
        `,
    ),
  );
}

export function renderSettingsCard({
  intervalSeconds$,
  onIntervalChange,
  soundButtonLabel$,
  toggleSounds,
}) {
  return section.style`
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
  );
}

export function renderWebsitesCard({
  endpointInput$,
  endpointInputError$,
  endpointListView$,
  onEndpointInput,
  addEndpoint,
}) {
  return section.style`
    background: rgba(255,255,255,0.74);
    border-radius: 10px;
    padding: 12px;
    text-align: left;
    flex: 1 1 300px;
  `(
    p.style`margin: 0 0 6px; font-size: 0.95rem; font-weight: 600;`("Websites checked"),
    div.style`display:flex; gap:8px; align-items:flex-start;`(
      input
        .onInput(onEndpointInput)
        .attr("value", subscribe(endpointInput$))
        .attr("placeholder", "google.com/generate_204")
        .style`flex:1 1 auto; padding:8px; border:0; border-radius:8px; font-size:0.85rem;`,
      button
        .onClick(addEndpoint)
        .style`padding:8px 10px; border:0; border-radius:8px; cursor:pointer; font-size:0.85rem; flex:0 0 auto;`(
          "Add",
        ),
    ),
    p.style`margin: 6px 0 0; font-size: 0.75rem; color: #b91c1c; min-height: 1em;`(
      subscribe(endpointInputError$),
    ),
    div.style`display: grid; gap: 4px; margin-top: 6px;`(
      subscribe(endpointListView$),
    ),
  );
}

export function renderNetworkCard({
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
}) {
  function geoValue(field) {
    return subscribe(userGeo$, (profile) => profile?.[field] || "--");
  }

  return section.style`
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
      detailRow("City", geoValue("city")),
      detailRow("State/Region", geoValue("region")),
      detailRow("Postal Code", geoValue("postal")),
      detailRow("Country", geoValue("country")),
      detailRow("ISP", geoValue("isp")),
      detailRow("ASN", geoValue("asn")),
      detailRow("Time Zone", geoValue("timezone")),
      detailRow("Browser online", subscribe(browserOnline$)),
      detailRow("Connection type", subscribe(connectionType$)),
      detailRow("RTT", subscribe(connectionRtt$)),
      detailRow("Downlink", subscribe(connectionDownlink$)),
      detailRow("Checks", subscribe(totalChecks$)),
      detailRow("Success / Fail", [subscribe(successfulChecks$), " / ", subscribe(failedChecks$)]),
      detailRow("Uptime ratio", subscribe(uptimePercent$)),
      detailRow("Last outage", subscribe(lastOutageDuration$)),
    ),
    p.style`margin: 8px 0 0; font-size: 0.72rem; opacity: 0.8;`(
      "Geo/IP data credit: ",
      a
        .attr("href", "https://ipapi.co/")
        .attr("target", "_blank")
        .attr("rel", "noopener noreferrer")
        .style`color: #0f766e; text-decoration: underline;`("ipapi.co"),
    ),
  );
}
