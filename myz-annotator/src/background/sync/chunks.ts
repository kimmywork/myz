import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hkdfSha256,
  hmacSha256,
  sha256,
  utf8ToBytes,
} from "./crypto";
import type { ChunkEnvelope, SyncRecord } from "./types";
import {
  base32Encode,
  base64ToBytes,
  bytesToBase64,
  decodeBinaryPayload,
  encodeBinaryPayload,
} from "./utils";
import { SYNC_PROTOCOL_VERSION } from "@/shared/versioning";

export interface BuiltChunk {
  chunkId: string;
  chunkCipher: Uint8Array;
  chunkNonce: Uint8Array;
  recordHash: string;
  keyId: string;
}

export async function buildChunkForRecord(
  record: SyncRecord,
  masterKey: Uint8Array,
  prevHash: string,
): Promise<BuiltChunk> {
  const recordPayload = encodeBinaryPayload({
    protocolVersion: SYNC_PROTOCOL_VERSION,
    recordId: record.recordId,
    type: record.type,
    updatedAt: record.updatedAt,
    data: record.data,
  });
  const recordKey = await hkdfSha256(
    masterKey,
    utf8ToBytes(`record:${record.recordId}|${record.updatedAt}|${prevHash}`),
    32,
  );
  const aad = utf8ToBytes(`${record.recordId}|${record.updatedAt}|${prevHash}`);
  const { nonce: recordNonce, ciphertext: recordCipher } = await aesGcmEncrypt(
    recordKey,
    recordPayload,
    aad,
  );
  const keyId = base32Encode(await sha256(recordKey));
  const envelope: ChunkEnvelope = {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    recordId: record.recordId,
    updatedAt: record.updatedAt,
    prevHash,
    keyId,
    recordCipher: bytesToBase64(recordCipher),
    recordNonce: bytesToBase64(recordNonce),
  };
  const chunkPlaintext = encodeBinaryPayload(envelope);
  const chunkId = base32Encode(await hmacSha256(masterKey, chunkPlaintext));
  const chunkKey = await hkdfSha256(
    masterKey,
    utf8ToBytes(`chunk-key:${chunkId}`),
    32,
  );
  const { nonce: chunkNonce, ciphertext: chunkCipher } = await aesGcmEncrypt(
    chunkKey,
    chunkPlaintext,
  );
  return {
    chunkId,
    chunkCipher,
    chunkNonce,
    recordHash: record.recordHash,
    keyId,
  };
}

export async function decryptChunkEnvelope(
  masterKey: Uint8Array,
  chunkId: string,
  chunkNonce: Uint8Array,
  chunkCipher: Uint8Array,
): Promise<ChunkEnvelope> {
  const chunkKey = await hkdfSha256(
    masterKey,
    utf8ToBytes(`chunk-key:${chunkId}`),
    32,
  );
  const plain = await aesGcmDecrypt(chunkKey, chunkNonce, chunkCipher);
  const envelope = decodeBinaryPayload(plain) as ChunkEnvelope;
  return {
    protocolVersion: envelope.protocolVersion || SYNC_PROTOCOL_VERSION,
    recordId: envelope.recordId,
    updatedAt: envelope.updatedAt,
    prevHash: envelope.prevHash,
    keyId: envelope.keyId,
    recordCipher: envelope.recordCipher,
    recordNonce: envelope.recordNonce,
  };
}

export async function decryptRecordPayload(
  masterKey: Uint8Array,
  envelope: ChunkEnvelope,
): Promise<Uint8Array> {
  const recordKey = await hkdfSha256(
    masterKey,
    utf8ToBytes(
      `record:${envelope.recordId}|${envelope.updatedAt}|${envelope.prevHash}`,
    ),
    32,
  );
  const aad = utf8ToBytes(
    `${envelope.recordId}|${envelope.updatedAt}|${envelope.prevHash}`,
  );
  const recordCipher = base64ToBytes(envelope.recordCipher);
  const recordNonce = base64ToBytes(envelope.recordNonce);
  return aesGcmDecrypt(recordKey, recordNonce, recordCipher, aad);
}
