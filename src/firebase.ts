import { initializeApp, getApps } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported, Analytics } from 'firebase/analytics';
import { getMessaging, getToken, Messaging } from 'firebase/messaging';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCKIcJBN66qonY2krdNxKDLrnNzYrfDtII",
  authDomain: "bumubumu-app.firebaseapp.com",
  projectId: "bumubumu-app",
  storageBucket: "bumubumu-app.firebasestorage.app",
  messagingSenderId: "865374160634",
  appId: "1:865374160634:web:c294ff923cd3ecbee86b43",
  measurementId: "G-5L1X6D3R6E"
};

const VAPID_KEY = "BB1H7Idc8yPjiEcQ6HJGAnXPAbeYBj9gXZJfC08FJxs9RYpPGbjEqBOVn4UYsWZqS-WXLB96JnF00y1fGa4cZBc";

// Initialize custom app so it doesn't conflict with any other default app
const appName = "bumubumu-app-prod";
const prodApp = getApps().find(a => a.name === appName) || initializeApp(firebaseConfig, appName);

// Initialize Firestore on the production app to make sure FCM token is saved directly to the correct database!
export const dbProd = getFirestore(prodApp);

// Initialize Analytics & Messaging conditionally
export let analytics: Analytics | null = null;
export let messaging: Messaging | null = null;

// Determine if we are in development or AI Studio preview
const isDevOrPreview = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.startsWith('ais-dev-') ||
  window.location.hostname.startsWith('ais-pre-')
);

if (typeof window !== "undefined") {
  if (isDevOrPreview) {
    console.log(
      "%cBumuBumu Info: %cFCM (Push Bildirimleri) ve Google Analytics, canlı site API koruması (HTTP Referrer Restrictions) nedeniyle geliştirme ortamında güvenli biçimde simüle edilmektedir. Canlı sunucuda sorunsuz çalışacaktır.",
      "color: #3b82f6; font-weight: bold;",
      "color: inherit;"
    );
  } else {
    isAnalyticsSupported().then((supported) => {
      if (supported) {
        analytics = getAnalytics(prodApp);
        console.log("Google Analytics initialized successfully.");
      }
    }).catch(err => console.warn("Google Analytics support check failed:", err));

    try {
      messaging = getMessaging(prodApp);
      console.log("Firebase Messaging initialized successfully.");
    } catch (err) {
      console.warn("Firebase Messaging is not supported in this browser/environment:", err);
    }
  }
}

/**
 * Requests notification permission from the user.
 * If granted, retrieves the FCM Token and stores it in Firestore under user's document.
 */
export async function requestAndSaveFcmToken(userId: string): Promise<string | null> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    console.warn("Notifications are not supported in this environment.");
    return null;
  }

  if (isDevOrPreview) {
    console.log("Geliştirme ortamında FCM Token alma işlemi güvenli bir şekilde pas geçildi.");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn("Notification permission was denied:", permission);
      return null;
    }

    if (!messaging) {
      console.warn("Firebase Messaging is not initialized.");
      return null;
    }

    // Register active service worker if needed
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log("FCM Token retrieved successfully:", token);
      
      // Save to production firestore under /users/{userId}
      const userRef = doc(dbProd, 'users', userId);
      await setDoc(userRef, {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString()
      }, { merge: true });

      // Also save to profiles/{userId} for good measure
      const profileRef = doc(dbProd, 'profiles', userId);
      await setDoc(profileRef, {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString()
      }, { merge: true });

      console.log("FCM Token successfully stored in database.");
      return token;
    } else {
      console.warn("No FCM Token received.");
      return null;
    }
  } catch (error) {
    console.error("Error retrieving or saving FCM Token:", error);
    return null;
  }
}
