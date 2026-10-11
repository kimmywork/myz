/**
 * Public barrel for content HTML/DOM helpers. Implementation is split across
 * `content/html/{serialize,sanitize,dom}.ts`.
 */
export { serializeRangeToHtml } from "./html/serialize.js";
export {
  isElementInViewport,
  normalizeParagraphText,
  getElementPageRect,
  isRectValid,
  collectLeafBlocks,
  waitForNextPaint,
  type ElementPosition,
  type HTMLLeaf,
} from "./html/dom.js";
