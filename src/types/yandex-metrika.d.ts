// The Metrika tag installs a global `ym` queue stub from an inline block in the
// document head (scripts/analytics-metrika.ts). It is optional at runtime: an
// ad blocker, a non-production hostname or a private route all leave it
// undefined, and every caller must survive that.
export {};

declare global {
  interface Window {
    ym?: (counterId: number, method: string, ...args: unknown[]) => void;
  }
}
