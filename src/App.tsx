import { useEffect, useReducer } from "react";
import { HistoryChart } from "./ui/HistoryChart";
import { Network } from "./ui/Network";
import { initialModel, reducer } from "./ui/state";
import type { Config } from "./core/types";

const fields: readonly Readonly<{
  key: keyof Config;
  label: string;
  min?: string;
  max?: string;
  step?: string;
}>[] = [
  {
    key: "count",
    label: "Liczba sensorów",
    min: "1",
    step: "1",
  },
  {
    key: "epochLength",
    label: "Długość epoki",
    min: "1",
    max: "100",
    step: "1",
  },
  {
    key: "initialEnergy",
    label: "Energia początkowa [J]",
    min: "0.01",
    max: "1",
    step: "any",
  },
  {
    key: "seed",
    label: "Seed SplitMix64",
  },
];

export const App = ({ config }: Readonly<{ config: Config }>) => {
  const [model, dispatch] = useReducer(reducer, config, initialModel);
  const { simulation, running } = model;
  const stats = simulation.history.at(-1);
  const dead = simulation.nodes.every((node) => node.energy === 0);

  // Podczas automatycznej symulacji zegar uruchamia kolejną rundę
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => dispatch({ type: "tick" }), 180);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <main>
      <div className="layout">
        <aside className="panel settings">
          <h2>Parametry sieci</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              dispatch({
                type: "apply",
                config: {
                  count: Number(data.get("count")),
                  epochLength: Number(data.get("epochLength")),
                  initialEnergy: Number(data.get("initialEnergy")),
                  seed: BigInt(String(data.get("seed"))),
                },
              });
            }}
          >
            {fields.map((field) => (
              <label key={field.key} htmlFor={field.key}>
                {field.label}
                <input
                  id={field.key}
                  type={field.key === "seed" ? "text" : "number"}
                  inputMode={field.key === "seed" ? "numeric" : "decimal"}
                  name={field.key}
                  required
                  defaultValue={String(config[field.key])}
                  pattern={field.key === "seed" ? "[0-9]{1,20}" : undefined}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onInput={
                    field.key === "seed"
                      ? (event) => {
                          const input = event.currentTarget;
                          const tooLarge =
                            input.value.length === 20 &&
                            input.value > "18446744073709551615";
                          input.setCustomValidity(
                            tooLarge
                              ? "Maksymalny seed to 18446744073709551615."
                              : "",
                          );
                        }
                      : undefined
                  }
                />
              </label>
            ))}
            <button className="button apply" type="submit">
              Zastosuj
            </button>
          </form>
        </aside>
        <section className="workspace" aria-label="Wizualizacja symulacji">
          <div className="metrics">
            <div>
              <span>Runda</span>
              <strong>{simulation.round.toString().padStart(3, "0")}</strong>
              <small>
                epoka{" "}
                {Math.floor(
                  Math.max(0, simulation.round - 1) /
                    simulation.config.epochLength,
                ) + 1}
              </small>
            </div>
            <div>
              <span>Żywe sensory</span>
              <strong>
                {stats?.alive ?? 0}
                <em> / {simulation.config.count}</em>
              </strong>
              <small>energia większa od zera</small>
            </div>
            <div>
              <span>Żywi liderzy</span>
              <strong>{stats?.heads ?? 0}</strong>
              <small>
                p = {(100 / simulation.config.epochLength).toFixed(1)}%
              </small>
            </div>
          </div>
          <div className="panel map-panel">
            <div className="map-toolbar">
              <h2>Sieć na końcu rundy</h2>
              <div className="controls">
                <button
                  className="button primary"
                  disabled={dead}
                  onClick={() => dispatch({ type: "toggle" })}
                >
                  {running ? "Ⅱ Pauza" : "▷ Uruchom"}
                </button>
                <button
                  className="button"
                  disabled={running || dead}
                  onClick={() => dispatch({ type: "step" })}
                >
                  Krok +1
                </button>
                <button
                  className="button reset"
                  onClick={() => dispatch({ type: "reset" })}
                  aria-label="Resetuj symulację"
                >
                  ↺ Reset
                </button>
              </div>
            </div>
            <Network simulation={simulation} />
            <div className="map-footer">
              <div className="legend">
                <span>
                  <i className="sensor" />
                  Sensor
                </span>
                <span>
                  <i className="head" />
                  Lider
                </span>
                <span>
                  <i className="dead">×</i>Wyczerpany
                </span>
              </div>
              <span>{stats?.packets ?? 0} pakietów do bazy w rundzie</span>
            </div>
          </div>
          <div className="panel chart">
            <h2>
              Żywe sensory <span>[liczba]</span>
            </h2>
            <HistoryChart
              history={simulation.history}
              max={simulation.config.count}
            />
          </div>
        </section>
      </div>
    </main>
  );
};
