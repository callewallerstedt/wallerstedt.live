/** Seamless ticker: two identical tracks sliding one full width apart. */
export function Marquee({
  items,
  speed = 46,
  display = false,
}: {
  items: string[];
  speed?: number;
  display?: boolean;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div
      className={`wl-marquee${display ? " wl-marquee--display" : ""}`}
      style={{ ["--speed" as string]: `${speed}s` }}
      aria-hidden="true"
    >
      {[0, 1].map((copy) => (
        <div className="wl-marquee__track" key={copy}>
          {items.map((item, index) => (
            <span className="wl-marquee__item" key={`${copy}-${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
