export interface ArchitectureLayoutNode {
  ref: string
  label: string
  parentRef: string | null
  childCount: number
}

export interface ArchitectureNodeBox {
  ref: string
  x: number
  y: number
  width: number
  height: number
}

export interface ArchitectureClusterBox {
  ref: string
  x: number
  y: number
  width: number
  height: number
}

export interface ArchitectureGeometry {
  width: number
  height: number
  nodes: ArchitectureNodeBox[]
  clusters: ArchitectureClusterBox[]
  positions: Map<string, { x: number; y: number }>
}

interface LayoutBlock {
  width: number
  height: number
  nodes: ArchitectureNodeBox[]
  clusters: ArchitectureClusterBox[]
}

interface LayoutRow {
  blocks: LayoutBlock[]
  width: number
  height: number
  gap: number
}

const NODE_WIDTH = 176
const NODE_HEIGHT = 46
const NODE_GAP = 22
const GROUP_PADDING = 18
const CHILD_ROW_GAP = 32
const ROOT_GAP = 56
const MAX_ROOT_WIDTH = 1600
const MAX_CONTENT_WIDTH = 1280

export class ArchitectureLayout {
  static build(nodes: ArchitectureLayoutNode[], collapsed: Set<string>): ArchitectureGeometry {
    const sorted = [...nodes].sort((left, right) => left.label.localeCompare(right.label))
    const byRef = new Map(sorted.map((node) => [node.ref, node]))
    const children = new Map<string, ArchitectureLayoutNode[]>()
    const roots: ArchitectureLayoutNode[] = []

    for (const node of sorted) {
      const parent = node.parentRef === null ? undefined : byRef.get(node.parentRef)
      if (parent === undefined) {
        roots.push(node)
        continue
      }
      const siblings = children.get(parent.ref) ?? []
      siblings.push(node)
      children.set(parent.ref, siblings)
    }

    const visited = new Set<string>()
    const blocks = roots.map((root) => ArchitectureLayout.block(root, children, collapsed, visited))
    const missing = sorted.filter((node) => !visited.has(node.ref))
    blocks.push(
      ...missing.map((node) => ArchitectureLayout.block(node, children, collapsed, visited)),
    )

    return ArchitectureLayout.pack(blocks)
  }

  private static block(
    node: ArchitectureLayoutNode,
    children: Map<string, ArchitectureLayoutNode[]>,
    collapsed: Set<string>,
    visited: Set<string>,
  ): LayoutBlock {
    visited.add(node.ref)
    const visibleChildren = collapsed.has(node.ref)
      ? []
      : (children.get(node.ref) ?? []).filter((child) => !visited.has(child.ref))
    const childBlocks = visibleChildren.map((child) =>
      ArchitectureLayout.block(child, children, collapsed, visited),
    )
    const childRows = ArchitectureLayout.rows(childBlocks, MAX_CONTENT_WIDTH, NODE_GAP)
    const isGroup = node.childCount > 0
    const padding = isGroup ? GROUP_PADDING : 0
    const childrenWidth = childRows.reduce((width, row) => Math.max(width, row.width), 0)
    const contentWidth = Math.max(NODE_WIDTH, childrenWidth)
    const width = contentWidth + padding * 2
    const childrenHeight = ArchitectureLayout.rowsHeight(childRows, CHILD_ROW_GAP)
    const childrenY = padding + NODE_HEIGHT + NODE_GAP
    const height =
      childRows.length === 0 ? NODE_HEIGHT + padding * 2 : childrenY + childrenHeight + padding
    const nodeX = (width - NODE_WIDTH) / 2
    const nodes = [{ ref: node.ref, x: nodeX, y: padding, width: NODE_WIDTH, height: NODE_HEIGHT }]
    const clusters = isGroup ? [{ ref: node.ref, x: 0, y: 0, width, height }] : []
    const placed = ArchitectureLayout.placeRows(childRows, width, childrenY, CHILD_ROW_GAP)

    nodes.push(...placed.nodes)
    clusters.push(...placed.clusters)

    return { width, height, nodes, clusters }
  }

  private static pack(blocks: LayoutBlock[]): ArchitectureGeometry {
    const rows = ArchitectureLayout.rows(blocks, MAX_ROOT_WIDTH, ROOT_GAP)
    const width = Math.max(
      rows.reduce((maximumWidth, row) => Math.max(maximumWidth, row.width), 0),
      NODE_WIDTH,
    )
    const height = Math.max(ArchitectureLayout.rowsHeight(rows, ROOT_GAP), NODE_HEIGHT)
    const placed = ArchitectureLayout.placeRows(rows, width, 0, ROOT_GAP)
    const positions = new Map(
      placed.nodes.map((node) => [
        node.ref,
        { x: node.x + node.width / 2, y: node.y + node.height / 2 },
      ]),
    )

    return {
      width,
      height,
      nodes: placed.nodes,
      clusters: placed.clusters,
      positions,
    }
  }

  private static rows(blocks: LayoutBlock[], maximumWidth: number, gap: number): LayoutRow[] {
    const rows: LayoutRow[] = []

    for (const block of blocks) {
      const row = rows.at(-1)
      if (row === undefined || row.width + gap + block.width > maximumWidth) {
        rows.push({ blocks: [block], width: block.width, height: block.height, gap })
        continue
      }
      row.blocks.push(block)
      row.width += gap + block.width
      row.height = Math.max(row.height, block.height)
    }

    return rows
  }

  private static rowsHeight(rows: LayoutRow[], rowGap: number): number {
    if (rows.length === 0) return 0

    return rows.reduce((height, row) => height + row.height, 0) + rowGap * (rows.length - 1)
  }

  private static placeRows(
    rows: LayoutRow[],
    width: number,
    startY: number,
    rowGap: number,
  ): { nodes: ArchitectureNodeBox[]; clusters: ArchitectureClusterBox[] } {
    const nodes: ArchitectureNodeBox[] = []
    const clusters: ArchitectureClusterBox[] = []
    let cursorY = startY

    for (const row of rows) {
      let cursorX = (width - row.width) / 2
      for (const block of row.blocks) {
        nodes.push(...ArchitectureLayout.shiftNodes(block.nodes, cursorX, cursorY))
        clusters.push(...ArchitectureLayout.shiftClusters(block.clusters, cursorX, cursorY))
        cursorX += block.width + row.gap
      }
      cursorY += row.height + rowGap
    }

    return { nodes, clusters }
  }

  private static shiftNodes(
    nodes: ArchitectureNodeBox[],
    offsetX: number,
    offsetY: number,
  ): ArchitectureNodeBox[] {
    return nodes.map((node) => ({ ...node, x: node.x + offsetX, y: node.y + offsetY }))
  }

  private static shiftClusters(
    clusters: ArchitectureClusterBox[],
    offsetX: number,
    offsetY: number,
  ): ArchitectureClusterBox[] {
    return clusters.map((cluster) => ({
      ...cluster,
      x: cluster.x + offsetX,
      y: cluster.y + offsetY,
    }))
  }
}
