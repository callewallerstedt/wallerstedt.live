import { splitLinkedText } from "@/lib/os/linkify";

/** Render stored notes with safe http(s) URLs as new-tab links. */
export function LinkedNotes({ text }: { text: string }) {
  const parts = splitLinkedText(text);
  if (!parts.length) return null;
  return (
    <>
      {parts.map((part, index) =>
        part.type === "link" ? (
          <a
            className="break-all font-medium text-brand underline underline-offset-2"
            href={part.value}
            key={`${part.value}-${index}`}
            onClick={(event) => event.stopPropagation()}
            rel="noopener noreferrer"
            target="_blank"
          >
            {part.value}
          </a>
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        ),
      )}
    </>
  );
}
