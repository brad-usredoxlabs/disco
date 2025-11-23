import { onMounted, onBeforeUnmount } from 'vue'

/**
 * Attach global keyboard shortcuts so Tab/Shift+Tab jump across TipTap field blocks.
 * @param {import('vue').Ref<import('@tiptap/vue-3').Editor | null>} editorRef
 */
export function useFieldNavigation(editorRef) {
  function handleKeyDown(event) {
    const editor = editorRef.value
    if (!editor) return
    if (event.key !== 'Tab') return
    if (!isFieldBlockSelection(editor)) return

    event.preventDefault()
    if (event.shiftKey) {
      focusPreviousField(editor)
    } else {
      focusNextField(editor)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}

function isFieldBlockSelection(editor) {
  const { state } = editor
  const { from, to } = state.selection
  let isField = false
  state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'fieldBlock') {
      isField = true
      return false
    }
    return undefined
  })
  return isField
}

function focusNextField(editor) {
  editor.commands.command(({ tr, state }) => {
    const pos = findNextField(state, tr.selection.to + 1)
    if (pos !== null) {
      const resolved = tr.doc.resolve(pos)
      tr.setSelection(state.selection.constructor.near(tr.doc.resolve(pos)))
      editor.view.dispatch(tr)
      editor.view.focus()
      return true
    }
    return false
  })
}

function focusPreviousField(editor) {
  editor.commands.command(({ tr, state }) => {
    const pos = findPreviousField(state, tr.selection.from - 1)
    if (pos !== null) {
      tr.setSelection(state.selection.constructor.near(tr.doc.resolve(pos)))
      editor.view.dispatch(tr)
      editor.view.focus()
      return true
    }
    return false
  })
}

function findNextField(state, startPos) {
  let found = null
  state.doc.nodesBetween(startPos, state.doc.content.size, (node, pos) => {
    if (node.type.name === 'fieldBlock') {
      found = pos + 1
      return false
    }
    return undefined
  })
  return found
}

function findPreviousField(state, startPos) {
  let found = null
  state.doc.nodesBetween(0, startPos, (node, pos, parent, index) => {
    if (node.type.name === 'fieldBlock') {
      found = pos + 1
    }
    return undefined
  })
  return found
}
