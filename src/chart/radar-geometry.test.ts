import { describe, expect, it } from 'vitest'
import { badgePositions, hexagonPoints, scorePoints } from './radar-geometry'

describe('雷达图几何', () => {
  it('六边形包含六个等角顶点', () => {
    const points = hexagonPoints(100)
    expect(points).toHaveLength(6)
    expect(points[0].x).toBeCloseTo(0)
    expect(points[0].y).toBeCloseTo(-100)
    expect(points[3].x).toBeCloseTo(0)
    expect(points[3].y).toBeCloseTo(100)
  })

  it('0分在中心，5分在外圈并钳制越界值', () => {
    const points = scorePoints([0, 5, 6, -1, 2.5, 5], 100)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(Math.hypot(points[1].x, points[1].y)).toBeCloseTo(100)
    expect(Math.hypot(points[2].x, points[2].y)).toBeCloseTo(100)
    expect(points[3]).toEqual({ x: 0, y: 0 })
    expect(Math.hypot(points[4].x, points[4].y)).toBeCloseTo(50)
  })

  it('徽章严格轴对称', () => {
    const positions = badgePositions()
    expect(positions[0].x).toBe(positions[3].x)
    expect(positions[0].y + positions[3].y).toBe(540 - 58)
    expect(positions[1].x + positions[5].x).toBe(800 - 142)
    expect(positions[2].x + positions[4].x).toBe(800 - 142)
    expect(positions[1].y).toBe(positions[5].y)
    expect(positions[2].y).toBe(positions[4].y)
  })
})
