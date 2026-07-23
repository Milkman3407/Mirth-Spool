"use client";

import { useEffect, useRef, useState } from "react";

interface InstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

export function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [online, setOnline] = useState(true);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const reloadForUpdate = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onlineListener = () => setOnline(true);
    const offlineListener = () => setOnline(false);
    const installListener = (event: Event) => {
      const prompt = event as InstallPromptEvent;
      prompt.preventDefault();
      setInstallPrompt(prompt);
    };
    window.addEventListener("online", onlineListener);
    window.addEventListener("offline", offlineListener);
    window.addEventListener("beforeinstallprompt", installListener);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("online", onlineListener);
        window.removeEventListener("offline", offlineListener);
        window.removeEventListener("beforeinstallprompt", installListener);
      };
    }

    const controllerListener = () => {
      if (reloadForUpdate.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerListener,
    );
    let cancelled = false;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => {
        if (cancelled) return;
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(installing);
            }
          });
        });
        const worker =
          navigator.serviceWorker.controller ?? registration.active;
        if (worker) await sendWorkerMessage(worker, "WARM_SAFE_SHELL");
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onlineListener);
      window.removeEventListener("offline", offlineListener);
      window.removeEventListener("beforeinstallprompt", installListener);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerListener,
      );
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function applyUpdate() {
    if (!waitingWorker) return;
    reloadForUpdate.current = true;
    await sendWorkerMessage(waitingWorker, "SKIP_WAITING");
  }

  if (online && !waitingWorker && !installPrompt) return null;
  return (
    <aside aria-label="Application status" className="pwa-status" role="status">
      {!online ? (
        <div>
          <strong>You are offline.</strong>
          <span>Current feed data and remote media need a connection.</span>
          <button onClick={() => window.location.reload()} type="button">
            Try again
          </button>
        </div>
      ) : null}
      {waitingWorker ? (
        <div>
          <strong>An update is ready.</strong>
          <span>Reload when you have finished your current task.</span>
          <button onClick={() => void applyUpdate()} type="button">
            Reload to update
          </button>
          <button
            className="secondary-button"
            onClick={() => setWaitingWorker(null)}
            type="button"
          >
            Not now
          </button>
        </div>
      ) : null}
      {installPrompt ? (
        <div>
          <strong>Install MirthSpool.</strong>
          <span>
            Use the private app shell without relying on a third party.
          </span>
          <button onClick={() => void install()} type="button">
            Install app
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export async function clearOriginCaches(): Promise<void> {
  window.sessionStorage.clear();
  window.localStorage.clear();
  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  }
}

function sendWorkerMessage(worker: ServiceWorker, type: string) {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    worker.postMessage({ type }, [channel.port2]);
    window.setTimeout(resolve, 2_000);
  });
}
