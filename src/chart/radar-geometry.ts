export interface Point { x: number; y: number }

export const SVG_WIDTH = 800
export const SVG_HEIGHT = 540
export const CHART_CENTER: Point = { x: 400, y: 270 }
export const BADGE_WIDTH = 142
export const BADGE_HEIGHT = 58

export function polarPoint(index: number, radius: number): Point {
  if (radius === 0) return { x: 0, y: 0 }
  const angle = -Math.PI / 2 + index * Math.PI / 3
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

export function hexagonPoints(radius: number): Point[] {
  return Array.from({ length: 6 }, (_, index) => polarPoint(index, radius))
}

export function scorePoints(scores: number[], radius: number): Point[] {
  return Array.from({ length: 6 }, (_, index) => polarPoint(index, radius * Math.min(5, Math.max(0, scores[index] ?? 0)) / 5))
}

export function pointsAttribute(points: Point[]): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
}

export function badgePositions(): Point[] {
  return [
    { x: 329, y: 2 },
    { x: 616, y: 132 },
    { x: 616, y: 350 },
    { x: 329, y: 480 },
    { x: 42, y: 350 },
    { x: 42, y: 132 },
  ]
}
