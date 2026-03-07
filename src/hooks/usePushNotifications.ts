import { useState, useEffect, useCallback } from "react";

const VAPID_PUBLIC_KEY = ""; // Will be set by user

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const isSupported = "Notification" in window && "serviceWorker" in navigator;
    setSupported(isSupported);
    if (isSupported) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!supported) return false;

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === "granted";
  }, [supported]);

  const sendLocalNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (permission !== "granted") return;

      // Use service worker for persistent notifications
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            vibrate: [200, 100, 200],
            ...options,
          });
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

  return {
    supported,
    permission,
    requestPermission,
    sendLocalNotification,
  };
}
