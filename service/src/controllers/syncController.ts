import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SyncModel } from '../models/Sync';
import { saveHighlight, loadAllHighlights, deleteHighlight } from '../utils/storage';

function asAuthRequest(req: Request): AuthRequest {
  return req as AuthRequest;
}

export class SyncController {
  static async syncHighlights(req: Request, res: Response): Promise<void> {
    try {
      const authReq = asAuthRequest(req);
      if (!authReq.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { highlights, deletedIds = [] } = req.body;
      const userId = authReq.user.userId;

      const serverHighlights = await loadAllHighlights(userId);
      const serverMetadata = await SyncModel.getAllHighlightMetadata(userId);
      const serverHighlightIds = new Set(serverMetadata.map(m => m.highlight_id));

      const clientHighlightIds = new Set(Object.keys(highlights));
      const toUpload: string[] = [];
      const toDownload: string[] = [];
      const toDelete: string[] = [];

      for (const id of clientHighlightIds) {
        const clientHighlight = highlights[id];
        const serverHighlight = serverHighlights[id];

        if (!serverHighlight) {
          toUpload.push(id);
        } else {
          const clientUpdated = new Date(clientHighlight.updatedAt || clientHighlight.createdAt);
          const serverUpdated = new Date(serverHighlight.updatedAt || serverHighlight.createdAt);

          if (clientUpdated > serverUpdated) {
            toUpload.push(id);
          } else if (serverUpdated > clientUpdated) {
            toDownload.push(id);
          }
        }
      }

      for (const id of serverHighlightIds) {
        if (!clientHighlightIds.has(id) && !deletedIds.includes(id)) {
          toDownload.push(id);
        }
      }

      for (const id of toUpload) {
        const highlightData = highlights[id];
        const filePath = await saveHighlight(userId, id, highlightData);
        await SyncModel.upsertHighlightMetadata(userId, id, filePath);
      }

      for (const id of deletedIds) {
        await deleteHighlight(userId, id);
        await SyncModel.markHighlightDeleted(userId, id);
        toDelete.push(id);
      }

      const downloadData: Record<string, any> = {};
      for (const id of toDownload) {
        downloadData[id] = serverHighlights[id];
      }

      const totalHighlights = Object.keys(await loadAllHighlights(userId)).length;
      await SyncModel.upsertSyncMetadata(userId, totalHighlights);

      res.json({
        message: 'Sync completed',
        stats: {
          uploaded: toUpload.length,
          downloaded: toDownload.length,
          deleted: toDelete.length,
          total: totalHighlights,
        },
        downloadData,
        deleteIds: toDelete,
      });
    } catch (error) {
      console.error('Sync error:', error);
      res.status(500).json({ error: 'Sync failed' });
    }
  }

  static async getSyncStatus(req: Request, res: Response): Promise<void> {
    try {
      const authReq = asAuthRequest(req);
      if (!authReq.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const userId = authReq.user.userId;
      const metadata = await SyncModel.getSyncMetadata(userId);

      if (!metadata) {
        res.json({
          lastSyncAt: null,
          highlightsCount: 0,
          synced: false,
        });
        return;
      }

      res.json({
        lastSyncAt: metadata.last_sync_at,
        highlightsCount: metadata.highlights_count,
        synced: true,
      });
    } catch (error) {
      console.error('Get sync status error:', error);
      res.status(500).json({ error: 'Failed to get sync status' });
    }
  }

  static async getAllHighlights(req: Request, res: Response): Promise<void> {
    try {
      const authReq = asAuthRequest(req);
      if (!authReq.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const userId = authReq.user.userId;
      const highlights = await loadAllHighlights(userId);

      res.json({
        highlights,
        count: Object.keys(highlights).length,
      });
    } catch (error) {
      console.error('Get highlights error:', error);
      res.status(500).json({ error: 'Failed to get highlights' });
    }
  }
}
