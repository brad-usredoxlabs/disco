import { computed, reactive } from 'vue'
import { computeRangeSelection } from '../utils/layoutUtils'

export function useGridSelection(layoutIndexRef) {
  const state = reactive({
    wells: [],
    anchor: null
  })

  function setSelection(wells = [], anchor = null) {
    const unique = Array.isArray(wells)
      ? wells.filter((well, index, array) => well && array.indexOf(well) === index)
      : []
    state.wells = unique
    state.anchor = anchor || unique[0] || null
  }

  function reset() {
    state.wells = []
    state.anchor = null
  }

  function selectSingle(wellId) {
    if (!wellId) {
      reset()
      return
    }
    setSelection([wellId], wellId)
  }

  function toggleSelection(wellId) {
    if (!wellId) return
    const set = new Set(state.wells)
    if (set.has(wellId)) {
      set.delete(wellId)
    } else {
      set.add(wellId)
    }
    const next = Array.from(set)
    setSelection(next, next.length ? state.anchor || wellId : null)
  }

  function rangeSelect(targetId) {
    const layoutIndex = layoutIndexRef?.value
    if (!targetId || !layoutIndex) return
    const anchor = state.anchor || targetId
    const range = computeRangeSelection(anchor, targetId, layoutIndex)
    setSelection(range, anchor)
  }

  return {
    selection: computed(() => state.wells),
    anchor: computed(() => state.anchor),
    setSelection,
    reset,
    selectSingle,
    toggleSelection,
    rangeSelect
  }
}
