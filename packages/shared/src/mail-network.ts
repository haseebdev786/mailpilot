import dns from "node:dns/promises";
import { isIP } from "node:net";

export function isPublicMailAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return /^[23][0-9a-f]{3}:/.test(value) && !/^2001:(0:|:|db8:)/.test(value) && !value.startsWith("2002:") && !value.startsWith("3fff:");
  }
  return false;
}

export async function resolveMailServer(host: string) {
  const allowPrivate = process.env.NODE_ENV !== "production" && process.env.ALLOW_PRIVATE_MAIL_SERVERS === "true";
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || (!allowPrivate && addresses.some(({ address }) => !isPublicMailAddress(address)))) throw new Error("Mail servers must resolve to public internet addresses");
  // Pin the validated IP so a second lookup cannot rebind the connection.
  return { address: addresses[0].address, servername: host };
}
