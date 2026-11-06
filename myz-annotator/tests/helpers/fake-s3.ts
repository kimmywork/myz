import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client as AwsS3Client,
} from "@aws-sdk/client-s3";
import { start, type FakeS3Server } from "fakes3-sdk";

/**
 * Bucket the sync suite writes to. fakes3 (like S3) requires buckets to exist,
 * so the fixture creates it before the extension connects.
 */
export const FAKE_S3_BUCKET = "myz";

const REGION = "us-east-1";

/** S3 settings slice accepted by `myz:updateSettings` and the setup wizard. */
export interface FakeS3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  prefix: string;
}

/**
 * An in-process S3-compatible server plus an AWS SDK client for assertions.
 *
 * `fakes3` is started with `auth: true`, so it verifies every SigV4 signature
 * the extension's hand-rolled `S3Client` produces: a green run means the
 * transport (signing, path-style keys, conditional writes, XML listings) is
 * accepted by a server that follows AWS behaviour, instead of by a mock we
 * wrote ourselves.
 */
export interface FakeS3 {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  server: FakeS3Server;
  /** Settings for the extension; pass a prefix to exercise prefixed buckets. */
  s3Settings: (prefix?: string) => FakeS3Settings;
  /** Keys the server actually holds, straight from the AWS SDK (not our client). */
  listKeys: (prefix?: string) => Promise<string[]>;
  /** Raw object bytes, or null when the key is absent. */
  readObject: (key: string) => Promise<Uint8Array | null>;
  /** Write an object with the AWS SDK, e.g. to seed data our client must read. */
  seedObject: (key: string, body: string | Uint8Array) => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Start fakes3 and create the test bucket. The native binding ships prebuilt
 * per platform; a missing binding fails here with the underlying error rather
 * than as a confusing sync failure inside the extension.
 */
export async function startFakeS3(): Promise<FakeS3> {
  const server = await start({ auth: true });
  const credentials = {
    accessKeyId: server.accessKey,
    secretAccessKey: server.secretKey,
  };
  const aws = new AwsS3Client({
    region: REGION,
    endpoint: server.endpoint,
    forcePathStyle: true,
    credentials,
  });

  await aws.send(new CreateBucketCommand({ Bucket: FAKE_S3_BUCKET }));

  return {
    endpoint: server.endpoint,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    server,
    s3Settings(prefix = ""): FakeS3Settings {
      return {
        endpoint: server.endpoint,
        region: REGION,
        bucket: FAKE_S3_BUCKET,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: "",
        prefix,
      };
    },
    async listKeys(prefix = ""): Promise<string[]> {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const page = await aws.send(
          new ListObjectsV2Command({
            Bucket: FAKE_S3_BUCKET,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        keys.push(...(page.Contents ?? []).map((object) => object.Key ?? ""));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    async readObject(key: string): Promise<Uint8Array | null> {
      try {
        const response = await aws.send(
          new GetObjectCommand({ Bucket: FAKE_S3_BUCKET, Key: key }),
        );
        return await response.Body!.transformToByteArray();
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === "NoSuchKey" || name === "NotFound") return null;
        throw error;
      }
    },
    async seedObject(key: string, body: string | Uint8Array): Promise<void> {
      await aws.send(
        new PutObjectCommand({
          Bucket: FAKE_S3_BUCKET,
          Key: key,
          Body:
            typeof body === "string" ? new TextEncoder().encode(body) : body,
        }),
      );
    },
    stop: () => server.stop(),
  };
}
