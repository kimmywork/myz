import { defineComponent } from "vue";
import Inspector from "./components/Inspector";
import Interests from "./components/Interests";
import Modal from "./components/Modal";
import Notification from "./components/Notifications";
import Toolbar from "./components/Toolbar";

export default defineComponent({
  name: "App",
  setup() {
    return () => (
      <div>
        <Modal />
        <Inspector />
        <Toolbar />
        <Notification />
        <Interests />
      </div>
    );
  },
});
