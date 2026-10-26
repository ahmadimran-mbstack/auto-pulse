// Pure function to generate a deterministic CSS gradient from a user id string
export function getDeterministicGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = Math.abs((hash * 7) % 360);
  return `linear-gradient(135deg, hsl(${hue1}, 75%, 65%), hsl(${hue2}, 85%, 45%))`;
}
