import { readSettings } from "../../storage";
import { createLocalAccount } from "../accountKeyring";
import { syncAccountNow } from "./engine";

export interface BootstrapResult {
  accountId: string;
}

/**
 * Clean-break bootstrap: create the v2 account and run the first sync.
 * Legacy v1 rescue was removed with the v1 sync path.
 */
export async function bootstrapV2Account(): Promise<BootstrapResult> {
  const settings = await readSettings();
  const s3 = settings.sync?.s3;
  if (
    !s3?.endpoint ||
    !s3?.bucket ||
    !s3?.accessKeyId ||
    !s3?.secretAccessKey
  ) {
    throw new Error("请先配置并启用 S3 同步");
  }
  const account = await createLocalAccount();
  await syncAccountNow();
  return { accountId: account.accountId };
}
