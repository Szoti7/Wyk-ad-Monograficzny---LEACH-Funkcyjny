export type Point = Readonly<{ x: number; y: number }>;
export type Config = Readonly<{
  count: number;
  seed: bigint;
  epochLength: number;
  initialEnergy: number;
}>;
export type Sensor = Readonly<{
  id: number;
  position: Point;
  energy: number;
  lastHeadEpoch: number | null;
  isHead: boolean;
  headId: number | null;
}>;
export type Link = Readonly<{
  from: number;
  to: number | "base";
}>;
export type RoundStats = Readonly<{
  round: number;
  alive: number;
  energy: number;
  heads: number;
  packets: number;
}>;
export type Simulation = Readonly<{
  config: Config;
  round: number;
  rng: bigint;
  nodes: readonly Sensor[];
  links: readonly Link[];
  history: readonly RoundStats[];
}>;
