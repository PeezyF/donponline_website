export type CoinPack = {
  name: string;
  coins: number;
  amountCents: number;
};

export const coinPacks: Record<string, CoinPack> = {
  starter: { name: "Starter Stack — 500 Motion Coins", coins: 500, amountCents: 499 },
  power: { name: "Power Stack — 1,200 Motion Coins", coins: 1200, amountCents: 999 },
  vault: { name: "The Vault — 2,500 Motion Coins", coins: 2500, amountCents: 1999 }
};
