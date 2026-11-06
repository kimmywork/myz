import { expect, test } from "@playwright/test";
import { S3Client } from "../../../packages/sync-core/src/s3Client.js";
import {
  startFakeS3,
  type FakeS3,
  type FakeS3Settings,
} from "../helpers/fake-s3.js";

/**
 * Transport conformance for the hand-written S3 client (`@myz/sync-core/s3Client`).
 *
 * The server is fakes3 in `auth: true` mode, so it verifies SigV4 and follows
 * AWS semantics (path-style keys, ETags, conditional writes, XML listings).
 * The AWS SDK talks to the same server as an independent oracle: anything it
 * wrote must be readable by our client and vice versa. No locally written mock
 * stands in for S3 here.
 */

let fake: FakeS3;

const client = (overrides: Partial<FakeS3Settings> = {}) =>
  new S3Client({ ...fake.s3Settings(), ...overrides });

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

test.beforeEach(async () => {
  fake = await startFakeS3();
});

test.afterEach(async () => {
  await fake.stop();
});

test("the server verifies SigV4, and our signer passes", async () => {
  // If fakes3 were not checking signatures this would resolve instead of 403.
  await expect(
    client({ secretAccessKey: "wrong-secret" }).getObject("missing"),
  ).rejects.toThrow(/S3 get failed: 403/);

  await expect(client().getObject("missing")).resolves.toBeNull();
});

test("round-trips objects, keys and ETags with the AWS SDK", async () => {
  const s3 = client();
  const body = encode('{"note":"中文 with spaces"}');
  const key = "acct_1/shard a+b&ü.json";

  await s3.putObject(key, body, { contentType: "application/json" });

  const got = await s3.getObject(key);
  expect(got?.body).toEqual(body);
  expect(got?.etag).toMatch(/^"[0-9a-f]{32}"$/);

  const head = await s3.headObject(key);
  expect(head?.etag).toBe(got?.etag);

  // The AWS SDK sees exactly the key we signed for, decoded once.
  expect(await fake.listKeys("")).toEqual([key]);
  expect(await fake.readObject(key)).toEqual(body);

  // …and we read what the AWS SDK wrote.
  await fake.seedObject("acct_1/from-aws.bin", "written-by-aws");
  const fromAws = await s3.getObject("acct_1/from-aws.bin");
  expect(decode(fromAws!.body)).toBe("written-by-aws");
});

test("maps the configured key prefix onto both writes and listings", async () => {
  const prefixed = client({ prefix: "team-a" });
  await prefixed.putObject("acct_3/x", encode("v"));

  expect(await fake.listKeys("")).toEqual(["team-a/acct_3/x"]);

  const listed = await prefixed.listObjects("acct_3");
  expect(listed.map((object) => object.key)).toEqual(["team-a/acct_3/x"]);
  expect(listed[0].size).toBe(1);
});

test("honours conditional writes and deletes", async () => {
  const s3 = client();
  const key = "acct_4/lock.json";

  await s3.putObject(key, encode("first"), { ifNoneMatch: "*" });
  await expect(
    s3.putObject(key, encode("second"), { ifNoneMatch: "*" }),
  ).rejects.toThrow(/S3 put failed: 412/);

  const etag = (await s3.headObject(key))?.etag;
  expect(etag).toBeTruthy();
  await expect(
    s3.putObject(key, encode("stale"), { ifMatch: '"stale-etag"' }),
  ).rejects.toThrow(/S3 put failed: 412/);
  await s3.putObject(key, encode("second"), { ifMatch: etag });

  const updatedEtag = (await s3.headObject(key))?.etag;
  expect(updatedEtag).not.toBe(etag);
  await expect(s3.deleteObject(key, { ifMatch: etag })).rejects.toThrow(
    /S3 delete failed: 412/,
  );
  await s3.deleteObject(key, { ifMatch: updatedEtag });
  await expect(s3.getObject(key)).resolves.toBeNull();
  // Deleting an already-deleted key stays idempotent.
  await expect(s3.deleteObject(key)).resolves.toBeUndefined();
});

test("lists every page, not just the first thousand keys", async () => {
  const total = 1005;
  for (let start = 0; start < total; start += 50) {
    const batch = Array.from(
      { length: Math.min(50, total - start) },
      (_, offset) => start + offset,
    );
    await Promise.all(
      batch.map((index) => fake.seedObject(`acct_5/shard-${index}`, "x")),
    );
  }

  const objects = await client().listObjects("acct_5/");

  expect(objects).toHaveLength(total);
  expect(new Set(objects.map((object) => object.key)).size).toBe(total);
  expect(objects[0].size).toBe(1);
  expect(objects[0].lastModified).toBeTruthy();
});

test("treats missing buckets and objects as empty", async () => {
  await expect(
    client({ bucket: "no-such-bucket" }).listObjects(""),
  ).resolves.toEqual([]);
  await expect(client().headObject("no-such-key")).resolves.toBeNull();
});
