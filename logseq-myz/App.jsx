import { defineComponent, ref } from "vue";

import "@logseq/libs";

import "./styles.css";

const closeApp = () => {
  logseq.isMainUIVisible && logseq.hideMainUI({ restoreEditingCursor: true});
}

export default defineComponent({
  name: "App",
  setup() {
    let left = ref(0);
    let ready = ref(false);
    
    logseq.once('ui:visible:changed', ({ visible }) => {
      visible && (ready.value = true)
    })

    logseq.on('ui:visible:changed', ({ visible }) => {
      if (visible) {
        const el = top.document.querySelector(`div[data-injected-ui=logseq-myz--myz-show-dashboard]`)
        const {left: buttonLeft} = el.getBoundingClientRect()
        left.value = buttonLeft - 110
      }
    })

    return () => (
      <div className="myz-wrap">
        {ready?
        <div className="myz-content" style={{ left:  left.value + "px" }}>
          <a href="#" class="button" onClick={closeApp}>Hello MyZ 📺</a>
        </div>: <div/>}
      </div>
    );
  },
});
