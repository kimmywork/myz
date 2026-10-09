import { defineComponent } from "vue"
import {
  chipClassFor,
  containerClassFor,
  inputClassFor,
  listClassFor,
  optionClassFor,
  removeClassFor,
  type TagInputVariant,
} from "./tag-input/tagInputVariants.js"
import { useTagInput } from "./tag-input/useTagInput.js"

export interface TagInputProps {
  modelValue: string[]
  options: string[]
  placeholder?: string
  allowNew?: boolean
  disabled?: boolean
  variant?: TagInputVariant
}

export default defineComponent({
  name: "TagInput",
  props: {
    modelValue: { type: Array as () => string[], default: () => [] },
    options: { type: Array as () => string[], default: () => [] },
    placeholder: { type: String, default: "" },
    allowNew: { type: Boolean, default: true },
    disabled: { type: Boolean, default: false },
    variant: { type: String as () => TagInputVariant, default: "dashboard" },
  },
  emits: ["update:modelValue", "focus"],
  setup(props, { emit }) {
    const api = useTagInput(
      {
        modelValue: props.modelValue,
        options: props.options,
        allowNew: props.allowNew,
        disabled: props.disabled,
        variant: props.variant,
      },
      emit,
    )

    return () => {
      const variant = props.variant
      return (
        <div class="relative w-full">
          <div
            ref={api.containerRef}
            class={containerClassFor(
              variant,
              api.isFocused.value,
              props.disabled,
            )}
            onMousedown={api.handleContainerMouseDown}
          >
            {api.internalValue.value.map((tag) => (
              <span
                class={chipClassFor(variant)}
                key={tag}
                data-role="tag-chip"
              >
                <span>{tag}</span>
                {!props.disabled && (
                  <button
                    type="button"
                    class={removeClassFor(variant)}
                    onClick={() => api.removeTag(tag)}
                    aria-label={`移除标签 ${tag}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!props.disabled && (
              <input
                data-testid="tag-input-field"
                ref={api.inputRef}
                class={inputClassFor(variant)}
                type="text"
                value={api.inputValue.value}
                placeholder={props.placeholder}
                onInput={api.handleInput}
                onFocus={api.handleFocus}
                onBlur={api.handleBlur}
                onKeydown={api.handleKeydown}
                onKeyup={(event: KeyboardEvent) => event.stopPropagation()}
                autocomplete="off"
                spellcheck="false"
              />
            )}
          </div>
          {api.dropdownOpen.value && api.filteredOptions.value.length ? (
            <div
              class={listClassFor(variant)}
              role="listbox"
              data-role="tag-options"
            >
              {api.filteredOptions.value.map((option, index) => (
                <div
                  key={option}
                  class={optionClassFor(
                    variant,
                    api.activeIndex.value === index,
                  )}
                  role="option"
                  aria-selected={
                    api.activeIndex.value === index ? "true" : "false"
                  }
                  onMousedown={(event: MouseEvent) =>
                    api.handleOptionMouseDown(event, option, index)
                  }
                >
                  {option}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )
    }
  },
})
