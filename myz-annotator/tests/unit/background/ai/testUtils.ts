import { vi } from "vitest";

class FakeIDBRequest<T = any> {
  result: T | null = null;
  error: any = null;
  onsuccess: ((event: { target: FakeIDBRequest<T> }) => void) | null = null;
  onerror: ((event: { target: FakeIDBRequest<T> }) => void) | null = null;
  onupgradeneeded: ((event: { target: FakeIDBRequest<T> }) => void) | null =
    null;
}

class FakeObjectStore {
  name: string;
  keyPath: string | null;
  data: Map<any, any>;
  indexes: Map<string, { keyPath: string }>;
  tx: FakeTransaction;

  constructor(name: string, keyPath: string | null, tx: FakeTransaction) {
    this.name = name;
    this.keyPath = keyPath;
    this.data = new Map();
    this.indexes = new Map();
    this.tx = tx;
  }

  createIndex(name: string, keyPath: string) {
    this.indexes.set(name, { keyPath });
    return this.index(name);
  }

  index(name: string) {
    const index = this.indexes.get(name);
    if (!index) {
      throw new Error(`Index not found: ${name}`);
    }
    return new FakeIndex(this, index.keyPath);
  }

  get(key: any) {
    const request = new FakeIDBRequest();
    queueMicrotask(() => {
      request.result = this.data.get(key) ?? null;
      request.onsuccess?.({ target: request });
    });
    return request;
  }

  getAll() {
    const request = new FakeIDBRequest();
    queueMicrotask(() => {
      request.result = Array.from(this.data.values());
      request.onsuccess?.({ target: request });
    });
    return request;
  }

  put(value: any) {
    const request = new FakeIDBRequest();
    queueMicrotask(() => {
      const key =
        this.keyPath && value && typeof value === "object"
          ? value[this.keyPath]
          : value?.key;
      this.data.set(key, value);
      request.result = key ?? null;
      request.onsuccess?.({ target: request });
      this.tx.scheduleComplete();
    });
    return request;
  }

  delete(key: any) {
    const request = new FakeIDBRequest();
    queueMicrotask(() => {
      this.data.delete(key);
      request.onsuccess?.({ target: request });
      this.tx.scheduleComplete();
    });
    return request;
  }

  openCursor() {
    const request = new FakeIDBRequest();
    const items = Array.from(this.data.values());
    let index = 0;
    const store = this;

    const cursor = {
      get value() {
        return items[index];
      },
      get key() {
        const current = items[index];
        return store.keyPath && current ? current[store.keyPath] : undefined;
      },
      delete: () => {
        const current = items[index];
        const key =
          store.keyPath && current ? current[store.keyPath] : undefined;
        if (key !== undefined) {
          store.data.delete(key);
        }
        store.tx.scheduleComplete();
      },
      continue: () => {
        index += 1;
        queueMicrotask(() => {
          request.result = index < items.length ? cursor : null;
          request.onsuccess?.({ target: request });
        });
      },
    } as any;

    queueMicrotask(() => {
      request.result = items.length ? cursor : null;
      request.onsuccess?.({ target: request });
      if (!items.length) {
        store.tx.scheduleComplete();
      }
    });

    return request;
  }
}

class FakeIndex {
  store: FakeObjectStore;
  keyPath: string;

  constructor(store: FakeObjectStore, keyPath: string) {
    this.store = store;
    this.keyPath = keyPath;
  }

  getAll(range?: { type: string; value: any }) {
    const request = new FakeIDBRequest();
    queueMicrotask(() => {
      const items = Array.from(this.store.data.values());
      const filtered =
        range?.type === "only"
          ? items.filter((item) => item?.[this.keyPath] === range.value)
          : items;
      request.result = filtered;
      request.onsuccess?.({ target: request });
    });
    return request;
  }

  openCursor(range?: { type: string; value: any }) {
    const request = new FakeIDBRequest();
    const items = Array.from(this.store.data.values());
    const filtered =
      range?.type === "only"
        ? items.filter((item) => item?.[this.keyPath] === range.value)
        : items;
    let index = 0;
    const store = this.store;
    const keyPath = this.keyPath;

    const cursor = {
      get value() {
        return filtered[index];
      },
      get key() {
        const current = filtered[index];
        return current?.[keyPath || "key"];
      },
      delete: () => {
        const current = filtered[index];
        const key = current?.[keyPath || "key"];
        if (key !== undefined) {
          store.data.delete(key);
        }
        store.tx.scheduleComplete();
      },
      continue: () => {
        index += 1;
        queueMicrotask(() => {
          request.result = index < filtered.length ? cursor : null;
          request.onsuccess?.({ target: request });
        });
      },
    } as any;

    queueMicrotask(() => {
      request.result = filtered.length ? cursor : null;
      request.onsuccess?.({ target: request });
      if (!filtered.length) {
        store.tx.scheduleComplete();
      }
    });

    return request;
  }
}

class FakeTransaction {
  db: FakeIDBDatabase;
  mode: "readonly" | "readwrite";
  storeNames: string[];
  oncomplete: (() => void) | null = null;
  onerror: ((event: { target: FakeTransaction }) => void) | null = null;
  private completeScheduled = false;

