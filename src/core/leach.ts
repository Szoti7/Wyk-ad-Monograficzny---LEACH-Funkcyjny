import { nextFloat } from "./random";
import type {
  Config,
  Link,
  Point,
  RoundStats,
  Sensor,
  Simulation,
} from "./types";

// Model radia używany w symulacji w Pythonie
// Jedna ramka danych na rundę. Setup: ADV, JOIN_REQ i TDMA po 200 bitów.
// Pomijamy kolizje, retransmisje, nasłuch bez odbioru i czas propagacji.
// Odległości w m, energia w J. BS ma nieograniczone zasilanie.

export const FIELD_SIZE = 100; // Rozmiar jednego boku pola
export const ADV_RANGE = Math.SQRT2 * FIELD_SIZE; // Odległość z jaką musi nadawać węzeł aby usłyszał go każdy inny węzeł w sieci
export const BASE: Point = { x: 50, y: 175 }; // Położenie stacji bazowej
// Definicja modelu Radia używanego w symulacji
export const RADIO = {
  headerBits: 200, // Ile bitów ma nagłówek wiadomości
  dataBits: 4000, // Ile bitów zajmuje pomiar
  eTx: 50e-9, // Koszt elektroniki nadajnika [J/bit]
  eRx: 50e-9, // Koszt elektroniki odbiornika [J/bit]
  eFs: 10e-12, // Współczynnik wzmacniacza dla wolnej przestrzeni [J/(bit·m²)]
  eMp: 0.0013e-12, // Współczynnik wzmacniacza dla propagacji wielodrogowej [J/(bit·m⁴)]
  aggregation: 5e-9, // Koszt DA (agregacji danych przez liderów)
} as const;

export const DEFAULT_CONFIG: Config = {
  count: 100,
  seed: 30052001n,
  epochLength: 20, // Liczba rund w epoce. Przy 100 żywych węzłach i epoce 20 rund oczekujemy średnio 5 liderów na rundę
  initialEnergy: 0.5, // początkowa energia w węzłach
};

// Funkcja obliczająca odległość euklidesową pomiędzy dwoma punktami
export const distance = (a: Point, b: Point): number => {
  return Math.hypot(a.x - b.x, a.y - b.y);
};

// Odległość progowa pomiędzy dwoma modelami propagacji [m]
const d0 = Math.sqrt(RADIO.eFs / RADIO.eMp);

// Funkcja zwracająca koszt transmisji
export const transmitCost = (
  distance: number,
  bits: number = RADIO.dataBits + RADIO.headerBits,
): number => {
  const amplifierCostPerBit =
    distance < d0 ? RADIO.eFs * distance ** 2 : RADIO.eMp * distance ** 4;
  return RADIO.eTx * bits + bits * amplifierCostPerBit;
};

// Koszt odbioru wiadomości o podanej liczbie bitów
export const receiveCost = (bits: number): number => {
  return bits * RADIO.eRx;
};

// Koszt agregacji bitów pomiarów zebranych przez lidera
export const aggregationCost = (bits: number): number => {
  return bits * RADIO.aggregation;
};

// p = 1 / L. Równoważne p / (1 - p * (r mod L)).
export const threshold = (round: number, epochLength: number): number => {
  return 1 / (epochLength - (round % epochLength));
};

const statistics = (
  round: number,
  nodes: readonly Sensor[],
  packets: number,
): RoundStats => ({
  round,
  alive: nodes.filter((node) => node.energy > 0).length,
  energy: nodes.reduce((sum, node) => sum + node.energy, 0),
  heads: nodes.filter((node) => node.isHead).length,
  packets,
});

export const createSimulation = (config: Config): Simulation => {
  const generated = Array.from({ length: config.count }, (_, id) => id).reduce<
    Readonly<{ nodes: readonly Sensor[]; rng: bigint }>
  >(
    (acc, id) => {
      const [x, afterX] = nextFloat(acc.rng);
      const [y, afterY] = nextFloat(afterX);
      return {
        rng: afterY,
        nodes: [
          ...acc.nodes,
          {
            id,
            position: { x: x * FIELD_SIZE, y: y * FIELD_SIZE },
            energy: config.initialEnergy,
            lastHeadEpoch: null,
            isHead: false,
            headId: null,
          },
        ],
      };
    },
    { nodes: [], rng: config.seed },
  );
  return {
    config,
    round: 0,
    ...generated,
    links: [],
    history: [statistics(0, generated.nodes, 0)],
  };
};

