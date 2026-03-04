import { createSchemaRegistry } from "./schemaRegistry";
import { MyZRecordSchemaV1 } from "./schemas/records";
import { RECORD_SCHEMA_VERSION } from "./versioning";

export const MyZRecordRegistry = createSchemaRegistry({
  latestVersion: RECORD_SCHEMA_VERSION,
  versions: {
    [RECORD_SCHEMA_VERSION]: MyZRecordSchemaV1,
  },
});
