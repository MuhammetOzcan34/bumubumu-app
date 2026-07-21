/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserData, ProfileData } from '../types';
import { checkAndRefreshSubscription } from '../lib/pushNotifications';
import { requestAndSaveFcmToken } from '../firebase';


interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: UserData | null;
  profileData: ProfileData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName: string) => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  logOut: () => Promise<void>;
  updateProfileDetails: (displayName: string, bio: string, location: string, birthYear?: number, gender?: string, photoURL?: string, username?: string) => Promise<void>;
  refreshUserData: () => Promise<void>;
}

export function generateDefaultUsername(displayName: string, uid: string): string {
  const cleanName = (displayName || "")
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
    
  const prefix = cleanName || "user";
  const suffix = uid.slice(0, 4).toLowerCase();
  return `${prefix}_${suffix}`;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Veritabanı ve profil senkronizasyonu
  const syncUserProfile = async (user: FirebaseUser) => {
    const userDocRef = doc(db, 'users', user.uid);
    const profileDocRef = doc(db, 'profiles', user.uid);

    let userSnap;
    let fallbackToLocal = false;
    try {
      userSnap = await getDoc(userDocRef);
    } catch (err) {
      console.warn("Firestore userDocRef çekilemedi (Kota aşımı olabilir), yerel önbelleğe geçiliyor:", err);
      fallbackToLocal = true;
    }

    let profileSnap;
    if (!fallbackToLocal) {
      try {
        profileSnap = await getDoc(profileDocRef);
      } catch (err) {
        console.warn("Firestore profileDocRef çekilemedi (Kota aşımı olabilir), yerel önbelleğe geçiliyor:", err);
        fallbackToLocal = true;
      }
    }

    if (fallbackToLocal) {
      // Yerel önbellekten veya dinamik oluşturarak kurtar
      const cacheUserKey = `bumu_user_data_${user.uid}`;
      const cacheProfKey = `bumu_profile_data_${user.uid}`;
      
      const cachedU = localStorage.getItem(cacheUserKey);
      const cachedP = localStorage.getItem(cacheProfKey);
      
      const adminEmails = ["muhammet.ozcann83@gmail.com"];
      const computedRole = adminEmails.includes((user.email || "").toLowerCase()) ? "admin" : "user";
      
      let uData: UserData;
      let pData: ProfileData;
      
      if (cachedU) {
        try {
          uData = JSON.parse(cachedU);
        } catch (_) {
          uData = {
            userId: user.uid,
            email: user.email || "",
            role: computedRole as "user" | "admin",
            points: 100,
            birthYear: 1999,
            age: 27,
            gender: "Belirtilmemiş",
            createdAt: null
          };
        }
      } else {
        uData = {
          userId: user.uid,
          email: user.email || "",
          role: computedRole as "user" | "admin",
          points: 100,
          birthYear: 1999,
          age: 27,
          gender: "Belirtilmemiş",
          createdAt: null
        };
      }
      
      if (cachedP) {
        try {
          pData = JSON.parse(cachedP);
          if (!pData.username) {
            pData.username = generateDefaultUsername(pData.displayName || "user", user.uid);
          }
        } catch (_) {
          pData = {
            userId: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || "Yeni Üye",
            photoURL: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
            bio: "BumuBumu ile Seçimlerini Paylaş!",
            location: "İstanbul",
            username: generateDefaultUsername(user.displayName || user.email?.split('@')[0] || "Yeni Üye", user.uid)
          };
        }
      } else {
        pData = {
          userId: user.uid,
          displayName: user.displayName || user.email?.split('@')[0] || "Yeni Üye",
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
          bio: "BumuBumu ile Seçimlerini Paylaş!",
          location: "İstanbul",
          username: generateDefaultUsername(user.displayName || user.email?.split('@')[0] || "Yeni Üye", user.uid)
        };
      }
      
      setUserData(uData);
      setProfileData(pData);
      return;
    }

    try {
      let uData: UserData;
      let pData: ProfileData;

      const adminEmails = ["muhammet.ozcann83@gmail.com"];
      const computedRole = adminEmails.includes((user.email || "").toLowerCase()) ? "admin" : "user";

      if (!userSnap.exists()) {
        // Yeni kullanıcı dökümanı (Özel PII verisi)
        uData = {
          userId: user.uid,
          email: user.email || "",
          role: computedRole as "user" | "admin",
          points: 0,
          birthYear: 1999, // varsayılan doğum yılı (yaş ~= 27)
          age: 27, // varsayılan yaş
          gender: "Belirtilmemiş", // varsayılan cinsiyet
          createdAt: serverTimestamp()
        };
        try {
          await setDoc(userDocRef, uData);
        } catch (err) {
          console.error("DEBUG: Failed to CREATE userDocRef", err);
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
          return;
        }
      } else {
        uData = userSnap.data() as UserData;
        // Rol değişikliği kontrolü (örn. admin mailine göre her zaman güncellensin)
        if (computedRole === "admin" && uData.role !== "admin") {
          uData.role = "admin";
          try {
            await updateDoc(userDocRef, { role: "admin" });
          } catch (err) {
            console.error("DEBUG: Failed to UPDATE user role", err);
            handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
            return;
          }
        }
      }

      if (!profileSnap.exists()) {
        // Yeni profil dökümanı (Halka açık)
        pData = {
          userId: user.uid,
          displayName: user.displayName || user.email?.split('@')[0] || "Yeni Üye",
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
          bio: "BumuBumu ile Seçimlerini Paylaş!",
          location: "İstanbul",
          username: generateDefaultUsername(user.displayName || user.email?.split('@')[0] || "Yeni Üye", user.uid)
        };
        try {
          await setDoc(profileDocRef, pData);
        } catch (err) {
          console.error("DEBUG: Failed to CREATE profileDocRef", err);
          handleFirestoreError(err, OperationType.CREATE, `profiles/${user.uid}`);
          return;
        }
      } else {
        pData = profileSnap.data() as ProfileData;
        if (!pData.username) {
          const generated = generateDefaultUsername(pData.displayName || "user", user.uid);
          pData.username = generated;
          try {
            await updateDoc(profileDocRef, { username: generated });
          } catch (updateErr) {
            console.warn("Failed to update profile username in Firestore:", updateErr);
          }
        }
      }

      setUserData(uData);
      setProfileData(pData);
      localStorage.setItem(`bumu_user_data_${user.uid}`, JSON.stringify(uData));
      localStorage.setItem(`bumu_profile_data_${user.uid}`, JSON.stringify(pData));
    } catch (err) {
      console.error("Kullanıcı senkronizasyon hatası:", err);
      // Hata fırlatma yerine yerel önbellek kurtarması yapalım
      const cacheUserKey = `bumu_user_data_${user.uid}`;
      const cacheProfKey = `bumu_profile_data_${user.uid}`;
      const cachedU = localStorage.getItem(cacheUserKey);
      const cachedP = localStorage.getItem(cacheProfKey);
      if (cachedU && cachedP) {
        try {
          setUserData(JSON.parse(cachedU));
          setProfileData(JSON.parse(cachedP));
        } catch (_) {
          handleFirestoreError(err, OperationType.GET, `users_profiles_sync/${user.uid}`);
        }
      } else {
        handleFirestoreError(err, OperationType.GET, `users_profiles_sync/${user.uid}`);
      }
    }
  };

  const refreshUserData = async () => {
    if (!currentUser) return;
    try {
      const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
      const profileSnap = await getDoc(doc(db, 'profiles', currentUser.uid));
      if (userSnap.exists()) setUserData(userSnap.data() as UserData);
      if (profileSnap.exists()) setProfileData(profileSnap.data() as ProfileData);
    } catch (e) {
      console.error(e);
    }
  };

  // Google Girişi
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        await syncUserProfile(result.user);
      }
    } catch (err: any) {
      console.error("Google login hatası:", err);
      
      if (
        err.code === 'auth/popup-blocked' || 
        err.code === 'auth/cancelled-popup-request' || 
        err.code === 'auth/popup-closed-by-user' ||
        err.message?.includes('popup')
      ) {
        alert("Google giriş penceresi açılmadı veya kapatıldı. Mobil Safari kullanıyorsanız Safari Ayarları'ndan 'Açılır Pencereleri Engelle' seçeneğini devre dışı bırakıp tekrar deneyiniz.");
      } else if (err.code !== 'auth/user-cancelled') {
        alert("Google ile giriş yapılırken bir hata oluştu: " + (err.message || "Lütfen tekrar deneyiniz."));
      }
      throw err;
    }
  };

  // E-posta Kayıt
  const signUpWithEmail = async (email: string, pass: string, displayName: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail === 'demo@bumu.com') {
      return signInWithEmail(email, pass);
    }
    try {
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      if (result.user) {
        // Profil detay doldurma
        const userDocRef = doc(db, 'users', result.user.uid);
        const profileDocRef = doc(db, 'profiles', result.user.uid);

        const adminEmails = ["muhammet.ozcann83@gmail.com"];
        const computedRole = adminEmails.includes((email || "").toLowerCase()) ? "admin" : "user";

        const uData: UserData = {
          userId: result.user.uid,
          email: email,
          role: computedRole as "user" | "admin",
          points: 10, // Hoş geldin puanı
          birthYear: 2004, // varsayılan doğum yılı (yaş ~= 22)
          age: 22,
          gender: "Belirtilmemiş",
          createdAt: serverTimestamp()
        };

        const pData: ProfileData = {
          userId: result.user.uid,
          displayName: displayName,
          photoURL: `https://api.dicebear.com/7.x/adventurer/svg?seed=${result.user.uid}`,
          bio: "BumuBumu ile Seçimlerini Paylaş!",
          location: "İstanbul",
          username: generateDefaultUsername(displayName, result.user.uid)
        };

        await setDoc(userDocRef, uData);
        await setDoc(profileDocRef, pData);

        setUserData(uData);
        setProfileData(pData);
      }
    } catch (err) {
      console.error("E-posta kayıt hatası:", err);
      throw err;
    }
  };

  // E-posta Giriş
  const signInWithEmail = async (email: string, pass: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail === 'demo@bumu.com') {
      if (pass !== 'bumudemo123') {
        throw new Error("Kimlik doğrulama başarısız. Lütfen bilgilerinizi kontrol ediniz.");
      }
      // Demo Simülasyonu
      const simulatedUser = {
        uid: "demo_guest_user",
        email: "demo@bumu.com",
        displayName: "Tanıtım Üyesi",
        photoURL: "https://api.dicebear.com/7.x/adventurer/svg?seed=demo_guest_user",
        emailVerified: true,
        isAnonymous: false,
        providerData: []
      } as unknown as FirebaseUser;

      setCurrentUser(simulatedUser);
      localStorage.setItem('bumu_demo_current_user', JSON.stringify({
        uid: simulatedUser.uid,
        email: simulatedUser.email,
        displayName: simulatedUser.displayName,
        photoURL: simulatedUser.photoURL
      }));
      await syncUserProfile(simulatedUser);
      return;
    }

    try {
      const result = await signInWithEmailAndPassword(auth, email, pass);
      if (result.user) {
        await syncUserProfile(result.user);
      }
    } catch (err) {
      console.error("E-posta giriş hatası:", err);
      throw err;
    }
  };

  // Çıkış Yap
  const logOut = async () => {
    try {
      localStorage.removeItem('bumu_demo_current_user');
      await signOut(auth);
      setCurrentUser(null);
      setUserData(null);
      setProfileData(null);
    } catch (err) {
      console.error("Çıkış hatası:", err);
    }
  };

  // Detaylı profil bilgilerini güncelleme
  const updateProfileDetails = async (
    displayName: string, 
    bio: string, 
    location: string, 
    birthYear?: number, 
    gender?: string,
    photoURL?: string,
    username?: string
  ) => {
    if (!currentUser) return;
    try {
      const profileDocRef = doc(db, 'profiles', currentUser.uid);
      const userDocRef = doc(db, 'users', currentUser.uid);

      const profileUpdate: any = {
        displayName,
        bio,
        location
      };
      if (photoURL !== undefined) {
        profileUpdate.photoURL = photoURL;
      }
      if (username !== undefined) {
        const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
        profileUpdate.username = cleanUsername || generateDefaultUsername(displayName, currentUser.uid);
      }

      await updateDoc(profileDocRef, profileUpdate);

      const userUpdate: any = {};
      if (birthYear !== undefined) {
        userUpdate.birthYear = birthYear;
        userUpdate.age = 2026 - birthYear; // 2026 yılı referans alınarak yedek hesaplama
      }
      if (gender !== undefined) userUpdate.gender = gender;
      
      // displayName & photoURL copies inside users as well (as keys allows)
      userUpdate.displayName = displayName;
      if (photoURL !== undefined) {
        userUpdate.photoURL = photoURL;
      }

      await updateDoc(userDocRef, userUpdate);

      // Lokal state güncellemesi
      setProfileData(prev => prev ? { 
        ...prev, 
        displayName, 
        bio, 
        location, 
        ...(photoURL !== undefined ? { photoURL } : {}),
        ...(username !== undefined ? { username } : {})
      } : null);
      setUserData(prev => prev ? { ...prev, ...userUpdate } : null);
    } catch (err) {
      console.error("Profil güncelleme hatası:", err);
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${currentUser.uid}`);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        localStorage.removeItem('bumu_demo_current_user');
        setCurrentUser(user);
        await syncUserProfile(user);
        checkAndRefreshSubscription(user.uid).catch(err => console.warn("Failed silent token refresh:", err));
        requestAndSaveFcmToken(user.uid).catch(err => console.warn("FCM request and save failed:", err));
      } else {
        const savedDemo = localStorage.getItem('bumu_demo_current_user');
        if (savedDemo) {
          try {
            const parsed = JSON.parse(savedDemo);
            const simulatedUser = {
              uid: parsed.uid,
              email: parsed.email,
              displayName: parsed.displayName,
              photoURL: parsed.photoURL,
              emailVerified: true,
              isAnonymous: false,
              providerData: []
            } as unknown as FirebaseUser;
            setCurrentUser(simulatedUser);
            await syncUserProfile(simulatedUser);
            checkAndRefreshSubscription(simulatedUser.uid).catch(err => console.warn("Failed silent token refresh for demo:", err));
          } catch (e) {
            console.error("Failed to parse demo session", e);
            setCurrentUser(null);
            setUserData(null);
            setProfileData(null);
          }
        } else {
          setCurrentUser(null);
          setUserData(null);
          setProfileData(null);
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userData,
    profileData,
    loading,
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    logOut,
    updateProfileDetails,
    refreshUserData
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
