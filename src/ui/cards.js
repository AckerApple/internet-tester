import { a, button, div, h1, input, option, p, section, select, subscribe } from "taggedjs";

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

export function renderStatusCard({ status$, failures$, lastCheckedAt$, lastEndpointChecked$ }) {
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

export function renderHistoryCard({ historyView$ }) {
  return section.style`
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
      subscribe(historyView$, (history) => {
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
             `${index + 1}. ${entry.icon} ${entry.label}${entry.delta ? ` (delta ${entry.delta})` : ""}`
          ).key(entry.timestamp)
        });
      }),
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
  geoCity$,
  geoRegion$,
  geoPostal$,
  geoCountry$,
  geoIsp$,
  geoAsn$,
  geoTimezone$,
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
