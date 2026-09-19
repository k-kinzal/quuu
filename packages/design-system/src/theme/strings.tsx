import { createContext, useContext, type ReactNode } from 'react'

/**
 * The design system's own built-in copy (aria labels, tooltips, generic fallbacks).
 *
 * These are the only strings the kit renders on its own; everything an app can
 * name (labels, titles, options) already arrives via props. They stay generic —
 * no app vocabulary — and are grouped per component so a pack reads like the
 * component catalog.
 *
 * English is the source. Apps that follow a non-English OS locale pass a whole
 * pack (e.g. `jaStrings`) through `ThemeProvider`; there is no per-key merge on
 * purpose, so a pack is always complete and a missing translation is a type
 * error here rather than a silent English fallback at runtime.
 */
export interface DsStrings {
  spinner: { label: string }
  filterChip: {
    /** Value shown when no filter is applied. */
    all: string
  }
  selectionSheet: {
    /** Fallback aria label of the sheet. */
    label: string
  }
  searchPicker: { placeholder: string; empty: string }
  terminalView: {
    /** Fallback aria label of the terminal surface. */
    label: string
  }
  contentTabs: {
    scrollLeft: string
    scrollRight: string
    close(label: string): string
    closeTitle(label: string): string
  }
  resizer: {
    /** Default label of a vertical pane boundary. */
    paneWidth: string
    /** Default label of the horizontal boundary between stacked panes. */
    stackedPaneHeight: string
    horizontalAria(label: string): string
    horizontalTitle(label: string): string
    verticalAria(label: string): string
    verticalTitle(label: string): string
  }
  dataTable: {
    /** Default label of a column-width handle. */
    columnWidth: string
    columnAria(label: string): string
    columnTitle(label: string, canReset: boolean): string
  }
  repeatableList: {
    reorderAria(position: number): string
    reorderTitle: string
  }
  toast: {
    /** Label of the control that clears one notification without following it. */
    dismiss: string
  }
}

export const enStrings: DsStrings = {
  spinner: { label: 'Loading' },
  filterChip: { all: 'All' },
  selectionSheet: { label: 'Select' },
  searchPicker: { placeholder: 'Type to filter…', empty: 'No matching options' },
  terminalView: { label: 'Terminal' },
  contentTabs: {
    scrollLeft: 'Scroll tabs left',
    scrollRight: 'Scroll tabs right',
    close: (label) => `Close ${label}`,
    closeTitle: (label) => `Close ${label} (Delete)`
  },
  resizer: {
    paneWidth: 'Pane width',
    stackedPaneHeight: 'Height of stacked panes',
    horizontalAria: (label) => `${label} (← → to adjust)`,
    horizontalTitle: (label) => `${label}\nDrag, or ← → to adjust (⇧ for 1px steps)`,
    verticalAria: (label) => `${label} (↑ ↓ to adjust)`,
    verticalTitle: (label) => `${label}\nDrag, or ↑ ↓ to adjust (⇧ for 1px steps)`
  },
  dataTable: {
    columnWidth: 'Column width',
    columnAria: (label) => `${label} (← → to adjust)`,
    columnTitle: (label, canReset) =>
      `${label}\nDrag, or ← → to adjust (⇧ for 1px steps)${canReset ? '\nDouble-click / ⏎ to reset' : ''}`
  },
  repeatableList: {
    reorderAria: (position) => `Reorder item ${position}`,
    reorderTitle: 'Drag, or ↑ ↓ to reorder'
  },
  toast: { dismiss: 'Dismiss' }
}

export const jaStrings: DsStrings = {
  spinner: { label: '読み込み中' },
  filterChip: { all: 'すべて' },
  selectionSheet: { label: '選択' },
  searchPicker: { placeholder: '入力して絞り込み…', empty: '一致する候補がありません' },
  terminalView: { label: 'ターミナル' },
  contentTabs: {
    scrollLeft: 'タブを左へスクロール',
    scrollRight: 'タブを右へスクロール',
    close: (label) => `${label} を閉じる`,
    closeTitle: (label) => `${label} を閉じる (Delete)`
  },
  resizer: {
    paneWidth: '面の幅',
    stackedPaneHeight: '上下の面の高さ',
    horizontalAria: (label) => `${label}（← → で変える）`,
    horizontalTitle: (label) => `${label}\nドラッグ、または ← → で変える（⇧ で 1px ずつ）`,
    verticalAria: (label) => `${label}（↑ ↓ で変える）`,
    verticalTitle: (label) => `${label}\nドラッグ、または ↑ ↓ で変える（⇧ で 1px ずつ）`
  },
  dataTable: {
    columnWidth: '列の幅',
    columnAria: (label) => `${label}（← → で変える）`,
    columnTitle: (label, canReset) =>
      `${label}\nドラッグ、または ← → で変える（⇧ で 1px ずつ）${canReset ? '\nダブルクリック / ⏎ で既定に戻す' : ''}`
  },
  repeatableList: {
    reorderAria: (position) => `${position} 番目を並べ替える`,
    reorderTitle: 'ドラッグ、または ↑ ↓ で並べ替える'
  },
  toast: { dismiss: '閉じる' }
}

const StringsContext = createContext<DsStrings>(enStrings)

export function StringsProvider({
  strings,
  children
}: {
  strings: DsStrings
  children: ReactNode
}): JSX.Element {
  return <StringsContext.Provider value={strings}>{children}</StringsContext.Provider>
}

/** Read the active string pack. Components fall back to props when the app names things itself. */
export function useStrings(): DsStrings {
  return useContext(StringsContext)
}
