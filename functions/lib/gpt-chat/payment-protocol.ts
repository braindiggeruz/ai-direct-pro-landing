import type { Order } from "./billing-store";
// MD5 is mandated by Click Shop API, not selected as a password primitive.
// Small server-only implementation avoids node compatibility changes to Pages.
export function md5(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const size = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(size);
  buffer.set(bytes);
  buffer[bytes.length] = 128;
  const view = new DataView(buffer.buffer);
  view.setUint32(size - 8, bytes.length * 8, true);
  let a = 0x67452301,
    b = 0xefcdab89,
    c = 0x98badcfe,
    d = 0x10325476;
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let offset = 0; offset < size; offset += 64) {
    const original = [a, b, c, d];
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f =
        round === 0
          ? (b & c) | (~b & d)
          : round === 1
            ? (d & b) | (~d & c)
            : round === 2
              ? b ^ c ^ d
              : c ^ (b | ~d);
      const g =
        round === 0
          ? i
          : round === 1
            ? (5 * i + 1) % 16
            : round === 2
              ? (3 * i + 5) % 16
              : (7 * i) % 16;
      const sum =
        (a +
          f +
          Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) +
          view.getUint32(offset + g * 4, true)) |
        0;
      const shift = shifts[round * 4 + (i % 4)];
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    }
    a = (a + original[0]) | 0;
    b = (b + original[1]) | 0;
    c = (c + original[2]) | 0;
    d = (d + original[3]) | 0;
  }
  const result = new Uint8Array(16);
  const out = new DataView(result.buffer);
  [a, b, c, d].forEach((n, i) => out.setUint32(i * 4, n, true));
  return Array.from(result, (n) => n.toString(16).padStart(2, "0")).join("");
}
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function clickSignature(
  p: Record<string, string>,
  secret: string,
): string {
  return md5(
    p.click_trans_id +
      p.service_id +
      secret +
      p.merchant_trans_id +
      (p.action === "1" ? p.merchant_prepare_id : "") +
      p.amount +
      p.action +
      p.sign_time,
  );
}
export function parseClickAmount(value: string): number | null {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}
export function paymeState(row: Order): number {
  return row.state === "paid"
    ? 2
    : row.state === "refunded"
      ? -2
      : row.state === "cancelled"
        ? -1
        : 1;
}
export function paymeCheck(row: Order) {
  return {
    create_time: row.create_time,
    perform_time: row.perform_time,
    cancel_time: row.cancel_time,
    transaction: row.id,
    state: paymeState(row),
    reason: row.reason,
  };
}
