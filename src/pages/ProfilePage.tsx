/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Award, Clock, MapPin, Copy, Check, LogOut, Save, Smartphone, Sparkles, Heart, LayoutGrid, Vote, Users, MessageSquare, RefreshCw, Camera, Bell, Trash2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc, deleteDoc, startAfter, limit, writeBatch } from 'firebase/firestore';
import { PostData } from '../types';
import { VotingCard } from '../components/VotingCard';
import { requestAndSaveNotificationPermission } from '../lib/pushNotifications';
import { requestAndSaveFcmToken } from '../firebase';


const worldCitiesList = [
  "İstanbul, Türkiye",
  "Ankara, Türkiye",
  "İzmir, Türkiye",
  "Bursa, Türkiye",
  "Antalya, Türkiye",
  "Adana, Türkiye",
  "Trabzon, Türkiye",
  "Diyarbakır, Türkiye",
  "Eskişehir, Türkiye",
  "Gaziantep, Türkiye",
  "London, United Kingdom",
  "Paris, France",
  "Berlin, Germany",
  "Rome, Italy",
  "Madrid, Spain",
  "Barcelona, Spain",
  "Amsterdam, Netherlands",
  "Vienna, Austria",
  "Brussels, Belgium",
  "Dublin, Ireland",
  "Geneva, Switzerland",
  "Zurich, Switzerland",
  "Stockholm, Sweden",
  "Oslo, Norway",
  "Copenhagen, Denmark",
  "Helsinki, Finland",
  "Moscow, Russia",
  "Kyiv, Ukraine",
  "Warsaw, Poland",
  "Prague, Czechia",
  "Budapest, Hungary",
  "Athens, Greece",
  "Lisbon, Portugal",
  "Baku, Azerbaijan",
  "New York, USA",
  "Los Angeles, USA",
  "San Francisco, USA",
  "Chicago, USA",
  "Miami, USA",
  "Toronto, Canada",
  "Vancouver, Canada",
  "Mexico City, Mexico",
  "Rio de Janeiro, Brazil",
  "Sao Paulo, Brazil",
  "Buenos Aires, Argentina",
  "Tokyo, Japan",
  "Seoul, South Korea",
  "Beijing, China",
  "Shanghai, China",
  "Singapore",
  "Hong Kong",
  "Dubai, United Arab Emirates",
  "Mumbai, India",
  "New Delhi, India",
  "Sydney, Australia",
  "Melbourne, Australia",
  "Cape Town, South Africa",
  "Cairo, Egypt"
];

