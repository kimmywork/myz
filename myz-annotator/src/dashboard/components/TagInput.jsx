import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

import "./TagInput.css";

export default defineComponent({
  name: "TagInput",
  props: {
    modelValue: {
      type: Array,
      default: () => [],
    },
    options: {
      type: Array,
      default: () => [],
    },
    placeholder: {
      type: String,
      default: "",
    },
    allowNew: {
      type: Boolean,
      default: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:modelValue", "focus"],
  setup(props, { emit }) {
    const containerRef = ref(null);
    const inputRef = ref(null);
    const internalValue = ref([...props.modelValue]);
    const inputValue = ref("");
    const dropdownOpen = ref(false);
    const activeIndex = ref(-1);
    const isFocused = ref(false);

    const normalizedOptions = computed(() => {
      const seen = new Set();
      const result = [];
      props.options.forEach((option) => {
        const trimmed = typeof option === "string" ? option.trim() : "";
        if (!trimmed) {
          return;
        }
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          result.push(trimmed);
        }
      });
      return result;
    });

    const filteredOptions = computed(() => {
      const term = inputValue.value.trim().toLowerCase();
      return normalizedOptions.value
        .filter(
          (option) =>
            !internalValue.value.some(
              (tag) => tag.toLowerCase() === option.toLowerCase(),
            ),
        )
        .filter((option) => (term ? option.toLowerCase().includes(term) : true))
        .slice(0, 50);
    });

    watch(
      () => props.modelValue,
      (next) => {
        const sanitized = Array.isArray(next)
          ? next
              .filter((tag) => typeof tag === "string" && tag.trim())
              .map((tag) => tag.trim())
          : [];
        internalValue.value = [...new Set(sanitized.map((tag) => tag.trim()))];
      },
      { immediate: true },
    );

    watch(filteredOptions, (options) => {
      if (!options.length) {
        dropdownOpen.value = false;
        activeIndex.value = -1;
      }
    });

    function emitChange() {
      emit("update:modelValue", [...internalValue.value]);
    }

    function addTag(raw) {
      const tag = typeof raw === "string" ? raw.trim() : "";
      if (!tag) {
        return false;
      }
      if (
        !props.allowNew &&
        !normalizedOptions.value.some(
          (option) => option.toLowerCase() === tag.toLowerCase(),
        )
      ) {
        return false;
      }
      if (
        internalValue.value.some(
          (current) => current.toLowerCase() === tag.toLowerCase(),
        )
      ) {
        return false;
      }
      internalValue.value = [...internalValue.value, tag];
      emitChange();
      return true;
    }

    function removeTag(tag) {
      const lower = tag.toLowerCase();
      const next = internalValue.value.filter(
        (item) => item.toLowerCase() !== lower,
      );
      if (next.length === internalValue.value.length) {
        return;
      }
      internalValue.value = next;
      emitChange();
    }

    function closeDropdown() {
      dropdownOpen.value = false;
      activeIndex.value = -1;
    }

    function openDropdown() {
      if (filteredOptions.value.length) {
        dropdownOpen.value = true;
        if (activeIndex.value < 0) {
          activeIndex.value = 0;
        }
      }
    }

    function commitInput() {
      const hasOptions =
        dropdownOpen.value && filteredOptions.value[activeIndex.value];
      if (hasOptions) {
        const added = addTag(filteredOptions.value[activeIndex.value]);
        if (added) {
          inputValue.value = "";
        }
        closeDropdown();
        focusInput();
        return;
      }
      const value = inputValue.value;
      if (!value.trim()) {
        return;
      }
      if (addTag(value)) {
        inputValue.value = "";
      }
      closeDropdown();
    }

    function handleInput(event) {
      inputValue.value = event.target.value;
      if (!event.target.value.trim()) {
        if (filteredOptions.value.length) {
          dropdownOpen.value = true;
          activeIndex.value = 0;
        } else {
          closeDropdown();
        }
        return;
      }
      openDropdown();
    }

    function handleKeydown(event) {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commitInput();
        return;
      }
      if (
        event.key === "Backspace" &&
        !inputValue.value &&
        internalValue.value.length
      ) {
        event.preventDefault();
        removeTag(internalValue.value[internalValue.value.length - 1]);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!dropdownOpen.value) {
          openDropdown();
          return;
        }
        activeIndex.value =
          activeIndex.value + 1 >= filteredOptions.value.length
            ? 0
            : activeIndex.value + 1;
        scrollOptionIntoView();
        return;
      }
      if (event.key === "ArrowUp" && dropdownOpen.value) {
        event.preventDefault();
        activeIndex.value =
          activeIndex.value - 1 < 0
            ? filteredOptions.value.length - 1
            : activeIndex.value - 1;
        scrollOptionIntoView();
        return;
      }
      if (event.key === "Escape") {
        closeDropdown();
      }
    }

    function handleFocus() {
      if (props.disabled) {
        return;
      }
      isFocused.value = true;
      emit("focus");
      nextTick(() => {
        if (filteredOptions.value.length) {
          dropdownOpen.value = true;
          activeIndex.value = 0;
        }
      });
    }

    function handleBlur(event) {
      if (props.disabled) {
        return;
      }
      // Delay to allow option click
      setTimeout(() => {
        if (
          containerRef.value &&
          containerRef.value.contains(document.activeElement)
        ) {
          return;
        }
        isFocused.value = false;
        closeDropdown();
      }, 120);
    }

    function handleContainerMouseDown(event) {
      if (event.target.closest(".tag-input__remove")) {
        return;
      }
      focusInput();
    }

    function focusInput() {
      if (props.disabled) {
        return;
      }
      nextTick(() => inputRef.value?.focus());
    }

    function selectOption(option) {
      if (addTag(option)) {
        inputValue.value = "";
      }
      closeDropdown();
      focusInput();
    }

    function scrollOptionIntoView() {
      nextTick(() => {
        const list = containerRef.value?.querySelector(".tag-input__list");
        if (!list) {
          return;
        }
        const option = list.children[activeIndex.value];
        if (option && typeof option.scrollIntoView === "function") {
          option.scrollIntoView({ block: "nearest" });
        }
      });
    }

    function handleOptionMouseDown(event, option, index) {
      event.preventDefault();
      activeIndex.value = index;
      selectOption(option);
    }

    function handleDocumentClick(event) {
      if (!containerRef.value) {
        return;
      }
      if (!containerRef.value.contains(event.target)) {
        isFocused.value = false;
        closeDropdown();
      }
    }

    onMounted(() => {
      document.addEventListener("click", handleDocumentClick);
    });

    onBeforeUnmount(() => {
      document.removeEventListener("click", handleDocumentClick);
    });

    return () => {
      const classes = ["tag-input"];
      if (isFocused.value) {
        classes.push("is-focused");
      }
      if (props.disabled) {
        classes.push("is-disabled");
      }
      return (
        <div
          ref={containerRef}
          class={classes.join(" ")}
          onMousedown={handleContainerMouseDown}
        >
          {internalValue.value.map((tag) => (
            <span class="tag-input__chip" key={tag}>
              <span>{tag}</span>
              {!props.disabled && (
                <button
                  type="button"
                  class="tag-input__remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`移除标签 ${tag}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {!props.disabled && (
            <input
              ref={inputRef}
              class="tag-input__input"
              type="text"
              value={inputValue.value}
              placeholder={props.placeholder}
              onInput={handleInput}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeydown={handleKeydown}
              autocomplete="off"
              spellcheck="false"
            />
          )}
          {dropdownOpen.value && filteredOptions.value.length ? (
            <div class="tag-input__list" role="listbox">
              {filteredOptions.value.map((option, index) => (
                <div
                  key={option}
                  class={[
                    "tag-input__option",
                    activeIndex.value === index ? "is-active" : "",
                  ]}
                  role="option"
                  aria-selected={activeIndex.value === index ? "true" : "false"}
                  onMousedown={(event) =>
                    handleOptionMouseDown(event, option, index)
                  }
                >
                  {option}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    };
  },
});
