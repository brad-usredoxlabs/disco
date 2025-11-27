import { onMounted, onBeforeUnmount } from 'vue'

/**
 * Attach global keyboard shortcuts so Tab/Shift+Tab jump across TipTap field blocks
 * and keep the focused field centered in the scroll container.
 *
 * @param {import('vue').Ref<import('@tiptap/vue-3').Editor | null>} editorRef
 */
export function useFieldNavigation(editorRef) {
  function handleKeyDown(event) {
    const editor = editorRef.value
    if (!editor) return
    if (event.key !== 'Tab') return

    // Only take over Tab if focus is currently inside a field block
    const active = document.activeElement
    if (!active) return

    const currentField = active.closest('[data-field-block]')
    if (!currentField) return

    if (!shouldCaptureTabWithinField(currentField, active, event.shiftKey)) {
      return
    }

    event.preventDefault()

    const root = editor.view.dom
    const fields = Array.from(root.querySelectorAll('[data-field-block]'))

    if (!fields.length) return

    const currentIndex = fields.indexOf(currentField)
    const direction = event.shiftKey ? -1 : 1

    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + direction + fields.length) % fields.length

    const nextField = fields[nextIndex]
    if (!nextField) return

    focusFieldCentered(nextField)
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}

/**
 * Focus the input/textarea inside a field block and center that block
 * inside the nearest scroll container.
 */
function focusFieldCentered(fieldElement) {
  // 1) Focus the input WITHOUT scrolling
  const inputElement = fieldElement.querySelector('input, textarea')
  if (inputElement) {
    inputElement.focus({ preventScroll: true })
  } else {
    // as a fallback, focus the field block itself
    fieldElement.focus?.({ preventScroll: true })
  }

  // 2) Wait for focus to settle before scrolling
  requestAnimationFrame(() => {
    // Find scroll container
    const container = findScrollContainer(fieldElement)
    if (!container) return
    const isDocumentContainer =
      container === document.body ||
      container === document.documentElement ||
      container === document.scrollingElement

    // Get fresh measurements after focus
    const fieldRect = fieldElement.getBoundingClientRect()
    const containerRect = isDocumentContainer
      ? {
          top: 0,
          height: window.innerHeight
        }
      : container.getBoundingClientRect()
    const currentScrollTop = isDocumentContainer ? window.scrollY : container.scrollTop
    const viewportHeight = containerRect.height

    // Calculate where the field currently is relative to the container's viewport
    const fieldOffset = isDocumentContainer ? fieldRect.top : fieldRect.top - containerRect.top
    const targetOffset = viewportHeight * 0.4
    const tolerance = Math.max(8, viewportHeight * 0.05)

    const desiredScrollTop =
      currentScrollTop + fieldOffset - targetOffset + fieldRect.height / 2
    const maxScrollTop = Math.max(
      0,
      (isDocumentContainer ? container.scrollHeight - viewportHeight : container.scrollHeight - container.clientHeight)
    )
    const clamped = Math.max(0, Math.min(desiredScrollTop, maxScrollTop))
    const delta = clamped - currentScrollTop

    if (Math.abs(delta) > tolerance) {
      if (isDocumentContainer) {
        window.scrollTo({
          top: clamped,
          behavior: 'smooth'
        })
      } else {
        container.scrollTo({
          top: clamped,
          behavior: 'smooth'
        })
      }
    }
  })
}

function findScrollContainer(element) {
  let parent = element.parentElement
  while (parent) {
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY || style.overflow
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return parent
    }
    parent = parent.parentElement
  }
  // Fallback: document scroll
  return document.scrollingElement || document.documentElement || document.body
}

function shouldCaptureTabWithinField(fieldElement, activeElement, isShift) {
  const focusable = getFocusableElements(fieldElement)
  if (!focusable.length) return true
  const index = focusable.indexOf(activeElement)
  if (index === -1) return true
  if (!isShift && index < focusable.length - 1) {
    return false
  }
  if (isShift && index > 0) {
    return false
  }
  return true
}

function getFocusableElements(container) {
  const selectors = [
    'input:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ]
  return Array.from(
    container.querySelectorAll(selectors.join(','))
  ).filter((el) => el.offsetParent !== null)
}