const electHeads = (
  state: Simulation,
): Readonly<{ nodes: readonly Sensor[]; rng: bigint }> => {
  const epoch = Math.floor(state.round / state.config.epochLength);
  return state.nodes.reduce<
    Readonly<{ nodes: readonly Sensor[]; rng: bigint }>
  >(
    (acc, node) => {
      const eligible = node.energy > 0 && node.lastHeadEpoch !== epoch;
      const [draw, rng] = eligible
        ? nextFloat(acc.rng)
        : ([1, acc.rng] as const);
      const isHead =
        eligible && draw < threshold(state.round, state.config.epochLength);
      return {
        rng,
        nodes: [
          ...acc.nodes,
          {
            ...node,
            isHead,
            headId: null,
            lastHeadEpoch: isHead ? epoch : node.lastHeadEpoch,
          },
        ],
      };
    },
    { nodes: [], rng: state.rng },
  );
};

const nearestHead = (node: Sensor, heads: readonly Sensor[]): Sensor | null =>
  heads.reduce<Sensor | null>(
    (best, head) =>
      best === null ||
      distance(node.position, head.position) <
        distance(node.position, best.position)
        ? head
        : best,
    null,
  );

type Payment = Readonly<{ node: Sensor; success: boolean }>;

// Wynik operacji ustalamy PRZED odjęciem energii. Równość oznacza sukces
// i wyczerpanie baterii. Niedobór oznacza nieudaną operację i baterię 0.
const pay = (node: Sensor, cost: number): Payment => {
  const balance = node.energy;
  const debit = cost;
  return {
    node: { ...node, energy: Math.max(0, balance - debit) },
    success: balance >= debit,
  };
};

const replaceNodes = (
  nodes: readonly Sensor[],
  updates: readonly Sensor[],
): readonly Sensor[] =>
  nodes.map((node) => updates.find((update) => update.id === node.id) ?? node);

const setupClusters = (nodes: readonly Sensor[]): readonly Sensor[] => {
  const headerRxCost = receiveCost(RADIO.headerBits);

  // 1. ADV TX: każdy wybrany, żywy CH nadaje raz na cały obszar.
  const advertisements = nodes
    .filter((node) => node.isHead && node.energy > 0)
    .map((head) => pay(head, transmitCost(ADV_RANGE, RADIO.headerBits)));
  const afterAdvTx = replaceNodes(
    nodes,
    advertisements.map((result) => result.node),
  );
  // Zachowujemy udane wiadomości również wtedy, gdy nadawca właśnie umarł.
  const announced = advertisements
    .filter((result) => result.success)
    .map((result) => result.node);

  // 2. ADV RX: wszystkie żywe węzły słuchają, także pozostali CH.
  // Nadawca nie odbiera własnego ogłoszenia.
  const afterAdvRx = afterAdvTx.map((node) => {
    const count = announced.filter((head) => head.id !== node.id).length;
    return node.energy > 0 && count > 0
      ? pay(node, count * headerRxCost).node
      : node;
  });

  // 3. JOIN_REQ TX: zwykły sensor wybiera najbliższy usłyszany CH.
  // Jeżeli węzeł nie otrzyma harmonogramu, wysyła pomiar do BS.
  // Remis odległości rozstrzyga kolejność ID, bez dodatkowego losowania.
  const requests = afterAdvRx
    .filter((node) => !node.isHead && node.energy > 0)
    .flatMap((member) => {
      const head = nearestHead(member, announced);
      return head === null
        ? []
        : [
            {
              headId: head.id,
              payment: pay(
                member,
                transmitCost(
                  distance(member.position, head.position),
                  RADIO.headerBits,
                ),
              ),
            },
          ];
    });
  const afterJoinTx = replaceNodes(
    afterAdvRx,
    requests.map((request) => request.payment.node),
  );
  const sentRequests = requests.filter((request) => request.payment.success);

  // 4. JOIN_REQ RX: żywy CH płaci x * E_RX(200), tylko za udane nadania.
  const receptions = afterJoinTx
    .filter((node) => node.isHead && node.energy > 0)
    .map((head) => {
      const members = sentRequests.filter(
        (request) => request.headId === head.id,
      );
      return { members, payment: pay(head, members.length * headerRxCost) };
    });
  const afterJoinRx = replaceNodes(
    afterJoinTx,
    receptions.map((result) => result.payment.node),
  );

  // 5. TDMA TX: jeden broadcast 200 bitów do najdalszego zgłoszonego
  // członka. Rozmiar harmonogramu nie rośnie z liczbą członków.
  const schedules = receptions
    .filter(
      (result) =>
        result.payment.success &&
        result.payment.node.energy > 0 &&
        result.members.length > 0,
    )
    .map((result) => {
      const head = result.payment.node;
      const range = result.members.reduce(
        (max, request) =>
          Math.max(max, distance(head.position, request.payment.node.position)),
        0,
      );
      return pay(head, transmitCost(range, RADIO.headerBits));
    });
  const afterTdmaTx = replaceNodes(
    afterJoinRx,
    schedules.map((result) => result.node),
  );

  // 6. TDMA RX: odbiór udanego broadcastu kosztuje 200 * E_elec,
  // nawet jeśli jego nadawca wyczerpał baterię dokładnie na TX.
  // Członkostwo wymaga żywego odbiorcy i CH na końcu fazy setup.
  return afterTdmaTx.map((node) => {
    if (node.energy === 0) return { ...node, isHead: false, headId: null };
    if (node.isHead) return { ...node, headId: node.id };
    const request = sentRequests.find(
      (item) => item.payment.node.id === node.id,
    );
    const schedule = schedules.find(
      (item) => item.success && item.node.id === request?.headId,
    );
    if (!schedule) return { ...node, headId: null };
    const received = pay(node, headerRxCost);
    return {
      ...received.node,
      headId:
        received.success && received.node.energy > 0 && schedule.node.energy > 0
          ? schedule.node.id
          : null,
    };
  });
};

