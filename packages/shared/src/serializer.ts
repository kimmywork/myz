/**
 * Public barrel for range serialization. Implementation is split across
 * `serializer/{path,text,range}.ts`; importers keep using this module.
 */
export {
  isMyzWrapper,
  isNodeFromMyz,
  findPrimaryDescendant,
  getLogicalChildNodes,
  getDirectChildAndLogical,
  nodeName,
  sameNodeType,
  buildPath,
  resolvePath,
  resolvePartialPath,
  type ChildAndLogical,
  type PathSegment,
} from "./serializer/path.ts"
export {
  getDescendantTextNodes,
  getTextLength,
  charOffsetWithinElement,
  nodeForCharOffset,
  findRangeByNormalizedText,
} from "./serializer/text.ts"
export {
  unwrapNode,
  serializeRange,
  serializeRangePaths,
  deserializeRange,
  type SerializedRange,
} from "./serializer/range.ts"
