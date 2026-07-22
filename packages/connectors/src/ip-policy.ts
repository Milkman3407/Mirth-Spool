import { isIP } from "node:net";

export type IpFamily = 4 | 6;

export interface ResolvedAddress {
  readonly address: string;
  readonly family: IpFamily;
}

function parseIpv4(address: string): readonly number[] | null {
  if (isIP(address) !== 4) return null;
  const parts = address.split(".").map(Number);
  return parts.length === 4 ? parts : null;
}

function ipv4Number(address: string): number | null {
  const parts = parseIpv4(address);
  if (!parts) return null;
  return (
    ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!
  );
}

function inIpv4Cidr(address: number, base: string, prefix: number): boolean {
  const baseNumber = ipv4Number(base);
  if (baseNumber === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (baseNumber & mask);
}

const nonPublicIpv4Cidrs = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

function expandIpv6(address: string): readonly number[] | null {
  if (isIP(address) !== 6) return null;
  let withoutZone = address.split("%", 1)[0]!.toLowerCase();
  if (withoutZone.includes(".")) {
    const colon = withoutZone.lastIndexOf(":");
    const dotted = withoutZone.slice(colon + 1);
    const ipv4 = ipv4Number(dotted);
    if (ipv4 === null) return null;
    withoutZone = `${withoutZone.slice(0, colon)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = withoutZone.split("::", 2);
  const left = halves[0] ?? "";
  const right = halves[1] ?? "";
  const parseSide = (side: string): number[] =>
    side === "" ? [] : side.split(":").map((part) => Number.parseInt(part, 16));
  const leftParts = parseSide(left);
  const rightParts = parseSide(right);
  const missing = 8 - leftParts.length - rightParts.length;
  if (missing < 0 || (!withoutZone.includes("::") && missing !== 0))
    return null;
  return [
    ...leftParts,
    ...Array.from({ length: missing }, () => 0),
    ...rightParts,
  ];
}

function ipv6Prefix(
  parts: readonly number[],
  base: readonly number[],
  bits: number,
): boolean {
  const full = Math.floor(bits / 16);
  const remainder = bits % 16;
  for (let index = 0; index < full; index += 1) {
    if (parts[index] !== base[index]) return false;
  }
  if (remainder === 0) return true;
  const mask = (0xffff << (16 - remainder)) & 0xffff;
  return (parts[full]! & mask) === (base[full]! & mask);
}

const nonPublicIpv6Cidrs = [
  ["::", 128],
  ["::1", 128],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

export function isPublicAddress(address: string): boolean {
  const ipv4 = ipv4Number(address);
  if (ipv4 !== null) {
    return !nonPublicIpv4Cidrs.some(([base, prefix]) =>
      inIpv4Cidr(ipv4, base, prefix),
    );
  }
  const ipv6 = expandIpv6(address);
  if (!ipv6) return false;
  if (ipv6Prefix(ipv6, expandIpv6("::ffff:0:0")!, 96)) {
    const mapped = `${(ipv6[6]! >> 8) & 0xff}.${ipv6[6]! & 0xff}.${
      (ipv6[7]! >> 8) & 0xff
    }.${ipv6[7]! & 0xff}`;
    return isPublicAddress(mapped);
  }
  return !nonPublicIpv6Cidrs.some(([base, prefix]) =>
    ipv6Prefix(ipv6, expandIpv6(base)!, prefix),
  );
}

export function assertAddressPolicy(
  addresses: readonly ResolvedAddress[],
  allowPrivateAddresses: boolean,
): ResolvedAddress {
  if (addresses.length === 0) {
    throw new Error("Host did not resolve to an address");
  }
  for (const result of addresses) {
    if (isIP(result.address) !== result.family) {
      throw new Error("Resolver returned an invalid address");
    }
    if (!allowPrivateAddresses && !isPublicAddress(result.address)) {
      throw new Error("Host resolved to a disallowed address");
    }
  }
  return addresses[0]!;
}

export function validateOutboundUrl(
  input: string,
  allowedPorts: readonly number[] = [80, 443],
): URL {
  if (input.length > 2_048) throw new Error("URL is too long");
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("URL scheme is not allowed");
  }
  if (url.username || url.password)
    throw new Error("URL credentials are not allowed");
  if (!url.hostname || url.hostname.endsWith(".")) {
    throw new Error("URL hostname is invalid");
  }
  const port =
    url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (!allowedPorts.includes(port)) throw new Error("URL port is not allowed");
  return url;
}
