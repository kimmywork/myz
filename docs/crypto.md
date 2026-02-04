解你的需求：在 myz-annotator 中实现端到端加密（E2EE）+ 增量分片同步到 S3 兼容存储；服务端永远只保存密文与少量元数据（B1 的密封形式），任何解密与派生都在本地；支持多端并发、冲突处理、归档与清理、密钥轮换（全量重加密）、以及签名验证/可信性校验。下面是我理解后的实现方案与加密流程草案，供你 review。

  方案总览

  - 本地：以“数据快照→分片→加密→签名→上传”的流水线运行；同步索引/清单（manifest）也加密并签名。
  - 远端（S3）：只保存密文分片、密文 manifest、密文锁、密文公钥记录（用于比对/提醒密钥变更）。
  - 多端：基于“租约锁 + 乐观并发 + 签名验证”的策略，确保冲突可检测且可恢复。
  - 密钥轮换：生成新密钥集（B1/B2/C），重新加密全部内容，上传新“纪元”（epoch），旧纪元进入可清理状态。

  ———

  ## 1) 密钥体系与派生（满足 A → B1/B2/C，不可逆）

  目标： A 不可逆地产生 B1/B2/C；仅 B1（加密后）允许上云；B2/C 永不离开本地；A 在本地也只作为一次性输入。

  建议算法

  - KDF（从 A 推导主种子）：Argon2id（memory-hard）
      - 参数：如 m=64MB, t=3, p=1（可调）
      - 输出 seed（32字节）
  - 从 seed 导出：
      - B1/B2：Ed25519 keypair（从 seed 走确定性生成）
      - C（对称主密钥）：HKDF-SHA256(seed, info="myz:e2ee:master") → 32字节
      - 所有 derivation 固定且跨平台一致
  - 清理 A：完成后擦除内存中的 A 与中间盐/缓存，仅保留 “已设置时间戳” 作为 UI 状态。

  补充

  - salt：每个用户固定本地保存一个 salt（未上云），用于 Argon2id
  - A 不写磁盘、不上云、不日志
  - B1 在云端仅“密封存储”（见下）

  ———

  ## 2) 数据模型与分片策略

  对象类型

  - record：一条业务记录（标注/对话/配置等）
  - chunk：分片文件（密文）
  - manifest：当前快照的索引（密文）
  - lock：分布式锁对象（密文+签名）
  - epoch：密钥轮换后的版本命名空间

  分片建议

  - 基于内容和对象类型分片（例如每 256KB 或 1MB 一片）
  - 同一记录可跨片，也可“record per chunk”（视数据规模）
  - 使用 chunkId = BLAKE3(plaintext_chunk) 或 BLAKE3(ciphertext)（更推荐 plaintext+nonce 组合）

  ———

  ## 3) 加密与签名流程（端到端）

  ### 3.1 记录级链式派生密钥（解决增量 + 篡改/冲突）

  需求： “每条记录通过 C + 时间戳 + 上一次生成的密钥（或类似逻辑）进行链式派生”，并处理同步冲突。

  建议：

  - 为每个“写入批次”生成 sessionNonce（随机 32字节）
  - 记录级派生（支持有序链）：
      - K0 = HKDF(C, info="myz:record:root")
      - 第 i 条记录：Ki = HKDF(Ki-1, info=recordId || timestamp || sessionNonce)
  - 当出现分支（并发写入导致 “两个不同的 Ki-1”），在 manifest 记录“父链指针”。
      - 本地合并时按“最后写入 + 签名有效 + 业务合并规则”择优并生成新的合并链头。
  - 每条记录加密：XChaCha20-Poly1305(Ki, nonce, aad)
      - AAD 包含 recordId、type、timestamp、parentHash

  ### 3.2 分片与 Manifest

  - 分片密文：XChaCha20-Poly1305(Ck, nonce, aad)
      - Ck = HKDF(C, info="myz:chunk:" + chunkId)
  - manifest 同样加密，里面记录：
      - chunk 列表、chunk 哈希、record 索引、链头、上次同步游标
  - manifest 生成后用 B2 做签名：Sig = Ed25519.sign(B2, manifestHash)
  - 服务端只存 manifest.enc + Sig

  ———

  ## 4) B1 在云端的处理（密钥变更提醒）

  目标： 只允许 B1 以“加密形式”存储，用于判断最终密钥是否更改。
  建议：

  - 生成 B1_fingerprint = SHA256(B1)
  - 再用 B1 自身（或由 C 派生的 C_pubseal）加密该 fingerprint，产生 B1_sealed
      - sealed = XChaCha20-Poly1305(K=HKDF(C, "myz:seal"), nonce, B1_fingerprint)
  - 客户端可用 C 解封，若无法解封则提示密钥不一致
  - 服务端仅保存 sealed，不可恢复 B1

  ———

  ## 5) 同步协议（增量 + 冲突 + 多端）

  ### 5.1 基本同步流程

  1. 拉取最新 manifest（密文）
  2. 用 C 解密并验证签名（B1）
  3. 比对本地索引
  4. 缺失 chunk 拉取并解密校验
  5. 本地新增记录 → 分片 → 上传 → 更新 manifest → 签名 → 上传
  6. 写入同步游标（例如 lastManifestHash）

  ### 5.2 冲突处理

  - 若服务端 manifest 更新快于本地：
      - 本地先“追上”服务端，合并到本地状态
      - 写入时使用新链头，避免覆盖
  - 如果检测到两个 manifest 具有不同链头：
      - 采用“合并分支”策略：保留双分支并生成一个合并 manifest
      - 合并决策依赖业务字段（如高亮内容冲突合并/优先时间戳）

  ### 5.3 多端锁（租约）

  - lock 对象 lock/{userId}
      - 内容：clientId, leaseExpiresAt, nonce, signature(B2)
      - 采用“租约 + 续约”机制，超时自动释放
      - 客户端必须持有锁才可写 manifest
  - 失败处理：若锁被占，客户端进入只读同步模式 + 重试

  ———

  ## 6) 归档与清理（历史上限/废弃分片清理）

  - manifest 中维护 “活跃 chunk 集合”
  - 定期生成 “归档 manifest”（仅保留近 N 版本或 N 天）
  - 清理策略：
      - 找到所有已被“新 manifest”引用的 chunk
      - 标记未引用 chunk 为“可删”，延迟删除（安全期）
  - 删除操作需锁持有者执行，并写入清理日志（也加密）

  ———

  ## 7) 密钥轮换（全量重加密）

  - 用户输入新 A → 推导新的 B1/B2/C
  - 进入 “epoch+1”
  - 本地解密旧数据 → 重新加密为新密钥
  - 上传新 epoch 的全量数据与 manifest
  - 将旧 epoch 标记为“待清理”
  - 其他客户端：发现 B1_sealed 与本地解封不一致 → 进入“要求重新输入密钥”状态，否则清空同步记录

  ———

  ## 8) 安全算法建议（现代、安全、效率兼顾）

  - KDF：Argon2id
  - 对称加密：XChaCha20-Poly1305（nonce 易管理，移动端友好）
  - 哈希：BLAKE3（快，跨平台）
  - 签名：Ed25519
  - 派生：HKDF-SHA256
  - 完全避免：在云端存储任何明文/明文元数据/可逆密钥材料
