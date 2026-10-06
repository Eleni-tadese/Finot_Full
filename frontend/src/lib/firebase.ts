import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Push is optional: without VITE_FIREBASE_* values (or in browsers without
// support) `messaging` stays null and every helper below becomes a no-op.
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let messaging: ReturnType<typeof getMessaging> | null = null;
if (isConfigured) {
  try {
    messaging = getMessaging(initializeApp(firebaseConfig));
  } catch {
    messaging = null;
  }
}

export const requestNotificationPermission = async () => {
  try {
    if (!messaging) return null;
    // Check if Notification API is available at all
    if (!('Notification' in window)) {
      return null;
    }
    // If already denied, don't prompt again (avoids browser console noise)
    if (Notification.permission === 'denied') {
      return null;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { 
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
      });
      return token;
    }
    return null;
  } catch {
    // Silently handle — push notifications are optional
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });

export { messaging };
