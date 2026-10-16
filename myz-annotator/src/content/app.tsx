import { defineComponent } from "vue";
import Inspector from "./components/Inspector";
import Modal from "./components/Modal";
import Notification from "./components/Notifications";
import Toolbar from "./components/Toolbar";
import VideoCaptureButton from "./components/VideoCaptureButton";

export default defineComponent({
  name: "App",
  setup() {
    return () => (
      <div>
        <Modal />
        <Inspector />
        <Toolbar />
        <VideoCaptureButton />
        <Notification />
      </div>
    );
  },
});
