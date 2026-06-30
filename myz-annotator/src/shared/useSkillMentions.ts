import { computed, nextTick, onMounted, ref } from "vue";
import type { Ref } from "vue";
import type { SkillMetadata } from "@/background/ai/skills/types.js";
import { sendMessage } from "@/shared/messaging.js";

interface UseSkillMentionsOptions {
  textareaRef: Ref<HTMLTextAreaElement | null>;
  getValue: () => string;
  setValue: (value: string) => void;
}

export function useSkillMentions(options: UseSkillMentionsOptions) {
  const skillList = ref<SkillMetadata[]>([]);
  const mentionQuery = ref("");
  const mentionStart = ref(0);
  const mentionEnd = ref(0);
  const mentionOpen = ref(false);

  const filteredSkills = computed(() => {
    const query = mentionQuery.value.trim();
    const enabled = skillList.value.filter((skill) => skill.enabled);
    if (!query) return enabled.slice(0, 6);
    return enabled.filter((skill) => skill.name.startsWith(query)).slice(0, 6);
  });

  const refreshSkills = async () => {
    try {
      const result = await sendMessage("myz:listSkills");
      skillList.value = Array.isArray(result) ? result : [];
    } catch {
      skillList.value = [];
    }
  };

  const closeMentions = () => {
    mentionOpen.value = false;
    mentionQuery.value = "";
  };

  const applyMention = async (name: string) => {
    if (!options.textareaRef.value) return;
    const value = options.getValue() || "";
    const before = value.slice(0, mentionStart.value);
    const after = value.slice(mentionEnd.value);
    const nextValue = `${before}@${name} ${after}`;
    options.setValue(nextValue);
    closeMentions();
    await nextTick();
    const cursor = before.length + name.length + 2;
    options.textareaRef.value.selectionStart = cursor;
    options.textareaRef.value.selectionEnd = cursor;
    options.textareaRef.value.focus();
  };

  const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement;
    options.setValue(target.value);
    const caret = target.selectionStart ?? target.value.length;
    const before = target.value.slice(0, caret);
    const match = /(?:^|\s)@([a-z0-9-]*)$/.exec(before);
    if (match) {
      mentionQuery.value = match[1] || "";
      mentionEnd.value = caret;
      mentionStart.value = caret - (match[1]?.length || 0) - 1;
      mentionOpen.value = true;
      if (skillList.value.length === 0) {
        void refreshSkills();
      }
    } else {
      closeMentions();
    }
  };

  const handleMentionKeydown = async (event: KeyboardEvent) => {
    if (!mentionOpen.value || filteredSkills.value.length === 0) {
      return false;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      await applyMention(filteredSkills.value[0].name);
      return true;
    }

    if (event.key === "Escape") {
      closeMentions();
      return true;
    }

    return false;
  };

  onMounted(() => {
    void refreshSkills();
  });

  return {
    mentionOpen,
    filteredSkills,
    closeMentions,
    applyMention,
    handleInput,
    handleMentionKeydown,
  };
}
