/** Injectable random source. int(n) returns an integer in [0, n). */
export interface Rng {
  int(n: number): number;
}

/** Deterministic generator for tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(n: number) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const f = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(f * n);
    },
  };
}
