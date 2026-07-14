import { Icons } from "./TeslaIcons";
import { formatDuration, formatTripName } from "./format";
import { RouteReview } from "./RouteReview";
import type { Trip, TripDetail } from "./types";

type TripsViewProps = {
  trips: Trip[];
  selectedTripId: string;
  tripDetail: TripDetail | null;
  previewData: boolean;
  onSelectTrip: (tripId: string) => void;
};

export function TripsView({ trips, selectedTripId, tripDetail, previewData, onSelectTrip }: TripsViewProps) {
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) || trips[0];

  return (
    <section className="trips-view-v2" aria-label="Tesla trip history">
      <header className="section-heading">
        <span><small>JOURNEYS</small><h1>Trip history</h1></span>
        <span className="heading-count">{trips.length}</span>
      </header>

      {!selectedTrip ? (
        <div className="empty-state-v2"><Icons.Trips size={38} /><h2>No recorded trips</h2><p>Your first drive appears after telemetry samples reach the existing trips API.</p></div>
      ) : (
        <>
          <article className="trip-detail-card">
            <header className="trip-detail-header">
              <span><small>{new Date(selectedTrip.started_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</small><h2>{formatTripName(selectedTrip)}</h2></span>
              <span className="trip-total"><strong>{selectedTrip.distance_km}</strong><small>km</small></span>
            </header>
            {previewData && <span className="preview-chip trip-preview"><Icons.Eye size={12} /> Preview route</span>}
            <RouteReview trip={tripDetail?.id === selectedTrip.id ? tripDetail : null} />
            <div className="trip-metric-grid">
              <span><strong>{formatDuration(selectedTrip.drive_seconds)}</strong><small>Drive time</small></span>
              <span><strong>{selectedTrip.avg_speed_kmh}</strong><small>Avg km/h</small></span>
              <span><strong>{selectedTrip.max_speed_kmh}</strong><small>Max km/h</small></span>
              <span><strong>{Math.max(0, selectedTrip.start_battery - selectedTrip.end_battery)}%</strong><small>Battery used</small></span>
            </div>
            {selectedTrip.charge_events.length > 0 && (
              <div className="charge-events">
                <h3><Icons.Bolt size={16} /> Charging on this journey</h3>
                {selectedTrip.charge_events.map((event) => (
                  <div key={event.id}><span>{event.start_battery}% → {event.end_battery}%</span><strong>{Math.round(event.max_power_kw)} kW max</strong></div>
                ))}
              </div>
            )}
          </article>

          <div className="trip-list-v2">
            {trips.map((trip) => (
              <button key={trip.id} className={trip.id === selectedTrip.id ? "is-selected" : ""} onClick={() => onSelectTrip(trip.id)} aria-pressed={trip.id === selectedTrip.id}>
                <span className="trip-list-icon"><Icons.Drive size={21} /></span>
                <span className="trip-list-copy"><strong>{formatTripName(trip)}</strong><small>{new Date(trip.started_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {formatDuration(trip.drive_seconds)}</small></span>
                <span className="trip-list-distance"><strong>{trip.distance_km}</strong><small>km</small></span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
