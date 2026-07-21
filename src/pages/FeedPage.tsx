/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, setDoc, deleteDoc, serverTimestamp, startAfter } from 'firebase/firestore';
import { PostData, StoryData, ProfileData } from '../types';
import { checkAndSeedDatabase } from '../lib/seeding';
import { VotingCard } from '../components/VotingCard';
import { BumuLogo } from '../components/BumuLogo';
import { Sparkles, HelpCircle, Flame, BadgeAlert, Award, Play, X, Trophy, Users, Search, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCreatorProfile } from '../hooks/useCreatorProfile';

interface FeedStoryItemProps {
  story: StoryData;
  isRead: boolean;
  onClick: () => void;
}

const FeedStoryItem: React.FC<FeedStoryItemProps> = ({ story, isRead, onClick }) => {
  const { photoURL, displayName } = useCreatorProfile(story.userId, story.userPhoto, story.userName);
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 outline-none text-center cursor-pointer shrink-0 group transition duration-200 hover:scale-105 ${isRead ? 'opacity-60' : ''}`}
    >
      <div className={`relative p-[2.5px] rounded-full shadow-md transition-all ${
        isRead 
          ? 'bg-slate-800 border border-slate-700/50' 
          : 'bg-gradient-to-tr from-[#FD1D1D] via-[#C13584] to-[#833AB4] group-hover:shadow-[#C13584]/25'
      }`}>
        <div className="p-[2.5px] rounded-full bg-[#080212]">
          <img
            src={photoURL}
            alt={displayName}
            className="w-[44px] h-[44px] rounded-full object-cover bg-neutral-900"
          />
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 p-0.5 text-white rounded-full border border-[#080212] ${
          isRead ? 'bg-slate-750 text-slate-400' : 'bg-pink-500'
        }`}>
          <Play className="w-2.5 h-2.5 fill-current" />
        </div>
      </div>
      
      <span className={`text-[9px] font-bold font-display truncate max-w-[55px] transition-all ${
        isRead 
          ? 'text-slate-500 group-hover:text-slate-400' 
          : 'text-gray-400 group-hover:text-pink-500'
      }`}>
        {(displayName || '').split(' ')[0]}
      </span>
    </button>
  );
};

const ActiveStoryHeader: React.FC<{ story: StoryData }> = ({ story }) => {
  const { photoURL, displayName } = useCreatorProfile(story.userId, story.userPhoto, story.userName);
  return (
    <div className="flex items-center gap-2">
      <img 
        src={photoURL} 
        alt={displayName} 
        className="w-8 h-8 rounded-full border border-pink-500/30 object-cover bg-neutral-900" 
      />
      <div className="flex flex-col">
        <span className="text-xs font-bold text-white font-display flex items-center gap-1">{displayName}</span>
        <span className="text-[9px] text-[#E1306C] font-mono leading-none">@sonuclandi</span>
      </div>
    </div>
  );
};

// KOTA DOSTU GÜÇLÜ ÖNBELLEK SİSTEMİ (Firestore limit aşım koruması)
const CACHE_MAX_AGE = 300000; // 5 dakika

const isCacheFresh = (key: string, maxAgeMs = CACHE_MAX_AGE) => {
  const cached = localStorage.getItem(key);
  if (!cached) return false;
  try {
    const parsed = JSON.parse(cached);
    if (parsed && typeof parsed === 'object' && 'timestamp' in parsed) {
      return (Date.now() - parsed.timestamp) < maxAgeMs;
    }
  } catch (_) {}
  return false;
};

const getCachedData = (key: string) => {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    return parsed.data;
  } catch (_) {
    return null;
  }
};

const setCacheData = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
};

interface FeedPageProps {
  highlightPostId?: string | null;
  onClearHighlight?: () => void;
}

