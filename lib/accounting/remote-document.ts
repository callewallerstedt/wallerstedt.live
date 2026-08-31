import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import { AccountingError } from "./errors";

const MAX_REMOTE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item))) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

function isPrivateAddress(address: string) {
  const normalized = address.toLocaleLowerCase("en").split("%")[0];
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }
  return normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb");
}

async function assertPublicUrl(url: URL) {
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (url.port && url.port !== "443")
  ) {
    throw new AccountingError(
      "Attachment URLs must use public HTTPS.",
      400,
      "invalid_attachment_url",
    );
  }
  const hostname = url.hostname.toLocaleLowerCase("en");
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new AccountingError("Private attachment URLs are not allowed.", 400, "private_attachment_url");
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AccountingError("The attachment host could not be resolved.", 400, "attachment_host_unavailable");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new AccountingError("Private attachment URLs are not allowed.", 400, "private_attachment_url");
  }
}

function extensionFor(contentType: string) {
  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType.includes("csv") || contentType === "application/vnd.ms-excel") return ".csv";
  return ".txt";
}

function remoteFilename(response: Response, url: URL, supplied?: string | null) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  let value = supplied?.trim() || "";
  if (!value && encoded) {
    try { value = decodeURIComponent(encoded); } catch { value = encoded; }
  }
  if (!value && plain) value = plain;
  if (!value) {
    try { value = decodeURIComponent(url.pathname.split("/").pop() || ""); } catch { value = ""; }
  }
  return value.replace(/\\/g, "/").split("/").pop()?.trim().slice(0, 180) || "underlag";
}

async function responseBytes(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_REMOTE_BYTES) {
    throw new AccountingError("The remote attachment is larger than 10 MB.", 413, "attachment_too_large");
  }
  if (!response.body) {
    throw new AccountingError("The attachment URL returned an empty response.", 400, "empty_attachment");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REMOTE_BYTES) {
      await reader.cancel();
      throw new AccountingError("The remote attachment is larger than 10 MB.", 413, "attachment_too_large");
    }
    chunks.push(value);
  }
  if (total === 0) throw new AccountingError("The attachment URL returned an empty file.", 400, "empty_attachment");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fileFromPublicUrl(rawUrl: string, suppliedName?: string | null) {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new AccountingError("Invalid attachment URL.", 400, "invalid_attachment_url");
  }

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicUrl(current);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/pdf,image/jpeg,image/png,text/plain,text/csv;q=0.9,*/*;q=0.2",
          "User-Agent": "Wallerstedt-Accounting-Agent/1.0",
        },
      });
    } catch {
      throw new AccountingError("The attachment URL could not be downloaded.", 400, "attachment_download_failed");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) {
        throw new AccountingError("The attachment URL redirected too many times.", 400, "attachment_redirect_failed");
      }
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new AccountingError(`The attachment URL returned HTTP ${response.status}.`, 400, "attachment_download_failed");
    }
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLocaleLowerCase("en");
    if (!ALLOWED_TYPES.has(contentType)) {
      throw new AccountingError("The attachment URL is not a supported PDF, image, text, or CSV file.", 415, "unsupported_attachment_type");
    }
    const bytes = await responseBytes(response);
    let filename = remoteFilename(response, current, suppliedName);
    if (!/\.[a-z0-9]{2,5}$/i.test(filename)) filename += extensionFor(contentType);
    return new File([bytes], filename, { type: contentType });
  }
  throw new AccountingError("The attachment URL could not be downloaded.", 400, "attachment_download_failed");
}
