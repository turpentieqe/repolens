export const constellations = [
  { name: 'Orion', brightestStar: 'Rigel', season: 'winter' },
  { name: 'Lyra', brightestStar: 'Vega', season: 'summer' },
  { name: 'Cassiopeia', brightestStar: 'Schedar', season: 'autumn' },
] as const;

export function findConstellation(name: string) {
  return constellations.find((item) => item.name.toLowerCase() === name.toLowerCase());
}
