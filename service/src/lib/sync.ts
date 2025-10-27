export type SyncChangeType = "create" | "update" | "delete";

export type SyncChange<T = Record<string, unknown>> = {
  id: string;
  type: SyncChangeType;
  payload?: T;
  updatedAt: string;
};

export type SyncSnapshot<T = Record<string, unknown>> = {
  annotations: Record<string, { id: string; data: T; updatedAt: string }>;
};

export function applyChanges<T>(
  snapshot: SyncSnapshot<T>,
  changes: SyncChange<T>[]
): SyncSnapshot<T> {
  const nextSnapshot: SyncSnapshot<T> = {
    annotations: { ...snapshot.annotations },
  };

  for (const change of changes) {
    if (!change.id) {
      continue;
    }

    const key = change.id;

    switch (change.type) {
      case "create":
      case "update": {
        if (!change.payload) {
          continue;
        }

        nextSnapshot.annotations[key] = {
          id: key,
          data: change.payload,
          updatedAt: change.updatedAt,
        };
        break;
      }
      case "delete": {
        delete nextSnapshot.annotations[key];
        break;
      }
      default: {
        const exhaustive: never = change.type;
        throw new Error(`Unsupported change type: ${exhaustive}`);
      }
    }
  }

  return nextSnapshot;
}

export function emptySnapshot<T>(): SyncSnapshot<T> {
  return { annotations: {} };
}
