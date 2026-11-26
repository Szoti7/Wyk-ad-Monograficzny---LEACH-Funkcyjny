import { createSimulation, step } from "../core/leach";
import type { Config, Simulation } from "../core/types";

export type Model = Readonly<{
  simulation: Simulation;
  running: boolean;
}>;
export type Action =
  | Readonly<{ type: "apply"; config: Config }>
  | Readonly<{ type: "reset" | "toggle" | "step" | "tick" }>;

export const initialModel = (config: Config): Model => ({
  simulation: createSimulation(config),
  running: false,
});

export const reducer = (model: Model, action: Action): Model => {
  switch (action.type) {
    case "apply":
      return initialModel(action.config);
    case "reset":
      return initialModel(model.simulation.config);
    case "toggle":
      return {
        ...model,
        running:
          model.simulation.nodes.some((node) => node.energy > 0) &&
          !model.running,
      };
    case "tick":
    case "step": {
      if (action.type === "tick" && !model.running) return model;
      const simulation = step(model.simulation);
      return {
        ...model,
        simulation,
        running:
          model.running && simulation.nodes.some((node) => node.energy > 0),
      };
    }
  }
};
