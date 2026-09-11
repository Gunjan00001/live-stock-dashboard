export function formatVolume(volume: number) {
  if (volume >= 1e7) return `${(volume / 1e7).toFixed(2)} Cr`;
  if (volume >= 1e5) return `${(volume / 1e5).toFixed(1)} L`;
  return volume.toLocaleString("en-IN");
}