type TransferResult = Readonly<{
  nodes: readonly Sensor[];
  packets: number;
}>;

const transferDirect = (node: Sensor): TransferResult => {
  const sent = pay(node, transmitCost(distance(node.position, BASE)));
  return { nodes: [sent.node], packets: sent.success ? 1 : 0 };
};

const transferCluster = (
  head: Sensor,
  nodes: readonly Sensor[],
): TransferResult => {
  const members = nodes.filter(
    (node) => !node.isHead && node.headId === head.id && node.energy > 0,
  );
  // Sloty TDMA w kolejności ID. Pakiet 4200 bitów wysłany przy energii
  // dokładnie równej kosztowi nadal może być odebrany przez CH.
  const received = members.reduce<
    Readonly<{
      head: Sensor;
      samples: number;
      nodes: readonly Sensor[];
    }>
  >(
    (acc, member) => {
      const sent = pay(
        member,
        transmitCost(distance(member.position, head.position)),
      );
      const reception =
        sent.success && acc.head.energy > 0
          ? pay(acc.head, receiveCost(RADIO.dataBits + RADIO.headerBits))
          : { node: acc.head, success: false };
      return {
        head: reception.node,
        samples: acc.samples + (reception.success ? 1 : 0),
        nodes: [...acc.nodes, sent.node],
      };
    },
    { head, samples: 0, nodes: [] },
  );

  // E_DA * 4000 * (m + 1): m odebranych pomiarów i własny pomiar CH.
  // Bez odebranych pomiarów CH wysyła tylko własny pakiet, bez agregacji.
  const aggregated =
    received.samples > 0 && received.head.energy > 0
      ? pay(
          received.head,
          aggregationCost((received.samples + 1) * RADIO.dataBits),
        ).node
      : received.head;
  // CH, który umarł przy RX albo agregacji, nie może już wykonać TX.
  const delivery =
    aggregated.energy > 0
      ? transferDirect(aggregated)
      : { nodes: [aggregated], packets: 0 };
  return {
    nodes: [...received.nodes, ...delivery.nodes],
    packets: delivery.packets,
  };
};

const finishRound = (nodes: readonly Sensor[]): readonly Sensor[] =>
  nodes.map((node) => ({
    ...node,
    isHead: node.isHead && node.energy > 0,
    headId:
      node.energy > 0 &&
      nodes.some(
        (head) => head.id === node.headId && head.isHead && head.energy > 0,
      )
        ? node.headId
        : null,
  }));

// Połączenia pokazują stan sieci po zakończeniu rundy, nie historię nadanych pakietów.
// Zmiana headId na null po śmierci CH w steady nie uruchamia retransmisji.
const connections = (nodes: readonly Sensor[]): readonly Link[] =>
  nodes
    .filter((node) => node.energy > 0)
    .map((node) => ({
      from: node.id,
      to: node.isHead || node.headId === null ? "base" : node.headId,
    }));

export const step = (state: Simulation): Simulation => {
  if (state.nodes.every((node) => node.energy === 0)) return state;
  const elected = electHeads(state);
  const assigned = setupClusters(elected.nodes);
  const transfers = [
    ...assigned
      .filter((node) => node.isHead && node.energy > 0)
      .map((head) => transferCluster(head, assigned)),
    ...assigned
      .filter((node) => !node.isHead && node.headId === null && node.energy > 0)
      .map(transferDirect),
  ];
  const nodes = finishRound(
    replaceNodes(
      assigned,
      transfers.flatMap((result) => result.nodes),
    ),
  );
  const round = state.round + 1;
  const packets = transfers.reduce((sum, result) => sum + result.packets, 0);
  return {
    ...state,
    round,
    rng: elected.rng,
    nodes,
    links: connections(nodes),
    history: [...state.history, statistics(round, nodes, packets)],
  };
};
