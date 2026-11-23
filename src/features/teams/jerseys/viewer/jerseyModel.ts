export type JerseySide = 'front' | 'back'

type Point = readonly [x: number, y: number, z: number]
type Profile = readonly [y: number, halfWidth: number, depth: number]

const torso: Profile[] = [
  [-1.28, 0.84, 0.2],
  [-1.23, 0.86, 0.22],
  [-0.82, 0.83, 0.24],
  [-0.35, 0.81, 0.26],
  [0.13, 0.85, 0.29],
  [0.48, 0.9, 0.31],
]

const shoulder = [0.42, 0.66] as const
const collar = [
  // x, front height, back height
  [0, 0.85, 1.06],
  [0.12, 0.86, 1.07],
  [0.23, 0.91, 1.09],
  [0.32, 1.01, 1.15],
  [0.38, 1.13, 1.21],
  [0.42, 1.26, 1.26],
  [0.54, 1.28, 1.28],
  [0.66, 1.27, 1.27],
  [0.7, 1.1, 1.1],
  [0.72, 0.9, 0.9],
  [0.78, 0.72, 0.72],
  [0.84, 0.57, 0.57],
  [0.9, 0.48, 0.48],
] as const

const columns = [
  ...collar
    .slice(1)
    .reverse()
    .map(([x, front, back]) => ({ x: -x, front, back })),
  ...collar.map(([x, front, back]) => ({ x, front, back })),
]
const topDepth = 0.16
export const jerseyX = 0.9
export const jerseyY = 1.28

export function jerseyOutline(side: JerseySide): readonly (readonly [number, number])[] {
  return [
    ...columns.map((column) => [column.x, column[side]] as const),
    ...torso
      .slice(0, -1)
      .reverse()
      .map(([y, width]) => [width, y] as const),
    ...torso.slice(0, -1).map(([y, width]) => [-width, y] as const),
  ]
}

function surface(side: JerseySide): Point[][] {
  const sign = side === 'front' ? 1 : -1
  const edgeDepth = 0.055
  const chest = torso.at(-1)!
  const chestRows = torso.map(([y, width, depth]) =>
    columns.map(({ x }): Point => {
      const curve = Math.cos((x / jerseyX) * (Math.PI / 2))
      return [(x / jerseyX) * width, y, sign * (edgeDepth + (depth - edgeDepth) * curve)]
    }),
  )
  return [
    ...chestRows,
    ...[0.25, 0.5, 0.75, 1].map((height) =>
      columns.map((column, index): Point => {
        const { x } = column
        const z = chestRows.at(-1)![index]![2]
        const upperDepth = edgeDepth + (topDepth - edgeDepth) * (1 - (x / jerseyX) ** 4)
        return [
          x,
          chest[0] + (column[side] - chest[0]) * height,
          z + (sign * upperDepth - z) * height,
        ]
      }),
    ),
  ]
}

function buildMesh(side: JerseySide, front: Point[][], back: Point[][]) {
  const points: Point[] = []
  const indices: number[] = []

  function addRows(rows: Point[][], reverse = false) {
    const start = points.length
    const width = rows[0]!.length
    points.push(...rows.flat())
    for (let row = 0; row < rows.length - 1; row++) {
      for (let column = 0; column < width - 1; column++) {
        const a = start + row * width + column
        const b = a + 1
        const c = a + width
        const d = c + 1
        if (reverse) indices.push(a, c, b, b, c, d)
        else indices.push(a, b, c, b, d, c)
      }
    }
  }

  addRows(side === 'front' ? front : back, side === 'back')
  const seamStart = points.length
  let seamEnd = seamStart
  if (side === 'front') {
    for (const edge of [0, columns.length - 1]) {
      const seams = torso.map((_, row) => [front[row]![edge]!, back[row]![edge]!])
      addRows(seams, edge === 0)
    }
    seamEnd = points.length
    for (const sign of [-1, 1]) {
      const onShoulder = (_: Point, column: number) =>
        columns[column]!.x * sign >= shoulder[0] && columns[column]!.x * sign <= shoulder[1]
      addRows([front.at(-1)!.filter(onShoulder), back.at(-1)!.filter(onShoulder)])
    }
  }

  const normals = points.map((): [number, number, number] => [0, 0, 0])
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!
    const b = indices[i + 1]!
    const c = indices[i + 2]!
    const [x, y, z] = points[a]!
    const [bx, by, bz] = points[b]!
    const [cx, cy, cz] = points[c]!
    const nx = (by - y) * (cz - z) - (bz - z) * (cy - y)
    const ny = (bz - z) * (cx - x) - (bx - x) * (cz - z)
    const nz = (bx - x) * (cy - y) - (by - y) * (cx - x)
    for (const index of [a, b, c]) {
      normals[index]![0] += nx
      normals[index]![1] += ny
      normals[index]![2] += nz
    }
  }

  const facing = side === 'front' ? 1 : -1
  const vertices = points.flatMap(([x, y, z], i) => {
    const [nx, ny, nz] = normals[i]!
    const length = Math.hypot(nx, ny, nz)
    // Side seams sample the solid trim band so its thin piping stays on the front and back.
    const uv =
      i >= seamStart && i < seamEnd
        ? [0.04, 0.66]
        : [(1 + (x * facing) / jerseyX) / 2, (1 - y / jerseyY) / 2]
    return [x, y, z, ...(length ? [nx / length, ny / length, nz / length] : [0, 0, facing]), ...uv]
  })
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) }
}

export function createJerseyModel() {
  const front = surface('front')
  const back = surface('back')
  return { front: buildMesh('front', front, back), back: buildMesh('back', front, back) }
}
