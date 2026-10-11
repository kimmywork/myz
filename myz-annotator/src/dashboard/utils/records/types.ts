import type { MyZRecord } from "@myz/shared/types";

export type PageSortMode = "time" | "range";

export interface PageGroup {
  key: string;
  url: string;
  title: string;
  hostname: string;
  latestAt: string;
  count: number;
  records: MyZRecord[];
}