export const FeedPage: React.FC<FeedPageProps> = ({ highlightPostId = null, onClearHighlight }) => {
  const { currentUser, userData, signInWithEmail } = useAuth();
  const [posts, setPosts] = useState<PostData[]>([]);
  const [indexErrorUrl, setIndexErrorUrl] = useState<string | null>(null);
  const [sponsoredPosts, setSponsoredPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);

  // Guest authentication and demo flow triggers
  const [demoAuthLoading, setDemoAuthLoading] = useState(false);
  const [demoAuthError, setDemoAuthError] = useState<string | null>(null);

  const handleGuestDemoLogin = async () => {
    setDemoAuthLoading(true);
    setDemoAuthError(null);
    try {
      if (signInWithEmail) {
        await signInWithEmail("demo@bumu.com", "bumudemo123");
      } else {
        throw new Error("signInWithEmail context is not initialized");
      }
    } catch (err: any) {
      console.error("Demo login failed inside feed prompt:", err);
      setDemoAuthError("Tanıtım hesabı ile giriş başarısız oldu. Lütfen kendi hesabınla giriş yapmayı dene.");
    } finally {
      setDemoAuthLoading(false);
    }
  };

  useEffect(() => {
    if (highlightPostId) {
      const timer = setTimeout(() => {
        if (onClearHighlight) onClearHighlight();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightPostId, onClearHighlight]);

  // Keşfet, Takip Edilenler & Kullanıcı Arama Sekme Yönetimi
  const [feedTab, setFeedTab] = useState<'explore' | 'following' | 'searchUsers'>('explore');
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0);

  // Pagination states
  const [lastVisibleDoc, setLastVisibleDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Instagram-style incremental loading
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    setVisibleCount(10);
    setLastVisibleDoc(null);
    setHasMore(true);
  }, [feedTab, forceRefreshTrigger]);

  // Pull-to-refresh states
  const [pullY, setPullY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);

  // Reset pull to refresh when loading finishes
  useEffect(() => {
    if (!loading) {
      setRefreshing(false);
      setPullY(0);
    }
  }, [loading]);

  const handleStart = (clientY: number) => {
    const isAtTop = window.scrollY === 0 && document.documentElement.scrollTop === 0;
    if (isAtTop && !refreshing) {
      startYRef.current = clientY;
      setIsPulling(true);
    }
  };

  const handleMove = (clientY: number) => {
    if (!isPulling || refreshing) return;
    const deltaY = clientY - startYRef.current;
    if (deltaY > 0) {
      const resistanceDistance = Math.min(deltaY * 0.4, 90);
      setPullY(resistanceDistance);
    }
  };

  const handleEnd = () => {
    if (!isPulling) return;
    setIsPulling(false);
    if (pullY > 60) {
      setRefreshing(true);
      handleRefreshAll();
    } else {
      setPullY(0);
    }
  };

  // Infinite Scroll Observer using IntersectionObserver
  const loaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentLoader = loaderRef.current;
    if (!currentLoader) return;

    const observer = new IntersectionObserver((entries) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loading && !loadingMore) {
        fetchFeed(true);
      }
    }, {
      rootMargin: '300px', // triggers loading 300px before reaching the end for seamless Instagram feel
      threshold: 0.1
    });

    observer.observe(currentLoader);
    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [posts, sponsoredPosts, hasMore, loading, loadingMore]);

  const handleRefreshAll = () => {
    if (currentUser) {
      localStorage.removeItem(`bumu_feed_explore_${currentUser.uid}`);
      localStorage.removeItem(`bumu_feed_following_${currentUser.uid}`);
      localStorage.removeItem(`bumu_sponsored_feed_explore`);
      localStorage.removeItem(`bumu_sponsored_feed_following`);
      localStorage.removeItem(`bumu_stories_${currentUser.uid}`);
      localStorage.removeItem(`bumu_all_profiles_${currentUser.uid}`);
      localStorage.removeItem(`bumu_following_${currentUser.uid}`);
    } else {
      localStorage.removeItem(`bumu_feed_explore_anonymous`);
      localStorage.removeItem(`bumu_sponsored_feed_explore`);
      localStorage.removeItem(`bumu_stories_anonymous`);
    }
    setForceRefreshTrigger(prev => prev + 1);
  };

  // Hikaye paylaşıldığında otomatik yenileme için dinleyici
  useEffect(() => {
    const handleStoryShared = () => {
      setForceRefreshTrigger(prev => prev + 1);
    };
    window.addEventListener('story-shared', handleStoryShared);
    return () => window.removeEventListener('story-shared', handleStoryShared);
  }, []);

  // Kullanıcı Arama Durumları
  const [allProfiles, setAllProfiles] = useState<ProfileData[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<ProfileData[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebouncedQuery, setSearchDebouncedQuery] = useState('');

  // Debounce search query (500ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchDebouncedQuery(searchQuery);
    }, 500);
    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Stories (Hikayeler) states
  const [stories, setStories] = useState<StoryData[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [activeStory, setActiveStory] = useState<StoryData | null>(null);
  const [activeStoryProgress, setActiveStoryProgress] = useState(0);
  const [readStoryIds, setReadStoryIds] = useState<string[]>([]);

  // Okunan hikayeleri yükleme
  useEffect(() => {
    const key = `bumu_read_stories_${currentUser?.uid || 'anonymous'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setReadStoryIds(JSON.parse(saved));
      } catch (e) {
        setReadStoryIds([]);
      }
    } else {
      setReadStoryIds([]);
    }
  }, [currentUser]);

  // Hikayeyi okundu olarak işaretleme
  const markStoryAsRead = (storyId: string) => {
    if (readStoryIds.includes(storyId)) return;
    const newRead = [...readStoryIds, storyId];
    setReadStoryIds(newRead);
    const key = `bumu_read_stories_${currentUser?.uid || 'anonymous'}`;
    localStorage.setItem(key, JSON.stringify(newRead));
  };

  // Hikaye Silme Özelliği
  const handleDeleteStory = async (storyId: string) => {
    if (!currentUser) return;
    if (!window.confirm("Bu hikayeyi silmek istediğinizden emin misiniz?")) return;
    try {
      if (storyId.startsWith('fallback-')) {
        setStories(prev => prev.filter(s => s.storyId !== storyId));
        setActiveStory(null);
        return;
      }
      await deleteDoc(doc(db, 'stories', storyId));
      
      // Önbellekleri temizle
      localStorage.removeItem(`bumu_stories_${currentUser.uid}`);
      localStorage.removeItem(`bumu_stories_anonymous`);
      
      // Yerel durumları güncelle
      setStories(prev => prev.filter(s => s.storyId !== storyId));
      setActiveStory(null);
    } catch (err) {
      console.error("Hikaye silinirken hata:", err);
    }
  };

  // Takip edilen kişilerin ID'lerini Firestore'dan çek (SÜPER KOTA DOSTU ÖNBELLEKLİ)
  useEffect(() => {
    if (!currentUser) {
      setFollowingIds([]);
      setFeedTab('explore');
      return;
    }
    const fetchFollowing = async () => {
      const isForced = forceRefreshTrigger > 0;
      const cacheKey = `bumu_following_${currentUser.uid}`;
      
      if (!isForced && isCacheFresh(cacheKey)) {
        const cached = getCachedData(cacheKey);
        if (cached) {
          setFollowingIds(cached);
          return;
        }
      }

      try {
        const followsRef = collection(db, 'follows');
        const q = query(followsRef, where('followerId', '==', currentUser.uid));
        const snap = await getDocs(q);
        const ids = snap.docs.map(doc => doc.data().followingId as string);
        setFollowingIds(ids);
        setCacheData(cacheKey, ids);
      } catch (err) {
        console.warn("Takip edilenler listesi alınamadı, yerel önbellek deneniyor:", err);
        const cached = getCachedData(cacheKey);
        if (cached) {
          setFollowingIds(cached);
        }
      }
    };
    fetchFollowing();
  }, [currentUser, forceRefreshTrigger]);

  // Akış Gönderilerini Çek (SÜPER KOTA DOSTU SAYFALAMALI - cursor based pagination)
  const fetchFeed = async (isMore = false) => {
    if (isMore && (loadingMore || !hasMore || !lastVisibleDoc)) return;

    if (isMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setLastVisibleDoc(null);
      setHasMore(true);
    }

    try {
      if (!isMore) {
        await checkAndSeedDatabase();
      }
      const postsRef = collection(db, 'posts');
      let q;

      if (feedTab === 'following') {
        if (followingIds.length === 0) {
          if (!isMore) setPosts([]);
          setHasMore(false);
          setLoading(false);
          setLoadingMore(false);
          return;
        }

        // Following için son 30-50 global gönderiyi sayfalama ile çekip istemcide takip durumuna göre filtreliyoruz
        if (isMore && lastVisibleDoc) {
          q = query(
            postsRef,
            where('groupId', '==', 'global'),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisibleDoc),
            limit(15)
          );
        } else {
          q = query(
            postsRef,
            where('groupId', '==', 'global'),
            orderBy('createdAt', 'desc'),
            limit(15)
          );
        }
      } else {
        // Explore tab için limit 10 sayfalama
        if (isMore && lastVisibleDoc) {
          q = query(
            postsRef,
            where('groupId', '==', 'global'),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisibleDoc),
            limit(10)
          );
        } else {
          q = query(
            postsRef,
            where('groupId', '==', 'global'),
            orderBy('createdAt', 'desc'),
            limit(10)
          );
        }
      }

      let snap;
      let isFallbackActive = false;
      try {
        snap = await getDocs(q);
      } catch (queryErr: any) {
        console.warn("Primary feed query failed, initiating resilient fallback:", queryErr);
        isFallbackActive = true;

        const isIndexError = queryErr.code === 'failed-precondition' || 
                             queryErr.message?.toLowerCase().includes('index') ||
                             queryErr.toString().toLowerCase().includes('index');
        
        if (isIndexError) {
          const matchUrl = queryErr.message?.match(/https:\/\/console\.firebase\.google\.com[^\s']+/);
          if (matchUrl && matchUrl[0]) {
            setIndexErrorUrl(matchUrl[0]);
          } else {
            setIndexErrorUrl("https://console.firebase.google.com");
          }
        }

        // LEVEL 1 FALLBACK: Remove orderBy but keep groupId filter
        try {
          const fallbackLimit = feedTab === 'following' ? 60 : 40;
          const fallbackQ = query(
            postsRef,
            where('groupId', '==', 'global'),
            limit(fallbackLimit)
          );
          snap = await getDocs(fallbackQ);
          setHasMore(false);
        } catch (fallbackErr: any) {
          console.warn("Level 1 fallback failed (possibly due to missing fields or permissions), trying Level 2 ultra-resilient fallback:", fallbackErr);
          
          // LEVEL 2 FALLBACK: Ultra-resilient absolute query without any filters or order
          try {
            const ultraFallbackQ = query(postsRef, limit(80));
            snap = await getDocs(ultraFallbackQ);
            setHasMore(false);
          } catch (ultraErr) {
            console.error("All resilient feed query fallbacks failed:", ultraErr);
            throw ultraErr;
          }
        }
      }

      if (snap.empty) {
        setHasMore(false);
        if (isMore) setLoadingMore(false);
        else setLoading(false);
        return;
      }

      const lastDoc = snap.docs[snap.docs.length - 1];
      if (!isFallbackActive) {
        setLastVisibleDoc(lastDoc);
        setHasMore(snap.docs.length >= (feedTab === 'following' ? 15 : 10));
      }

      const list: PostData[] = [];
      snap.forEach(d => {
        const data = d.data() as PostData;
        // Güvenlik ve Doğruluk: Eğer fallback aktifse, sadece 'global' olanları ana akışa ekleyelim (kapalı grup gönderileri sızmasın)
        const isGlobal = !data.groupId || data.groupId === 'global';
        if (!isGlobal) return;

        if (feedTab === 'following') {
          if (followingIds.includes(data.creatorId)) {
            list.push({ postId: d.id, ...data });
          }
        } else {
          list.push({ postId: d.id, ...data });
        }
      });

      // Eğer fallback aktifse istemci tarafında createdAt'e göre sıralayalım
      if (isFallbackActive) {
        list.sort((a, b) => {
          const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return timeB - timeA;
        });
      }

      if (isMore) {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.postId));
          const filteredNew = list.filter(p => !existingIds.has(p.postId));
          return [...prev, ...filteredNew];
        });
      } else {
        setPosts(list);

        // Sponsorlu reklam kampanyalarını çek (Sadece ilk sayfa açılışında 5 adet limitli)
        const sponsoredQuery = query(
          postsRef,
          where('isSponsored', '==', true),
          limit(5)
        );
        try {
          const sponsoredSnap = await getDocs(sponsoredQuery);
          const sponsoredList: PostData[] = [];
          sponsoredSnap.forEach(d => {
            sponsoredList.push({ postId: d.id, ...d.data() } as PostData);
          });
          setSponsoredPosts(sponsoredList);
        } catch (sponErr) {
          console.warn("Sponsorlu gönderiler çekilemedi:", sponErr);
        }
      }
    } catch (err) {
      console.warn("Akış çekme hatası (Sayfalama):", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchFeed(false);
  }, [feedTab, followingIds, forceRefreshTrigger]);

  // 3. Kullanıcı profillerini debounced ve prefiks sorgusu ile çekme (KOTA DOSTU VE LİMİTLİ)
  useEffect(() => {
    if (feedTab !== 'searchUsers') return;

    const fetchProfiles = async () => {
      const qText = searchDebouncedQuery.trim();
      
      // Eğer arama sorgusu boşsa boş liste gösterelim (Kota harcamayalım)
      if (!qText) {
        setFilteredProfiles([]);
        return;
      }

      setLoadingProfiles(true);
      const cacheKey = `bumu_search_cache_${qText}`;
      
      // Önce yerel önbelleğe bak
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setFilteredProfiles(parsed);
          setLoadingProfiles(false);
          return;
        } catch (_) {}
      }

      try {
        const profilesRef = collection(db, 'profiles');
        // Tüm profilleri limitli (maksimum 100) olarak çekelim
        const q = query(profilesRef, limit(100));
        const snap = await getDocs(q);
        const list: ProfileData[] = [];
        const queryLower = qText.toLowerCase();
        
        snap.forEach(d => {
          const data = d.data();
          const displayName = (data.displayName || '').toLowerCase();
          const bio = (data.bio || '').toLowerCase();
          const location = (data.location || '').toLowerCase();
          const email = (data.email || '').toLowerCase();
          
          // Büyük/küçük harf duyarsız şekilde isim, bio, konum veya e-postada eşleşme ara
          if (
            displayName.includes(queryLower) ||
            bio.includes(queryLower) ||
            location.includes(queryLower) ||
            email.includes(queryLower) ||
            d.id === qText
          ) {
            list.push({ ...data, userId: d.id } as ProfileData);
          }
        });

        setFilteredProfiles(list);
        localStorage.setItem(cacheKey, JSON.stringify(list));
      } catch (err) {
        console.warn("Kullanıcı arama hatası:", err);
      } finally {
        setLoadingProfiles(false);
      }
    };
    
    fetchProfiles();
  }, [feedTab, searchDebouncedQuery]);

  // 5. Kullanıcı Takip Etme / Takipten Çıkma Toggled
  const handleFollowToggleInPage = async (targetUserId: string, targetName: string, targetPhoto: string) => {
    if (!currentUser) return;
    try {
      const isFollowingTarget = followingIds.includes(targetUserId);
      const followId = `${currentUser.uid}_${targetUserId}`;
      const followDocRef = doc(db, 'follows', followId);
      
      if (isFollowingTarget) {
        await deleteDoc(followDocRef);
        setFollowingIds(prev => prev.filter(id => id !== targetUserId));
        try {
          const notifId = `${currentUser.uid}_follow_${targetUserId}`;
          await deleteDoc(doc(db, 'notifications', notifId));
        } catch (err) {}
      } else {
        await setDoc(followDocRef, {
          followerId: currentUser.uid,
          followerName: userData?.displayName || currentUser.displayName || 'Anonim',
          followerPhoto: userData?.photoURL || currentUser.photoURL || '',
          followingId: targetUserId,
          followingName: targetName || 'Gizemli Üye',
          followingPhoto: targetPhoto || '',
          createdAt: serverTimestamp()
        });
        setFollowingIds(prev => [...prev, targetUserId]);

        try {
          const notifId = `${currentUser.uid}_follow_${targetUserId}`;
          const notifDocRef = doc(db, 'notifications', notifId);
          await setDoc(notifDocRef, {
            notificationId: notifId,
            recipientId: targetUserId,
            senderId: currentUser.uid,
            senderName: userData?.displayName || currentUser.displayName || 'Anonim',
            senderPhoto: userData?.photoURL || currentUser.photoURL || '',
            type: 'follow',
            read: false,
            createdAt: serverTimestamp()
          });
        } catch (err) {
          console.error("Takip bildirimi oluşturma hatası:", err);
        }
      }
    } catch (err) {
      console.error("Takip sırasında hata oluştu:", err);
    }
  };

  // Realtime or direct fetching of Shared Stories with a fallback to ended posts (SÜPER KOTA DOSTU ÖNBELLEKLİ)
  useEffect(() => {
    const fetchStories = async () => {
      setLoadingStories(true);
      const isForced = forceRefreshTrigger > 0;
      const cacheKey = `bumu_stories_${currentUser?.uid || 'anonymous'}`;
      
      if (!isForced && isCacheFresh(cacheKey)) {
        const cached = getCachedData(cacheKey);
        if (cached) {
          setStories(cached);
          setLoadingStories(false);
          return;
        }
      }

      try {
        const storiesRef = collection(db, 'stories');
        const q = query(storiesRef, orderBy('createdAt', 'desc'), limit(15));
        const snap = await getDocs(q);
        const list: StoryData[] = [];
        
        snap.forEach(d => {
          list.push({ storyId: d.id, ...d.data() } as StoryData);
        });

        if (list.length === 0) {
          // Fallback to concluded global/public posts so the user has beautiful, real stories immediately
          const postsRef = collection(db, 'posts');
          const endedQ = query(postsRef, where('status', '==', 'ended'), where('groupId', '==', 'global'), limit(30));
          const endedSnap = await getDocs(endedQ);
          const fallbackStories: StoryData[] = [];
          
          endedSnap.forEach((d) => {
            const data = d.data();
            if (data.groupId && data.groupId !== 'global') {
              return; // Do not show group posts in public stories fallback
            }
            if (fallbackStories.length >= 8) return;

            fallbackStories.push({
              storyId: `fallback-${d.id}`,
              postId: d.id,
              userId: data.creatorId,
              userName: data.creatorName || 'Anonim',
              userPhoto: data.creatorPhoto || '',
              optionAUrl: data.optionAUrl,
              optionBUrl: data.optionBUrl,
              optionALabel: data.optionALabel,
              optionBLabel: data.optionBLabel,
              title: data.title,
              winnerOption: data.winnerOption || 'draw',
              createdAt: data.createdAt
            });
          });
          setStories(fallbackStories);
          setCacheData(cacheKey, fallbackStories);
        } else {
          setStories(list);
          setCacheData(cacheKey, list);
        }
      } catch (err) {
        console.warn("Hikayeleri çekme hatası (Kota aşımı olabilir), yerel önbelleğe geçiliyor:", err);
        const cached = getCachedData(cacheKey);
        if (cached) {
          setStories(cached);
        }
      } finally {
        setLoadingStories(false);
      }
    };

    fetchStories();
  }, [currentUser, forceRefreshTrigger]);

  // Stories progress timer
  useEffect(() => {
    if (!activeStory) {
      setActiveStoryProgress(0);
      return;
    }

    setActiveStoryProgress(0);
    const interval = setInterval(() => {
      setActiveStoryProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setActiveStory(null);
          return 100;
        }
        return prev + 2; // Ticks up, roughly 50 ticks * 100ms = 5 seconds player
      });
    }, 100);

    return () => clearInterval(interval);
  }, [activeStory]);

  // Sponsorlu postları ve normal postları dinamik harmanlama
  const blendedFeed = [...sponsoredPosts, ...posts.filter(p => !p.isSponsored)];

  // Son 24 saat içinde paylaşılan hikayeleri getiren filtre (Yüksek Toleranslı)
  const filteredStories = stories.filter(story => {
    let storyTime = Date.now(); // default to now if missing
    if (story.createdAt) {
      if (story.createdAt.seconds) {
        storyTime = story.createdAt.seconds * 1000;
      } else if (story.createdAt.toDate) {
        storyTime = story.createdAt.toDate().getTime();
      } else {
        const parsed = new Date(story.createdAt).getTime();
        if (!isNaN(parsed)) {
          storyTime = parsed;
        }
      }
    }
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    return storyTime >= twentyFourHoursAgo;
  });

  // Okunan hikayeleri sona atma sıralaması (Instagram UX)
  const sortedStories = [...filteredStories].sort((a, b) => {
    const aRead = readStoryIds.includes(a.storyId);
    const bRead = readStoryIds.includes(b.storyId);
    if (aRead && !bRead) return 1;
    if (!aRead && bRead) return -1;
    return 0;
  });

  return (
    <div 
      className="w-full max-w-lg mx-auto bg-slate-950/40 px-0 py-4 min-h-screen text-slate-100 flex flex-col gap-4 font-sans select-none pb-12 relative touch-pan-y"
      onTouchStart={(e) => handleStart(e.touches[0].clientY)}
      onTouchMove={(e) => handleMove(e.touches[0].clientY)}
      onTouchEnd={handleEnd}
      onMouseDown={(e) => handleStart(e.clientY)}
      onMouseMove={(e) => {
        if (e.buttons === 1) {
          handleMove(e.clientY);
        }
      }}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
    >
      
      {/* Pull To Refresh Indicator */}
      <div 
        className="absolute left-0 right-0 top-0 flex justify-center pointer-events-none transition-all duration-150 z-50"
        style={{
          transform: `translateY(${pullY}px)`,
          opacity: pullY > 10 ? 1 : 0,
          marginTop: '-10px'
        }}
      >
        <div className="bg-slate-900/90 border border-slate-800 rounded-full p-2.5 shadow-xl flex items-center justify-center backdrop-blur">
          <RefreshCw 
            className={`w-4 h-4 text-indigo-400 ${
              refreshing 
                ? 'animate-spin' 
                : ''
            }`}
            style={{
              transform: refreshing ? 'none' : `rotate(${pullY * 4}deg)`
            }}
          />
        </div>
      </div>

      {/* 1. HİKAYELER SEKANSI / INSTAGRAM STORIES CAROUSEL */}
      {(!loadingStories && filteredStories.length === 0) ? null : (
        <div className="w-full border-b border-white/5 pb-3 px-4">
          <div className="flex gap-3 overflow-x-auto scrollbar-none py-1.5 px-0.5">
            {loadingStories ? (
              <div className="flex gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 animate-pulse">
                    <div className="w-13 h-13 rounded-full bg-slate-900 border border-slate-800" />
                    <div className="w-10 h-2 bg-slate-900 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              sortedStories.map((story) => {
                const isRead = readStoryIds.includes(story.storyId);
                return (
                  <FeedStoryItem
                    key={story.storyId}
                    story={story}
                    isRead={isRead}
                    onClick={() => {
                      setActiveStory(story);
                      markStoryAsRead(story.storyId);
                    }}
                  />
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Firestore Index Warning Banner */}
      {indexErrorUrl && (
        <div className="mx-4 my-2 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-2xl flex flex-col gap-2 font-sans text-xs animate-fade-in">
          <div className="flex items-start gap-2">
            <BadgeAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0 animate-pulse" />
            <div>
              <p className="font-bold">⚠️ Firestore Dizin Eksikliği Tespit Edildi (Üretim Modu)</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                Sorguların hızlı ve sıralı çalışabilmesi için Firebase'de bir indeks (dizin) oluşturulmalıdır. 
                Sistem şu anda geçici istemci sıralaması (Client-Side Fallback) kullanarak çalışıyor.
              </p>
            </div>
          </div>
          <a 
            href={indexErrorUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-1 text-center py-2 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold hover:brightness-110 active:scale-95 transition"
          >
            ⚡ DİZİNİ OTOMATİK OLUŞTUR (KOLAY TIKLAMA)
          </a>
        </div>
      )}

      {/* 2. AKIŞ SEKMELERİ */}
      <div className="mx-4 grid grid-cols-3 bg-[#11051b]/80 p-1 rounded-2xl border border-white/5 backdrop-blur-md mb-2">
        <button
          onClick={() => setFeedTab('explore')}
          className={`py-2 text-[10px] sm:text-xs font-bold font-display rounded-xl tracking-wider transition duration-300 flex items-center justify-center gap-1 cursor-pointer truncate ${
            feedTab === 'explore'
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'text-gray-400 hover:text-white bg-transparent'
          }`}
        >
          🧭 KEŞFET
        </button>
        <button
          onClick={() => setFeedTab('following')}
          className={`py-2 text-[10px] sm:text-xs font-bold font-display rounded-xl tracking-wider transition duration-300 flex items-center justify-center gap-1 cursor-pointer truncate ${
            feedTab === 'following'
              ? 'bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white shadow-lg shadow-pink-600/20'
              : 'text-gray-400 hover:text-white bg-transparent'
          }`}
        >
          🔥 TAKİP
        </button>
        <button
          onClick={() => setFeedTab('searchUsers')}
          className={`py-2 text-[10px] sm:text-xs font-bold font-display rounded-xl tracking-wider transition duration-300 flex items-center justify-center gap-1 cursor-pointer truncate ${
            feedTab === 'searchUsers'
              ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-gray-400 hover:text-white bg-transparent'
          }`}
        >
          🔍 ÜYE BUL
        </button>
      </div>

      {/* 3. AKIŞ İÇERİKLERİ VE KULLANICI ARAMA GÖRÜNÜMÜ */}
      {!currentUser && feedTab !== 'explore' ? (
        <div className="mx-4 my-6 p-6 bg-[#11051b]/95 border border-white/5 rounded-3xl text-center flex flex-col items-center gap-4 animate-scale-up shadow-2xl">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#E1306C] via-[#C13584] to-[#833AB4] flex items-center justify-center text-white shadow-lg shadow-pink-600/10">
            {feedTab === 'following' ? <Flame className="w-6 h-6" /> : <Users className="w-6 h-6" />}
          </div>
          
          <div>
            <h3 className="text-xs font-extrabold text-gray-200 uppercase tracking-widest font-display">
              {feedTab === 'following' ? 'Takip Ettiğin Karşılaştırmalar' : 'BumuBumu Üyelerini Keşfet'}
            </h3>
            <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed max-w-xs mx-auto">
              {feedTab === 'following' 
                ? 'Takip ettiğin kişilerin paylaştığı güncel ikili karşılaştırmaları görmek, oylara katılmak ve yorum yapmak için üye ol veya giriş yap.'
                : 'Sistemdeki diğer üyeleri aramak, profillerini incelemek, onları takip etmek ve doğrudan DM göndermek için üye ol veya giriş yap.'
              }
            </p>
          </div>

          {demoAuthError && (
            <p className="text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/10 px-3 py-1.5 rounded-xl">
              {demoAuthError}
            </p>
          )}

          <div className="w-full flex flex-col gap-2 max-w-xs mx-auto mt-2">
            <button
              onClick={handleGuestDemoLogin}
              disabled={demoAuthLoading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 hover:brightness-110 text-white font-display font-black text-[10px] tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5 uppercase shadow-lg shadow-pink-600/10 disabled:opacity-50"
            >
              {demoAuthLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                '⚡ TANITIM HESABI İLE TEK TIKLA GİRİŞ'
              )}
            </button>
            
            <button
              onClick={() => {
                // Navigate to profile page where the auth gate is active
                window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'profile' } }));
              }}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono text-[9px] tracking-widest uppercase transition cursor-pointer"
            >
              🔑 KENDİ HESABINLA GİRİŞ YAP / ÜYE OL
            </button>
          </div>
        </div>
      ) : feedTab === 'searchUsers' ? (
        <div className="flex flex-col gap-4 px-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kullanıcı adı, bio veya şehre göre ara..."
              className="w-full pl-10 pr-10 py-2.5 bg-slate-900/60 border border-slate-800/80 focus:border-[#E1306C] rounded-2xl text-xs font-display text-slate-100 placeholder-slate-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-2.5 p-0.5 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 pb-16">
            {loadingProfiles ? (
              <div className="flex justify-center items-center py-20">
                <div className="w-6 h-6 border-2 border-[#E1306C] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="bg-slate-900/10 border border-slate-800/40 rounded-3xl p-10 text-center text-slate-500 text-xs italic border-dashed">
                Aradığınız kriterlerde üye bulunamadı.
              </div>
            ) : (
              filteredProfiles.map((p) => {
                const isMe = p.userId === currentUser?.uid;
                const isCurrentUserFollowing = followingIds.includes(p.userId);
                
                return (
                  <div 
                    key={p.userId} 
                    className="flex items-center justify-between p-3.5 bg-[#18181B] dark:bg-[#12071f]/60 border border-white/5 rounded-2xl hover:border-[#E1306C]/30 transition duration-300"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={p.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${p.userId}`}
                        alt={p.displayName}
                        className="w-10 h-10 rounded-full border border-white/10 object-cover bg-neutral-900 flex-shrink-0"
                      />
                      <div className="min-w-0 flex flex-col">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-gray-200 truncate font-display leading-none">{p.displayName}</span>
                          {p.location && (
                            <span className="text-[8px] bg-white/5 px-1.5 py-0.5 rounded text-gray-400 font-sans border border-white/5 flex items-center gap-0.5">
                              📍 {p.location}
                            </span>
                          )}
                          {isMe && (
                            <span className="text-[8px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1 py-0.5 rounded font-bold uppercase tracking-wider">
                              BEN
                            </span>
                          )}
                        </div>
                        {p.bio && (
                          <p className="text-[10px] text-gray-400 line-clamp-1 italic font-display mt-0.5">{p.bio}</p>
                        )}
                        <span className="text-[8px] text-gray-600 font-mono mt-0.5">ID: {p.userId.slice(0, 8)}...</span>
                      </div>
                    </div>

                    {!isMe && currentUser && (
                      <button
                        onClick={() => handleFollowToggleInPage(p.userId, p.displayName, p.photoURL || '')}
                        className={`text-[9px] px-3.5 py-1.5 rounded-full font-bold uppercase tracking-wider transition duration-200 cursor-pointer border shrink-0 ${
                          isCurrentUserFollowing
                            ? 'bg-transparent text-[#E1306C] border-[#E1306C]/40 hover:bg-[#E1306C]/10'
                            : 'bg-gradient-to-r from-pink-600 to-purple-600 text-white border-transparent hover:brightness-110 shadow-md shadow-pink-600/10'
                        }`}
                      >
                        {isCurrentUserFollowing ? 'Takibi Bırak' : 'Takip Et'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 mt-1 pb-16">
          {loading ? (
            <div className="flex justify-center items-center py-32">
              <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : blendedFeed.length === 0 ? (
            feedTab === 'following' ? (
              followingIds.length === 0 ? (
                <div className="mx-4 bg-slate-900/10 border border-slate-800/40 rounded-3xl p-12 text-center flex flex-col items-center gap-3 animate-fade-in">
                  <Users className="w-12 h-12 text-[#E1306C] animate-pulse" />
                  <h3 className="text-sm font-semibold text-slate-400">Takip Ettiğin Kimse Yok</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-mono max-w-sm lowercase">
                    gönderilerin üzerindeki veya "üye bul" sekmesindeki "takip et" butonuna tıklayarak arkadaş edinmeye başla! takip ettiklerinin paylaşımlarını burada göreceksin.
                  </p>
                </div>
              ) : (
                <div className="mx-4 bg-slate-900/10 border border-slate-800/40 rounded-3xl p-12 text-center flex flex-col items-center gap-3 animate-fade-in">
                  <Flame className="w-12 h-12 text-gray-700 animate-pulse" />
                  <h3 className="text-sm font-semibold text-slate-400">Yeni Paylaşım Yok</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-mono max-w-sm lowercase">
                    takip ettiğin kişiler henüz yeni bir ikili karşılaştırma paylaşmamış. daha fazla kişiyi takip etmeyi deneyebilirsin!
                  </p>
                </div>
              )
            ) : (
              <div className="mx-4 bg-slate-900/10 border border-slate-800/40 rounded-3xl p-12 text-center flex flex-col items-center gap-3 animate-fade-in">
                <HelpCircle className="w-12 h-12 text-slate-700 animate-pulse" />
                <h3 className="text-sm font-semibold text-slate-400">Şimdilik Akış Sakin</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-mono max-w-xs lowercase">
                  gönderiler veya sponsorlu kampanyalar henüz oluşmamış. '+' butonuna tıklayarak ilk karşılaştırmayı sen yapabilirsin!
                </p>
              </div>
            )
          ) : (
            <>
              {blendedFeed.map((post) => (
                <VotingCard 
                  key={post.postId} 
                  post={post} 
                  autoOpenComments={highlightPostId === post.postId}
                  onPostDeleted={() => {
                    setPosts(prev => prev.filter(p => p.postId !== post.postId));
                    setSponsoredPosts(prev => prev.filter(p => p.postId !== post.postId));
                  }}
                />
              ))}

              {hasMore && (
                <div ref={loaderRef} className="flex justify-center py-8 select-none">
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono lowercase">
                    <RefreshCw className="w-4 h-4 animate-spin-slow text-indigo-400" />
                    yükleniyor...
                  </div>
                </div>
              )}
              {!hasMore && blendedFeed.length > 0 && (
                <p className="text-center text-[10px] text-slate-600 font-mono py-6 lowercase select-none">
                  tüm yeni karşılaştırmaları inceledin! 🎉
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* 3. AKTİF HİKAYE OYNATICI OVERLAY MODALI */}
      {activeStory && (
        <div className="fixed inset-0 z-50 bg-[#06010c]/98 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md animate-scale-up">
          <div className="w-full max-w-sm h-[85vh] bg-[#11051b] border border-pink-500/25 rounded-3xl flex flex-col relative overflow-hidden shadow-2xl">
            
            {/* Ticking Story Progress Bars */}
            <div className="absolute top-2.5 inset-x-4 z-40 flex gap-1">
              <div className="h-1 bg-white/20 rounded-full w-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-pink-500 to-fuchsia-400 transition-all duration-100 rounded-full"
                  style={{ width: `${activeStoryProgress}%` }}
                />
              </div>
            </div>

            {/* Header: User details & close */}
            <div className="absolute top-5 inset-x-4 z-40 flex items-center justify-between pointer-events-auto">
              <ActiveStoryHeader story={activeStory} />

              <div className="flex items-center gap-2">
                {/* Delete story button if it belongs to current user or admin */}
                {currentUser && (activeStory.userId === currentUser.uid || userData?.role === 'admin') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteStory(activeStory.storyId);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition cursor-pointer font-bold text-[10px] uppercase font-mono shadow-md shadow-red-600/20"
                    title="Hikayeyi Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sil</span>
                  </button>
                )}
                {/* Logo badge in popup */}
                <BumuLogo size="xs" className="w-[20px] h-[20px]" />
                <button 
                  onClick={() => setActiveStory(null)}
                  className="p-1 rounded-full bg-black/60 text-gray-300 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Story comparison view in gorgeous 9:16 aspect ratios */}
            <div className="flex-1 flex flex-col justify-center items-center px-4 pt-16 pb-6 text-center">
              
              {/* Question Headline */}
              <h2 className="text-white font-display text-sm font-black uppercase tracking-wide leading-snug max-w-[280px] mb-4 bg-black/40 px-3 py-1.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                {activeStory.title}
              </h2>

              {/* Visual matchup elements */}
              <div className="w-full grid grid-cols-2 gap-2 max-w-xs relative my-auto">
                
                {/* Option A Container */}
                <div className={`relative rounded-2xl overflow-hidden border aspect-[9/16] ${activeStory.winnerOption === 'A' ? 'border-pink-500 px-0.5 py-0.5 shadow-lg shadow-pink-500/20 ring-1 ring-pink-500' : 'border-white/5 opacity-55'}`}>
                  <img 
                    src={activeStory.optionAUrl || null} 
                    alt={activeStory.optionALabel} 
                    className="w-full h-full object-cover" 
                  />

                  {/* Victory banner */}
                  {activeStory.winnerOption === 'A' && (
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-pink-500 text-white text-[8px] font-black tracking-widest uppercase flex items-center gap-0.5 shadow-lg">
                      <Trophy className="w-2.5 h-2.5" /> KAZANDI
                    </div>
                  )}
                </div>

                {/* Option B Container */}
                <div className={`relative rounded-2xl overflow-hidden border aspect-[9/16] ${activeStory.winnerOption === 'B' ? 'border-pink-500 px-0.5 py-0.5 shadow-lg shadow-pink-500/20 ring-1 ring-pink-500' : 'border-white/5 opacity-55'}`}>
                  <img 
                    src={activeStory.optionBUrl || null} 
                    alt={activeStory.optionBLabel} 
                    className="w-full h-full object-cover" 
                  />

                  {/* Victory banner */}
                  {activeStory.winnerOption === 'B' && (
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-pink-500 text-white text-[8px] font-black tracking-widest uppercase flex items-center gap-0.5 shadow-lg">
                      <Trophy className="w-2.5 h-2.5" /> KAZANDI
                    </div>
                  )}
                </div>

                {/* If draw / berabere */}
                {activeStory.winnerOption === 'draw' && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-500 text-black py-1 px-3.5 rounded-xl border border-[#080212] flex items-center justify-center font-display font-black text-[9px] tracking-wider uppercase shadow-xl z-20">
                    🤝 BERABERE
                  </div>
                )}
              </div>

              {/* Bottom inspect link buttons */}
              <div className="w-full pt-4 max-w-xs">
                <button
                  onClick={() => {
                    // Navigate silently resetting query param or simulate inspect
                    setActiveStory(null);
                    window.location.hash = `gonderi-${activeStory.postId}`;
                    const targetEl = document.getElementById(`insights-toggle-${activeStory.postId}`) || document.getElementById(`${activeStory.postId}-voteA`);
                    if (targetEl) {
                      targetEl.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 font-bold text-xs text-white shadow-lg shadow-pink-500/10 cursor-pointer active:scale-95 transition font-display uppercase tracking-wider"
                >
                  Gönderiyi İncele & Yorumlar
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