  constructor(
    db: FakeIDBDatabase,
    storeNames: string[],
    mode: "readonly" | "readwrite",
  ) {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;
  }

  objectStore(name: string) {
    const store = this.db.stores.get(name);
    if (!store) {
      throw new Error(`Object store not found: ${name}`);
    }
    store.tx = this;
    return store;
  }

  scheduleComplete() {
    if (this.completeScheduled) return;
    this.completeScheduled = true;
    queueMicrotask(() => {
      this.oncomplete?.();
    });
  }
}

class FakeIDBDatabase {
  name: string;
  version: number;
  stores: Map<string, FakeObjectStore>;
  objectStoreNames: { contains: (name: string) => boolean };

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (storeName: string) => this.stores.has(storeName),
    };
  }

  createObjectStore(name: string, options?: { keyPath?: string }) {
    const store = new FakeObjectStore(
      name,
      options?.keyPath ?? null,
      null as any,
    );
    this.stores.set(name, store);
    return store;
  }

  transaction(
    storeNames: string | string[],
    mode: "readonly" | "readwrite" = "readonly",
  ) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new FakeTransaction(this, names, mode);
  }
}

export function installFakeIndexedDB() {
  const dbs = new Map<string, FakeIDBDatabase>();
  const indexedDB = {
    open: (name: string, version?: number) => {
      const request = new FakeIDBRequest<IDBDatabase>();
      queueMicrotask(() => {
        const isNew = !dbs.has(name);
        const db = dbs.get(name) ?? new FakeIDBDatabase(name, version || 1);
        dbs.set(name, db);
        request.result = db as unknown as IDBDatabase;
        if (isNew) {
          request.onupgradeneeded?.({ target: request });
        }
        request.onsuccess?.({ target: request });
      });
      return request as unknown as IDBOpenDBRequest;
    },
  } as IDBFactory;

  globalThis.indexedDB = indexedDB;
  globalThis.IDBKeyRange = {
    only: (value: any) => ({ type: "only", value }),
  } as any;

  return {
    reset() {
      dbs.clear();
    },
  };
}

export function installFakeChrome(overrides: Partial<typeof chrome> = {}) {
  const runtime = {
    sendMessage: vi.fn(async () => ({})),
    getURL: vi.fn((path: string) => `chrome-extension://${path}`),
    ...((overrides as any).runtime || {}),
  };
  const offscreen = {
    hasDocument: vi.fn(async () => false),
    createDocument: vi.fn(async () => undefined),
    ...((overrides as any).offscreen || {}),
  };
  const chromeMock: any = {
    runtime,
    offscreen,
    ...overrides,
  };
  (globalThis as any).chrome = chromeMock;
  return chromeMock as typeof chrome;
}

export function installFetchMock() {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function mockFetchOnce(
  response: Partial<Response> & { json?: () => any; text?: () => any },
) {
  const fetchMock = globalThis.fetch as any;
  fetchMock.mockResolvedValueOnce({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? "OK",
    headers: response.headers ?? new Headers(),
    json: response.json || (async () => ({})),
    text: response.text || (async () => ""),
    body: response.body,
  });
}

export interface ToolCallSequenceStep {
  message?: Record<string, any>;
  role?: string;
  content?: any;
  reasoning_content?: string;
  extra_content?: Record<string, any>;
  tool_calls?: any[];
  response?: Record<string, any>;
}

export function createToolCallSequenceClient(options: {
  steps: ToolCallSequenceStep[];
  finalContent?: string;
  finalMessage?: Record<string, any>;
  onRequest?: (request: any, index: number) => void;
}) {
  const { steps, finalContent = "done", finalMessage, onRequest } = options;
  let callCount = 0;

  const buildMessage = (step?: ToolCallSequenceStep) => {
    if (!step) {
      return {
        role: "assistant",
        content: finalContent,
      };
    }

    if (step.message) {
      return {
        role: "assistant",
        content: "",
        ...step.message,
        ...(step.tool_calls ? { tool_calls: step.tool_calls } : {}),
        ...(step.extra_content ? { extra_content: step.extra_content } : {}),
      };
    }

    const message: Record<string, any> = {
      role: step.role || "assistant",
      content: step.content ?? "",
    };
    if (step.tool_calls) {
      message.tool_calls = step.tool_calls;
    }
    if (step.extra_content) {
      message.extra_content = step.extra_content;
    }
    if (typeof (step as any).reasoning_content === "string") {
      message.reasoning_content = (step as any).reasoning_content;
    }
    return message;
  };

  const buildResponse = (step?: ToolCallSequenceStep) => {
    const message = buildMessage(step);
    const response = step?.response ? { ...step.response } : {};
    if (Array.isArray(response.choices)) {
      if (!response.choices.length) {
        response.choices = [{ message }];
      } else if (!response.choices[0]?.message) {
        response.choices[0] = { ...response.choices[0], message };
      }
      return response;
    }
    return {
      choices: [{ message }],
      ...response,
    };
  };

  return {
    createCompletion: vi.fn(async (request: any) => {
      const index = callCount;
      callCount += 1;
      onRequest?.(request, index);
      const step = steps[index];
      if (step) {
        return buildResponse(step);
      }
      if (finalMessage) {
        return buildResponse({ message: finalMessage });
      }
      return buildResponse();
    }),
  };
}
