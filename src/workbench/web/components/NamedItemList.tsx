import type { WorkbenchNamedItem } from "../../types"

export function NamedItemList({ items, empty }: { items: WorkbenchNamedItem[]; empty: string }) {
  if (items.length === 0) return <p className="empty">{empty}</p>

  return (
    <ul className="named-list">
      {items.map((item, index) => (
        <li key={`${item.ref ?? item.label}-${index}`}>
          <span>{item.label}</span>
          <span className="pill">{item.kindLabel}</span>
          {item.state !== undefined && <span className="state">{item.state}</span>}
        </li>
      ))}
    </ul>
  )
}
