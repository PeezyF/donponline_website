export type CoinPack = {
  name: string;
  coins: number;
  amountCents: number;
};

export const coinPacks: Record<string, CoinPack> = {
  starter: { name: "Starter Stack — 500 Motion Coins", coins: 500, amountCents: 499 },
  power: { name: "Power Stack — 1,200 Motion Coins", coins: 1200, amountCents: 999 },
  vault: { name: "The Vault — 2,500 Motion Coins", coins: 2500, amountCents: 1999 },
  beat: { name: "Beat Pack — 50,000 Motion Coins", coins: 50000, amountCents: 39999 },
  vip: { name: "VIP All Access Pack — 100,000 Motion Coins", coins: 100000, amountCents: 69999 }
};
