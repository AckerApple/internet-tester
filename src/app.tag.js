import { a, main, p, section, subscribe, tag } from "taggedjs";
import {
  renderHistoryCard,
  renderNetworkCard,
  renderSettingsCard,
  renderStatusCard,
  renderWebsitesCard,
} from "./ui/cards.js";

export function createAppTag({
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
}) {
  return tag(() =>
    main.attr("style.background", subscribe(color$)).style`
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
      section.style`width: min(1200px, 100%); display: flex; flex-direction: column; gap: 10px;`(
        section.style`
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: stretch;
        `(
          renderStatusCard({
            status$,
            failures$,
            lastCheckedAt$,
            lastEndpointChecked$,
            nextCheckCountdownMs$,
            nextCheckProgressPercent$,
          }),
          renderSettingsCard({ intervalSeconds$, onIntervalChange, soundButtonLabel$, toggleSounds }),
          renderHistoryCard({ historyView$, historyDetails$ }),
          renderWebsitesCard({
            endpointInput$,
            endpointInputError$,
            endpointListView$,
            onEndpointInput,
            addEndpoint,
          }),
          renderNetworkCard({
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
          }),
        ),
        p.style`margin: 2px 0 0; font-size: 0.72rem; opacity: 0.85; text-align: center;`(
          a
            .attr("href", "https://github.com/AckerApple/internet-tester")
            .attr("target", "_blank")
            .attr("rel", "noopener noreferrer")
            .style`color: #0f766e; text-decoration: underline;`("code base"),
        ),
      ),
    ),
  );
}
