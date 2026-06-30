import { createBaseConfig } from "../../eslint.config.base.js";

export default createBaseConfig({
  tsconfigRootDir: import.meta.dirname,
  extraGlobals: {
    ParentNode: "readonly",
  },
});
