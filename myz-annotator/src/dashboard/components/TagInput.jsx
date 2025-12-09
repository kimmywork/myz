import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

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
    variant: {
      type: String,
      default: "dashboard", // "dashboard" | "content"
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
      event.stopPropagation();
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

    function handleKeyup(event) {
      // Prevent bubbling to page-level shortcuts on host sites (e.g. GitHub).
      event.stopPropagation();
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
        const path = event?.composedPath ? event.composedPath() : [];
        const inside =
          (containerRef.value && path.includes(containerRef.value)) ||
          containerRef.value?.contains(document.activeElement);
        if (inside) {
          return;
        }
        isFocused.value = false;
        closeDropdown();
      }, 120);
    }

    function handleContainerMouseDown(event) {
      const removeSelector =
        props.variant === "content"
          ? ".myz-tag-input__remove"
          : ".tag-input__remove";
      if (event.target.closest(removeSelector)) {
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
        const list = containerRef.value?.querySelector(
          "[data-role='tag-options']",
        );
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
      const path = event.composedPath ? event.composedPath() : [];
      const inside =
        (containerRef.value && path.includes(containerRef.value)) ||
        containerRef.value.contains(event.target);
      if (!inside) {
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
      const useContentVariant = props.variant === "content";
      const containerClasses = useContentVariant
        ? [
            "myz-tag-input",
            isFocused.value ? "is-focused" : "",
            props.disabled ? "is-disabled" : "",
          ]
            .filter(Boolean)
            .join(" ")
        : [
            "relative flex w-full flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition",
            props.disabled ? "cursor-not-allowed opacity-60" : "cursor-text",
            isFocused.value
              ? "border-indigo-400 bg-white shadow-lg dark:bg-slate-950/60"
              : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/60",
          ].join(" ");

      return (
        <div class="relative w-full">
          <div
            ref={containerRef}
            class={containerClasses}
            onMousedown={handleContainerMouseDown}
          >
            {internalValue.value.map((tag) => (
              <span
                class={
                  useContentVariant
                    ? "myz-tag-input__chip"
                    : "inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-100"
                }
                key={tag}
                data-role="tag-chip"
              >
                <span>{tag}</span>
                {!props.disabled && (
                  <button
                    type="button"
                    class={
                      useContentVariant
                        ? "myz-tag-input__remove"
                        : "text-slate-500 hover:text-rose-500 dark:text-slate-200 dark:hover:text-rose-400"
                    }
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
                data-testid="tag-input-field"
                ref={inputRef}
                class={
                  useContentVariant
                    ? "myz-tag-input__input"
                    : "min-w-[80px] flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
                }
                type="text"
                value={inputValue.value}
                placeholder={props.placeholder}
                onInput={handleInput}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeydown={handleKeydown}
                onKeyup={handleKeyup}
                autocomplete="off"
                spellcheck="false"
              />
            )}
          </div>
          {dropdownOpen.value && filteredOptions.value.length ? (
            <div
              class={
                useContentVariant
                  ? "myz-tag-input__list"
                  : "absolute left-0 top-full z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95"
              }
              role="listbox"
              data-role="tag-options"
            >
              {filteredOptions.value.map((option, index) => (
                <div
                  key={option}
                  class={
                    useContentVariant
                      ? [
                          "myz-tag-input__option",
                          activeIndex.value === index ? "is-active" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")
                      : [
                          "cursor-pointer rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-500/30",
                          activeIndex.value === index
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-white"
                            : "",
                        ].join(" ")
                  }
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
