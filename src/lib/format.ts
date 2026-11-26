export function formatCoins(value: number): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('en-US')} PC`;
}

export function formatSignedCoins(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('en-US')} PC`;
}

export function formatPercent(rate: number, decimals = 1): string {
  const pct = rate * 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(decimals)}%`;
}

export function formatRoi(roiPct: number): string {
  const sign = roiPct > 0 ? '+' : '';
  return `${sign}${roiPct.toFixed(0)}%`;
}
