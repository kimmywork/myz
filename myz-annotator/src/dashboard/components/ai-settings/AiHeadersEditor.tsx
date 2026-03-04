import { defineComponent } from "vue";
import type { PropType } from "vue";

export default defineComponent({
  name: "AiHeadersEditor",
  props: {
    value: { type: String, default: "" },
    onChange: {
      type: Function as PropType<(value: string) => void>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <label class="field">
        <span>自定义 Headers</span>
        <textarea
          rows="4"
          value={props.value}
          placeholder={"x-api-key: xxx\nuser-agent: ...\nX-Foo: bar"}
          onInput={(e) =>
            props.onChange((e.target as HTMLTextAreaElement).value)
          }
        ></textarea>
        <small class="help-text">每行一个：Header: value</small>
      </label>
    );
  },
});
