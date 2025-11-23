<template>
  <div class="tiptap-editor">
    <div v-if="editor" class="editor-toolbar">
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
        title="Italic"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('bulletList') }"
        @click="editor.chain().focus().toggleBulletList().run()"
        title="Bullet list"
      >
        • List
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('orderedList') }"
        @click="editor.chain().focus().toggleOrderedList().run()"
        title="Numbered list"
      >
        1. List
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('heading', { level: 2 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        title="Heading level 2"
      >
        H2
      </button>
      <button
        type="button"
        :class="{ 'is-active': editor.isActive('heading', { level: 3 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
        title="Heading level 3"
      >
        H3
      </button>
      <button
        type="button"
        @click="editor.chain().focus().setHorizontalRule().run()"
        title="Horizontal rule"
      >
        ―
      </button>
      <span class="toolbar-separator" aria-hidden="true"></span>
      <button
        type="button"
        class="insert-step-btn"
        @click="insertProtocolStep"
      >
        + Step
      </button>
      <span class="toolbar-separator" aria-hidden="true"></span>
      <button
        type="button"
        :disabled="!editor.can().undo()"
        @click="editor.chain().focus().undo().run()"
        title="Undo"
      >
        ↶
      </button>
      <button
        type="button"
        :disabled="!editor.can().redo()"
        @click="editor.chain().focus().redo().run()"
        title="Redo"
      >
        ↷
      </button>
    </div>

    <EditorContent
      v-if="editor"
      class="editor-content"
      :editor="editor"
    />
    <p v-else class="editor-loading">Preparing editor…</p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { FieldBlock } from '../nodes/FieldBlock'
import { ProtocolStep } from '../nodes/ProtocolStep'
import { OntologyTermReference } from '../nodes/OntologyTermReference'
import { useFieldNavigation } from '../composables/useFieldNavigation'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Start editing your protocol…' }]
        }
      ]
    })
  },
  editable: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue'])

const editor = ref(null)
useFieldNavigation(editor)

onMounted(() => {
  editor.value = new Editor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3]
        }
      }),
      FieldBlock,
      ProtocolStep,
      OntologyTermReference
    ],
    editable: props.editable,
    content: props.modelValue || buildPlaceholderDoc(),
    onUpdate: ({ editor }) => {
      emit('update:modelValue', editor.getJSON())
    }
  })
})

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
    editor.value = null
  }
})

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) return
    const nextValue = value || buildPlaceholderDoc()
    const current = editor.value.getJSON()
    if (JSON.stringify(current) !== JSON.stringify(nextValue)) {
      editor.value.commands.setContent(nextValue, false)
    }
  },
  { deep: true }
)

watch(
  () => props.editable,
  (isEditable) => {
    if (!editor.value) return
    editor.value.setEditable(!!isEditable)
  }
)

function insertProtocolStep() {
  if (!editor.value) return
  const doc = editor.value.state.doc
  let stepCount = 0
  doc.descendants((node) => {
    if (node.type.name === 'protocolStep') {
      stepCount += 1
    }
  })
  editor.value
    .chain()
    .focus()
    .insertProtocolStep({
      stepNumber: stepCount + 1,
      name: '',
      description: '',
      duration: '',
      inputs: [],
      equipment: [],
      acceptanceCriteria: '',
      validationErrors: []
    })
    .run()
}

function buildPlaceholderDoc() {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Start editing your protocol…' }]
      }
    ]
  }
}
</script>

<style scoped>
.tiptap-editor {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.editor-toolbar button {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.editor-toolbar button:hover:not(:disabled) {
  background: #e5e7eb;
  border-color: #9ca3af;
}

.editor-toolbar button.is-active {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #fff;
}

.editor-toolbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.toolbar-separator {
  width: 1px;
  align-self: stretch;
  background: #d1d5db;
  margin: 0 0.25rem;
}

.insert-step-btn {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1e40af;
  font-weight: 500;
}

.insert-step-btn:hover {
  background: #bfdbfe;
  border-color: #60a5fa;
}

.editor-content {
  padding: 1rem;
  min-height: 320px;
}

.editor-content :deep(.ProseMirror) {
  min-height: 320px;
  outline: none;
}

.editor-loading {
  padding: 1rem;
  text-align: center;
  color: #6b7280;
  font-style: italic;
}
</style>
