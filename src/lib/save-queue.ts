"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTransientError } from "@/lib/http-error";

export type SaveOperation = {
  key: string;
  run: (signal: AbortSignal) => Promise<unknown>;
  describe: string;
  onSuccess?: (response: unknown) => void;
};

export type SaveQueueState = {
  pending: Map<string, SaveOperation>;
  inFlight: Map<string, SaveOperation>;
  failed: Map<string, { op: SaveOperation; error: string }>;
};

type InFlightEntry = {
  op: SaveOperation;
  controller: AbortController;
};

type Waiter = {
  keys: Set<string>;
  resolve: (isDrained: boolean) => void;
};

const RETRY_DELAYS_MS = [0, 1000, 3000] as const;

export function useSaveQueue() {
  const pendingRef = useRef<Map<string, SaveOperation>>(new Map());
  const inFlightRef = useRef<Map<string, InFlightEntry>>(new Map());
  const failedRef = useRef<Map<string, { op: SaveOperation; error: string }>>(
    new Map(),
  );
  const droppedKeysRef = useRef<Set<string>>(new Set());
  const waitersRef = useRef<Waiter[]>([]);
  const startOperationRef = useRef<(op: SaveOperation) => void>(() => {});
  const [state, setState] = useState<SaveQueueState>(() => ({
    pending: new Map(),
    inFlight: new Map(),
    failed: new Map(),
  }));

  const notify = useCallback(() => {
    setState({
      pending: new Map(pendingRef.current),
      inFlight: new Map(
        [...inFlightRef.current].map(([key, entry]) => [key, entry.op]),
      ),
      failed: new Map(failedRef.current),
    });
  }, []);

  const settleWaiters = useCallback(() => {
    const remainingWaiters: Waiter[] = [];

    for (const waiter of waitersRef.current) {
      const hasPending = hasAnyKey(pendingRef.current, waiter.keys);
      const hasInFlight = hasAnyKey(inFlightRef.current, waiter.keys);
      const hasFailed = hasAnyKey(failedRef.current, waiter.keys);

      if (hasFailed) {
        waiter.resolve(false);
      } else if (!hasPending && !hasInFlight) {
        waiter.resolve(true);
      } else {
        remainingWaiters.push(waiter);
      }
    }

    waitersRef.current = remainingWaiters;
  }, []);

  const runWithRetry = useCallback(async (op: SaveOperation) => {
    let lastError: unknown = null;

    for (let index = 0; index < RETRY_DELAYS_MS.length; index += 1) {
      const delayMs = RETRY_DELAYS_MS[index];

      if (delayMs > 0) {
        await sleep(delayMs);
      }

      const entry = inFlightRef.current.get(op.key);

      if (!entry) {
        throw new Error("Save operation was cancelled.");
      }

      try {
        return await op.run(entry.controller.signal);
      } catch (error) {
        lastError = error;

        if (!isTransientError(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Save failed.");
  }, []);

  const startOperation = useCallback(
    (op: SaveOperation) => {
      const controller = new AbortController();

      pendingRef.current.delete(op.key);
      inFlightRef.current.set(op.key, { op, controller });
      notify();

      void runWithRetry(op)
        .then((response) => {
          inFlightRef.current.delete(op.key);
          if (droppedKeysRef.current.delete(op.key)) {
            settleWaiters();
            notify();
            return;
          }

          op.onSuccess?.(response);

          const pendingOp = pendingRef.current.get(op.key);

          if (pendingOp) {
            startOperationRef.current(pendingOp);
          } else {
            settleWaiters();
            notify();
          }
        })
        .catch((error) => {
          inFlightRef.current.delete(op.key);
          if (droppedKeysRef.current.delete(op.key)) {
            settleWaiters();
            notify();
            return;
          }

          const pendingOp = pendingRef.current.get(op.key);

          if (pendingOp) {
            startOperationRef.current(pendingOp);
            return;
          }

          failedRef.current.set(op.key, {
            op,
            error: getErrorMessage(error),
          });
          settleWaiters();
          notify();
        });
    },
    [notify, runWithRetry, settleWaiters],
  );

  useEffect(() => {
    startOperationRef.current = startOperation;
  }, [startOperation]);

  const enqueue = useCallback(
    (op: SaveOperation) => {
      droppedKeysRef.current.delete(op.key);
      failedRef.current.delete(op.key);

      if (inFlightRef.current.has(op.key)) {
        pendingRef.current.set(op.key, op);
        notify();
        settleWaiters();
        return;
      }

      startOperation(op);
    },
    [notify, settleWaiters, startOperation],
  );

  const retryAll = useCallback(() => {
    const failedOps = [...failedRef.current.values()].map(
      (failure) => failure.op,
    );

    for (const op of failedOps) {
      failedRef.current.delete(op.key);
      enqueue(op);
    }

    notify();
    settleWaiters();
  }, [enqueue, notify, settleWaiters]);

  const drop = useCallback(
    (key: string) => {
      pendingRef.current.delete(key);
      failedRef.current.delete(key);
      if (inFlightRef.current.has(key)) {
        droppedKeysRef.current.add(key);
      }
      settleWaiters();
      notify();
    },
    [notify, settleWaiters],
  );

  const waitForKeys = useCallback(
    (keys: string[]) => {
      const keySet = new Set(keys);

      if (hasAnyKey(failedRef.current, keySet)) {
        return Promise.resolve(false);
      }

      if (
        !hasAnyKey(pendingRef.current, keySet) &&
        !hasAnyKey(inFlightRef.current, keySet)
      ) {
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        waitersRef.current.push({ keys: keySet, resolve });
      });
    },
    [],
  );

  useEffect(() => {
    window.addEventListener("online", retryAll);

    return () => window.removeEventListener("online", retryAll);
  }, [retryAll]);

  const isBusy =
    state.pending.size > 0 || state.inFlight.size > 0 || state.failed.size > 0;

  return {
    state,
    isBusy,
    enqueue,
    retryAll,
    drop,
    waitForKeys,
  };
}

function hasAnyKey(
  map: ReadonlyMap<string, unknown>,
  keys: Set<string>,
) {
  for (const key of keys) {
    if (map.has(key)) {
      return true;
    }
  }

  return false;
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
