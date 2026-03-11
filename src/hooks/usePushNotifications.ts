import { useState, useEffect, useCallback } from "react";

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    const isSupported = "Notification" in window && "serviceWorker" in navigator;
    setSupported(isSupported);
    if (isSupported) {
      setPermission(Notification.permission);
      // Check existing subscription
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.pushManager?.getSubscription().then((sub) => {
            setSubscription(sub);
          });
        });
      }
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!supported) return false;

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === "granted") {
      // Register/reactivate service worker subscription for local notifications
      try {
        const registration = await navigator.serviceWorker.ready;
        // Try subscribing (works without VAPID for local notifications)
        const existingSub = await registration.pushManager?.getSubscription();
        setSubscription(existingSub);
      } catch (e) {
        console.log("Push manager not available, using local notifications", e);
      }
    }

    return result === "granted";
  }, [supported]);

  const sendLocalNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (permission !== "granted") return;

      // Use service worker for persistent notifications (works on mobile PWA)
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            vibrate: [200, 100, 200],
            tag: options?.tag || "brave-notification",
            renotify: true,
            ...options,
          } as any);
        });
      } else {
        new Notification(title, {
          icon: "/icons/icon-192.png",
          ...options,
        });
      }
    },
    [permission]
  );

  // Schedule a local notification after a delay (useful for reminders)
  const scheduleNotification = useCallback(
    (title: string, options: NotificationOptions, delayMs: number) => {
      if (permission !== "granted") return;
      setTimeout(() => sendLocalNotification(title, options), delayMs);
    },
    [permission, sendLocalNotification]
  );

  return {
    supported,
    permission,
    subscription,
    requestPermission,
    sendLocalNotification,
    scheduleNotification,
  };
}
