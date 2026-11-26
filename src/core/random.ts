// SplitMix64 o stałym przyroście, na podstawie implementacji S. Vigny:
// https://prng.di.unimi.it/splitmix64.c (public domain).
// Stan jest wartością, nigdy ukrytą zmienną ani mutowalnym obiektem.
export type Rng = bigint;
export type RandomResult<T> = readonly [value: T, nextState: Rng];

const u64 = (value: bigint): bigint => BigInt.asUintN(64, value);

export const nextUint64 = (state: Rng): RandomResult<bigint> => {
  const nextState = u64(state + 0x9e3779b97f4a7c15n);
  const first = u64((nextState ^ (nextState >> 30n)) * 0xbf58476d1ce4e5b9n);
  const second = u64((first ^ (first >> 27n)) * 0x94d049bb133111ebn);
  return [u64(second ^ (second >> 31n)), nextState];
};

export const nextFloat = (state: Rng): RandomResult<number> => {
  const [value, nextState] = nextUint64(state);
  return [Number(value >> 11n) / 9007199254740992, nextState];
};
