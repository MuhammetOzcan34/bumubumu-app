/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, query, where, getDocs, getDoc, addDoc, setDoc, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, startAfter } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { ChatRoomData, MessageData, PostData } from '../types';
import { MessageSquare, Send, Share2, Plus, Sparkles, X, Check, Image as ImageIcon, Users, Trash2, RefreshCw, ArrowLeft } from 'lucide-react';
import { VotingCard } from '../components/VotingCard';
import { GroupsPage } from './GroupsPage';
import { compressImageFile } from '../lib/imageCompressor';

export const DmPage: React.FC = () => {
  const { currentUser, profileData } = useAuth();
  
  // DM / Kulüp Sekme State'i
  const [activeTab, setActiveTab] = useState<'dm' | 'groups'>('dm');
  
  // Aktif Kapalı Grup State'i (Parent / Child senkronizasyonu için)
  const [activeGroupInPage, setActiveGroupInPage] = useState<string | null>(null);

  // DM State'leri
  const [chatRooms, setChatRooms] = useState<ChatRoomData[]>([]);
  const [activeChat, setActiveChat] = useState<ChatRoomData | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);

  // DM Geçmiş Mesaj Yükleme Durumları
  const [messagesLastDoc, setMessagesLastDoc] = useState<any>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  
  // Sohbet & Mesaj Yenileme Tetikleyicileri (Instagram usulü)
  const [refreshRoomsTrigger, setRefreshRoomsTrigger] = useState(0);
  const [refreshMessagesTrigger, setRefreshMessagesTrigger] = useState(0);
  
  // Sohbet Formu
  const [inputText, setInputText] = useState('');
  
  // Yeni Sohbet Başlatıcı
  const [targetUid, setTargetUid] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);
  
  // Arkadaşlar ve Global Arama State'leri
  const [friends, setFriends] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingFriends, setLoadingFriends] = useState(false);
  
  // Karşılaştırma Kartı Paylaşım Modali
  const [showSharePostModal, setShowSharePostModal] = useState(false);
  const [myPosts, setMyPosts] = useState<PostData[]>([]);

  // Medya Gönderme / Sıkıştırma State & Refs
  const [sendingMedia, setSendingMedia] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<Record<string, any>>({});

  // Swipe to back gesture refs and handlers
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const diffX = e.touches[0].clientX - touchStartRef.current.x;
    const diffY = e.touches[0].clientY - touchStartRef.current.y;
    
    // Sağa kaydırınca geri gitme (Instagram tarzı)
    if (diffX > 100 && Math.abs(diffX) > Math.abs(diffY) * 2) {
      touchStartRef.current = null;
      setActiveChat(null);
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  // Arkadaşlar ve takipçileri çekme
  useEffect(() => {
    if (!currentUser || !showNewChatModal) return;
    
    const fetchFriendsAndProfiles = async () => {
      setLoadingFriends(true);
      try {
        const followsRef = collection(db, 'follows');
        // Takip ettiklerim
        const qFollowing = query(followsRef, where('followerId', '==', currentUser.uid));
        const followingSnap = await getDocs(qFollowing);
        const followingList: any[] = [];
        followingSnap.forEach(d => {
          const data = d.data();
          followingList.push({
            uid: data.followingId,
            displayName: data.followingName || 'Üye',
            photoURL: data.followingPhoto || ''
          });
        });

        // Takipçilerim
        const qFollowers = query(followsRef, where('followingId', '==', currentUser.uid));
        const followersSnap = await getDocs(qFollowers);
        const followersList: any[] = [];
        followersSnap.forEach(d => {
          const data = d.data();
          followersList.push({
            uid: data.followerId,
            displayName: data.followerName || 'Üye',
            photoURL: data.followerPhoto || ''
          });
        });

        // Birleştir, duplicate'leri kaldır
        const merged = [...followingList];
        followersList.forEach(f => {
          if (!merged.some(m => m.uid === f.uid)) {
            merged.push(f);
          }
        });

        setFriends(merged);
      } catch (err) {
        console.error("Arkadaşlar listelenirken hata:", err);
      } finally {
        setLoadingFriends(false);
      }
    };

    fetchFriendsAndProfiles();
  }, [currentUser, showNewChatModal]);

  // Global Kullanıcı Arama
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const profilesRef = collection(db, 'profiles');
        const q = query(profilesRef, limit(40)); 
        const snap = await getDocs(q);
        const results: any[] = [];
        snap.forEach(d => {
          const data = d.data();
          if (d.id !== currentUser?.uid) {
            const name = (data.displayName || '').toLowerCase();
            const email = (data.email || '').toLowerCase();
            const queryLower = searchQuery.toLowerCase();
            if (name.includes(queryLower) || email.includes(queryLower) || d.id === searchQuery.trim()) {
              results.push({
                uid: d.id,
                displayName: data.displayName || 'Üye',
                photoURL: data.photoURL || '',
                email: data.email || ''
              });
            }
          }
        });
        setSearchResults(results);
      } catch (err) {
        console.error("Arama hatası:", err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, currentUser]);

  const handleSelectUserToChat = async (uid: string, name: string, photo: string) => {
    if (!currentUser) return;
    setNewChatError(null);

    try {
      const sortedIds = [currentUser.uid, uid].sort();
      const newChatId = `chat_${sortedIds[0]}_${sortedIds[1]}`;

      // Gerçek isim çözme (Eğer isim 'Kullanıcı' ise veya boş ise veritabanından çek)
      let rName = name;
      let rPhoto = photo;
      if (rName === "Kullanıcı" || !rName) {
        if (profileCache.current[uid]) {
          rName = profileCache.current[uid].displayName || rName;
          rPhoto = profileCache.current[uid].photoURL || rPhoto;
        } else {
          try {
            const uSnap = await getDoc(doc(db, 'profiles', uid));
            if (uSnap.exists()) {
              const ud = uSnap.data();
              rName = ud.displayName || rName;
              rPhoto = ud.photoURL || rPhoto;
              profileCache.current[uid] = { displayName: rName, photoURL: rPhoto };
            }
          } catch (_) {
            // Devam et
          }
        }
      }

      const chatDocRef = doc(db, 'chats', newChatId);
      const chatDocSnap = await getDoc(chatDocRef);
      if (!chatDocSnap.exists()) {
        await setDoc(chatDocRef, {
          chatId: newChatId,
          participantIds: sortedIds,
          lastMessage: "Sohbet başlatıldı",
          lastMessageAt: serverTimestamp(),
          lastSenderId: currentUser.uid
        }, { merge: true });
      }

      setTargetUid('');
      setSearchQuery('');
      setSearchResults([]);
      setShowNewChatModal(false);
      setActiveTab('dm'); // Sohbetlere (DM) sekmesine yönlendir
      
      setActiveChat({
        chatId: newChatId,
        participantIds: sortedIds,
        lastMessage: chatDocSnap.exists() ? (chatDocSnap.data()?.lastMessage || "") : "Sohbet başlatıldı",
        lastMessageAt: chatDocSnap.exists() ? chatDocSnap.data()?.lastMessageAt : null,
        lastSenderId: chatDocSnap.exists() ? chatDocSnap.data()?.lastSenderId : currentUser.uid,
        otherUser: { userId: uid, displayName: rName, photoURL: rPhoto } as any
      });
    } catch (err) {
      console.error(err);
      setNewChatError("Sohbet odası başlatılamadı.");
    }
  };

  // Profil sayfasından veya başka bir yerden yönlendirilmiş bir hedef kullanıcıyla sohbeti otomatik başlatma/açma
  useEffect(() => {
    if (!currentUser) return;
    const autoTargetUid = localStorage.getItem('startChatWith');
    if (autoTargetUid) {
      localStorage.removeItem('startChatWith');
      
      const startAutoChat = async () => {
        try {
          const sortedIds = [currentUser.uid, autoTargetUid].sort();
          const newChatId = `chat_${sortedIds[0]}_${sortedIds[1]}`;
          
          let otherUserData = profileCache.current[autoTargetUid];
          if (!otherUserData) {
            try {
              const userSnap = await getDoc(doc(db, 'profiles', autoTargetUid));
              otherUserData = userSnap.exists()
                ? { userId: autoTargetUid, ...userSnap.data() }
                : { userId: autoTargetUid, displayName: 'Kullanıcı', photoURL: '' };
              profileCache.current[autoTargetUid] = otherUserData;
            } catch (_) {
              otherUserData = { userId: autoTargetUid, displayName: 'Kullanıcı', photoURL: '' };
            }
          }

          const chatDocRef = doc(db, 'chats', newChatId);
          const chatDocSnap = await getDoc(chatDocRef);
          if (!chatDocSnap.exists()) {
            await setDoc(chatDocRef, {
              chatId: newChatId,
              participantIds: sortedIds,
              lastMessage: "Sohbet başlatıldı",
              lastMessageAt: serverTimestamp(),
              lastSenderId: currentUser.uid
            }, { merge: true });
          }

          setActiveTab('dm'); // Sekmeyi DM yapalım

          setActiveChat({
            chatId: newChatId,
            participantIds: sortedIds,
            lastMessage: chatDocSnap.exists() ? (chatDocSnap.data()?.lastMessage || "") : "Sohbet başlatıldı",
            lastMessageAt: chatDocSnap.exists() ? chatDocSnap.data()?.lastMessageAt : null,
            lastSenderId: chatDocSnap.exists() ? chatDocSnap.data()?.lastSenderId : currentUser.uid,
            otherUser: otherUserData as any
          });
        } catch (err) {
          console.error("Otomatik sohbet başlatma hatası:", err);
        }
      };
      startAutoChat();
    }
  }, [currentUser]);

  // 1. Kullanıcının aktif sohbet odalarını çekme (getDocs ile bir kere - SÜPER KOTA DOSTU VE RESILIENT ÖNBELLEKLİ)
  useEffect(() => {
    if (!currentUser) return;

    // Hemen yerel önbelleği yükleyelim ki kota sınırlarında boş ekran kalmasın
    const cached = localStorage.getItem(`bumu_chats_${currentUser.uid}`);
    if (cached) {
      try {
        setChatRooms(JSON.parse(cached));
      } catch (_) {}
    }

    const fetchRooms = async () => {
      try {
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participantIds', 'array-contains', currentUser.uid));
        const snapshot = await getDocs(q);

        const rooms: ChatRoomData[] = [];
        
        for (const d of snapshot.docs) {
          const data = d.data();
          const otherUserId = data.participantIds.find((id: string) => id !== currentUser.uid);
          
          let otherUserProfile = undefined;
          if (otherUserId) {
            if (profileCache.current[otherUserId]) {
              otherUserProfile = profileCache.current[otherUserId];
            } else {
              try {
                const pSnap = await getDoc(doc(db, 'profiles', otherUserId));
                if (pSnap.exists()) {
                  otherUserProfile = { userId: otherUserId, ...pSnap.data() };
                  profileCache.current[otherUserId] = otherUserProfile;
                } else {
                  otherUserProfile = { userId: otherUserId, displayName: 'Kullanıcı', photoURL: '' };
                }
              } catch (e) {
                console.error("Diğer üye profil çekme hatası:", e);
                otherUserProfile = { userId: otherUserId, displayName: 'Kullanıcı', photoURL: '' };
              }
            }
          }

          rooms.push({
            chatId: d.id,
            ...data,
            otherUser: otherUserProfile
          } as ChatRoomData);
        }

        // Son mesaj tarihine göre azalan şekilde sıralayalım
        rooms.sort((a,b) => {
          const dateA = a.lastMessageAt?.seconds || 0;
          const dateB = b.lastMessageAt?.seconds || 0;
          return dateB - dateA;
        });

        setChatRooms(rooms);
        localStorage.setItem(`bumu_chats_${currentUser.uid}`, JSON.stringify(rooms));
      } catch (error) {
        console.error("Sohbet odası çekilirken hata, yerel önbelleğe dönülüyor:", error);
        const fallbackCached = localStorage.getItem(`bumu_chats_${currentUser.uid}`);
        if (fallbackCached) {
          try {
            setChatRooms(JSON.parse(fallbackCached));
          } catch (_) {}
        }
      }
    };

    fetchRooms();
  }, [currentUser, refreshRoomsTrigger]);

  // 2. Seçili sohbet odasındaki mesajları kota dostu canlı dinleme (limit(1)) & geçmişi sayfalama
  const fetchOlderMessages = async () => {
    if (!activeChat || !hasMoreMessages || !messagesLastDoc || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const msgsRef = collection(db, 'chats', activeChat.chatId, 'messages');
      const qOlder = query(
        msgsRef,
        orderBy('createdAt', 'desc'),
        startAfter(messagesLastDoc),
        limit(20)
      );
      const snapshot = await getDocs(qOlder);
      if (snapshot.empty) {
        setHasMoreMessages(false);
        setLoadingOlderMessages(false);
        return;
      }

      setMessagesLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMoreMessages(snapshot.docs.length >= 20);

      const olderList: MessageData[] = [];
      snapshot.forEach(d => {
        olderList.push({
          messageId: d.id,
          ...d.data()
        } as MessageData);
      });
      olderList.reverse(); // Geriye doğru sıralı diziyi kronolojik yapmak için çeviriyoruz

      setMessages(prev => [...olderList, ...prev]);
    } catch (error) {
      console.error("Geçmiş mesajlar yüklenirken hata:", error);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      setMessagesLastDoc(null);
      setHasMoreMessages(true);
      return;
    }

    // Seçili oda mesajlarını hemen önbellekten çekelim
    const cachedMsgs = localStorage.getItem(`bumu_messages_${activeChat.chatId}`);
    if (cachedMsgs) {
      try {
        setMessages(JSON.parse(cachedMsgs));
      } catch (_) {}
    }

    // 1. Son 20 mesajı tek seferlik çekme
    const fetchInitialMessages = async () => {
      try {
        const msgsRef = collection(db, 'chats', activeChat.chatId, 'messages');
        const qInit = query(msgsRef, orderBy('createdAt', 'desc'), limit(20));
        const snapshot = await getDocs(qInit);
        
        if (snapshot.empty) {
          setMessages([]);
          setMessagesLastDoc(null);
          setHasMoreMessages(false);
          return;
        }

        setMessagesLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMoreMessages(snapshot.docs.length >= 20);

        const list: MessageData[] = [];
        snapshot.forEach(d => {
          list.push({
            messageId: d.id,
            ...d.data()
          } as MessageData);
        });
        list.reverse(); // Kronolojik sıralama (Eskiden yeniye)

        setMessages(list);
        localStorage.setItem(`bumu_messages_${activeChat.chatId}`, JSON.stringify(list));
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
      } catch (error) {
        console.error("İlk mesajlar yüklenirken hata:", error);
      }
    };

    fetchInitialMessages();

    // 2. Yeni gelen mesajlar için limit(1) canlı dinleyici (SÜPER KOTA DOSTU!)
    const msgsRef = collection(db, 'chats', activeChat.chatId, 'messages');
    const qLive = query(msgsRef, orderBy('createdAt', 'desc'), limit(1));
    const unsubscribe = onSnapshot(qLive, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newMsg = {
            messageId: change.doc.id,
            ...change.doc.data()
          } as MessageData;

          // Eğer bu mesaj bizim listemizde yoksa listeye ekle
          setMessages(prev => {
            if (prev.some(m => m.messageId === newMsg.messageId)) return prev;
            const updated = [...prev, newMsg];
            localStorage.setItem(`bumu_messages_${activeChat.chatId}`, JSON.stringify(updated));
            return updated;
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      });
    });

    return () => unsubscribe();
  }, [activeChat, refreshMessagesTrigger]);

  // 3. Mesaj Gönderme (Medya Sıkıştırmalı & Standart)
  const handleSendMessage = async (e?: React.FormEvent, customPostId?: string, mediaUrl?: string) => {
    if (e) e.preventDefault();
    if (!currentUser || !activeChat) return;

    const messageText = customPostId 
      ? "Sana oylaman için interaktif bir BumuBumu gönderdi!" 
      : (mediaUrl && !inputText.trim() ? "📷 bir fotoğraf gönderdi" : inputText.trim());

    if (!messageText && !mediaUrl) return;

    if (!customPostId && !mediaUrl) setInputText('');

    try {
      const msgId = 'msg_' + Math.random().toString(36).substring(2, 11);
      const messagesRef = collection(db, 'chats', activeChat.chatId, 'messages');
      
      const payload: any = {
        messageId: msgId,
        senderId: currentUser.uid,
        senderName: profileData?.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || "Kullanıcı",
        text: messageText,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any
      };

      if (customPostId) {
        payload.postId = customPostId; // İnteraktif oylama kartı referansı!
      }

      if (mediaUrl) {
        payload.mediaUrl = mediaUrl; // Sıkıştırılmış görsel
      }

      // Yerel mesaj listesini hemen güncelle (Optimistic update)
      setMessages(prev => [...prev, payload]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

      // Sol taraftaki yerel oda listesini de hemen güncelle (Optimistic update)
      setChatRooms(prev => prev.map(room => room.chatId === activeChat.chatId ? {
        ...room,
        lastMessage: messageText,
        lastMessageAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
        lastSenderId: currentUser.uid
      } : room).sort((a,b) => {
        const dateA = a.lastMessageAt?.seconds || 0;
        const dateB = b.lastMessageAt?.seconds || 0;
        return dateB - dateA;
      }));

      // Mesajı alt koleksiyona yaz
      await setDoc(doc(messagesRef, msgId), payload);

      // Ana chat dökümanının son mesaj detaylarını güncelle
      await setDoc(doc(db, 'chats', activeChat.chatId), {
        lastMessage: messageText,
        lastMessageAt: serverTimestamp(),
        lastSenderId: currentUser.uid
      }, { merge: true });

    } catch (err) {
      console.error("Mesaj gönderilemedi:", err);
      handleFirestoreError(err, OperationType.CREATE, `chats/${activeChat.chatId}/messages`);
    }
  };

  const handleMediaFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSendingMedia(true);
    try {
      // Client-side görsel sıkıştırma (<300-500kb max)
      const compressedBase64 = await compressImageFile(file, 1000, 1000, 0.72);
      await handleSendMessage(undefined, undefined, compressedBase64);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    } catch (err) {
      console.error("Medya gönderim hatası:", err);
    } finally {
      setSendingMedia(false);
    }
  };

  // Mesaj Silme Özelliği
  const handleDeleteMessage = async (e: React.MouseEvent, messageId: string) => {
    e.stopPropagation();
    if (!currentUser || !activeChat) return;
    if (!window.confirm("Bu mesajı silmek istediğinizden emin misiniz?")) return;
    try {
      const msgRef = doc(db, 'chats', activeChat.chatId, 'messages', messageId);
      await deleteDoc(msgRef);
      
      // Önbelleği güncelle
      const cacheKey = `bumu_messages_${activeChat.chatId}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const list = JSON.parse(cached) as MessageData[];
          const updated = list.filter(m => m.messageId !== messageId);
          localStorage.setItem(cacheKey, JSON.stringify(updated));
          setMessages(updated);
        } catch (_) {}
      }
    } catch (err) {
      console.error("Mesaj silme hatası:", err);
    }
  };

  // Sohbet Odasını/Geçmişini Silme Özelliği
  const handleDeleteChatRoom = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!currentUser) return;
    if (!window.confirm("Bu sohbeti ve tüm mesaj geçmişini silmek istediğinizden emin misiniz?")) return;
    try {
      await deleteDoc(doc(db, 'chats', chatId));
      
      // Önbellekleri temizle
      localStorage.removeItem(`bumu_messages_${chatId}`);
      const updatedRooms = chatRooms.filter(r => r.chatId !== chatId);
      setChatRooms(updatedRooms);
      localStorage.setItem(`bumu_chats_${currentUser.uid}`, JSON.stringify(updatedRooms));
      
      if (activeChat?.chatId === chatId) {
        setActiveChat(null);
      }
    } catch (err) {
      console.error("Sohbet silme hatası:", err);
    }
  };

  // 4. Yeni Sohbet Odası Oluşturma
  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !targetUid.trim()) return;
    setNewChatError(null);

    const inputVal = targetUid.trim();
    let resolvedUid = inputVal;
    let otherUserData: any = null;
    let userExists = false;

    // Kendiyle sohbet etmeye çalışırsa engelle
    if (inputVal === currentUser.uid) {
      setNewChatError("Kendinizle mesajlaşamazsınız.");
      return;
    }

    try {
      // 1. Önce username ile aramayı deneyelim (input @ ile başlasın veya başlamasın)
      const cleanUsername = inputVal.startsWith('@') ? inputVal.slice(1).trim().toLowerCase() : inputVal.toLowerCase();
      try {
        const pRef = collection(db, 'profiles');
        const qUsername = query(pRef, where('username', '==', cleanUsername), limit(1));
        const usernameSnap = await getDocs(qUsername);
        if (!usernameSnap.empty) {
          const foundDoc = usernameSnap.docs[0];
          resolvedUid = foundDoc.id;
          otherUserData = { userId: resolvedUid, ...foundDoc.data() };
          userExists = true;
          profileCache.current[resolvedUid] = otherUserData;
        }
      } catch (err) {
        console.warn("Username query failed, moving to direct ID check:", err);
      }

      // Kendiyle sohbet etmeye çalışırsa engelle (username çözüldükten sonra da kontrol et)
      if (resolvedUid === currentUser.uid) {
        setNewChatError("Kendinizle mesajlaşamazsınız.");
        return;
      }

      // 2. Bulunamadıysa doğrudan UID olarak doğrula
      if (!userExists) {
        try {
          const userSnap = await getDoc(doc(db, 'profiles', resolvedUid));
          userExists = userSnap.exists();
          if (userExists) {
            otherUserData = { userId: resolvedUid, ...userSnap.data() };
            profileCache.current[resolvedUid] = otherUserData;
          }
        } catch (e) {
          console.warn("Firestore'dan profil doğrulanırken hata oluştu, yerel aramaya geçiliyor:", e);
          // Önbellekte var mı kontrol et
          if (profileCache.current[resolvedUid]) {
            userExists = true;
            otherUserData = profileCache.current[resolvedUid];
          } else {
            // Arkadaşlar listesinde var mı kontrol et
            const foundFriend = friends.find(f => f.userId === resolvedUid);
            if (foundFriend) {
              userExists = true;
              otherUserData = { userId: foundFriend.userId, displayName: foundFriend.displayName, photoURL: foundFriend.photoURL };
            }
          }
        }
      }

      if (!userExists) {
        setNewChatError("Belirtilen Kullanıcı adı veya ID sistemde bulunamadı.");
        return;
      }

      // Benzersiz chatId oluşturma (Sıralanmış alfabetik birleştirme)
      const sortedIds = [currentUser.uid, resolvedUid].sort();
      const newChatId = `chat_${sortedIds[0]}_${sortedIds[1]}`;

      const chatDocRef = doc(db, 'chats', newChatId);
      try {
        await setDoc(chatDocRef, {
          chatId: newChatId,
          participantIds: sortedIds,
          lastMessage: "Sohbet başarıyla başlatıldı!",
          lastMessageAt: serverTimestamp(),
          lastSenderId: currentUser.uid
        }, { merge: true });
      } catch (wErr) {
        console.warn("Firestore yazılırken hata oluştu, tamamen yerel/geçici oda başlatılıyor:", wErr);
      }

      setTargetUid('');
      setShowNewChatModal(false);
      setActiveTab('dm'); // Sohbetlere (DM) sekmesine yönlendir
      
      // Oluşturulan aktif odayı hemen seçelim
      setActiveChat({
        chatId: newChatId,
        participantIds: sortedIds,
        lastMessage: "Sohbet başarıyla başlatıldı!",
        lastMessageAt: null,
        lastSenderId: currentUser.uid,
        otherUser: otherUserData
      });
    } catch (err) {
      console.error(err);
      setNewChatError("Yeni oda başlatılamadı.");
    }
  };

  // 5. Karşılaştırma Listesini Yükleme (Paylaşım Modali İçin)
  const openSharePostModal = async () => {
    if (!currentUser) return;
    try {
      const postsRef = collection(db, 'posts');
      const q = query(postsRef, where('groupId', '==', 'global'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      const list: PostData[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({ postId: d.id, ...data } as PostData);
      });
      setMyPosts(list);
      setShowSharePostModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  // Seçilen Karşılaştırma Gönderisini DM İçinde Paylaşma
  const handleSharePostInChat = async (pstId: string) => {
    setShowSharePostModal(false);
    await handleSendMessage(null as any, pstId);
  };

  return (
    <div className={`w-full max-w-lg mx-auto bg-slate-950/40 ${activeGroupInPage ? 'p-0' : 'p-4'} min-h-screen text-slate-100 flex flex-col gap-4 font-sans relative`}>
      
      {/* SOHBET KUTULARININ EKRANI */}
      {!activeChat ? (
        <>
          {/* SEKME SEÇİCİ */}
          {!activeGroupInPage && (
            <div className="flex bg-slate-900/40 p-1 rounded-2xl border border-slate-800/60 mt-2">
              <button
                onClick={() => setActiveTab('dm')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer ${
                  activeTab === 'dm'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/35'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                SOHBETLER (DM)
              </button>
              <button
                onClick={() => setActiveTab('groups')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer ${
                  activeTab === 'groups'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/35'
                }`}
              >
                <Users className="w-4 h-4" />
                KULÜPLER
              </button>
            </div>
          )}

          {activeTab === 'dm' ? (
            <>
              {/* SOHBET ODALARI LİSTESİ */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/60 mt-2 select-none">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-400" />
                  <h1 className="text-base font-black tracking-wide text-slate-100 uppercase font-mono">Mesaj Kutusu</h1>
                  <button
                    onClick={() => setRefreshRoomsTrigger(prev => prev + 1)}
                    className="p-1.5 rounded-xl hover:bg-slate-900 text-slate-400 hover:text-white transition duration-200 cursor-pointer"
                    title="Sohbetleri Yenile"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <button
                  onClick={() => setShowNewChatModal(true)}
                  id="new-chat-opener"
                  className="px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold flex items-center gap-1.5 shadow duration-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Sohbet Başlat
                </button>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto mt-2 pb-16">
                {chatRooms.length === 0 ? (
                  <div className="bg-slate-900/10 border border-slate-800/40 rounded-3xl p-12 text-center text-slate-500 italic text-xs">
                    Mesaj kutunuz boş. Sohbet etmek için yukarıdan 'Sohbet Başlat' butonuna tıklayın.
                  </div>
                ) : (
                  chatRooms.map((chat) => (
                    <div
                      key={chat.chatId}
                      onClick={() => setActiveChat(chat)}
                      id={`chat-item-${chat.chatId}`}
                      className="bg-slate-900/40 hover:bg-slate-900/75 border border-slate-800/60 rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all hover:-translate-y-0.5 select-none animate-fade-in"
                    >
                      <div className="flex items-center gap-3">
                        <img 
                          src={chat.otherUser?.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${chat.chatId}`} 
                          alt="Profil" 
                          className="w-10 h-10 rounded-full border border-slate-800 object-cover"
                        />
                        <div>
                          <h4 className="text-xs font-bold text-slate-200">
                            {chat.otherUser?.displayName || "Gizemli BumuBumu Üyesi"}
                          </h4>
                          <p className="text-[11px] text-slate-400 font-medium truncate max-w-[200px] mt-0.5">{chat.lastMessage}</p>
                          
                          <span className="text-[8px] text-slate-600 font-mono mt-1 block">ID: {chat.otherUser?.userId}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[8px] font-mono text-slate-600">
                          {chat.lastMessageAt?.seconds ? new Date(chat.lastMessageAt.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        <button
                          onClick={(e) => handleDeleteChatRoom(e, chat.chatId)}
                          className="p-1.5 rounded-lg bg-red-650/10 hover:bg-red-600 text-red-400 hover:text-white transition duration-200 cursor-pointer"
                          title="Sohbeti Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="animate-fade-in">
              <GroupsPage onActiveGroupChange={setActiveGroupInPage} isNested={true} />
            </div>
          )}
        </>
      ) : (
        /* AKTİF SOHBET PENCERESİ */
        <div 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex flex-col fixed inset-x-0 top-[calc(60px+env(safe-area-inset-top))] bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 bg-[#090314] md:relative md:inset-auto md:top-auto md:bottom-auto md:h-[78vh] md:rounded-3xl md:border md:border-slate-800/60 overflow-hidden shadow-2xl"
        >
          
          {/* Sohbet Başlığı ve Geri Butonu (Instagram Tarzı Sol Geri Butonu) */}
          <div className="bg-slate-900/60 p-3.5 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setActiveChat(null)}
                id="chat-back-btn"
                className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition duration-300 cursor-pointer flex items-center justify-center shadow"
                title="Geri Dön"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              
              <img 
                src={activeChat.otherUser?.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${activeChat.chatId}`} 
                alt="Profil" 
                className="w-9 h-9 rounded-full border border-slate-800 object-cover"
              />
              <div className="flex items-center gap-1.5">
                <div>
                  <h3 className="text-xs font-bold text-slate-200 leading-none">
                    {activeChat.otherUser?.displayName || "Sohbet Odası"}
                  </h3>
                  <span className="text-[8px] text-slate-500 font-mono mt-1 block select-all">ID: {activeChat.otherUser?.userId}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRefreshMessagesTrigger(prev => prev + 1)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition duration-200 cursor-pointer"
                  title="Mesajları Yenile"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* MESAJ YIĞINI AKIŞI */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 scrollbar-thin">
            {hasMoreMessages && messages.length >= 20 && (
              <div className="flex justify-center pb-2">
                <button
                  onClick={fetchOlderMessages}
                  disabled={loadingOlderMessages}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white text-[10px] font-mono transition duration-300 active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingOlderMessages ? 'animate-spin' : ''}`} />
                  {loadingOlderMessages ? 'yükleniyor...' : 'geçmiş mesajları yükle'}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="text-center text-slate-600 italic font-mono text-[10px] py-12">
                Sohbetin ilk kıvılcımını atın.
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderId === currentUser?.uid;
                return (
                  <div 
                    key={msg.messageId} 
                    className={`flex flex-col max-w-[85%] ${isMe ? 'self-end ml-auto items-end' : 'self-start mr-auto items-start'}`}
                  >
                    {/* Normal Mesaj Balonu veya İnteraktif Oylama Kartı */}
                    {msg.postId ? (
                      /* İNTERAKTİF MESAJ İÇİ OYLAMA KARTI */
                      <div className="w-full min-w-[280px] bg-slate-900 border border-violet-500/30 rounded-2xl p-2 shadow-xl flex flex-col gap-1 inline-block text-left relative mt-1.5 mb-1.5">
                        <div className="flex items-center gap-1 text-[8px] font-mono font-bold text-violet-400 px-1 uppercase mb-2">
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Önerilen İnteraktif Karşılaştırma
                        </div>
                        
                        {/* İç İçe VotingCard Çağırımı (Gerçek zamanlı çalışır!) */}
                        <VotingCardNested postId={msg.postId} />
                      </div>
                    ) : (
                      /* Standart Mesaj Balonu */
                      <div className={`p-3 rounded-2xl text-xs font-medium leading-relaxed shadow-md flex flex-col gap-2 ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'}`}>
                        {msg.mediaUrl && (
                          <div className="rounded-xl overflow-hidden border border-white/10 max-w-[200px] bg-black/40">
                            <img src={msg.mediaUrl} alt="Medya" className="w-full h-auto object-cover max-h-48" />
                          </div>
                        )}
                        <p>{msg.text}</p>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1.5 mt-1 text-[8px] font-mono text-slate-600">
                      <span>{msg.senderName} • {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      {currentUser && (msg.senderId === currentUser.uid) && (
                        <button
                          onClick={(e) => handleDeleteMessage(e, msg.messageId)}
                          className="text-red-500 hover:text-red-400 p-0.5 rounded transition cursor-pointer"
                          title="Mesajı Sil"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* MESAJ INPUT VE PAYLAŞIM BARBARI */}
          <form onSubmit={(e) => handleSendMessage(e)} className="p-3 bg-slate-900/60 border-t border-slate-800/60 flex items-center gap-2">
            
            {/* İnteraktif Kart Paylaşma Mandalı */}
            <button
              type="button"
              onClick={openSharePostModal}
              id="dm-share-post-opener"
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-indigo-400 hover:text-indigo-300 hover:border-indigo-500 transition shadow cursor-pointer flex-shrink-0"
              title="Mevcut Karşılaştırmayı DM Gönder"
            >
              <Share2 className="w-4 h-4" />
            </button>

            {/* Medya Gönderme / Fotoğraf Sıkıştırmalı Paylaşım */}
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={sendingMedia}
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500 transition shadow cursor-pointer flex-shrink-0 relative flex items-center justify-center"
              title="Fotoğraf Gönder (<500kb Sıkıştırmalı)"
            >
              {sendingMedia ? (
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
            </button>
            <input
              type="file"
              ref={mediaInputRef}
              onChange={handleMediaFileSelect}
              accept="image/*"
              className="hidden"
            />

            <div className="flex-1 relative flex items-center">
              <input
                required
                type="text"
                placeholder="Mesajınızı anlık yazın..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl py-2.5 pl-3.5 pr-10 outline-none text-slate-100 transition placeholder-slate-600"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                id="dm-send-btn"
                className="absolute right-2 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition duration-300 disabled:opacity-40 flex items-center justify-center cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>

        </div>
      )}

      {/* YENİ SOHBET BAŞLATMA MODAL (Arkadaşlar & Arama) */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-100 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col gap-4 shadow-xl select-none max-h-[80vh]">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold font-mono tracking-wider text-slate-300 uppercase">Sohbet Başlat</h3>
              <button 
                onClick={() => { 
                  setShowNewChatModal(false); 
                  setSearchQuery(''); 
                  setSearchResults([]); 
                  setNewChatError(null); 
                }} 
                className="text-slate-500 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newChatError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-400 font-mono">
                {newChatError}
              </div>
            )}

            {/* Arama Inputu */}
            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                placeholder="İsim veya e-posta ile üye ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 p-3 rounded-xl outline-none text-slate-100 placeholder-slate-600"
              />
            </div>

            {/* Arama Sonuçları */}
            {searchQuery.trim() !== '' && (
              <div className="flex-1 overflow-y-auto max-h-[40vh] space-y-2 pr-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Arama Sonuçları ({searchResults.length})</span>
                {searchResults.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic text-center py-2">Eşleşen üye bulunamadı.</p>
                ) : (
                  searchResults.map((user) => (
                    <div
                      key={user.uid}
                      onClick={() => handleSelectUserToChat(user.uid, user.displayName, user.photoURL)}
                      className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-violet-500/40 rounded-xl cursor-pointer transition flex items-center gap-2.5"
                    >
                      <img 
                        src={user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`} 
                        alt="Profil" 
                        className="w-8 h-8 rounded-full border border-slate-800 object-cover"
                      />
                      <div className="flex-1 truncate">
                        <h4 className="text-xs font-bold text-slate-200 truncate">{user.displayName}</h4>
                        <p className="text-[9px] text-slate-550 truncate">{user.email || 'E-posta gizli'}</p>
                      </div>
                      <span className="text-[8px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">SOHBET ET</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Arkadaşlar (Takipçi & Takip Edilen) Listesi - Sadece arama boşken gösterilir */}
            {searchQuery.trim() === '' && (
              <div className="flex-1 overflow-y-auto max-h-[40vh] space-y-2 pr-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Arkadaşlar ({friends.length})</span>
                {loadingFriends ? (
                  <p className="text-[10px] text-slate-500 italic text-center py-4 animate-pulse">Arkadaşlar yükleniyor...</p>
                ) : friends.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic text-center py-4">Takip ettiğiniz veya sizi takip eden arkadaşınız bulunmuyor. Üst kısımdan arama yaparak yeni kişilere ulaşabilirsiniz!</p>
                ) : (
                  friends.map((user) => (
                    <div
                      key={user.uid}
                      onClick={() => handleSelectUserToChat(user.uid, user.displayName, user.photoURL)}
                      className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-violet-500/40 rounded-xl cursor-pointer transition flex items-center gap-2.5"
                    >
                      <img 
                        src={user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`} 
                        alt="Profil" 
                        className="w-8 h-8 rounded-full border border-slate-800 object-cover"
                      />
                      <div className="flex-1 truncate">
                        <h4 className="text-xs font-bold text-slate-200 truncate">{user.displayName}</h4>
                      </div>
                      <span className="text-[8px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">SOHBET ET</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Manuel UID ile Sohbet Başlat */}
            <div className="border-t border-slate-800/60 pt-2 text-left">
              <details className="group">
                <summary className="text-[9px] font-mono text-slate-500 hover:text-slate-300 cursor-pointer list-none flex justify-between items-center">
                  <span>Veya UID kodu ile başlat</span>
                  <span className="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    placeholder="UID girin..."
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                    className="flex-1 text-[10px] bg-slate-950 border border-slate-800 focus:border-violet-500 p-2 rounded-lg outline-none text-slate-100 font-mono"
                  />
                  <button
                    onClick={() => handleSelectUserToChat(targetUid.trim(), "Kullanıcı", "")}
                    disabled={!targetUid.trim()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-[9px] rounded-lg transition cursor-pointer disabled:opacity-40"
                  >
                    Başlat
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* KARŞILAŞTIRMA SEÇİP GÖNDERME GİZLİ MODAL */}
      {showSharePostModal && (
        <div className="fixed inset-0 z-100 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 p-5 rounded-3xl flex flex-col gap-4 shadow-xl select-none max-h-[80vh]">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold font-mono tracking-wider text-slate-300 uppercase">Kart Paylaşımı</h3>
              <button onClick={() => setShowSharePostModal(false)} className="text-slate-500 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <span className="text-[10px] text-slate-500 font-mono lowercase">Paylaşmak istediğiniz karşılaştırmayı seçin:</span>

            <div className="flex-1 overflow-y-auto space-y-2 max-h-[60vh] pr-1">
              {myPosts.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-6 font-mono">Paylaşılacak gönderi bulunmuyor.</p>
              ) : (
                myPosts.map((post) => (
                  <div
                    key={post.postId}
                    onClick={() => handleSharePostInChat(post.postId)}
                    className="p-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-violet-500/50 rounded-2xl cursor-pointer transition flex items-center justify-between"
                  >
                    <div className="flex-1 truncate pr-3">
                      <h4 className="text-xs font-bold text-slate-200 truncate">{post.title}</h4>
                      <p className="text-[9px] text-slate-500 truncate mt-0.5">{post.optionALabel} / {post.optionBLabel}</p>
                    </div>
                    
                    <span className="text-[8px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/25">PAYLAŞ</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// DM İçindeki Karşılaştırma Kartının Gerçek Zamanlı Gömülü Alt Bileşeni (Nested)
const VotingCardNested: React.FC<{ postId: string }> = ({ postId }) => {
  const [post, setPost] = useState<PostData | null>(null);
  const [load, setLoad] = useState(true);

  useEffect(() => {
    const postRef = doc(db, 'posts', postId);
    getDoc(postRef).then((docSnap) => {
      if (docSnap.exists()) {
        setPost({ postId: docSnap.id, ...docSnap.data() } as PostData);
      }
      setLoad(false);
    }).catch((error) => {
      console.error("Gömülü post okunurken hata:", error);
      setLoad(false);
    });
  }, [postId]);

  if (load) {
    return <div className="text-[10px] font-mono text-slate-500 italic p-3 text-center animate-pulse">Karşılaştırma yükleniyor...</div>;
  }

  if (!post) {
    return <div className="text-[10px] font-mono text-rose-400/80 italic p-3 text-center border-2 border-dashed border-rose-950 bg-rose-950/20 rounded-2xl">Bu gönderi kaldırılmış.</div>;
  }

  return (
    <div className="scale-95 origin-top border-t-0 p-0 shadow-none">
      <VotingCard post={post} standalone={true} />
    </div>
  );
};
