/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, getDocs, writeBatch, increment, serverTimestamp, onSnapshot, updateDoc, deleteDoc, collection, addDoc, setDoc } from 'firebase/firestore';
import { PostData, VoteData } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCreatorProfile } from '../hooks/useCreatorProfile';
import { Maximize2, Share2, Award, Clock, MapPin, Check, Sparkles, Trophy, X, ShieldAlert, Trash2, MessageSquare, Send, RotateCcw, BarChart2, Star, Lock } from 'lucide-react';
import { DividedComments } from './DividedComments';
import { BumuLogo } from './BumuLogo';
import { InsightsPanel } from './InsightsPanel';
import { updatePostTrendScore } from '../lib/trends';
import { aggregateAndCleanupShards } from '../lib/aggregation';

interface VotingCardProps {
  post: PostData;
  onPostDeleted?: () => void;
  standalone?: boolean;
  autoOpenComments?: boolean;
}

export const VotingCard: React.FC<VotingCardProps> = ({ post: initialPost, onPostDeleted, standalone = false, autoOpenComments = false }) => {
  const { currentUser, userData, profileData, refreshUserData } = useAuth();
  const [userVote, setUserVote] = useState<VoteData | null>(null);
  const [votedOptionLocally, setVotedOptionLocally] = useState<"A" | "B" | null>(null);
  const [loadingVote, setLoadingVote] = useState(true);
  const [showInsights, setShowInsights] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [reposting, setReposting] = useState(false);

  const handleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      alert("Bu gönderiyi kendi profilinizde paylaşmak için lütfen giriş yapın.");
      return;
    }
    setReposting(true);
    setShowShareMenu(false);
    try {
      const newPostId = 'post_repost_' + Math.random().toString(36).substring(2, 11);
      const postRef = doc(db, 'posts', newPostId);
      
      const payload = {
        postId: newPostId,
        creatorId: currentUser.uid,
        creatorName: userData?.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || "BumuBumu Üyesi",
        creatorPhoto: userData?.photoURL || currentUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`,
        title: post.title,
        optionALabel: post.optionALabel || 'Sol',
        optionBLabel: post.optionBLabel || 'Sağ',
        optionAUrl: post.optionAUrl,
        optionBUrl: post.optionBUrl,
        optionALink: post.optionALink || '',
        optionBLink: post.optionBLink || '',
        layout: post.layout || 'side-by-side',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        voteCountA: 0,
        voteCountB: 0,
        totalVotes: 0,
        tags: post.tags || [],
        location: post.location || 'İstanbul',
        groupId: "global",
        status: "active",
        winnerOption: "",
        isRepost: true,
        repostedFromUserId: post.creatorId,
        repostedFromUserName: post.creatorName || "BumuBumu Üyesi",
        originalPostId: post.postId
      };

      await setDoc(postRef, payload);
      alert("Bu karşılaştırma başarıyla profilinizde paylaşıldı!");
      window.dispatchEvent(new CustomEvent('repost-created'));
    } catch (err) {
      console.error("Yeniden paylaşım hatası:", err);
      alert("Yeniden paylaşım yapılırken bir hata oluştu.");
    } finally {
      setReposting(false);
    }
  };

  const post = React.useMemo(() => {
    return {
      ...initialPost,
      creatorPhoto: initialPost.creatorPhoto || (initialPost as any).photoURL || (initialPost as any).creatorPhotoURL || '',
      optionAUrl: initialPost.optionAUrl || (initialPost as any).imageA || (initialPost as any).mediaUrlA || (initialPost as any).optionA_url || '',
      optionBUrl: initialPost.optionBUrl || (initialPost as any).imageB || (initialPost as any).mediaUrlB || (initialPost as any).optionB_url || '',
      optionALabel: initialPost.optionALabel || initialPost.optionA || (initialPost as any).labelA || 'Seçenek A',
      optionBLabel: initialPost.optionBLabel || initialPost.optionB || (initialPost as any).labelB || 'Seçenek B',
      layout: initialPost.layout || 'side-by-side'
    } as PostData;
  }, [initialPost]);

  const { photoURL: creatorPhotoUrl, displayName: creatorDisplayName } = useCreatorProfile(post.creatorId, post.creatorPhoto, post.creatorName);

  const [livePost, setLivePost] = useState<PostData>(post);
  const isPostActive = livePost.status !== 'ended';

  useEffect(() => {
    setLivePost(post);
  }, [post]);
  
  // Takip etme durumları
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (!currentUser || post.creatorId === currentUser.uid) return;
    const checkFollow = async () => {
      try {
        const followDocRef = doc(db, 'follows', `${currentUser.uid}_${post.creatorId}`);
        const snap = await getDoc(followDocRef);
        setIsFollowing(snap.exists());
      } catch (err) {
        console.error("Takip kontrol hatası:", err);
      }
    };
    checkFollow();
  }, [currentUser, post.creatorId]);

  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    setFollowLoading(true);
    try {
      const followId = `${currentUser.uid}_${post.creatorId}`;
      const followDocRef = doc(db, 'follows', followId);
      if (isFollowing) {
        await deleteDoc(followDocRef);
        setIsFollowing(false);
        try {
          const notifId = `${currentUser.uid}_follow_${post.creatorId}`;
          await deleteDoc(doc(db, 'notifications', notifId));
        } catch (err) {}
      } else {
        await setDoc(followDocRef, {
          followerId: currentUser.uid,
          followerName: userData?.displayName || currentUser.displayName || 'Anonim',
          followerPhoto: userData?.photoURL || currentUser.photoURL || '',
          followingId: post.creatorId,
          followingName: creatorDisplayName,
          followingPhoto: creatorPhotoUrl,
          createdAt: serverTimestamp()
        });
        setIsFollowing(true);

        try {
          const notifId = `${currentUser.uid}_follow_${post.creatorId}`;
          const notifDocRef = doc(db, 'notifications', notifId);
          await setDoc(notifDocRef, {
            notificationId: notifId,
            recipientId: post.creatorId,
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
      console.error("Takip işlemi hatası:", err);
    } finally {
      setFollowLoading(false);
    }
  };
  
  // Detay Zoom Modal State'leri
  const [zoomOption, setZoomOption] = useState<'A' | 'B' | null>(null);
  const [zoomSuccessVote, setZoomSuccessVote] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showComments, setShowComments] = useState(autoOpenComments);
  
  // DOM element referansı (swiped navigation ve custom events için)
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoOpenComments) {
      setShowComments(true);
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
    }
  }, [autoOpenComments]);

  useEffect(() => {
    const handleOpenZoomEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const option = customEvent.detail?.option || 'A';
      setZoomOption(option);
    };
    const target = cardRef.current;
    if (target) {
      target.addEventListener('open-zoom', handleOpenZoomEvent);
      return () => {
        target.removeEventListener('open-zoom', handleOpenZoomEvent);
      };
    }
  }, []);
  
  // Oylamayı kapatma (Admin/Creator aksiyonu)
  const [closing, setClosing] = useState(false);

  // Oylama bildirim balonu state
  const [showRewardNotification, setShowRewardNotification] = useState(false);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeletePost = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'posts', post.postId));
      if (onPostDeleted) {
        onPostDeleted();
      }
    } catch (err) {
      console.error("Gönderi silme hatası:", err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Bu gönderide kullanıcının oyu var mı diye bir kere sorguluyoruz (Kota dostu getDoc)
  useEffect(() => {
    setVotedOptionLocally(null);
    setUserVote(null);
  }, [post.postId]);

  useEffect(() => {
    if (!currentUser) {
      setUserVote(null);
      setLoadingVote(false);
      return;
    }
    setLoadingVote(true);
    const voteRef = doc(db, 'posts', post.postId, 'votes', currentUser.uid);

    getDoc(voteRef).then((docSnap) => {
      if (docSnap.exists()) {
        setUserVote(docSnap.data() as VoteData);
        setVotedOptionLocally(null);
      } else {
        setUserVote(null);
      }
      setLoadingVote(false);
    }).catch((error) => {
      console.warn("Oy durumu okunurken hata:", error);
      setLoadingVote(false);
    });
  }, [post.postId, currentUser]);

  // Sharded Counter: Tüm shard'ları toplayıp ekrana yansıtma ve ardından arka planda birleştirip temizleme
  useEffect(() => {
    let active = true;
    const fetchShards = async () => {
      try {
        const shardsRef = collection(db, 'posts', post.postId, 'shards');
        const snap = await getDocs(shardsRef);
        if (!active) return;
        if (!snap.empty) {
          let shardA = 0;
          let shardB = 0;
          let shardTotal = 0;
          snap.forEach(d => {
            const data = d.data();
            shardA += data.voteCountA || 0;
            shardB += data.voteCountB || 0;
            shardTotal += data.totalVotes || 0;
          });
          setLivePost(prev => ({
            ...prev,
            voteCountA: shardA,
            voteCountB: shardB,
            totalVotes: shardTotal
          }));

          // Arka planda shard'ları periyodik birleştir ve temizle (Scheduled/On-demand Aggregation)
          aggregateAndCleanupShards(post.postId);
        }
      } catch (e) {
        console.warn("Shard verileri toplanamadı, ana alanlar kullanılacak:", e);
      }
    };
    fetchShards();
    return () => {
      active = false;
    };
  }, [post.postId]);

  // Çift tıklama algılama (Double Tap / Double Click)
  const lastTapRef = useRef<{ [key: string]: number }>({ A: 0, B: 0 });
  const tapTimeoutRef = useRef<{ [key: string]: any }>({ A: null, B: null });
  
  // Detay Zoom modal gestures ve kaydırma hareketleri ref'leri
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mouseDownRef = useRef<{ x: number; y: number } | null>(null);
  const lastZoomTapRef = useRef<number>(0);
  const zoomTapTimeoutRef = useRef<any>(null);

  // Gönderi geçiş mekanizması (DOM elemanları üzerinden akıllı Shorts/TikTok vari gezinme)
  const navigateToPost = (direction: 'next' | 'prev') => {
    const cards = Array.from(document.querySelectorAll('.voting-card-container'));
    const currentIndex = cards.findIndex(card => card.id === `voting-card-${post.postId}`);
    
    if (currentIndex === -1) return;

    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex >= 0 && targetIndex < cards.length) {
      const targetCard = cards[targetIndex];
      
      // Mevcut zumu kapat
      setZoomOption(null);
      if (zoomTapTimeoutRef.current) {
        clearTimeout(zoomTapTimeoutRef.current);
        zoomTapTimeoutRef.current = null;
      }
      
      // Hedefi yumuşakça ekran merkezine taşı
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Geçiş sonrasında gecikmeyle yeni kartın zumunu aynı seçenekle açması için CustomEvent tetikle
      const currentOpt = zoomOption;
      setTimeout(() => {
        const event = new CustomEvent('open-zoom', { detail: { option: currentOpt || 'A' } });
        targetCard.dispatchEvent(event);
      }, 350);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    const threshold = 50; // Kaydırma hassasiyeti için pixel sınırı

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // 1. Yatay Kaydırma (Sağa-Sola Swipe) -> Görseller arası geçiş
      if (Math.abs(deltaX) > threshold) {
        if (deltaX < 0) {
          // Sola Kaydırma -> B seçeneğine geç
          if (zoomOption === 'A') {
            setZoomOption('B');
          }
        } else {
          // Sağa Kaydırma -> A seçeneğine geç
          if (zoomOption === 'B') {
            setZoomOption('A');
          }
        }
      }
    } else {
      // 2. Dikey Kaydırma (Yukarı-Aşağı Swipe) -> Gönderiler arası geçiş
      if (Math.abs(deltaY) > threshold) {
        if (deltaY < 0) {
          // Aşağıdan Yukarı Kaydırma -> Bir sonraki gönderi
          navigateToPost('next');
        } else {
          // Yukarıdan Aşağı Kaydırma -> Bir önceki gönderi
          navigateToPost('prev');
        }
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Sadece sol tık drag hareketi başlatır
    mouseDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!mouseDownRef.current) return;
    const deltaX = e.clientX - mouseDownRef.current.x;
    const deltaY = e.clientY - mouseDownRef.current.y;
    mouseDownRef.current = null;

    const threshold = 50;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Yatay sürükle
      if (Math.abs(deltaX) > threshold) {
        if (deltaX < 0) {
          if (zoomOption === 'A') setZoomOption('B');
        } else {
          if (zoomOption === 'B') setZoomOption('A');
        }
      }
    } else {
      // Dikey sürükle
      if (Math.abs(deltaY) > threshold) {
        if (deltaY < 0) {
          navigateToPost('next');
        } else {
          navigateToPost('prev');
        }
      }
    }
  };

  // Detay Zoom Modalında Resim Üzerindeki Tıklamaları Ayrıştıran Fonksiyon (Single vs Double-tap)
  const handleZoomImageClickOrDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    const lastTapTime = lastZoomTapRef.current || 0;
    
    if (now - lastTapTime < DOUBLE_PRESS_DELAY) {
      // Çift Tıklama/Dokunma Yakalandı: Kapanma zamanlayıcısını iptal et ve oy ver!
      if (zoomTapTimeoutRef.current) {
        clearTimeout(zoomTapTimeoutRef.current);
        zoomTapTimeoutRef.current = null;
      }
      lastZoomTapRef.current = 0;
      
      const activeVoteObj = userVote || (votedOptionLocally ? { votedOption: votedOptionLocally } : null);
      if (zoomOption && !activeVoteObj && isPostActive && currentUser) {
        handleVote(zoomOption);
        setZoomSuccessVote(true);
        setTimeout(() => setZoomSuccessVote(false), 1200);
      }
    } else {
      // İlk tıklama: Gecikmeli kapanış başlat (çift tıklama gerçekleşirse iptal edilecek)
      lastZoomTapRef.current = now;
      
      if (zoomTapTimeoutRef.current) {
        clearTimeout(zoomTapTimeoutRef.current);
      }
      
      zoomTapTimeoutRef.current = setTimeout(() => {
        setZoomOption(null);
        zoomTapTimeoutRef.current = null;
      }, DOUBLE_PRESS_DELAY);
    }
  };

  const handleImageClickOrDoubleTap = (option: "A" | "B") => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 400; // Slower tapping window on mobiles
    const lastTapTime = lastTapRef.current[option] || 0;
    
    if (now - lastTapTime < DOUBLE_PRESS_DELAY) {
      // Çift tıklama algılandı: bekleyen tek tıklama büyütme işlemini iptal et
      if (tapTimeoutRef.current[option]) {
        clearTimeout(tapTimeoutRef.current[option]);
        tapTimeoutRef.current[option] = null;
      }
      lastTapRef.current[option] = 0; // triple-tap (üçlü tıklama) tetiklenmesini önle
      handleVote(option);
    } else {
      // İlk tıklama zamanını kaydet
      lastTapRef.current[option] = now;
      
      // Önceki zamanlayıcı varsa temizle
      if (tapTimeoutRef.current[option]) {
        clearTimeout(tapTimeoutRef.current[option]);
      }
      
      // Tek tıklama gecikmeli çalışsın (çift mi tek mi bekleyebilmek için)
      tapTimeoutRef.current[option] = setTimeout(() => {
        setZoomOption(option);
        tapTimeoutRef.current[option] = null;
      }, DOUBLE_PRESS_DELAY);
    }
  };

  // Oy Kullanma Ana Mantığı (Atomic Batch)
  const handleVote = async (option: "A" | "B") => {
    if (!currentUser) {
      alert("Oy kullanabilmek için lütfen üye girişi yapın!");
      return;
    }
    if (livePost.status === 'ended') return;
    
    const activeVoteObj = userVote || (votedOptionLocally ? { votedOption: votedOptionLocally } : null);
    if (activeVoteObj) return; // Mükerrer oy engeli

    // Rollback için eski durumları sakla
    const oldLivePost = { ...livePost };
    const oldUserVote = userVote;
    const oldVotedOptionLocally = votedOptionLocally;

    // 1. İyimser UI güncellemesi (Optimistic Update) - Kullanıcı butona bastığı an anında yansıt
    setLivePost(prev => ({
      ...prev,
      voteCountA: (prev.voteCountA || 0) + (option === 'A' ? 1 : 0),
      voteCountB: (prev.voteCountB || 0) + (option === 'B' ? 1 : 0),
      totalVotes: (prev.totalVotes || 0) + 1
    }));
    setUserVote({
      userId: currentUser.uid,
      votedOption: option,
      votedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any
    });
    setVotedOptionLocally(option);

    try {
      const batch = writeBatch(db);
      
      // 1. Oy dökümanını ekle
      const voteRef = doc(db, 'posts', post.postId, 'votes', currentUser.uid);
      batch.set(voteRef, {
        userId: currentUser.uid,
        votedOption: option,
        votedAt: serverTimestamp()
      });

      // 2. Post istatistiklerini artır (Hem ana döküman hem de Sharded Counter için)
      const postRef = doc(db, 'posts', post.postId);
      batch.update(postRef, {
        voteCountA: option === 'A' ? increment(1) : increment(0),
        voteCountB: option === 'B' ? increment(1) : increment(0),
        totalVotes: increment(1)
      });

      // 2b. Sharded Counter Güncellemesi (3-5 shard kullanıyoruz, burada 5 seçtik)
      const shardNum = Math.floor(Math.random() * 5);
      const shardRef = doc(db, 'posts', post.postId, 'shards', `shard_${shardNum}`);
      batch.set(shardRef, {
        voteCountA: option === 'A' ? increment(1) : increment(0),
        voteCountB: option === 'B' ? increment(1) : increment(0),
        totalVotes: increment(1)
      }, { merge: true });

      // 3. Sponsorlu oylama ise kullanıcıya puan ekle
      if (post.isSponsored && post.rewardPoints) {
        const userRef = doc(db, 'users', currentUser.uid);
        batch.update(userRef, {
          points: increment(post.rewardPoints || 10)
        });
        setShowRewardNotification(true);
        setTimeout(() => {
          setShowRewardNotification(false);
          refreshUserData();
        }, 3500);
      }

      // 4. Eğer gönderi kapalı gruba ait DEĞİLSE (yani public/global ise) kullanıcının oy verdikleri listesine ekle
      if (!post.groupId || post.groupId === 'global') {
        const userVotedRef = doc(db, 'users', currentUser.uid, 'votedPosts', post.postId);
        batch.set(userVotedRef, {
          postId: post.postId,
          votedOption: option,
          votedAt: serverTimestamp(),
          groupId: 'global'
        });
      }

      await batch.commit();

      // Trend puanı güncellemesi (Yazma anında popülerlik skoru hesabı ve global_trends güncellemesi)
      updatePostTrendScore(
        post.postId,
        post.title,
        (livePost.totalVotes || 0) + 1,
        0, // comment count represents trends score, we can let the comments fetch handle comment count or set custom
        post.tags || [],
        post.location || "",
        post.creatorPhoto || "",
        post.creatorName || "",
        post.optionALabel,
        post.optionBLabel,
        (livePost.voteCountA || 0) + (option === 'A' ? 1 : 0),
        (livePost.voteCountB || 0) + (option === 'B' ? 1 : 0),
        post.optionAUrl,
        post.optionBUrl,
        post.layout
      );

      // 5. Gönderi sahibine oylama bildirimi gönder (kendi kendine değilse)
      if (post.creatorId && currentUser.uid !== post.creatorId) {
        try {
          const notifId = `${currentUser.uid}_vote_${post.postId}`;
          const notifDocRef = doc(db, 'notifications', notifId);
          await setDoc(notifDocRef, {
            notificationId: notifId,
            recipientId: post.creatorId,
            senderId: currentUser.uid,
            senderName: userData?.displayName || currentUser.displayName || 'Anonim',
            senderPhoto: userData?.photoURL || currentUser.photoURL || '',
            type: 'vote',
            postId: post.postId,
            postTitle: post.title || '',
            votedOption: option,
            read: false,
            createdAt: serverTimestamp()
          });
        } catch (err) {
          console.error("Oylama bildirimi oluşturma hatası:", err);
        }
      }
    } catch (err) {
      // Hata durumunda iyimser güncellemeleri geri al (Rollback)
      setLivePost(oldLivePost);
      setUserVote(oldUserVote);
      setVotedOptionLocally(oldVotedOptionLocally);
      console.error("Oylama hatası:", err);
    }
  };

  // Oylamayı Geri Alma Mantığı (Retract Vote)
  const handleRetractVote = async () => {
    if (!currentUser) return;
    if (livePost.status === 'ended') return;

    const activeVoteObj = userVote || (votedOptionLocally ? { votedOption: votedOptionLocally } : null);
    if (!activeVoteObj) return;

    const optionToRetract = activeVoteObj.votedOption;

    // Geçici olarak local oyu kaldır (İyimser Güncelleme)
    setVotedOptionLocally(null);
    setUserVote(null);

    try {
      const batch = writeBatch(db);

      // 1. Oy dökümanını sil
      const voteRef = doc(db, 'posts', post.postId, 'votes', currentUser.uid);
      batch.delete(voteRef);

      // 2. Post istatistiklerini azalt
      const postRef = doc(db, 'posts', post.postId);
      batch.update(postRef, {
        voteCountA: optionToRetract === 'A' ? increment(-1) : increment(0),
        voteCountB: optionToRetract === 'B' ? increment(-1) : increment(0),
        totalVotes: increment(-1)
      });

      // 3. Sponsorlu oylama ise kullanıcıdan o puanı düşür
      if (post.isSponsored && post.rewardPoints) {
        const userRef = doc(db, 'users', currentUser.uid);
        batch.update(userRef, {
          points: increment(-(post.rewardPoints || 10))
        });
        setTimeout(() => {
          refreshUserData();
        }, 1200);
      }

      // 4. Kullanıcının oy verdikleri listesinden de sil
      if (!post.groupId || post.groupId === 'global') {
        const userVotedRef = doc(db, 'users', currentUser.uid, 'votedPosts', post.postId);
        batch.delete(userVotedRef);
      }

      await batch.commit();

      // Yerel istatistikleri ve oylama durumunu güncelle (onSnapshot olmadığı için el ile senkronizasyon)
      setLivePost(prev => ({
        ...prev,
        voteCountA: Math.max(0, (prev.voteCountA || 0) - (optionToRetract === 'A' ? 1 : 0)),
        voteCountB: Math.max(0, (prev.voteCountB || 0) - (optionToRetract === 'B' ? 1 : 0)),
        totalVotes: Math.max(0, (prev.totalVotes || 0) - 1)
      }));
      setUserVote(null);
      setVotedOptionLocally(null);
    } catch (err) {
      // Hata durumunda eski seçeneği geri yükle
      if (userVote) {
        setUserVote(userVote);
      } else {
        setVotedOptionLocally(optionToRetract);
      }
      console.error("Oyu geri alma hatası:", err);
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.postId}/votes/${currentUser.uid}`);
    }
  };

  // Oylamayı Sonlandırma / Kazananı İlan Etme
  const handleCloseVoting = async (winner: "A" | "B" | "draw") => {
    if (!currentUser || post.creatorId !== currentUser.uid) return;

    try {
      const postRef = doc(db, 'posts', post.postId);
      await updateDoc(postRef, {
        status: "ended",
        winnerOption: winner
      });

      // Clear feed cache so the finalized state is reflected
      if (currentUser) {
        localStorage.removeItem(`bumu_feed_explore_${currentUser.uid}`);
        localStorage.removeItem(`bumu_feed_following_${currentUser.uid}`);
        localStorage.removeItem(`bumu_feed_explore_anonymous`);
        localStorage.removeItem(`bumu_feed_following_anonymous`);
      }

      setClosing(false);
    } catch (err) {
      console.error("Gönderi kapatma hatası:", err);
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.postId}`);
    }
  };

  // Link Kopyalama (Growth Hack)
  const handleShare = () => {
    // Benzersiz deep link
    const deepLinkUrl = `${window.location.origin}/gonderi/${post.postId}`;
    navigator.clipboard.writeText(deepLinkUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const [sharingStory, setSharingStory] = useState(false);
  const [storyShared, setStoryShared] = useState(false);

  const handleShareToStories = async () => {
    if (!currentUser) return;
    setSharingStory(true);
    try {
      const storiesRef = collection(db, 'stories');
      await addDoc(storiesRef, {
        postId: livePost.postId,
        userId: currentUser.uid,
        userName: profileData?.displayName || userData?.displayName || currentUser.displayName || 'Anonim',
        userPhoto: profileData?.photoURL || userData?.photoURL || currentUser.photoURL || '',
        optionAUrl: livePost.optionAUrl,
        optionBUrl: livePost.optionBUrl,
        optionALabel: livePost.optionALabel || '',
        optionBLabel: livePost.optionBLabel || '',
        title: livePost.title,
        winnerOption: livePost.winnerOption || 'draw',
        createdAt: serverTimestamp()
      });

      // Clear stories caches so the shared story appears instantly
      localStorage.removeItem(`bumu_stories_${currentUser.uid}`);
      localStorage.removeItem(`bumu_stories_anonymous`);
      
      // Dispatch custom event to notify FeedPage to reload stories list
      window.dispatchEvent(new CustomEvent('story-shared'));

      setStoryShared(true);
      setTimeout(() => setStoryShared(false), 3000);
    } catch (err) {
      console.error("Hikayede paylaşım hatası:", err);
    } finally {
      setSharingStory(false);
    }
  };

  const isCreator = currentUser && livePost.creatorId === currentUser.uid;
  const activeVote = userVote || (votedOptionLocally ? { votedOption: votedOptionLocally } : null);
  const showResults = activeVote !== null || isCreator || livePost.status === 'ended';

  const hasLocalVote = votedOptionLocally !== null && userVote === null;
  const totalVotes = (livePost.totalVotes || 0) + (hasLocalVote ? 1 : 0);
  
  const voteCountALocal = (livePost.voteCountA || 0) + (hasLocalVote && votedOptionLocally === 'A' ? 1 : 0);
  const voteCountBLocal = (livePost.voteCountB || 0) + (hasLocalVote && votedOptionLocally === 'B' ? 1 : 0);

  const percentA = totalVotes > 0 ? Math.round((voteCountALocal / totalVotes) * 100) : 50;
  const percentB = totalVotes > 0 ? Math.round((voteCountBLocal / totalVotes) * 100) : 50;

  // Zaman kısıtı hesabı
  const creationTime = livePost.createdAt?.seconds ? new Date(livePost.createdAt.seconds * 1000) : new Date();
  const formatTime = creationTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + " - " + creationTime.toLocaleDateString('tr-TR');

  const cleanTitle = (livePost.title || '')
    .replace(/^\[★?\s*SPONSORLU\]\s*/i, '')
    .replace(/^\[SPONSORLU\]\s*/i, '')
    .replace(/^\*SPONSORLU\s*/i, '')
    .trim();

  return (
    <div 
      ref={cardRef}
      id={`voting-card-${post.postId}`}
      className="voting-card-container w-full bg-[#18181B] dark:bg-[#12071f] border border-pink-100/70 dark:border-violet-950/45 rounded-3xl p-5 shadow-xl flex flex-col gap-4 text-slate-800 dark:text-gray-100 relative overflow-hidden transition-all duration-300 hover:border-pink-200 dark:hover:border-violet-900/30"
    >
      
      {/* Sponsorlu Işıltılı Kenar Süsü */}
      {post.isSponsored && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 animate-pulse" />
      )}

      {/* Sponsorlu Puan Kazanım Bildirimi */}
      {showRewardNotification && (
        <div className="absolute inset-0 z-50 bg-[#0A0A0C]/95 flex flex-col items-center justify-center text-center p-4 transition-all duration-500">
          <Sparkles className="w-16 h-16 text-orange-500 animate-bounce mb-3" />
          <h3 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-300 font-display">Sponsor Ödülü!</h3>
          <p className="text-xs text-gray-300 font-display mt-1">Harika Seçim! Hesabına anında</p>
          <span className="text-3xl font-extrabold text-orange-500 font-display my-2 animate-pulse">+{post.rewardPoints || 10} Karma Puanı</span>
          <p className="text-[10px] text-gray-500 font-display">eklendi. BumuBumu ile kazanmaya devam et!</p>
        </div>
      )}

      {/* Üst Kart Alanı - Üretici Künyesi */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img 
            src={creatorPhotoUrl} 
            alt="Üretici" 
            className="w-9 h-9 rounded-full border border-white/10 object-cover bg-neutral-900 flex-shrink-0"
          />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-gray-200 flex items-center gap-1.5 leading-none font-display truncate">
              <span className="truncate">{creatorDisplayName}</span>
              {isCreator ? (
                <span className="text-[9px] bg-orange-600/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-sm uppercase tracking-wider font-display font-bold flex-shrink-0">Ben</span>
              ) : (
                currentUser && (
                  !isFollowing ? (
                    <button
                      onClick={handleFollowToggle}
                      disabled={followLoading}
                      className="text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider cursor-pointer border bg-pink-600/25 text-pink-300 border-pink-500/30 hover:bg-pink-600 hover:text-white transition-all flex items-center gap-1 leading-none shadow-sm shadow-pink-600/5 animate-scale-up"
                    >
                      {followLoading ? '...' : '+ Takip Et'}
                    </button>
                  ) : (
                    <span className="text-[8px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-sans font-bold flex items-center gap-0.5 uppercase tracking-wider animate-scale-up">
                      ✓ Takip Ediyor
                    </span>
                  )
                )
              )}
            </h3>
            <span className="text-[9px] font-sans text-gray-550 flex items-center gap-1 mt-1 font-medium">
              <Clock className="w-3 h-3 text-gray-600" />
              {formatTime}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {post.location && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] text-gray-300 font-medium font-sans">
              <MapPin className="w-2.5 h-2.5 text-orange-500" /> {post.location}
            </span>
          )}

          {post.isSponsored && (
            <span className="inline-flex items-center gap-1 px-1.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 shadow-sm" title="Sponsorlu">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 animate-pulse" />
            </span>
          )}

          {livePost.status === 'ended' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-display font-bold uppercase tracking-wide">
              Sonuçlandı
            </span>
          )}
          {(isCreator || userData?.role === 'admin') && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              id={`delete-post-btn-${post.postId}`}
              className="p-1.5 text-gray-550 hover:text-red-500 hover:bg-red-500/10 rounded-full transition cursor-pointer"
              title="Gönderiyi Sil"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Gönderi Sorusu / Başlık */}
      <div>
        {post.isRepost && post.repostedFromUserName && (
          <div className="flex items-center gap-1.5 mb-2 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-xl text-[10px] text-indigo-400 font-mono w-fit font-bold">
            <RotateCcw className="w-3 h-3.5 text-indigo-400 animate-spin-slow" />
            <span>Alıntı: @{post.repostedFromUserName}</span>
          </div>
        )}
        <h2 className="text-sm font-bold text-white tracking-tight leading-snug font-display flex items-center gap-1.5 flex-wrap">
          {post.isSponsored && (
            <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0 animate-pulse" />
          )}
          <span>{cleanTitle}</span>
        </h2>
        {/* Hashtag Listesi */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {post.tags.map((tag, idx) => (
              <span key={idx} className="text-[10px] font-bold text-orange-500 hover:text-orange-400 transition-colors cursor-pointer font-display">
                #{tag.replace('#', '')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* İKİLİ GÖRSEL SEÇİM ALANI */}
      <div className="relative">
        <div className={`w-full grid gap-[2px] rounded-2xl overflow-hidden border border-white/5 bg-[#111114] ${(!post.layout || post.layout === 'side-by-side') ? 'grid-cols-2' : 'grid-cols-1'}`}>
          
          {/* SEÇENEK A (SOL VEYA ÜST) */}
          <div className="relative group bg-[#202024] flex flex-col">
            {/* Görsel Kutusu */}
            <div 
              onClick={() => handleImageClickOrDoubleTap('A')}
              className="w-full aspect-[9/16] relative overflow-hidden cursor-pointer select-none touch-manipulation"
            >
              <img 
                src={post.optionAUrl || null} 
                alt={post.optionALabel || "A seçeneği"} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              
              {/* Pinch/Zoom-In Maximize Butonu */}
              <div className="absolute top-2 right-2 p-1.5 bg-black/80 rounded-full text-gray-400 hover:text-white transition opacity-0 group-hover:opacity-100 shadow backdrop-blur-xs">
                <Maximize2 className="w-3.5 h-3.5" />
              </div>

              {/* Oylama Durumu Bittiğinde Kazanan Madalyonu */}
              {livePost.status === 'ended' && livePost.winnerOption === 'A' && (
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-orange-600 text-white font-bold font-display text-[9px] uppercase flex items-center gap-1.5 shadow-lg">
                  <Trophy className="w-3.5 h-3.5" /> Kazandı
                </div>
              )}

              {/* Aktifken MOBİL & MASAÜSTÜ Ortak Oy Ver Butonu Overlay'i */}
              {!showResults && isPostActive && currentUser && (
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex justify-center z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVote('A');
                    }}
                    id={`${post.postId}-voteA`}
                    className="px-4 py-1.5 text-[11px] font-bold bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-all cursor-pointer font-display text-center whitespace-nowrap shadow-lg active:scale-95"
                  >
                    Bu'la
                  </button>
                </div>
              )}

              {/* Sonuçların Resim Üstünde Gösterimi (Overlay) */}
              {showResults && (
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/50 to-transparent flex flex-col gap-1 select-none text-white z-10 animate-fade-in">
                  {/* Bilgiler (Yüzde, Oy sayısı ve Tik) */}
                  <div className="flex items-center justify-between text-[11px] font-display">
                    <span className="flex items-center gap-1 font-bold">
                      <span className={activeVote?.votedOption === 'A' ? 'text-violet-400 font-extrabold text-sm' : 'text-gray-105'}>{percentA}%</span>
                      {activeVote?.votedOption === 'A' && (
                        <span className="inline-flex items-center text-[10px] px-2 bg-violet-600/30 text-violet-400 rounded-full border border-violet-500/20 font-black font-display py-0.5 animate-scale-up">
                          Bu
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-gray-300 font-sans">{voteCountALocal} oy</span>
                  </div>
                  {/* Minyatür Yüzde Barı */}
                  <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden relative">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${activeVote?.votedOption === 'A' ? 'bg-violet-600' : 'bg-gray-400'}`}
                      style={{ width: `${percentA}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SEÇENEK B (SAĞ VEYA ALT) */}
          <div className="relative group bg-[#202024] flex flex-col">
            {/* Görsel Kutusu */}
            <div 
              onClick={() => handleImageClickOrDoubleTap('B')}
              className="w-full aspect-[9/16] relative overflow-hidden cursor-pointer select-none touch-manipulation"
            >
              <img 
                src={post.optionBUrl || null} 
                alt={post.optionBLabel || "B seçeneği"} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              
              {/* Pinch/Zoom-In Maximize Butonu */}
              <div className="absolute top-2 right-2 p-1.5 bg-black/80 rounded-full text-gray-400 hover:text-white transition opacity-0 group-hover:opacity-100 shadow backdrop-blur-xs">
                <Maximize2 className="w-3.5 h-3.5" />
              </div>

              {/* Oylama Durumu Bittiğinde Kazanan Madalyonu */}
              {livePost.status === 'ended' && livePost.winnerOption === 'B' && (
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-orange-600 text-white font-bold font-display text-[9px] uppercase flex items-center gap-1.5 shadow-lg">
                  <Trophy className="w-3.5 h-3.5" /> Kazandı
                </div>
              )}

              {/* Aktifken MOBİL & MASAÜSTÜ Ortak Oy Ver Butonu Overlay'i */}
              {!showResults && isPostActive && currentUser && (
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex justify-center z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVote('B');
                    }}
                    id={`${post.postId}-voteB`}
                    className="px-4 py-1.5 text-[11px] font-bold bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-all cursor-pointer font-display text-center whitespace-nowrap shadow-lg active:scale-95"
                  >
                    Bu'la
                  </button>
                </div>
              )}

              {/* Sonuçların Resim Üstünde Gösterimi (Overlay) */}
              {showResults && (
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/50 to-transparent flex flex-col gap-1 select-none text-white z-10 animate-fade-in">
                  {/* Bilgiler (Yüzde, Oy sayısı ve Tik) */}
                  <div className="flex items-center justify-between text-[11px] font-display">
                    <span className="flex items-center gap-1 font-bold">
                      <span className={activeVote?.votedOption === 'B' ? 'text-violet-400 font-extrabold text-sm' : 'text-gray-105'}>{percentB}%</span>
                      {activeVote?.votedOption === 'B' && (
                        <span className="inline-flex items-center text-[10px] px-2 bg-violet-600/30 text-violet-400 rounded-full border border-violet-500/20 font-black font-display py-0.5 animate-scale-up">
                          Bu
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-gray-300 font-sans">{voteCountBLocal} oy</span>
                  </div>
                  {/* Minyatür Yüzde Barı */}
                  <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden relative">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${activeVote?.votedOption === 'B' ? 'bg-violet-600' : 'bg-gray-400'}`}
                      style={{ width: `${percentB}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Bu mu - logo rozeti */}
        {post.layout === 'side-by-side' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-black/95 p-1 rounded-2xl border border-white/20 flex items-center justify-center shadow-2xl z-25 select-none pointer-events-none transform hover:scale-110 transition duration-300">
            <BumuLogo size="sm" className="w-9 h-9" />
          </div>
        )}
      </div>

      {/* Alt Etkileşim İstatistikleri ve Butonlar (Ultra-Kompakt Modern Instagram Tarzı) */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-1.5 border-t border-white/5 pt-2.5 mt-2 select-none">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Oy Sayısı */}
          <div 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/40 border border-slate-800/40 text-gray-300" 
            title={`${totalVotes} Toplam Oy`}
          >
            <Trophy className="w-4 h-4 text-pink-500 shrink-0" />
            <span className="text-xs font-bold font-sans text-pink-500">
              {totalVotes}
            </span>
          </div>

          {/* Yorumlar Butonu */}
          {showResults && (
            <button
              onClick={() => setShowComments(!showComments)}
              id={`${post.postId}-comments-toggle-btn`}
              className={`p-2 rounded-full border transition duration-200 cursor-pointer flex items-center justify-center ${
                showComments 
                  ? 'bg-pink-600/20 border-pink-500/30 text-pink-500' 
                  : 'bg-slate-900/40 border-slate-800/40 text-gray-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Yorumları Göster"
            >
              <MessageSquare className="w-4.5 h-4.5" />
            </button>
          )}

          {/* Arkadaşına Sor / Paylaş - Modal Açıcı */}
          <div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowShareMenu(true);
              }}
              id={`${post.postId}-share-btn`}
              className={`p-2 rounded-full border transition duration-250 cursor-pointer flex items-center justify-center bg-slate-900/40 border-slate-800/40 text-gray-400 hover:text-white hover:bg-slate-800`}
              title="Paylaş ve Bağlantıyı Kopyala"
            >
              <Send className="w-4.5 h-4.5 rotate-45 -translate-y-[1px] translate-x-[1px]" />
            </button>
          </div>

          {/* Kitle Seçim İçgörüsü Butonu (Sadece Admin veya Reklam Yöneticisi için, tıklandığında altta açılır) */}
          {currentUser && (
            userData?.role === 'admin' || 
            ((userData?.role === 'advertiser' || userData?.role === 'reklam_yoneticisi') && post.creatorId === currentUser.uid)
          ) && (
            <button
              onClick={() => setShowInsights(!showInsights)}
              id={`insights-toggle-icon-${post.postId}`}
              className={`p-2 rounded-full border transition duration-200 cursor-pointer flex items-center justify-center ${
                showInsights 
                  ? 'bg-orange-600/20 border-orange-500/30 text-orange-500' 
                  : 'bg-slate-900/40 border-slate-800/40 text-gray-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Kitle Seçim İçgörüsü"
            >
              <BarChart2 className="w-4.5 h-4.5" />
            </button>
          )}

          {/* Hikayede Paylaş Butonu (Sadece sonuçlanmışsa ve grup oylaması değilse) */}
          {livePost.status === 'ended' && currentUser && (!post.groupId || post.groupId === 'global') && (
            <button
              onClick={handleShareToStories}
              disabled={sharingStory}
              className={`p-2 rounded-full border transition duration-200 cursor-pointer flex items-center justify-center ${
                storyShared 
                  ? 'bg-green-600/20 border-green-500/30 text-green-400' 
                  : 'bg-slate-900/40 border-slate-800/40 text-gray-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Hikayede Paylaş"
            >
              <Sparkles className={`w-4.5 h-4.5 ${sharingStory ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Creator Oylama Kapatma Paneli ve Oylamayı Geri Alma */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {currentUser && activeVote && isPostActive && (
            <button
              onClick={handleRetractVote}
              className="text-[10px] font-bold p-1.5 sm:px-2.5 sm:py-1 rounded-full bg-[#E1306C]/10 text-pink-400 border border-[#E1306C]/20 hover:bg-[#E1306C]/20 hover:text-white transition cursor-pointer flex items-center justify-center gap-1 shadow-sm active:scale-95 shrink-0"
              title="Oyu Geri Al"
            >
              <RotateCcw className="w-3.5 h-3.5 animate-spin-reverse shrink-0" />
              <span className="hidden sm:inline">Oyu Geri Al</span>
            </button>
          )}

          {isCreator && isPostActive && (
            <button
              onClick={() => setClosing(true)}
              id={`${post.postId}-open-close`}
              className="p-1.5 sm:p-2 rounded-full bg-pink-600/10 text-pink-400 border border-pink-500/25 hover:bg-pink-600 hover:text-white transition duration-200 cursor-pointer flex items-center justify-center shadow-sm active:scale-95 shrink-0"
              title="Oylamayı Sonuçlandır"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* REKLAM YÖNETİCİSİ / ADMİN İÇİN KİTLE SEÇİM İÇGÖRÜSÜ PANELI */}
      {showInsights && currentUser && (
        userData?.role === 'admin' || 
        ((userData?.role === 'advertiser' || userData?.role === 'reklam_yoneticisi') && post.creatorId === currentUser.uid)
      ) && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="animate-fade-in bg-black/10 rounded-2xl p-1">
            <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-white/5 text-orange-400 text-xs font-display">
              <span className="flex items-center gap-1.5 font-bold">
                <BarChart2 className="w-3.5 h-3.5 text-orange-500" />
                Kitle Seçim İçgörüsü
              </span>
              <button 
                onClick={() => setShowInsights(false)}
                className="text-[10px] hover:text-gray-200 transition px-2 py-0.5 rounded bg-white/5 text-gray-400 hover:bg-white/10 cursor-pointer"
              >
                Gizle
              </button>
            </div>
            <div className="mt-1">
              <InsightsPanel 
                voteCountA={voteCountALocal} 
                voteCountB={voteCountBLocal} 
                totalVotes={totalVotes}
                labelA={post.optionALabel}
                labelB={post.optionBLabel}
                isSponsored={post.isSponsored}
                rewardPoints={post.rewardPoints}
                postId={post.postId}
                isAdmin={userData?.role === 'admin'}
              />
            </div>
          </div>
        </div>
      )}

      {/* BÖLÜNMÜŞ YORUMLAR (Oylanmışsa veya bittiyse ve Yorumlar açıksa gösterilir) */}
      {showResults && showComments && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-white/5 text-slate-400 text-xs font-display">
              <span className="flex items-center gap-1.5 font-bold text-gray-200">
                <MessageSquare className="w-3.5 h-3.5 text-pink-500" />
                Görüşler & Yorumlar
              </span>
              <button 
                onClick={() => setShowComments(false)}
                className="text-[10px] hover:text-gray-200 transition px-2 py-0.5 rounded bg-white/5 text-gray-400 hover:bg-white/10"
              >
                Yorumları Gizle
              </button>
            </div>
            <DividedComments 
              postId={post.postId} 
              hasVoted={activeVote !== null} 
              userVotedOption={activeVote?.votedOption || null} 
              isCreator={isCreator}
              postCreatorId={post.creatorId}
              postTitle={post.title}
              totalVotes={post.totalVotes}
              tags={post.tags}
              location={post.location}
              photoURL={post.creatorPhoto}
              creatorName={post.creatorName}
              optionA={post.optionALabel}
              optionB={post.optionBLabel}
              optionA_votes={post.voteCountA}
              optionB_votes={post.voteCountB}
              optionAUrl={post.optionAUrl}
              optionBUrl={post.optionBUrl}
              layout={post.layout}
            />
          </div>
        </div>
      )}

      {/* Gönderi Silme Onay Overi */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-[#0A0A0C]/95 z-50 flex flex-col items-center justify-center text-center p-6 animate-scale-up">
          <ShieldAlert className="w-12 h-12 text-red-500 animate-bounce mb-3" />
          <h3 className="text-sm font-bold text-gray-200 font-display">Gönderiyi Silmek İstiyor musunuz?</h3>
          <p className="text-xs text-gray-400 font-display mt-1 max-w-xs leading-relaxed lowercase">
            bu işlem geri alınamaz. gönderi, kullanılan oylar ve yapılan yorumlar kalıcı olarak silinecektir.
          </p>
          <div className="flex gap-2.5 mt-4">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition cursor-pointer font-display"
            >
              iptal
            </button>
            <button
              onClick={handleDeletePost}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition cursor-pointer flex items-center gap-1.5 font-display"
            >
              {deleting ? 'siliniyor...' : 'evet, sil'}
            </button>
          </div>
        </div>
      )}

      {/* Oylamayı Sonuçlandırma Geniş Onay Paneli (Mobil Cihazlar İçin Kolay Tıklanabilir) */}
      {closing && (
        <div className="absolute inset-0 bg-[#090312]/98 z-50 flex flex-col items-center justify-center text-center p-5 animate-scale-up">
          <Trophy className="w-12 h-12 text-pink-500 animate-bounce mb-2" />
          <h3 className="text-sm font-bold text-gray-100 font-display">Karşılaştırmayı Sonuçlandır</h3>
          <p className="text-[10px] text-gray-400 font-display mt-1 mb-4 max-w-xs leading-relaxed lowercase">
            kazanan tarafı seçerek bu oylamayı tamamlayın. bu karar kalıcıdır.
          </p>
          
          <div className="flex flex-col gap-3 w-full max-w-[280px] px-1">
            <button
              onClick={() => handleCloseVoting("A")}
              className="w-full h-12 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 via-pink-600 to-indigo-600 hover:brightness-110 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-between px-4 shadow-lg shadow-violet-600/10"
            >
              <span className="flex items-center gap-2">
                <span className="bg-white/20 px-2 py-0.5 rounded-lg text-[10px] font-black">SOL</span>
                <span className="truncate max-w-[150px]">{post.optionALabel || 'Seçenek A'}</span>
              </span>
              <span className="text-[10px] opacity-75">✓</span>
            </button>
            
            <button
              onClick={() => handleCloseVoting("B")}
              className="w-full h-12 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-pink-600 via-fuchsia-600 to-violet-600 hover:brightness-110 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-between px-4 shadow-lg shadow-pink-600/10"
            >
              <span className="flex items-center gap-2">
                <span className="bg-white/20 px-2 py-0.5 rounded-lg text-[10px] font-black">SAĞ</span>
                <span className="truncate max-w-[150px]">{post.optionBLabel || 'Seçenek B'}</span>
              </span>
              <span className="text-[10px] opacity-75">✓</span>
            </button>
            
            <button
              onClick={() => handleCloseVoting("draw")}
              className="w-full h-12 rounded-2xl text-xs font-bold text-gray-200 bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-between px-4"
            >
              <span className="flex items-center gap-2">
                <span className="bg-white/10 px-2 py-0.5 rounded-lg text-[10px] font-black">BERABERE</span>
                <span>Beraberlik / Kararsız</span>
              </span>
              <span className="text-[10px] opacity-75">✓</span>
            </button>
            
            <button
              onClick={() => setClosing(false)}
              className="w-full py-2.5 rounded-xl text-xs font-extrabold text-gray-500 hover:text-gray-300 transition duration-200 cursor-pointer uppercase tracking-wider mt-1"
            >
              vazgeç
            </button>
          </div>
        </div>
      )}

      {/* Paylaşım Modalı (Oylamayı Sonuçlandırma Tarzı Büyük Butonlu Göz Alıcı Modal) */}
      {showShareMenu && (
        <div className="absolute inset-0 bg-[#090312]/98 z-50 flex flex-col items-center justify-center text-center p-5 animate-scale-up select-none">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowShareMenu(false);
            }}
            className="absolute top-4 right-4 p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-full transition cursor-pointer"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>

          <Share2 className="w-12 h-12 text-pink-500 animate-pulse mb-2" />
          <h3 className="text-sm font-bold text-gray-100 font-display">Bu Karşılaştırmayı Paylaş</h3>
          <p className="text-[10px] text-gray-400 font-display mt-1 mb-4 max-w-xs leading-relaxed lowercase">
            bağlantıyı kopyalayarak veya profilinde yeniden paylaşarak arkadaşlarına ulaştır.
          </p>
          
          <div className="flex flex-col gap-3 w-full max-w-[280px] px-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare();
              }}
              className="w-full h-12 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-between px-4 shadow-lg shadow-emerald-600/10"
            >
              <span className="flex items-center gap-2">
                <Check className={`w-4 h-4 shrink-0 transition-all ${copied ? 'text-emerald-300 scale-125' : 'text-white'}`} />
                <span>{copied ? 'Bağlantı Kopyalandı!' : 'Bağlantıyı Kopyala'}</span>
              </span>
              <span className="text-[10px] opacity-75">link</span>
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRepost(e);
                setShowShareMenu(false);
              }}
              disabled={reposting}
              className="w-full h-12 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-110 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-between px-4 shadow-lg shadow-indigo-600/10 disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <RotateCcw className={`w-4 h-4 shrink-0 ${reposting ? 'animate-spin' : ''}`} />
                <span>{reposting ? 'Paylaşılıyor...' : 'Profilinde Paylaş'}</span>
              </span>
              <span className="text-[10px] opacity-75">repost</span>
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowShareMenu(false);
              }}
              className="w-full py-2.5 rounded-xl text-xs font-extrabold text-gray-500 hover:text-gray-300 transition duration-200 cursor-pointer uppercase tracking-wider mt-1"
            >
              vazgeç
            </button>
          </div>
        </div>
      )}

      {/* KİŞİSEL GÖRSEL ZOOM/DETAY MODALI (SWIPABLE & DOUBLE-TAP TO VOTE) */}
      {zoomOption && (
        <div 
          className="fixed inset-0 z-[120] bg-[#020204]/97 flex flex-col items-center justify-center p-4 backdrop-blur-lg select-none cursor-zoom-out animate-fade-in"
          onClick={() => {
            setZoomOption(null);
            if (zoomTapTimeoutRef.current) {
              clearTimeout(zoomTapTimeoutRef.current);
              zoomTapTimeoutRef.current = null;
            }
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        >
          {/* Header Controls */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-end text-white z-[130]">
            <button 
              onClick={() => {
                setZoomOption(null);
                if (zoomTapTimeoutRef.current) {
                  clearTimeout(zoomTapTimeoutRef.current);
                  zoomTapTimeoutRef.current = null;
                }
              }}
              className="p-2.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-full shadow hover:scale-105 active:scale-95 transition duration-200"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Image Canvas Container */}
          <div className="w-full max-w-[360px] aspect-[9/16] overflow-hidden rounded-2xl border border-slate-800/80 shadow-2xl relative select-none bg-black flex items-center justify-center">
            <img 
              src={(zoomOption === 'A' ? post.optionAUrl : post.optionBUrl) || null} 
              alt="İnceleme görseli" 
              className="w-full h-full object-cover transition-all duration-300 pointer-events-none"
            />

            {/* Dev Double-Tap Catcher transparent overlay */}
            <div 
              className="absolute inset-0 cursor-zoom-out touch-manipulation"
              style={{ pointerEvents: 'auto', zIndex: 50 }}
              onClick={handleZoomImageClickOrDoubleTap}
            />

            {/* Voting Success Animasyon Katmanı */}
            {zoomSuccessVote && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xs animate-scale-up z-[140] pointer-events-none">
                <div className="p-5 rounded-full bg-pink-600 shadow-2xl border border-pink-400 ring-8 ring-pink-500/25 animate-pulse text-white flex items-center justify-center">
                  <Check className="w-12 h-12 stroke-[3]" />
                </div>
                <span className="mt-4 text-white font-extrabold font-display text-[11px] tracking-widest bg-pink-950/90 border border-pink-800 px-4 py-2 rounded-full shadow">
                  OY KAYDEDİLDİ!
                </span>
              </div>
            )}
          </div>

          {/* Alt Bilgiler ve Kılavuzlar */}
          <div className="absolute bottom-6 flex flex-col items-center gap-3 bg-black/45 px-5 py-3 rounded-2xl border border-white/5 backdrop-blur-md text-center max-w-sm z-[130] pointer-events-auto">
            {/* Slide Dots */}
            <div className="flex items-center gap-2 select-none pointer-events-none">
              <span className={`w-2 h-2 rounded-full transition-all duration-300 ${zoomOption === 'A' ? 'bg-pink-500 w-5 shadow-lg' : 'bg-slate-700'}`} />
              <span className={`w-2 h-2 rounded-full transition-all duration-300 ${zoomOption === 'B' ? 'bg-pink-500 w-5 shadow-lg' : 'bg-slate-700'}`} />
            </div>

            {/* Göster Butonu - Sadece Link Varsa */}
            {((zoomOption === 'A' && post.optionALink) || (zoomOption === 'B' && post.optionBLink)) && (
              <a
                href={zoomOption === 'A' ? post.optionALink : post.optionBLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-6 py-2.5 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold font-mono rounded-xl flex items-center gap-1.5 shadow-lg shadow-pink-500/20 active:scale-95 transition cursor-pointer"
              >
                <span>Göster</span>
                <Send className="w-3.5 h-3.5 rotate-45 shrink-0" />
              </a>
            )}
            
            {/* Gesture Guide */}
            <span className="text-[10px] text-gray-400 font-sans leading-relaxed select-none pointer-events-none">
              ↔️ Resmi Kaydır (A/B) • ↕️ Gönderiyi Değiştir • 🖕👆 Oy Vermek İçin Çift Tıkla
            </span>
          </div>
        </div>
      )}

    </div>
  );
};
