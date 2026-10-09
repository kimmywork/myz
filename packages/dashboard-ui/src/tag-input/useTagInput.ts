import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue"
import type { TagInputVariant } from "./tagInputVariants.js"

export interface TagInputModel {
  modelValue: string[]
  options: string[]
  allowNew: boolean
  disabled: boolean
  variant: TagInputVariant
}

type Emit = {
  (event: "update:modelValue", value: string[]): void
  (event: "focus"): void
}

/** State + interaction logic for the tag input; view lives in TagInput.tsx. */
export function useTagInput(props: TagInputModel, emit: Emit) {
  const containerRef = ref<HTMLElement | null>(null)
  const inputRef = ref<HTMLInputElement | null>(null)
  const internalValue = ref<string[]>([...props.modelValue])
  const inputValue = ref("")
  const dropdownOpen = ref(false)
  const activeIndex = ref(-1)
  const isFocused = ref(false)

  const normalizedOptions = computed(() => {
    const seen = new Set<string>()
    const result: string[] = []
    props.options.forEach((option) => {
      const trimmed = typeof option === "string" ? option.trim() : ""
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push(trimmed)
      }
    })
    return result
  })

  const filteredOptions = computed(() => {
    const term = inputValue.value.trim().toLowerCase()
    return normalizedOptions.value
      .filter(
        (option) =>
          !internalValue.value.some(
            (tag) => tag.toLowerCase() === option.toLowerCase(),
          ),
      )
      .filter((option) => (term ? option.toLowerCase().includes(term) : true))
      .slice(0, 50)
  })

  watch(
    () => props.modelValue,
    (next) => {
      const sanitized = Array.isArray(next)
        ? next
            .filter((tag) => typeof tag === "string" && tag.trim())
            .map((tag) => tag.trim())
        : []
      internalValue.value = [...new Set(sanitized.map((tag) => tag.trim()))]
    },
    { immediate: true },
  )

  watch(filteredOptions, (options) => {
    if (!options.length) {
      dropdownOpen.value = false
      activeIndex.value = -1
    }
  })

  function emitChange() {
    emit("update:modelValue", [...internalValue.value])
  }

  function addTag(raw: string): boolean {
    const tag = typeof raw === "string" ? raw.trim() : ""
    if (!tag) return false
    if (
      !props.allowNew &&
      !normalizedOptions.value.some(
        (option) => option.toLowerCase() === tag.toLowerCase(),
      )
    ) {
      return false
    }
    if (
      internalValue.value.some(
        (current) => current.toLowerCase() === tag.toLowerCase(),
      )
    ) {
      return false
    }
    internalValue.value = [...internalValue.value, tag]
    emitChange()
    return true
  }

  function removeTag(tag: string) {
    const lower = tag.toLowerCase()
    const next = internalValue.value.filter(
      (item) => item.toLowerCase() !== lower,
    )
    if (next.length === internalValue.value.length) return
    internalValue.value = next
    emitChange()
  }

  function closeDropdown() {
    dropdownOpen.value = false
    activeIndex.value = -1
  }

  function openDropdown() {
    if (filteredOptions.value.length) {
      dropdownOpen.value = true
      if (activeIndex.value < 0) activeIndex.value = 0
    }
  }

  function focusInput() {
    if (props.disabled) return
    nextTick(() => inputRef.value?.focus())
  }

  function scrollOptionIntoView() {
    nextTick(() => {
      const list = containerRef.value?.querySelector("[data-role='tag-options']")
      if (!list) return
      const option = list.children[activeIndex.value]
      if (option && typeof option.scrollIntoView === "function") {
        option.scrollIntoView({ block: "nearest" })
      }
    })
  }

  function commitInput() {
    const hasOptions =
      dropdownOpen.value && filteredOptions.value[activeIndex.value]
    if (hasOptions) {
      const added = addTag(filteredOptions.value[activeIndex.value])
      if (added) inputValue.value = ""
      closeDropdown()
      focusInput()
      return
    }
    const value = inputValue.value
    if (!value.trim()) return
    if (addTag(value)) inputValue.value = ""
    closeDropdown()
  }

  function handleInput(event: Event) {
    inputValue.value = (event.target as HTMLInputElement).value
    if (!inputValue.value.trim()) {
      if (filteredOptions.value.length) {
        dropdownOpen.value = true
        activeIndex.value = 0
      } else {
        closeDropdown()
      }
      return
    }
    openDropdown()
  }

  function handleKeydown(event: KeyboardEvent) {
    event.stopPropagation()
    if (event.key === "Enter") {
      event.preventDefault()
      commitInput()
      return
    }
    if (
      event.key === "Backspace" &&
      !inputValue.value &&
      internalValue.value.length
    ) {
      event.preventDefault()
      removeTag(internalValue.value[internalValue.value.length - 1])
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (!dropdownOpen.value) {
        openDropdown()
        return
      }
      activeIndex.value =
        activeIndex.value + 1 >= filteredOptions.value.length
          ? 0
          : activeIndex.value + 1
      scrollOptionIntoView()
      return
    }
    if (event.key === "ArrowUp" && dropdownOpen.value) {
      event.preventDefault()
      activeIndex.value =
        activeIndex.value - 1 < 0
          ? filteredOptions.value.length - 1
          : activeIndex.value - 1
      scrollOptionIntoView()
      return
    }
    if (event.key === "Escape") closeDropdown()
  }

  function handleFocus() {
    if (props.disabled) return
    isFocused.value = true
    emit("focus")
    nextTick(() => {
      if (filteredOptions.value.length) {
        dropdownOpen.value = true
        activeIndex.value = 0
      }
    })
  }

  function handleBlur(event: FocusEvent) {
    if (props.disabled) return
    setTimeout(() => {
      const path = event?.composedPath ? event.composedPath() : []
      const inside =
        (containerRef.value && path.includes(containerRef.value)) ||
        containerRef.value?.contains(document.activeElement)
      if (inside) return
      isFocused.value = false
      closeDropdown()
    }, 120)
  }

  function handleDocumentClick(event: MouseEvent) {
    if (!containerRef.value) return
    const path = event.composedPath ? event.composedPath() : []
    const inside =
      (containerRef.value && path.includes(containerRef.value)) ||
      containerRef.value.contains(event.target as Node)
    if (!inside) {
      isFocused.value = false
      closeDropdown()
    }
  }

  function handleContainerMouseDown(event: MouseEvent) {
    const removeSelector =
      props.variant === "content"
        ? ".myz-tag-input__remove"
        : ".tag-input__remove"
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(removeSelector)
    ) {
      return
    }
    focusInput()
  }

  function selectOption(option: string) {
    if (addTag(option)) inputValue.value = ""
    closeDropdown()
    focusInput()
  }

  function handleOptionMouseDown(
    event: MouseEvent,
    option: string,
    index: number,
  ) {
    event.preventDefault()
    activeIndex.value = index
    selectOption(option)
  }

  onMounted(() => {
    document.addEventListener("click", handleDocumentClick)
  })
  onBeforeUnmount(() => {
    document.removeEventListener("click", handleDocumentClick)
  })

  return {
    containerRef,
    inputRef,
    internalValue,
    inputValue,
    dropdownOpen,
    activeIndex,
    isFocused,
    normalizedOptions,
    filteredOptions,
    addTag,
    removeTag,
    handleInput,
    handleKeydown,
    handleFocus,
    handleBlur,
    handleContainerMouseDown,
    handleOptionMouseDown,
  }
}

export type TagInputApi = ReturnType<typeof useTagInput>
