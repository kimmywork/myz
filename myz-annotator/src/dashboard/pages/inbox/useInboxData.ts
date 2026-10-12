import { sendMessage } from "@myz/shared/messaging";
import { countTags, mergeTags } from "@myz/shared/tags";
import { computed, ref, watch } from "vue";
import {
  LIST_PAGE_SIZE,
  TAG_DISPLAY_CAP,
  type Tab,
  type UndoState,
} from "./inbox-types.js";
import type {
  InboxQueueItem,
  InboxQueueResult,
} from "@/background/messages/inbox";

/** Data/derived state and loading for the Inbox queue. */
export function useInboxData() {
  const queue = ref<InboxQueueResult | null>(null);
  const allTags = ref<string[]>([]);
  const activeTab = ref<Tab>("pending");
  const activeTag = ref<string | null>(null);
  const query = ref("");
  const selected = ref<Set<string>>(new Set());
  const focusMode = ref(false);
  const focusIndex = ref(0);
  const sidebarOpen = ref(false);
  const status = ref("");
  const undo = ref<UndoState | null>(null);
  const tagQuery = ref("");
  const loading = ref(true);
  const loadError = ref("");
  const showAllTags = ref(false);
  const visibleCount = ref(LIST_PAGE_SIZE);
  const sentinelRef = ref<HTMLElement | null>(null);
  let sentinelObserver: IntersectionObserver | null = null;
  const taggingId = ref<string | null>(null);
  const tagDraft = ref("");

  const tabItems = computed<InboxQueueItem[]>(() => {
    if (!queue.value) return [];
    const source = queue.value[activeTab.value];
    const needle = query.value.trim().toLowerCase();
    return source.filter((item) => {
      if (
        activeTag.value &&
        !(item.record.tags || []).includes(activeTag.value)
      ) {
        return false;
      }
      if (!needle) return true;
      return [
        item.record.text,
        item.record.note,
        item.record.title,
        item.record.url,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  });

  const tagCounts = computed<Array<{ tag: string; count: number }>>(() => {
    const seen = new Map<string, InboxQueueItem>();
    const source = queue.value;
    if (source) {
      for (const item of [
        ...source.pending,
        ...source.snoozed,
        ...source.marked,
      ]) {
        seen.set(item.targetId, item);
      }
    }
    const counts = countTags(
      Array.from(seen.values()).map((item) => item.record),
    );
    const countMap = new Map(counts.map((entry) => [entry.tag, entry.count]));
    // Union the record counts with the known tag list, then apply the shared
    // sort (count desc, tag asc) so a tag with no records still shows up.
    return mergeTags(
      allTags.value,
      counts.map((entry) => entry.tag),
    )
      .map((tag) => ({ tag, count: countMap.get(tag) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  });

  const visibleTags = computed(() => {
    const needle = tagQuery.value.trim().toLowerCase();
    if (needle) {
      return tagCounts.value.filter((entry) =>
        entry.tag.toLowerCase().includes(needle),
      );
    }
    return showAllTags.value
      ? tagCounts.value
      : tagCounts.value.slice(0, TAG_DISPLAY_CAP);
  });

  const workingSet = computed(() => {
    if (!queue.value) return [];
    const seen = new Map<string, InboxQueueItem>();
    for (const item of [
      ...queue.value.pending,
      ...queue.value.snoozed,
      ...queue.value.marked,
    ]) {
      seen.set(item.targetId, item);
    }
    return Array.from(seen.values());
  });

  const focusItem = computed(() => tabItems.value[focusIndex.value] ?? null);
  const visibleItems = computed(() =>
    tabItems.value.slice(0, visibleCount.value),
  );

  watch([activeTab, activeTag, query], () => {
    visibleCount.value = LIST_PAGE_SIZE;
  });

  function observeSentinel() {
    sentinelObserver?.disconnect();
    if (!sentinelRef.value) return;
    sentinelObserver = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          visibleCount.value < tabItems.value.length
        ) {
          visibleCount.value += LIST_PAGE_SIZE;
        }
      },
      { rootMargin: "0px 0px 200px 0px" },
    );
    sentinelObserver.observe(sentinelRef.value);
  }

  watch(sentinelRef, () => observeSentinel());

  function disposeSentinel() {
    sentinelObserver?.disconnect();
    sentinelObserver = null;
  }

  async function load() {
    loading.value = true;
    try {
      const [next, tags] = await Promise.all([
        sendMessage<undefined, InboxQueueResult>("myz:inboxQueue"),
        sendMessage<undefined, string[]>("myz:getAllTags"),
      ]);
      queue.value = next;
      allTags.value = Array.isArray(tags) ? tags : [];
      loadError.value = "";
      if (focusIndex.value >= tabItems.value.length) focusIndex.value = 0;
    } catch (error) {
      loadError.value = (error as Error).message;
    } finally {
      loading.value = false;
    }
  }

  return {
    queue,
    allTags,
    activeTab,
    activeTag,
    query,
    selected,
    focusMode,
    focusIndex,
    sidebarOpen,
    status,
    undo,
    tagQuery,
    loading,
    loadError,
    showAllTags,
    visibleCount,
    sentinelRef,
    taggingId,
    tagDraft,
    tabItems,
    tagCounts,
    visibleTags,
    workingSet,
    focusItem,
    visibleItems,
    load,
    observeSentinel,
    disposeSentinel,
  };
}

export type InboxData = ReturnType<typeof useInboxData>;
