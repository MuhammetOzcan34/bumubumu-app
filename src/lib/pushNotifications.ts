import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';

const VAPID_PUBLIC_KEY = "BPlfU9Tb-A7MRXYgoxmzPKXsFfyo2Nu79sE-TcWW34zrhzfGP0M0h3_eToi4yrI--TKwwWgzI6OB7WIr-i6m1G8";

// Helper to convert VAPID public key to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribes the current PWA installation to push notifications and saves the token to Firestore
 */
export async function subscribeUserToPush(userId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn("Push notifications are not supported on this browser/platform.");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    if (!subscription) {
      console.error("Failed to retrieve PushSubscription");
      return false;
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys || !subJson.keys.p256dh || !subJson.keys.auth) {
      console.error("PushSubscription JSON is incomplete");
      return false;
    }

    // Generate a unique subscription ID based on a hash of the endpoint to avoid duplicate registrations
    const endpointHash = btoa(subJson.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-50);
    const subscriptionId = `sub_${endpointHash}`;

    // Get user agent to help identify the device
    const userAgent = navigator.userAgent || 'Unknown Device';
    const deviceLabel = userAgent.includes('Mobi') ? 'Mobile Device' : 'Desktop Device';

    // Store subscription in Firestore under /users/{userId}/push_subscriptions/{subscriptionId}
    const subRef = doc(db, 'users', userId, 'push_subscriptions', subscriptionId);
    await setDoc(subRef, {
      id: subscriptionId,
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth
      },
      userAgent,
      deviceLabel,
      updatedAt: new Date().toISOString()
    });

    console.log("Successfully registered and stored push subscription:", subscriptionId);
    return true;
  } catch (error) {
    console.error("Error subscribing to push notifications:", error);
    return false;
  }
}

/**
 * Requests notification permission from the user.
 * If granted, it automatically subscribes the PWA to push notifications and stores it in Firestore.
 */
export async function requestAndSaveNotificationPermission(userId: string): Promise<string> {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeUserToPush(userId);
    }
    return permission;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return 'error';
  }
}

/**
 * Checks and silently refreshes the push subscription if permission is already granted.
 * This is useful to run on application startup to ensure tokens are always fresh and valid.
 */
export async function checkAndRefreshSubscription(userId: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    console.log("Checking and silently refreshing background push subscription...");
    await subscribeUserToPush(userId);
  }
}
