import pool from '../config/database';

export interface SyncMetadata {
  id: string;
  user_id: string;
  last_sync_at: Date;
  highlights_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface HighlightMetadata {
  id: string;
  user_id: string;
  highlight_id: string;
  file_path: string;
  synced_at: Date;
  deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export class SyncModel {
  static async getSyncMetadata(userId: string): Promise<SyncMetadata | null> {
    const query = 'SELECT * FROM sync_metadata WHERE user_id = $1';
    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  static async upsertSyncMetadata(userId: string, highlightsCount: number): Promise<SyncMetadata> {
    const query = `
      INSERT INTO sync_metadata (user_id, last_sync_at, highlights_count)
      VALUES ($1, NOW(), $2)
      ON CONFLICT (user_id) 
      DO UPDATE SET last_sync_at = NOW(), highlights_count = $2
      RETURNING *
    `;
    const result = await pool.query(query, [userId, highlightsCount]);
    return result.rows[0];
  }

  static async getHighlightMetadata(userId: string, highlightId: string): Promise<HighlightMetadata | null> {
    const query = 'SELECT * FROM highlights_metadata WHERE user_id = $1 AND highlight_id = $2';
    const result = await pool.query(query, [userId, highlightId]);
    return result.rows[0] || null;
  }

  static async getAllHighlightMetadata(userId: string): Promise<HighlightMetadata[]> {
    const query = 'SELECT * FROM highlights_metadata WHERE user_id = $1 AND deleted = false ORDER BY synced_at DESC';
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async upsertHighlightMetadata(
    userId: string,
    highlightId: string,
    filePath: string
  ): Promise<HighlightMetadata> {
    const query = `
      INSERT INTO highlights_metadata (user_id, highlight_id, file_path, synced_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, highlight_id)
      DO UPDATE SET file_path = $3, synced_at = NOW(), deleted = false
      RETURNING *
    `;
    const result = await pool.query(query, [userId, highlightId, filePath]);
    return result.rows[0];
  }

  static async markHighlightDeleted(userId: string, highlightId: string): Promise<void> {
    const query = `
      UPDATE highlights_metadata 
      SET deleted = true 
      WHERE user_id = $1 AND highlight_id = $2
    `;
    await pool.query(query, [userId, highlightId]);
  }

  static async deleteHighlightMetadata(userId: string, highlightId: string): Promise<void> {
    const query = 'DELETE FROM highlights_metadata WHERE user_id = $1 AND highlight_id = $2';
    await pool.query(query, [userId, highlightId]);
  }
}
