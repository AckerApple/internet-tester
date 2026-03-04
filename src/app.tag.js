import { main, section, subscribe, tag } from "taggedjs";
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
  intervalSeconds$,
  onIntervalChange,
  soundButtonLabel$,
  toggleSounds,
  historyView$,
  endpointInput$,
  endpointInputError$,
  endpointListView$,
  onEndpointInput,
  addEndpoint,
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
      section.style`
        width: min(1200px, 100%);
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: stretch;
      `(
        renderStatusCard({ status$, failures$, lastCheckedAt$, lastEndpointChecked$ }),
        renderSettingsCard({ intervalSeconds$, onIntervalChange, soundButtonLabel$, toggleSounds }),
        renderHistoryCard({ historyView$ }),
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
        }),
      ),
    ),
  );
}