export const ProfilePage: React.FC = () => {
  const { currentUser, userData, profileData, updateProfileDetails, logOut } = useAuth();

  // Hedef Profil Yönetimi
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [targetProfile, setTargetProfile] = useState<any>(null);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [loadingTargetUser, setLoadingTargetUser] = useState(false);

  const targetUid = viewingUserId || currentUser?.uid;

  // Form State'leri
  const [displayName, setDisplayName] = useState(profileData?.displayName || '');
  const [username, setUsername] = useState(profileData?.username || '');
  const [bio, setBio] = useState(profileData?.bio || '');
  const [location, setLocation] = useState(profileData?.location || 'İstanbul');
  const [birthYear, setBirthYear] = useState<number>(userData?.birthYear || 2000);
  const [gender, setGender] = useState(userData?.gender || 'Belirtilmemiş');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 200;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const minSize = Math.min(img.width, img.height);
            const sx = (img.width - minSize) / 2;
            const sy = (img.height - minSize) / 2;
            ctx.drawImage(img, sx, sy, minSize, minSize, 0, 0, size, size);
            
            const compressed = canvas.toDataURL('image/jpeg', 0.8);
            setPhotoBase64(compressed);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Geri bildirimler
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);

  // PWA & Bildirim Ayarları State'leri
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isBadgingEnabled, setIsBadgingEnabled] = useState<boolean>(
    localStorage.getItem('bumubumu_badge_enabled') !== 'false'
  );
  const [badgeTestStatus, setBadgeTestStatus] = useState<string | null>(null);

  // Bildirim İzni İsteme Aksiyonu
  const handleRequestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      setBadgeTestStatus("Bildirim API bu tarayıcıda desteklenmiyor.");
      return;
    }
    
    try {
      const permission = await requestAndSaveNotificationPermission(currentUser?.uid || 'anonymous');
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        if (currentUser) {
          await requestAndSaveFcmToken(currentUser.uid).catch(e => console.warn("FCM token generation error:", e));
        }
        setBadgeTestStatus("Bildirim izni başarıyla alındı ve arka plan tokenı kaydedildi! 🎉");
        // Hoş geldiniz bildirimi
        const title = "BumuBumu'ya Hoş Geldin! 🔔";
        const options: any = {
          body: "Artık yeni oylamalar, yorumlar ve takipçilerden anında haberdar olacaksın!",
          icon: '/logo_v5.png',
          badge: '/logo_v5.png',
          vibrate: [100, 50, 100],
        };
        
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, options);
          });
        } else {
          new Notification(title, options);
        }
      } else if (permission === 'denied') {
        setBadgeTestStatus("Bildirim izni reddedildi. Tarayıcı ayarlarından açabilirsiniz.");
      } else {
        setBadgeTestStatus("Bildirim izni alınamadı.");
      }
    } catch (err) {
      console.error(err);
      setBadgeTestStatus("İzin istenirken bir hata oluştu.");
    }
  };

  // Test Bildirimi Gönderme
  const handleSendTestNotification = () => {
    if (notificationPermission !== 'granted') {
      setBadgeTestStatus("Lütfen önce bildirim izni verin.");
      return;
    }
    
    setBadgeTestStatus("3 saniye sonra test bildirimi gönderilecek. Lütfen uygulamayı arka plana atın! 📲");
    
    setTimeout(() => {
      const title = "Deneme Bildirimi 🗳️";
      const options: any = {
        body: "Bu bir BumuBumu PWA test bildirimdir. Harika görünüyor!",
        icon: '/logo_v5.png',
        badge: '/logo_v5.png',
        vibrate: [200, 100, 200],
        tag: 'test-notification'
      };
      
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, options);
          setBadgeTestStatus("Test bildirimi gönderildi! ✅");
        });
      } else {
        new Notification(title, options);
        setBadgeTestStatus("Test bildirimi gönderildi! ✅");
      }
    }, 3000);
  };

  // Badge Toggle Aksiyonu
  const handleToggleBadging = (enabled: boolean) => {
    setIsBadgingEnabled(enabled);
    localStorage.setItem('bumubumu_badge_enabled', String(enabled));
    
    if (!enabled && 'clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {});
      setBadgeTestStatus("Uygulama simge işareti (badge) devre dışı bırakıldı ve temizlendi.");
    } else if (enabled && 'setAppBadge' in navigator) {
      const cached = localStorage.getItem(`bumu_unread_count_${currentUser?.uid}`);
      const count = cached ? Number(cached) : 0;
      if (count > 0) {
        navigator.setAppBadge(count).catch(() => {});
      }
      setBadgeTestStatus("Uygulama simge işareti (badge) otomatik olarak güncellenecek.");
    }
  };

  // Simge Rozeti Temizleme (Sadece Badge)
  const handleClearBadgeOnly = () => {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge()
        .then(() => {
          setBadgeTestStatus("Simge üzerindeki kırmızı işaret başarıyla sıfırlandı!");
        })
        .catch((err) => {
          console.warn(err);
          setBadgeTestStatus("Simge işareti temizlenirken hata oluştu.");
        });
    } else {
      setBadgeTestStatus("App Badging API bu tarayıcı veya cihazda desteklenmiyor.");
    }
  };

  // Tüm Bildirimleri Okundu Yap & Badge Temizle
  const handleMarkAllReadAndClearBadge = async () => {
    if (!currentUser) return;
    setBadgeTestStatus("Bildirimler güncelleniyor...");
    
    try {
      const q = query(
        collection(db, 'notifications'),
        where('recipientId', '==', currentUser.uid),
        where('read', '==', false)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setBadgeTestStatus("Okunmamış bildiriminiz bulunmuyor.");
        if ('clearAppBadge' in navigator) {
          navigator.clearAppBadge().catch(() => {});
        }
        return;
      }
      
      const batch = writeBatch(db);
      snapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { read: true });
      });
      
      await batch.commit();
      
      localStorage.setItem(`bumu_unread_count_${currentUser.uid}`, '0');
      
      if ('clearAppBadge' in navigator) {
        navigator.clearAppBadge().catch(() => {});
      }
      
      window.dispatchEvent(new Event('notification-read-updated'));
      setBadgeTestStatus("Tüm bildirimler okundu yapıldı ve kırmızı işaret sıfırlandı! 🎉");
    } catch (err) {
      console.error(err);
      setBadgeTestStatus("Bildirimler okundu yapılırken hata oluştu.");
    }
  };

  // Profil verisi yüklendikçe veya hedef üye değiştikçe senkronize etme
  useEffect(() => {
    if (!currentUser) return;
    if (!viewingUserId) {
      setTargetProfile(profileData);
      setTargetUser(userData);
      return;
    }

    const fetchOtherUserProfile = async () => {
      setLoadingTargetUser(true);
      try {
        const pSnap = await getDoc(doc(db, 'profiles', viewingUserId));
        const uSnap = await getDoc(doc(db, 'users', viewingUserId));
        if (pSnap.exists()) {
          setTargetProfile(pSnap.data());
        } else {
          setTargetProfile({ displayName: 'BumuBumu Üyesi', bio: 'BumuBumu ile Seçimleri İncele!', photoURL: '' });
        }
        if (uSnap.exists()) {
          setTargetUser(uSnap.data());
        } else {
          setTargetUser({ birthYear: 2000, age: 26, gender: 'Belirtilmemiş' });
        }
      } catch (err) {
        console.error("Profil yüklenirken hata:", err);
      } finally {
        setLoadingTargetUser(false);
      }
    };

    fetchOtherUserProfile();
  }, [viewingUserId, currentUser, profileData, userData]);

  // Form alanlarını varsayılan kendi bilgilerimizle doldur
  useEffect(() => {
    if (profileData) {
      setDisplayName(profileData.displayName || '');
      setUsername(profileData.username || '');
      setBio(profileData.bio || '');
      setLocation(profileData.location || 'İstanbul');
    }
    if (userData) {
      setBirthYear(userData.birthYear || 2000);
      setGender(userData.gender || 'Belirtilmemiş');
    }
  }, [profileData, userData]);

  // Profil Karşılaştırma Akışları ve Sosyal Bağlantılar
  const [activeProfileTab, setActiveProfileTab] = useState<'created' | 'voted' | 'followers' | 'following' | null>(null);
  const [myCreatedPosts, setMyCreatedPosts] = useState<PostData[]>([]);
  const [myVotedPosts, setMyVotedPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  // Instagram-style incremental loading
  const [visibleCountCreated, setVisibleCountCreated] = useState(10);
  const [visibleCountVoted, setVisibleCountVoted] = useState(10);
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0);

  // Pagination states
  const [createdLastDoc, setCreatedLastDoc] = useState<any>(null);
  const [createdHasMore, setCreatedHasMore] = useState(true);
  const [loadingMoreCreated, setLoadingMoreCreated] = useState(false);

  const [votedLastDoc, setVotedLastDoc] = useState<any>(null);
  const [votedHasMore, setVotedHasMore] = useState(true);
  const [loadingMoreVoted, setLoadingMoreVoted] = useState(false);

  useEffect(() => {
    setVisibleCountCreated(10);
    setVisibleCountVoted(10);
    setCreatedLastDoc(null);
    setCreatedHasMore(true);
    setVotedLastDoc(null);
    setVotedHasMore(true);
  }, [activeProfileTab, forceRefreshTrigger, targetUid]);

  // Takipçi ve takip ettiklerim durumları
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [loadingFollows, setLoadingFollows] = useState(false);

  useEffect(() => {
    if (!currentUser || !targetUid) return;

    const fetchFollowData = async () => {
      setLoadingFollows(true);
      try {
        const followsRef = collection(db, 'follows');

        // Takipçiler (Bunu takip edenler: followingId == targetUid)
        const qFollowers = query(followsRef, where('followingId', '==', targetUid));
        const followersSnap = await getDocs(qFollowers);
        const followersList: any[] = [];
        followersSnap.forEach(d => {
          followersList.push({ id: d.id, ...d.data() });
        });
        setFollowers(followersList);

        // Takip edilenler (Benim takip ettiklerim: followerId == targetUid)
        const qFollowing = query(followsRef, where('followerId', '==', targetUid));
        const followingSnap = await getDocs(qFollowing);
        const followingList: any[] = [];
        followingSnap.forEach(d => {
          followingList.push({ id: d.id, ...d.data() });
        });
        setFollowing(followingList);
      } catch (err) {
        console.error("Takipçi/Takip edilen verileri alınamadı:", err);
      } finally {
        setLoadingFollows(false);
      }
    };

    fetchFollowData();
  }, [currentUser, targetUid, activeProfileTab]); // Sekme değiştiğinde veya kullanıcı değiştiğinde en güncel halini çekelim

  const handleUnfollowFromProfile = async (followingId: string) => {
    if (!currentUser) return;
    try {
      const followId = `${currentUser.uid}_${followingId}`;
      const followDocRef = doc(db, 'follows', followId);
      await deleteDoc(followDocRef);
      // Yerel durumları anında güncelle
      setFollowing(prev => prev.filter(item => item.followingId !== followingId));
    } catch (err) {
      console.error("Takip etmeyi bırakırken hata oluştu:", err);
    }
  };

  const handleStartDirectMessage = (targetUid: string) => {
    localStorage.setItem('startChatWith', targetUid);
    window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'dm' } }));
  };

  const fetchCreatedPosts = async (isMore = false) => {
    if (!targetUid) return;
    if (isMore && (loadingMoreCreated || !createdHasMore || !createdLastDoc)) return;

    if (isMore) {
      setLoadingMoreCreated(true);
    } else {
      setLoadingPosts(true);
      setCreatedLastDoc(null);
      setCreatedHasMore(true);
    }

    try {
      const postsRef = collection(db, 'posts');
      let q = query(
        postsRef,
        where('creatorId', '==', targetUid),
        where('groupId', '==', 'global'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );

      if (isMore && createdLastDoc) {
        q = query(
          postsRef,
          where('creatorId', '==', targetUid),
          where('groupId', '==', 'global'),
          orderBy('createdAt', 'desc'),
          startAfter(createdLastDoc),
          limit(10)
        );
      }

      const snap = await getDocs(q);
      if (snap.empty) {
        setCreatedHasMore(false);
        if (isMore) setLoadingMoreCreated(false);
        else setLoadingPosts(false);
        return;
      }

      setCreatedLastDoc(snap.docs[snap.docs.length - 1]);
      setCreatedHasMore(snap.docs.length >= 10);

      const list: PostData[] = [];
      snap.forEach(d => {
        list.push({ postId: d.id, ...d.data() } as PostData);
      });

      if (isMore) {
        setMyCreatedPosts(prev => {
          const existingIds = new Set(prev.map(p => p.postId));
          const filteredNew = list.filter(p => !existingIds.has(p.postId));
          return [...prev, ...filteredNew];
        });
      } else {
        setMyCreatedPosts(list);
      }
    } catch (err) {
      console.error("Created posts fetch error:", err);
    } finally {
      setLoadingPosts(false);
      setLoadingMoreCreated(false);
    }
  };

  const fetchVotedPosts = async (isMore = false) => {
    if (!targetUid) return;
    if (isMore && (loadingMoreVoted || !votedHasMore || !votedLastDoc)) return;

    if (isMore) {
      setLoadingMoreVoted(true);
    } else {
      setLoadingPosts(true);
      setVotedLastDoc(null);
      setVotedHasMore(true);
    }

    try {
      const votedHistoryRef = collection(db, 'users', targetUid, 'votedPosts');
      let q = query(votedHistoryRef, orderBy('votedAt', 'desc'), limit(10));

      if (isMore && votedLastDoc) {
        q = query(votedHistoryRef, orderBy('votedAt', 'desc'), startAfter(votedLastDoc), limit(10));
      }

      const snap = await getDocs(q);
      if (snap.empty) {
        setVotedHasMore(false);
        if (isMore) setLoadingMoreVoted(false);
        else setLoadingPosts(false);
        return;
      }

      setVotedLastDoc(snap.docs[snap.docs.length - 1]);
      setVotedHasMore(snap.docs.length >= 10);

      const votedIds: string[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.postId) {
          votedIds.push(data.postId);
        }
      });

      if (votedIds.length > 0) {
        const postsRef = collection(db, 'posts');
        const fetchedVoted: PostData[] = [];

        // Fetch the details of these 10 posts
        const chunks = [];
        for (let i = 0; i < votedIds.length; i += 10) {
          chunks.push(votedIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const qVoted = query(postsRef, where('postId', 'in', chunk), where('groupId', '==', 'global'));
          const votedSnap = await getDocs(qVoted);
          votedSnap.forEach(d => {
            const data = d.data() as PostData;
            if (!data.groupId || data.groupId === 'global') {
              fetchedVoted.push({ postId: d.id, ...data });
            }
          });
        }

        // Sort by the original order we fetched the IDs (using the index map)
        fetchedVoted.sort((a, b) => votedIds.indexOf(a.postId) - votedIds.indexOf(b.postId));

        if (isMore) {
          setMyVotedPosts(prev => {
            const existingIds = new Set(prev.map(p => p.postId));
            const filteredNew = fetchedVoted.filter(p => !existingIds.has(p.postId));
            return [...prev, ...filteredNew];
          });
        } else {
          setMyVotedPosts(fetchedVoted);
        }
      } else {
        if (!isMore) setMyVotedPosts([]);
      }
    } catch (err) {
      console.error("Voted posts fetch error:", err);
    } finally {
      setLoadingPosts(false);
      setLoadingMoreVoted(false);
    }
  };

  useEffect(() => {
    if (!currentUser || !targetUid) return;
    fetchCreatedPosts(false);
    fetchVotedPosts(false);
  }, [currentUser, targetUid, forceRefreshTrigger]);

  // UID Kopyalama aksiyonu (DM ve Grup üyeliği için)
  const handleCopyUid = () => {
    if (!currentUser) return;
    navigator.clipboard.writeText(currentUser.uid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setUpdating(true);
    setStatusMsg(null);

    try {
      await updateProfileDetails(
        displayName.trim(), 
        bio.trim(), 
        location, 
        Number(birthYear), 
        gender,
        photoBase64 || undefined,
        username.trim()
      );
      setStatusMsg("Profil detaylarınız başarıyla güncellendi.");
      setShowUpdateForm(false);
      setPhotoBase64(null); // save sonrası önizleme temizlensin
    } catch (err) {
      console.error(err);
      setStatusMsg("Profil kaydedilirken hata oluştu.");
    } finally {
      setUpdating(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="w-full max-w-lg mx-auto p-12 text-center text-slate-400 font-display">
        Lütfen profili görüntülemek için üye girişi yapın.
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-950/40 p-4 min-h-screen text-slate-100 flex flex-col gap-5 font-sans">
      
      {/* Üst Profil Kartı */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-5 flex flex-col items-center gap-3 relative overflow-hidden select-none">
        
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <button
            onClick={() => setForceRefreshTrigger(prev => prev + 1)}
            className="p-2 rounded-full bg-slate-950 border border-slate-800 text-indigo-400 hover:text-indigo-300 transition duration-300 cursor-pointer"
            title="Profili Yenile"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {viewingUserId ? (
            <button
              onClick={() => setViewingUserId(null)}
              className="px-3.5 py-1.5 rounded-full bg-indigo-600 text-white border border-indigo-500/25 hover:bg-indigo-500 transition duration-300 cursor-pointer text-[10px] font-bold uppercase tracking-wider shadow-[0_4px_12px_rgba(99,102,241,0.2)]"
            >
              ← Profilim
            </button>
          ) : (
            <button
              onClick={logOut}
              id="btn-logout"
              className="p-2 rounded-full bg-slate-950 border border-slate-800 text-rose-400 hover:text-rose-300 transition duration-300 cursor-pointer"
              title="Çıkış Yap"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <img 
          src={targetProfile?.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${targetUid}`} 
          alt="Avatar" 
          className="w-20 h-20 rounded-full border-2 border-violet-500 bg-slate-900 object-cover shadow-lg animate-fade-in"
        />

        {!viewingUserId && (
          <button
            onClick={() => setShowUpdateForm(!showUpdateForm)}
            className={`px-3.5 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-wider border transition-all duration-300 cursor-pointer ${
              showUpdateForm 
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/25' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-transparent shadow-[0_4px_12px_rgba(99,102,241,0.2)]'
            }`}
          >
            {showUpdateForm ? "Vazgeç" : "Profili Güncelle"}
          </button>
        )}

        <div className="text-center">
          <h2 className="text-base font-black text-slate-200 uppercase tracking-wide">
            {targetProfile?.displayName || "BumuBumu Üyesi"}
          </h2>
          <p className="text-xs text-indigo-400 font-bold font-mono tracking-wider mt-0.5 select-all">
            @{targetProfile?.username || (targetUid ? targetUid.slice(0, 8) : "")}
          </p>
          <p className="text-[11px] text-slate-400 max-w-xs mt-1.5 leading-normal italic">{targetProfile?.bio || "BumuBumu ile Seçimleri İncele!"}</p>
        </div>

        {/* Kullanıcı Detay Rozetleri */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 -mt-1 pb-1 select-none">
          {targetProfile?.location && (
            <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold font-display uppercase tracking-wider text-center">
              📍 {targetProfile.location}
            </span>
          )}
          {targetUser?.gender && targetUser.gender !== 'Belirtilmemiş' && (
            <span className="text-[9px] bg-pink-500/10 text-pink-400 border border-pink-500/20 px-2 py-0.5 rounded-full font-bold font-display uppercase tracking-wider text-center">
              {targetUser.gender === 'Erkek' ? '🙋‍♂️ Erkek' : '🙋‍♀️ Kadın'}
            </span>
          )}
          {targetUser?.birthYear && (
            <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold font-mono tracking-wider text-center">
              🎂 Doğu: {targetUser.birthYear} ({new Date().getFullYear() - targetUser.birthYear} Yaş)
            </span>
          )}
        </div>

        {/* Kullanıcı Adı Kopyalama Kutusu (Sohbetler ve Gruplar İçin Kolay Arama) */}
        <div className="w-full bg-slate-950 border border-slate-800/80 rounded-2xl p-2.5 flex items-center justify-between pointer-events-auto">
          <div className="flex-1 truncate pr-2">
            <span className="block text-[8px] font-display text-slate-500 uppercase">
              {viewingUserId ? "Kullanıcı Kimliği (@)" : "Kullanıcı Kimliğim (@)"}
            </span>
            <span className="text-[11px] font-mono font-bold text-indigo-400 truncate block select-all mt-0.5">
              @{targetProfile?.username || targetUid}
            </span>
          </div>

          <button
            onClick={() => {
              const copyVal = `@${targetProfile?.username || targetUid}`;
              navigator.clipboard.writeText(copyVal).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            id="btn-copy-username"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center border border-slate-800"
            title="Kullanıcı Adı Kopyala"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Karma Puanı ve Rol Göstergesi */}
        <div className="grid grid-cols-2 gap-3 w-full mt-1.5">
          <div className="bg-slate-950 border border-slate-800/50 rounded-2xl p-2.5 text-center flex flex-col justify-center items-center">
            <span className="text-[8px] font-display text-slate-500 uppercase">Karma BUMU Puanı</span>
            <span className="text-lg font-black text-amber-400 font-display flex items-center gap-1.5 mt-0.5 select-none text-center">
              <Award className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
              {targetUser?.points || 0}
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800/50 rounded-2xl p-2.5 text-center flex flex-col justify-center items-center">
            <span className="text-[8px] font-display text-slate-500 uppercase">Sistem Yetki Rolü</span>
            <span className="text-xs font-bold text-indigo-400 font-display mt-1 uppercase select-none">
              🛡️ {targetUser?.role || 'user'}
            </span>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs py-3 px-4 rounded-xl text-center font-display animate-fade-in">
          {statusMsg}
        </div>
      )}

      {/* Profil Düzenleme Formu */}
      {showUpdateForm && (
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-4 animate-fade-in">
          <h3 className="text-xs font-bold text-slate-300 font-display uppercase tracking-wider mb-4 flex items-center gap-1.5 select-none">
            <User className="w-4 h-4 text-violet-400" /> Profil Bilgilerini Güncelle
          </h3>

          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            
            {/* Profil Fotoğrafı Düzenleyici */}
            <div className="flex flex-col items-center gap-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/50">
              <span className="text-[9px] font-display text-slate-400 uppercase tracking-wider self-start select-none">Profil Fotoğrafı</span>
              
              <div className="relative group w-20 h-20">
                <img 
                  src={photoBase64 || profileData?.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`} 
                  alt="Yeni Avatar Önizleme" 
                  className="w-20 h-20 rounded-full object-cover border border-violet-500/40 bg-slate-900 shadow-md transition-all duration-300"
                />
                <button
                  type="button"
                  id="btn-change-photo-overlay"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-slate-950/70 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200 cursor-pointer text-[10px] font-bold text-violet-400 font-display"
                >
                  Değiştir
                </button>
              </div>

              <input 
                type="file" 
                id="profile-photo-file-input"
                ref={fileInputRef} 
                onChange={handlePhotoChange} 
                accept="image/*" 
                className="hidden" 
              />

              <button
                type="button"
                id="btn-select-profile-photo"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800/80 text-slate-300 hover:text-white font-bold text-[9px] tracking-wider uppercase flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Camera className="w-3.5 h-3.5 text-violet-400" />
                Yeni Fotoğraf Seç
              </button>

              {photoBase64 && (
                <span className="text-[8px] font-mono text-emerald-400 select-none animate-pulse">
                  ✓ Fotoğraf hazır! Güncellemek için kaydetmeyi unutmayın.
                </span>
              )}
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-display text-slate-400 uppercase">Görünen Ad</label>
              <input
                required
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 p-2.5 rounded-xl outline-none text-slate-200 font-medium"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-display text-slate-400 uppercase">Kullanıcı Adı (@)</label>
              <input
                required
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="Orn: ahmet_can"
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 p-2.5 rounded-xl outline-none text-slate-200 font-mono font-bold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-display text-slate-400 uppercase">Biyografi</label>
              <input
                type="text"
                placeholder="Örn: Seçim yapmayı ve diğerlerinin görüşlerini incelemeyi severim."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 p-2.5 rounded-xl outline-none text-slate-200 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Lokasyon */}
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-[10px] font-display text-slate-400 uppercase flex items-center gap-0.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" /> Şehrim
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
                  placeholder="Örn: Paris, Fransa veya İzmir"
                  className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 p-2.5 rounded-xl outline-none text-slate-200 font-bold"
                />
                
                {showSuggestions && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 max-h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 py-1 scrollbar-thin">
                    {worldCitiesList
                      .filter(c => c.toLowerCase().includes(location.toLowerCase()))
                      .slice(0, 8)
                      .map((c) => (
                        <div
                          key={c}
                          onMouseDown={() => {
                            setLocation(c);
                            setShowSuggestions(false);
                          }}
                          className="px-3.5 py-2 text-[11px] font-display text-slate-300 hover:bg-slate-900 cursor-pointer transition-colors"
                        >
                          📍 {c}
                        </div>
                      ))}
                    {worldCitiesList.filter(c => c.toLowerCase().includes(location.toLowerCase())).length === 0 && (
                      <div className="px-3.5 py-2 text-[10px] font-display text-slate-500 italic">
                        Yazmaya devam edin... Her ülke/şehir kaydedilebilir!
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Doğum Yılı */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-display text-slate-400 uppercase">Doğum Yılım</label>
                <input
                  required
                  type="number"
                  min={1920}
                  max={2015}
                  value={birthYear}
                  onChange={(e) => setBirthYear(Number(e.target.value))}
                  className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 p-2 rounded-xl outline-none text-slate-200 font-bold"
                />
              </div>
            </div>

            {/* Cinsiyet */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-display text-slate-400 uppercase">Cinsiyetim</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 p-2.5 rounded-xl outline-none text-slate-200 cursor-pointer font-bold"
              >
                <option value="Belirtilmemiş">Belirtmek İstemiyorum</option>
                <option value="Erkek">Erkek</option>
                <option value="Kadın">Kadın</option>
              </select>
            </div>

            {/* Kaydet */}
            <button
              type="submit"
              disabled={updating || !displayName.trim()}
              id="btn-save-profile"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs font-display py-3 rounded-xl transition cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2 mt-2"
            >
              {updating ? "KAYDEDİLİYOR..." : <><Save className="w-4 h-4" /> PROFİLİ KAYDET</>}
            </button>

          </form>
        </div>
      )}

      {/* PWA VE BİLDİRİM AYARLARI KARTI */}
      {!viewingUserId && (
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 select-none border-b border-slate-800/60 pb-3">
            <Bell className="w-4 h-4 text-[#E1306C]" />
            <h3 className="text-xs font-bold text-slate-200 font-display uppercase tracking-wider">
              Bildirim ve PWA Ayarları
            </h3>
          </div>

          {/* Bildirim Durumu ve İzin Al */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium font-display">Anlık Bildirim İzni</span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase ${
                notificationPermission === 'granted'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : notificationPermission === 'denied'
                  ? 'bg-rose-500/15 text-rose-400'
                  : 'bg-amber-500/15 text-amber-400'
              }`}>
                {notificationPermission === 'granted' ? 'Açık' : notificationPermission === 'denied' ? 'Kapalı' : 'Seçilmedi'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              {notificationPermission !== 'granted' ? (
                <button
                  type="button"
                  id="btn-pwa-grant-permission"
                  onClick={handleRequestNotificationPermission}
                  className="bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/45 text-[10px] font-bold py-2 px-3 rounded-xl transition cursor-pointer font-display flex items-center justify-center gap-1.5 uppercase"
                >
                  <Bell className="w-3.5 h-3.5" /> Bildirim İzni Ver
                </button>
              ) : (
                <div className="text-[10px] font-medium text-emerald-400/90 flex items-center justify-center gap-1.5 px-2 py-2 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                  <Check className="w-3.5 h-3.5" /> Cihaz Bildirime Açık
                </div>
              )}

              <button
                type="button"
                id="btn-pwa-test-notif"
                onClick={handleSendTestNotification}
                className="bg-slate-950 hover:bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-bold py-2 px-3 rounded-xl transition cursor-pointer font-display flex items-center justify-center gap-1.5 uppercase"
              >
                <Smartphone className="w-3.5 h-3.5 text-pink-500" /> Test Bildirimi Gönder
              </button>
            </div>
          </div>

          {/* App Badging API Ayarları */}
          <div className="flex flex-col gap-2 border-t border-slate-800/40 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col max-w-[70%]">
                <span className="text-xs text-slate-300 font-medium font-display">Simge İşareti (Badge)</span>
                <span className="text-[9px] text-slate-500 font-sans leading-normal">
                  Ana ekrandaki BumuBumu simgesinde okunmamış bildirim sayısı gösterilir.
                </span>
              </div>
              <div className="flex items-center">
                <button
                  type="button"
                  id="btn-pwa-badge-toggle"
                  onClick={() => handleToggleBadging(!isBadgingEnabled)}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer relative ${
                    isBadgingEnabled ? 'bg-indigo-600' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                      isBadgingEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Temizleme / Sıfırlama Seçenekleri */}
            <div className="flex flex-col gap-1.5 mt-2">
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">İşareti Temizleme (Sıfırlama) Ayarları</span>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="btn-pwa-clear-badge-only"
                  onClick={handleClearBadgeOnly}
                  className="bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-800 text-[10px] py-2 px-3 rounded-xl transition cursor-pointer font-display flex items-center justify-center gap-1.5 font-bold uppercase"
                  title="Kırmızı işareti geçici olarak siler, bildirimler silinmez."
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400" /> İşareti Sıfırla
                </button>

                <button
                  type="button"
                  id="btn-pwa-mark-all-read"
                  onClick={handleMarkAllReadAndClearBadge}
                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-[10px] py-2 px-3 rounded-xl transition cursor-pointer font-display flex items-center justify-center gap-1.5 font-bold uppercase"
                  title="Tüm okunmamış bildirimleri okundu yapar ve kırmızı işareti kalıcı sıfırlar."
                >
                  <Trash2 className="w-3.5 h-3.5" /> Okundu Yap & Sıfırla
                </button>
              </div>
            </div>
          </div>

          {/* İşlem Durumu Geri Bildirimi */}
          {badgeTestStatus && (
            <div className="text-[9.5px] font-mono font-medium text-indigo-400 bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-2.5 leading-normal text-center select-text animate-fade-in">
              💡 {badgeTestStatus}
            </div>
          )}
        </div>
      )}

      {/* 3. PROFIL POST AKIŞLARI VE BUMU SOSYAL BAĞLANTILARI */}
      <div className="space-y-4">
        {/* Tab Seçimi */}
        <div className="grid grid-cols-2 gap-2 bg-slate-900/45 p-1.5 rounded-2xl border border-slate-800/60">
          <button
            onClick={() => setActiveProfileTab('created')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-display text-[11px] font-bold tracking-wider transition-all cursor-pointer ${
              activeProfileTab === 'created'
                ? 'bg-[#E1306C] text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            PAYLAŞIM ({myCreatedPosts.length})
          </button>
          
          <button
            onClick={() => setActiveProfileTab('voted')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-display text-[11px] font-bold tracking-wider transition-all cursor-pointer ${
              activeProfileTab === 'voted'
                ? 'bg-[#E1306C] text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Vote className="w-3.5 h-3.5" />
            OY VERİLEN ({myVotedPosts.length})
          </button>

          <button
            onClick={() => setActiveProfileTab('followers')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-display text-[11px] font-bold tracking-wider transition-all cursor-pointer ${
              activeProfileTab === 'followers'
                ? 'bg-[#E1306C] text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            TAKİPÇİLER ({followers.length})
          </button>

          <button
            onClick={() => setActiveProfileTab('following')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-display text-[11px] font-bold tracking-wider transition-all cursor-pointer ${
              activeProfileTab === 'following'
                ? 'bg-[#E1306C] text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className="w-3.5 h-3.5 flex-shrink-0" />
            TAKİP ({following.length})
          </button>
        </div>

        {/* İçerik Gösterim Alanı */}
        <div className="space-y-4">
          {activeProfileTab === null ? (
            <div className="bg-slate-900/15 border border-slate-800/60 rounded-3xl p-10 text-center text-slate-400 text-xs italic border-dashed select-none">
              Paylaşımları, oylarınızı veya takip durumunu görmek için yukarıdan bir sekme seçin.
            </div>
          ) : loadingPosts || loadingFollows ? (
            <div className="flex justify-center items-center py-12">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeProfileTab === 'created' ? (
            myCreatedPosts.length === 0 ? (
              <div className="bg-slate-900/10 border border-slate-800/40 rounded-3xl p-10 text-center text-slate-500 text-xs italic">
                Henüz herkese açık bir karşılaştırma paylaşmadınız.
              </div>
            ) : (
              <>
                {myCreatedPosts.map((post) => (
                  <VotingCard
                    key={post.postId}
                    post={post}
                    onPostDeleted={() => {
                      setMyCreatedPosts(prev => prev.filter(p => p.postId !== post.postId));
                    }}
                  />
                ))}

                {createdHasMore && (
                  <div className="flex justify-center pt-2 pb-6">
                    <button
                      onClick={() => fetchCreatedPosts(true)}
                      disabled={loadingMoreCreated}
                      className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-violet-650/25 to-indigo-650/25 hover:from-violet-600 hover:to-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-bold font-display tracking-wider uppercase transition-all duration-300 shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingMoreCreated ? 'animate-spin' : 'animate-spin-slow'}`} />
                      {loadingMoreCreated ? 'yükleniyor...' : 'Daha Fazla Göster'}
                    </button>
                  </div>
                )}
                {!createdHasMore && myCreatedPosts.length > 0 && (
                  <p className="text-center text-[10px] text-slate-600 font-mono py-4 lowercase select-none">
                    tüm paylaştığın karşılaştırmaları inceledin! 🚀
                  </p>
                )}
              </>
            )
          ) : activeProfileTab === 'voted' ? (
            myVotedPosts.length === 0 ? (
              <div className="bg-slate-900/10 border border-slate-800/40 rounded-3xl p-10 text-center text-slate-500 text-xs italic border-dashed">
                Henüz oyladığınız herkese açık bir karşılaştırma bulunmuyor.
              </div>
            ) : (
              <>
                {myVotedPosts.map((post) => (
                  <VotingCard
                    key={post.postId}
                    post={post}
                  />
                ))}

                {votedHasMore && (
                  <div className="flex justify-center pt-2 pb-6">
                    <button
                      onClick={() => fetchVotedPosts(true)}
                      disabled={loadingMoreVoted}
                      className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-violet-650/25 to-indigo-650/25 hover:from-violet-600 hover:to-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-bold font-display tracking-wider uppercase transition-all duration-300 shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingMoreVoted ? 'animate-spin' : 'animate-spin-slow'}`} />
                      {loadingMoreVoted ? 'yükleniyor...' : 'Daha Fazla Göster'}
                    </button>
                  </div>
                )}
                {!votedHasMore && myVotedPosts.length > 0 && (
                  <p className="text-center text-[10px] text-slate-600 font-mono py-4 lowercase select-none">
                    tüm oy verdiğin karşılaştırmaları inceledin! 🎯
                  </p>
                )}
              </>
            )
          ) : activeProfileTab === 'followers' ? (
            followers.length === 0 ? (
              <div className="bg-slate-900/10 border border-slate-800/40 rounded-3xl p-10 text-center text-slate-500 text-xs italic">
                Henüz seni takip eden kimse bulunmuyor. Paylaşımlar yaparak kitleni büyüt!
              </div>
            ) : (
              <div className="flex flex-col gap-3 bg-slate-900/20 border border-slate-800/45 rounded-3xl p-4">
                {followers.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-none animate-fade-in">
                    <div className="flex items-center gap-3 min-w-0">
                      <img 
                        src={item.followerPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${item.followerId}`} 
                        alt="Takipçi" 
                        onClick={() => { setViewingUserId(item.followerId); setActiveProfileTab('created'); }}
                        className="w-10 h-10 rounded-full border border-white/10 object-cover bg-slate-950 flex-shrink-0 cursor-pointer hover:border-violet-500/50 transition-all duration-200"
                      />
                      <div className="min-w-0">
                        <h4 
                          onClick={() => { setViewingUserId(item.followerId); setActiveProfileTab('created'); }}
                          className="text-xs font-bold text-gray-200 truncate cursor-pointer hover:text-indigo-400 hover:underline transition-colors"
                        >
                          {item.followerName}
                        </h4>
                        <span className="text-[9px] text-gray-550 font-mono">ID: {item.followerId.slice(0, 8)}...</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartDirectMessage(item.followerId)}
                        className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white rounded-full transition cursor-pointer flex items-center justify-center"
                        title="Mesaj Gönder"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[9px] bg-slate-900 border border-white/5 text-gray-400 px-2 py-1.5 rounded-full font-bold uppercase tracking-wider select-none">
                        Takipçi
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            following.length === 0 ? (
              <div className="bg-slate-900/10 border border-slate-800/40 rounded-3xl p-10 text-center text-slate-500 text-xs italic border-dashed">
                Henüz kimseyi takip etmiyorsunuz. Keşfet akışından yeni kullanıcılar keşfedin!
              </div>
            ) : (
              <div className="flex flex-col gap-3 bg-slate-900/20 border border-slate-800/45 rounded-3xl p-4">
                {following.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-none animate-fade-in">
                    <div className="flex items-center gap-3 min-w-0">
                      <img 
                        src={item.followingPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${item.followingId}`} 
                        alt="Takip edilen" 
                        onClick={() => { setViewingUserId(item.followingId); setActiveProfileTab('created'); }}
                        className="w-10 h-10 rounded-full border border-white/10 object-cover bg-slate-950 flex-shrink-0 cursor-pointer hover:border-violet-500/50 transition-all duration-200"
                      />
                      <div className="min-w-0">
                        <h4 
                          onClick={() => { setViewingUserId(item.followingId); setActiveProfileTab('created'); }}
                          className="text-xs font-bold text-gray-200 truncate cursor-pointer hover:text-indigo-400 hover:underline transition-colors"
                        >
                          {item.followingName}
                        </h4>
                        <span className="text-[9px] text-gray-550 font-mono">ID: {item.followingId.slice(0, 8)}...</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartDirectMessage(item.followingId)}
                        className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white rounded-full transition cursor-pointer flex items-center justify-center"
                        title="Mesaj Gönder"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleUnfollowFromProfile(item.followingId)}
                        className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white px-2.5 py-1.5 rounded-full font-bold uppercase tracking-wider transition cursor-pointer"
                      >
                        Takibi Bırak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

    </div>
  );
};
