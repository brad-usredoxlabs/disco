import {
  FIRE_PLATE_EDITOR_SPEC,
  QPCR_PLATE_EDITOR_SPEC
} from '../../spec/plate-editor/PlateEditorSpec'

const SPEC_REGISTRY = {
  [FIRE_PLATE_EDITOR_SPEC.id]: FIRE_PLATE_EDITOR_SPEC,
  [QPCR_PLATE_EDITOR_SPEC.id]: QPCR_PLATE_EDITOR_SPEC
}

export const DEFAULT_PLATE_EDITOR_SPEC_ID = FIRE_PLATE_EDITOR_SPEC.id

export function resolvePlateEditorSpec(id) {
  if (id && SPEC_REGISTRY[id]) {
    return SPEC_REGISTRY[id]
  }
  return SPEC_REGISTRY[DEFAULT_PLATE_EDITOR_SPEC_ID]
}

export function listPlateEditorSpecs() {
  return Object.values(SPEC_REGISTRY)
}
