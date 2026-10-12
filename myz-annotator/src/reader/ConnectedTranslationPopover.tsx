import { defineComponent, type PropType } from "vue";
import type { TranslationController } from "./translate/useTranslation.js";
import TranslationPopover from "./TranslationPopover.js";

/**
 * Binds a {@link TranslationController} to the presentational
 * `TranslationPopover`, so the content toolbar and the reader selection tools
 * share one prop-mapping instead of duplicating the 15 popover props.
 */
export default defineComponent({
  name: "ConnectedTranslationPopover",
  props: {
    translation: {
      type: Object as PropType<TranslationController>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const t = props.translation;
      return (
        <TranslationPopover
          top={t.position.value.top}
          left={t.position.value.left}
          bottom={t.position.value.bottom}
          sourceText={t.sourceText.value}
          sourceLanguage={t.sourceLanguage.value}
          targetLanguage={t.targetLanguage.value}
          status={t.status.value}
          downloadPercent={t.downloadPercent.value}
          translation={t.translation.value}
          errorMessage={t.errorMessage.value}
          copyError={t.copyError.value}
          copied={t.copied.value}
          onCopy={() => void t.copy()}
          onRetry={t.retry}
          onClose={t.close}
        />
      );
    };
  },
});
