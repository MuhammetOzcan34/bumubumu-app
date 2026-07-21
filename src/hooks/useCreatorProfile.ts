import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const profileCache: { [userId: string]: { photoURL: string; displayName: string; timestamp: number } } = {};

export function useCreatorProfile(userId: string, initialPhoto?: string, initialName?: string) {
  const [photoURL, setPhotoURL] = useState(initialPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${userId}`);
  const [displayName, setDisplayName] = useState(initialName || 'Gizemli Üye');

  useEffect(() => {
    if (!userId) return;

    // Check memory cache first
    const cached = profileCache[userId];
    if (cached && (Date.now() - cached.timestamp < 30000)) { // 30 seconds memory cache
      setPhotoURL(cached.photoURL);
      setDisplayName(cached.displayName);
      return;
    }

    // Check localStorage cache
    const lsKey = `bumu_profile_cache_${userId}`;
    const lsCached = localStorage.getItem(lsKey);
    if (lsCached) {
      try {
        const parsed = JSON.parse(lsCached);
        if (Date.now() - parsed.timestamp < 120000) { // 2 minutes storage cache
          setPhotoURL(parsed.photoURL);
          setDisplayName(parsed.displayName);
          profileCache[userId] = parsed;
          return;
        }
      } catch (e) {}
    }

    // Set to initial inputs if no cache hit
    setPhotoURL(initialPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${userId}`);
    setDisplayName(initialName || 'Gizemli Üye');

    // Fetch from Firestore profiles
    let active = true;
    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'profiles', userId);
        const snap = await getDoc(docRef);
        if (snap.exists() && active) {
          const data = snap.data();
          const pUrl = data.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${userId}`;
          const dName = data.displayName || 'Gizemli Üye';
          
          setPhotoURL(pUrl);
          setDisplayName(dName);

          const entry = { photoURL: pUrl, displayName: dName, timestamp: Date.now() };
          profileCache[userId] = entry;
          localStorage.setItem(lsKey, JSON.stringify(entry));
        }
      } catch (err) {
        console.warn("useCreatorProfile error:", err);
      }
    };

    fetchProfile();
    return () => {
      active = false;
    };
  }, [userId]);

  return { photoURL, displayName };
}

