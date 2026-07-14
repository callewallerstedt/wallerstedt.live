import { Icons } from "./TeslaIcons";
import { formatAge } from "./format";
import type { ConnectionState } from "./types";

type StatusHeaderProps = {
  connection: ConnectionState;
  message: string;
  ageSeconds: number;
  clock: Date;
  refreshing: boolean;
  onRefresh: () => void;
};

export function StatusHeader({ connection, message, ageSeconds, clock, refreshing, onRefresh }: StatusHeaderProps) {
  const freshness = connection === "demo" ? "Preview" : formatAge(ageSeconds);
  return (
    <header className="drive-header">
      <div className="drive-connection" data-state={connection}>
        <span className="connection-pulse" />
        <span>
          <strong>{message}</strong>
          <small>{freshness}</small>
        </span>
      </div>
      <time className="drive-clock" dateTime={clock.toISOString()} suppressHydrationWarning>
        {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </time>
      <button className={`round-button ${refreshing ? "is-spinning" : ""}`} onClick={onRefresh} aria-label="Refresh Tesla data">
        <Icons.Refresh size={20} />
      </button>
    </header>
  );
}
