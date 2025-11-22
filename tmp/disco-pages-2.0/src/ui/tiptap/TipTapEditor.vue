<template>
  <div class="tiptap-shell">
    <div v-if="editor" class="tiptap-toolbar">
      <button
        type="button"
        :class="{ active: editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
      >
        Bold
      </button>
      <button
        type="button"
        :class="{ active: editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        Italic
      </button>
      <button
        type="button"
        :class="{ active: editor.isActive('bulletList') }"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        • List
      </button>
      <button
        type="button"
        :class="{ active: editor.isActive('orderedList') }"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        1. List
      </button>
      <button
        type="button"
        :class="{ active: editor.isActive('heading', { level: 2 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H2
      </button>
      <button
        type="button"
        :class="{ active: editor.isActive('heading', { level: 3 }) }"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        H3
      </button>
      <span class="toolbar-spacer"></span>
      <button type="button" @click="editor.chain().focus().undo().run()" :disabled="!editor.can().undo()">
        Undo
      </button>
      <button type="button" @click="editor.chain().focus().redo().run()" :disabled="!editor.can().redo()">
        Redo
      </button>
    </div>
    <EditorContent :editor="editor" class="tiptap-content" :style="{ minHeight }" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const props = defineProps({
  modelValue: {
    type: Object,
    default: null
  },
  readOnly: {
    type: Boolean,
    default: false
  },
  minHeight: {
    type: String,
    default: '260px'
  }
})

const emit = defineEmits(['update:modelValue'])

const editor = ref(null)

const defaultDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Start drafting your schema-driven record…'
        }
      ]
    }
  ]
}

onMounted(() => {
  editor.value = new Editor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4]
        }
      })
    ],
    content: props.modelValue || defaultDoc,
    editable: !props.readOnly,
    onUpdate: ({ editor }) => {
      emit('update:modelValue', editor.getJSON())
    }
  })
})

watch(
  () => props.modelValue,
  (newValue) => {
    if (!editor.value || !newValue) return
    const current = editor.value.getJSON()
    if (JSON.stringify(current) !== JSON.stringify(newValue)) {
      editor.value.commands.setContent(newValue, false)
    }
  },
  { deep: true }
)

watch(
  () => props.readOnly,
  (isReadOnly) => {
    if (editor.value) {
      editor.value.setOptions({ editable: !isReadOnly })
    }
  }
)

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<style scoped>
.tiptap-shell {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.tiptap-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.tiptap-toolbar button {
  border: 1px solid transparent;
  background: #fff;
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  font-size: 0.85rem;
  color: #0f172a;
}

.tiptap-toolbar button.active {
  border-color: #2563eb;
  color: #1d4ed8;
}

.tiptap-toolbar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-spacer {
  flex: 1 1 auto;
}

.tiptap-content :deep(.ProseMirror) {
  padding: 1.25rem;
  min-height: 200px;
  outline: none;
  font-size: 1rem;
  line-height: 1.6;
}

.tiptap-content :deep(.ProseMirror p) {
  margin: 0 0 0.75rem;
}

.tiptap-content :deep(.ProseMirror h2) {
  font-size: 1.25rem;
  margin-top: 1.5rem;
}

.tiptap-content :deep(.ProseMirror h3) {
  font-size: 1.1rem;
  margin-top: 1rem;
}

</style>