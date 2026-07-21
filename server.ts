import express from "express";
import path from "path";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, getDocs, doc, deleteDoc } from "firebase/firestore";
import webpush from "web-push";
import fs from "fs";

// Initialize Firebase on the server
let db: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
    console.log("Firebase successfully initialized on the server!");
  } else {
    console.warn("firebase-applet-config.json not found. Push notifications will be disabled.");
  }
} catch (err) {
  console.error("Failed to initialize Firebase on the server:", err);
}

// Configure Web Push VAPID keys
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY || "BPlfU9Tb-A7MRXYgoxmzPKXsFfyo2Nu79sE-TcWW34zrhzfGP0M0h3_eToi4yrI--TKwwWgzI6OB7WIr-i6m1G8";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "kntDLT88r8gsmr_DGIcQeEskJuUchZNF-i_BUiJ0lXQ";

webpush.setVapidDetails(
  "mailto:muhammet.ozcann83@gmail.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Keep track of server startup time to ignore old notifications
const serverStartTime = Date.now();
const processedNotificationIds = new Set<string>();

if (db) {
  try {
    const notificationsCol = collection(db, "notifications");
    
    // Real-time listener for incoming notifications
    onSnapshot(notificationsCol, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const notifId = change.doc.id;
          const data = change.doc.data();
          if (!data || processedNotificationIds.has(notifId)) return;
          
          processedNotificationIds.add(notifId);
          
          // Check if the notification was created around/after server start
          let shouldProcess = false;
          if (data.createdAt) {
            const createdAtTime = data.createdAt.toMillis ? data.createdAt.toMillis() : new Date(data.createdAt).getTime();
            if (createdAtTime > serverStartTime - 10000) { // 10 seconds buffer
              shouldProcess = true;
            }
          } else {
            // If createdAt is null/pending on local sync, we assume it's brand new
            shouldProcess = true;
          }
          
          if (shouldProcess) {
            const recipientId = data.recipientId;
            if (!recipientId) return;
            
            // Fetch recipient's push subscriptions
            const subsColRef = collection(db, "users", recipientId, "push_subscriptions");
            try {
              const subsSnapshot = await getDocs(subsColRef);
              
              subsSnapshot.forEach(async (subDoc) => {
                const subData = subDoc.data();
                if (subData && subData.endpoint && subData.keys) {
                  const pushSubscription = {
                    endpoint: subData.endpoint,
                    keys: {
                      p256dh: subData.keys.p256dh,
                      auth: subData.keys.auth
                    }
                  };
                  
                  // Construct friendly user message
                  let bodyText = "Yeni bir bildiriminiz var!";
                  if (data.type === "vote") {
                    bodyText = `🗳️ ${data.senderName} gönderini oyladı: ${data.votedOption === "A" ? "1. Seçenek (A)" : "2. Seçenek (B)"}`;
                  } else if (data.type === "comment") {
                    bodyText = `💬 ${data.senderName} gönderine yorum yaptı: "${data.commentText}"`;
                  } else if (data.type === "follow") {
                    bodyText = `👥 ${data.senderName} seni takip etmeye başladı!`;
                  }
                  
                  const payload = JSON.stringify({
                    title: "BumuBumu",
                    body: bodyText,
                    icon: "/logo_v5.png",
                    badge: "/logo_v5.png",
                    url: `/feed?post=${data.postId || ""}`
                  });
                  
                  webpush.sendNotification(pushSubscription, payload)
                    .then(() => {
                      console.log(`Push notification sent successfully to user ${recipientId}, sub: ${subDoc.id}`);
                    })
                    .catch(async (pushErr) => {
                      // Delete expired or dead push subscriptions (404 Not Found or 410 Gone)
                      if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
                        console.log(`Cleaning up dead push subscription: ${subDoc.id} for user ${recipientId}`);
                        try {
                          const deadSubRef = doc(db, "users", recipientId, "push_subscriptions", subDoc.id);
                          await deleteDoc(deadSubRef);
                        } catch (delErr) {
                          console.error("Failed to delete expired subscription:", delErr);
                        }
                      } else {
                        console.error("Web Push sending error:", pushErr);
                      }
                    });
                }
              });
            } catch (subErr) {
              console.error("Error reading subscriptions:", subErr);
            }
          }
        }
      });
    });
    console.log("Real-time Push Notification background observer is active and listening to events!");
  } catch (err) {
    console.error("Failed to configure database background notification observer:", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

  // Parse JSON and URL-encoded bodies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));


  // API endpoint for fetching OpenGraph images (Trendyol & other Cloudflare bypass)
  app.get("/api/fetchOgImage", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    try {
      // Fetch target URL using a real Chrome User-Agent and browser headers to bypass Cloudflare protection
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "Sec-Ch-Ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": "\"Windows\"",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1"
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Target URL returned status: ${response.status}` });
      }

      const html = await response.text();

      // Parse OpenGraph and Twitter image tags
      const ogPattern = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i;
      const ogPatternAlt = /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i;
      const twitterPattern = /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i;
      const twitterPatternAlt = /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i;
      const relPattern = /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i;

      const match = html.match(ogPattern) || html.match(ogPatternAlt) || html.match(twitterPattern) || html.match(twitterPatternAlt) || html.match(relPattern);
      const imageUrl = match ? match[1] : null;

      if (!imageUrl) {
        return res.status(404).json({ error: "OpenGraph image metadata not found" });
      }

      return res.json({ imageUrl });
    } catch (err: any) {
      console.error("fetchOgImage error:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch OpenGraph image" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started and listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
