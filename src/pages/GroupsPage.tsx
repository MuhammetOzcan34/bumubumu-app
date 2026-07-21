/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, getDocs, getDoc, query, where, addDoc, serverTimestamp, deleteDoc, orderBy, writeBatch, increment, collectionGroup, startAfter, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Users, Lock, Sparkles, UserPlus, Trash, ChevronRight, Check, ShieldAlert, Group, Image as ImageIcon, RefreshCw, ArrowLeft, Info, ChevronLeft, MapPin, Link, LayoutGrid, X, PlusCircle, Eye } from 'lucide-react';
import { GroupData, GroupMemberData, PostData } from '../types';
import { VotingCard } from '../components/VotingCard';
import { ImageInputCompressor } from '../components/ImageInputCompressor';
import { CreatePostPage } from './CreatePostPage';

interface GroupsPageProps {
  onActiveGroupChange?: (groupId: string | null) => void;
  isNested?: boolean;
}

export const GroupsPage: React.FC<GroupsPageProps> = ({ onActiveGroupChange, isNested = false }) => {
  const { currentUser, profileData } = useAuth();
  
  // Gruplar State'leri
  const [allGroups, setAllGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const profileCacheRef = useRef<Record<string, any>>({});
  
  // Grup Oluşturma Formu
  const [grpName, setGrpName] = useState('');
  const [grpDesc, setGrpDesc] = useState('');
  const [showCreateGroupForm, setShowCreateGroupForm] = useState(false);
  
  // Üye Ekleme Formu
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroupMembers, setActiveGroupMembers] = useState<GroupMemberData[]>([]);
  const [newMemberUid, setNewMemberUid] = useState('');
  const [friends, setFriends] = useState<{ uid: string, name: string }[]>([]);

  // activeGroupId set edildiğinde parent'a haber verelim
  useEffect(() => {
    if (onActiveGroupChange) {
      onActiveGroupChange(activeGroupId);
    }
  }, [activeGroupId, onActiveGroupChange]);

  // Üye Arama State'leri (Keşfet/FeedPage gibi gelişmiş algoritma)
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);

  // Grup Bilgi Paneli Toggle
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    
    const loadFriends = async () => {
      try {
        const followsRef = collection(db, 'follows');
        const q1 = query(followsRef, where('followerId', '==', currentUser.uid));
        const q2 = query(followsRef, where('followingId', '==', currentUser.uid));
        
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const map = new Map<string, string>();
        
        snap1.forEach(d => {
          const data = d.data();
          if (data.followingId && data.followingId !== currentUser.uid) {
            map.set(data.followingId, data.followingName || 'Bilinmeyen Üye');
          }
        });
        
        snap2.forEach(d => {
          const data = d.data();
          if (data.followerId && data.followerId !== currentUser.uid) {
            map.set(data.followerId, data.followerName || 'Bilinmeyen Üye');
          }
        });
        
        const list = Array.from(map.entries()).map(([uid, name]) => ({ uid, name }));
        setFriends(list);
      } catch (err) {
        console.error("Arkadaş ve takip listesi yüklenemedi:", err);
      }
    };
    
    loadFriends();
  }, [currentUser]);
  
  // Grup İçi Özel Karşılaştırmalar (WhatsApp Tarzı)
  const [groupPosts, setGroupPosts] = useState<PostData[]>([]);
  const [indexErrorUrl, setIndexErrorUrl] = useState<string | null>(null);
  const [groupPostsLoading, setGroupPostsLoading] = useState(false);
  const [groupPostsVisibleCount, setGroupPostsVisibleCount] = useState(10);
  
  // Group Posts pagination states
  const [groupPostsLastDoc, setGroupPostsLastDoc] = useState<any>(null);
  const [groupPostsHasMore, setGroupPostsHasMore] = useState(true);
  const [loadingMoreGroupPosts, setLoadingMoreGroupPosts] = useState(false);
  const [showGroupCreatePost, setShowGroupCreatePost] = useState(false);
  
  // Hatalar ve Mesajlar
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Mevcut tüm grupları çekiyoruz ve üyesi olduklarımızı işaretliyoruz (SÜPER RESILIENT VE HIZLI)
  const loadGroupsAndMemberships = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // 1. Doğrudan üyesi olduğumuz üyeler dökümanlarını collectionGroup sorgusuyla alıyoruz (1 okuma)
      const memberQuery = query(collectionGroup(db, 'members'), where('userId', '==', currentUser.uid));
      const memberSnap = await getDocs(memberQuery);
      
      const list: GroupData[] = [];
      for (const mDoc of memberSnap.docs) {
        // mDoc.ref.parent.parent gruptur
        const groupRef = mDoc.ref.parent.parent;
        if (groupRef) {
          const groupSnap = await getDoc(groupRef);
          if (groupSnap.exists()) {
            list.push({
              groupId: groupSnap.id,
              ...groupSnap.data()
            } as GroupData);
          }
        }
      }
      
      setAllGroups(list);
      // Yerel önbelleğe kaydet
      localStorage.setItem(`bumu_groups_${currentUser.uid}`, JSON.stringify(list));
    } catch (e) {
      console.warn("CollectionGroup groups failed, falling back to traditional groups query:", e);
      try {
        const groupsRef = collection(db, 'groups');
        const snap = await getDocs(groupsRef);
        const list: GroupData[] = [];
        for (const d of snap.docs) {
          try {
            const memberRef = doc(db, 'groups', d.id, 'members', currentUser.uid);
            const mSnap = await getDoc(memberRef);
            if (mSnap.exists()) {
              list.push({
                groupId: d.id,
                ...d.data()
              } as GroupData);
            }
          } catch (_) {
            // Devam et
          }
        }
        setAllGroups(list);
        localStorage.setItem(`bumu_groups_${currentUser.uid}`, JSON.stringify(list));
      } catch (err2) {
        console.error("Grup listesi yüklenemedi, yerel önbellek deneniyor:", err2);
        // Quota limit exceeded veya çevrimdışı durumunda önbellekten çek
        const cached = localStorage.getItem(`bumu_groups_${currentUser.uid}`);
        if (cached) {
          try {
            setAllGroups(JSON.parse(cached));
          } catch (_) {}
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroupsAndMemberships();
  }, [currentUser]);

  // Seçilen grubun üyelerini yükleme (SÜPER OPTİMİZE - PROFİL BELLEKLİ)
  const loadActiveGroupMembers = async (grpId: string) => {
    try {
      const membersRef = collection(db, 'groups', grpId, 'members');
      const snap = await getDocs(membersRef);
      const list: GroupMemberData[] = [];
      
      // Her üyenin profil bilgilerini çekip giden adını eşleştiriyoruz
      for (const d of snap.docs) {
        const uId = d.id;
        let dName = "Grup Üyesi";
        let photo = `https://api.dicebear.com/7.x/adventurer/svg?seed=${uId}`;
        
        // Bellekten veya Firestore'dan bul
        if (profileCacheRef.current[uId]) {
          const cached = profileCacheRef.current[uId];
          dName = cached.displayName || dName;
          photo = cached.photoURL || photo;
        } else {
          try {
            const profSnap = await getDoc(doc(db, 'profiles', uId));
            if (profSnap.exists()) {
              const pd = profSnap.data();
              dName = pd.displayName || dName;
              photo = pd.photoURL || photo;
              profileCacheRef.current[uId] = { displayName: dName, photoURL: photo };
            }
          } catch (_) {
            // Hata durumunda cache'lemesek de devam et
          }
        }

        list.push({
          userId: uId,
          role: d.data().role,
          joinedAt: d.data().joinedAt,
          displayName: dName,
          photoURL: photo
        });
      }
      setActiveGroupMembers(list);
    } catch (e) {
      console.error(e);
      try {
        handleFirestoreError(e, OperationType.LIST, 'groups/members');
      } catch (err) {
        // Fallback or ignore
      }
    }
  };

  const loadGroupPosts = async (grpId: string, isMore = false) => {
    if (isMore && (loadingMoreGroupPosts || !groupPostsHasMore || !groupPostsLastDoc)) return;

    if (isMore) {
      setLoadingMoreGroupPosts(true);
    } else {
      setGroupPostsLoading(true);
      setGroupPostsLastDoc(null);
      setGroupPostsHasMore(true);
    }

    try {
      const postsRef = collection(db, 'posts');
      let q = query(
        postsRef,
        where('groupId', '==', grpId),
        orderBy('createdAt', 'desc'),
        limit(10)
      );

      if (isMore && groupPostsLastDoc) {
        q = query(
          postsRef,
          where('groupId', '==', grpId),
          orderBy('createdAt', 'desc'),
          startAfter(groupPostsLastDoc),
          limit(10)
        );
      }

      let snap;
      let isFallbackActive = false;
      try {
        snap = await getDocs(q);
      } catch (queryErr: any) {
        console.warn("GroupsPage primary posts query failed, initiating resilient fallback:", queryErr);
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
          const fallbackQ = query(
            postsRef,
            where('groupId', '==', grpId),
            limit(50)
          );
          snap = await getDocs(fallbackQ);
          setGroupPostsHasMore(false);
        } catch (fallbackErr: any) {
          console.warn("GroupsPage Level 1 fallback failed, trying Level 2 ultra-resilient fallback:", fallbackErr);
          
          // LEVEL 2 FALLBACK: Absolutely no filters or order to avoid security layout rules discrepancies
          try {
            const ultraFallbackQ = query(postsRef, limit(100));
            snap = await getDocs(ultraFallbackQ);
            setGroupPostsHasMore(false);
          } catch (ultraErr) {
            console.error("All resilient fallback queries failed in GroupsPage:", ultraErr);
            throw ultraErr;
          }
        }
      }

      if (snap.empty) {
        setGroupPostsHasMore(false);
        if (isMore) setLoadingMoreGroupPosts(false);
        else setGroupPostsLoading(false);
        return;
      }

      if (!isFallbackActive) {
        setGroupPostsLastDoc(snap.docs[snap.docs.length - 1]);
        setGroupPostsHasMore(snap.docs.length >= 10);
      }

      const list: PostData[] = [];
      snap.forEach(d => {
        const data = d.data() as PostData;
        // Güvenlik: Eğer fallback aktifse (ve Level 2'den dolayı filtrelenmemişse), sadece bu gruba ait olanları alalım
        if (isFallbackActive && data.groupId !== grpId) {
          return;
        }
        list.push({ postId: d.id, ...data });
      });

      // Client-side sort if fallback
      if (isFallbackActive) {
        list.sort((a, b) => {
          const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return timeB - timeA;
        });
      }

      if (isMore) {
        setGroupPosts(prev => {
          const existingIds = new Set(prev.map(p => p.postId));
          const filteredNew = list.filter(p => !existingIds.has(p.postId));
          return [...prev, ...filteredNew];
        });
      } else {
        setGroupPosts(list);
      }
    } catch (err) {
      console.error("Grup içi oylamalar çekilirken hata:", err);
    } finally {
      setGroupPostsLoading(false);
      setLoadingMoreGroupPosts(false);
    }
  };



  // Üye Arama Algoritması (Keşfet / FeedPage'deki gibi büyük/küçük harf duyarsız ve kota dostu)
  useEffect(() => {
    if (!memberSearchQuery.trim()) {
      setMemberSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchingMembers(true);
      try {
        const profilesRef = collection(db, 'profiles');
        const q = query(profilesRef, limit(100));
        const snap = await getDocs(q);
        const results: any[] = [];
        const queryLower = memberSearchQuery.toLowerCase().trim();

        snap.forEach(d => {
          const data = d.data();
          // Zaten üye olanları listelemeyelim
          const isAlreadyMember = activeGroupMembers.some(m => m.userId === d.id);

          if (d.id !== currentUser?.uid && !isAlreadyMember) {
            const displayName = (data.displayName || '').toLowerCase();
            const bio = (data.bio || '').toLowerCase();
            const location = (data.location || '').toLowerCase();
            const email = (data.email || '').toLowerCase();

            if (
              displayName.includes(queryLower) ||
              bio.includes(queryLower) ||
              location.includes(queryLower) ||
              email.includes(queryLower) ||
              d.id === queryLower
            ) {
              results.push({
                uid: d.id,
                displayName: data.displayName || 'Üye',
                photoURL: data.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${d.id}`,
                email: data.email || ''
              });
            }
          }
        });
        setMemberSearchResults(results);
      } catch (err) {
        console.error("Grup üyesi arama hatası:", err);
      } finally {
        setSearchingMembers(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [memberSearchQuery, activeGroupMembers, currentUser]);

  // Arama sonucundan doğrudan üye ekleme
  const handleAddDirectMember = async (targetUid: string) => {
    if (!currentUser || !activeGroupId) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const memberRef = doc(db, 'groups', activeGroupId, 'members', targetUid);
      await setDoc(memberRef, {
        userId: targetUid,
        role: "member",
        joinedAt: serverTimestamp()
      });

      setSuccessMsg("Üye gruba başarıyla eklendi!");
      setMemberSearchQuery('');
      setMemberSearchResults([]);
      loadActiveGroupMembers(activeGroupId);
    } catch (err) {
      console.error(err);
      setErrorMsg("Üye eklenirken yetki hatası oluştu.");
    }
  };

  useEffect(() => {
    setGroupPostsVisibleCount(10);
    setGroupPostsLastDoc(null);
    setGroupPostsHasMore(true);
    if (activeGroupId) {
      loadActiveGroupMembers(activeGroupId);
      loadGroupPosts(activeGroupId, false);
    } else {
      setActiveGroupMembers([]);
      setGroupPosts([]);
      setShowGroupCreatePost(false);
      setMemberSearchQuery('');
      setMemberSearchResults([]);
      setShowInfoPanel(false);
    }
  }, [activeGroupId]);

  // Yeni Grup Kurma
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !grpName.trim()) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const newGroupId = 'group_' + Math.random().toString(36).substring(2, 11);
      
      // 1. Grubu oluştur
      const grpRef = doc(db, 'groups', newGroupId);
      await setDoc(grpRef, {
        groupId: newGroupId,
        name: grpName.trim(),
        description: grpDesc.trim(),
        creatorId: currentUser.uid,
        createdAt: serverTimestamp()
      });

      // 2. Kendisini grupta 'owner' (Kurucu) olarak subcollection'a ekle
      const memberRef = doc(db, 'groups', newGroupId, 'members', currentUser.uid);
      await setDoc(memberRef, {
        userId: currentUser.uid,
        role: "owner",
        joinedAt: serverTimestamp()
      });

      setGrpName('');
      setGrpDesc('');
      setSuccessMsg(`"${grpName}" grubu başarıyla kuruldu!`);
      setShowCreateGroupForm(false);
      loadGroupsAndMemberships();
    } catch (err) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `groups`);
      } catch (e) {
        setErrorMsg("Grup kurma yetkilendirmesi başarısız oldu.");
      }
    }
  };

  // Gruba Üye Ekleme
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeGroupId || !newMemberUid.trim()) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const inputVal = newMemberUid.trim();
    let resolvedUid = inputVal;
    let userExists = false;

    try {
      // 1. Önce username ile aramayı deneyelim
      const cleanUsername = inputVal.startsWith('@') ? inputVal.slice(1).trim().toLowerCase() : inputVal.toLowerCase();
      const pRef = collection(db, 'profiles');
      const qUsername = query(pRef, where('username', '==', cleanUsername), limit(1));
      const usernameSnap = await getDocs(qUsername);
      if (!usernameSnap.empty) {
        resolvedUid = usernameSnap.docs[0].id;
        userExists = true;
      }
    } catch (err) {
      console.warn("Groups username check failed, fallback to raw UID:", err);
    }

    try {
      if (!userExists) {
        // Girilen üyenin varlığını sorgulayalım
        const profileSnap = await getDoc(doc(db, 'profiles', resolvedUid));
        if (!profileSnap.exists()) {
          setErrorMsg("Girililen Kullanıcı adı veya ID sistemde bulunamadı.");
          return;
        }
      }

      const memberRef = doc(db, 'groups', activeGroupId, 'members', resolvedUid);
      await setDoc(memberRef, {
        userId: resolvedUid,
        role: "member",
        joinedAt: serverTimestamp()
      });

      setNewMemberUid('');
      setSuccessMsg("Grup daveti yapıldı! Üye gruba başarıyla eklendi.");
      loadActiveGroupMembers(activeGroupId);
    } catch (err) {
      console.error(err);
      setErrorMsg("Üye eklenirken hata oluştu (Yetki yetersiz veya üye zaten grupta).");
      try {
        handleFirestoreError(err, OperationType.WRITE, `groups/${activeGroupId}/members/${resolvedUid}`);
      } catch (e) {
        // Fallback
      }
    }
  };

  // Gruptan Ayrılma / Grubu Silme
  const handleLeaveOrDelete = async (grp: GroupData) => {
    if (!currentUser) return;
    try {
      if (grp.creatorId === currentUser.uid) {
        // Kurucu tüm üyeleri silebilir veya grubu silebilir
        await deleteDoc(doc(db, 'groups', grp.groupId));
        setSuccessMsg("Grup başarıyla silindi.");
      } else {
        // Üye kendi üyeliğini siler
        await deleteDoc(doc(db, 'groups', grp.groupId, 'members', currentUser.uid));
        setSuccessMsg("Gruptan başarıyla ayrıldınız.");
      }
      setActiveGroupId(null);
      loadGroupsAndMemberships();
    } catch (e) {
      console.error(e);
      setErrorMsg("Gruptan ayrılırken hata oluştu.");
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto min-h-screen text-slate-100 flex flex-col font-sans select-none pb-12">
      
      {errorMsg && (
        <div className="mx-4 mt-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs py-3 px-4 rounded-2xl flex items-start gap-2 font-display">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mx-4 mt-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs py-3 px-4 rounded-2xl flex items-start gap-2 font-display animate-fade-in">
          <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* DURUM 1: GRUP SEÇİLMİŞSE (TAM EKRAN SOHBET/OYLAMA MODU) */}
      {activeGroupId ? (
        (() => {
          const grp = allGroups.find(g => g.groupId === activeGroupId);
          if (!grp) return null;
          return (
            <div className="flex flex-col flex-1 animate-fade-in">
              
              {/* Instagram Tarzı Tam Ekran Header */}
              <div className={`bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 ${isNested ? 'px-0 py-3' : 'px-4 py-3'} border-b border-slate-800/60 flex items-center justify-between select-none`}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveGroupId(null)}
                    className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/70 hover:bg-slate-900 text-slate-300 hover:text-white transition cursor-pointer"
                    title="Geri Git"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  
                  <div>
                    <h3 className="text-xs font-black tracking-wide text-slate-100 uppercase font-mono flex items-center gap-1.5">
                      🔒 {grp.name}
                    </h3>
                    <p className="text-[9px] text-slate-500 font-sans mt-0.5 lowercase">kapalı oylama grubu</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGroupCreatePost(!showGroupCreatePost);
                    }}
                    className={`p-2 rounded-xl border transition cursor-pointer ${showGroupCreatePost ? 'bg-pink-600 border-pink-500 text-white shadow-lg shadow-pink-600/20' : 'bg-slate-950/80 border-slate-800/70 text-slate-400 hover:text-white'}`}
                    title="Yeni Gönderi Oluştur"
                  >
                    <PlusCircle className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => loadGroupPosts(activeGroupId)}
                    className="p-2 rounded-xl bg-slate-950/80 border border-slate-800/70 hover:bg-slate-900 text-slate-400 hover:text-white transition cursor-pointer"
                    title="Yenile"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setShowInfoPanel(!showInfoPanel)}
                    className={`p-2 rounded-xl border transition cursor-pointer ${showInfoPanel ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-950/80 border-slate-800/70 text-slate-400 hover:text-white'}`}
                    title="Grup Bilgisi & Üyeler"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* BİLGİ VE ÜYE EKLEME/BULMA PANELİ (Info Panel) */}
              {showInfoPanel && (
                <div className="m-4 bg-slate-900/95 border border-slate-800/80 p-4 rounded-3xl flex flex-col gap-4 shadow-2xl animate-scale-up">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                    <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">Grup Bilgileri & Üyeler</span>
                    <button
                      onClick={() => setShowInfoPanel(false)}
                      className="text-[9px] text-slate-500 hover:text-slate-300 px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer"
                    >
                      Kapat
                    </button>
                  </div>

                  <div>
                    <h4 className="text-[11px] font-bold text-slate-200">Grup Açıklaması</h4>
                    <p className="text-[10px] text-slate-400 font-light mt-1 bg-slate-950/50 p-2.5 rounded-xl border border-slate-950">{grp.description || 'Açıklama belirtilmemiş.'}</p>
                    <span className="text-[8px] font-mono text-slate-600 mt-1 block">ID KODU: {grp.groupId}</span>
                  </div>

                  {/* Üyeler Listesi */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> Gruptakiler ({activeGroupMembers.length})
                    </span>
                    
                    <div className="grid grid-cols-2 gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {activeGroupMembers.map((m) => (
                        <div key={m.userId} className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-950">
                          <img src={m.photoURL} alt="Foto" className="w-4.5 h-4.5 rounded-full object-cover" referrerPolicy="no-referrer" />
                          <div className="flex-1 truncate">
                            <span className="text-[9px] font-bold text-slate-300 block truncate leading-tight">{m.displayName}</span>
                            <span className="text-[7.5px] font-mono text-slate-600">{m.role === 'owner' ? 'Kurucu' : 'Üye'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Üye Ekleme / Yeni Üye Bulma Özelliği */}
                  <div className="space-y-2 border-t border-slate-800/40 pt-3">
                    <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase block">Gelişmiş Üye Bulma & Ekle</span>
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-1.5 bg-slate-950 p-2 border border-slate-800/80 rounded-xl items-center">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <input
                          type="text"
                          placeholder="İsim, e-posta veya biyografi ile yeni üye bul..."
                          value={memberSearchQuery}
                          onChange={(e) => setMemberSearchQuery(e.target.value)}
                          className="flex-1 text-[10px] bg-transparent outline-none text-slate-200 placeholder-slate-600"
                        />
                        {memberSearchQuery && (
                          <button onClick={() => setMemberSearchQuery('')} className="text-slate-500 hover:text-slate-200">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Hızlı Arkadaş Seçimi */}
                      {memberSearchQuery.trim() === '' && friends.length > 0 && (
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-[8px] font-mono text-slate-500 mr-1">Hızlı Ekle:</span>
                          {friends.slice(0, 5).map(f => {
                            const isAlreadyIn = activeGroupMembers.some(m => m.userId === f.uid);
                            if (isAlreadyIn) return null;
                            return (
                              <button
                                key={f.uid}
                                onClick={() => handleAddDirectMember(f.uid)}
                                className="text-[8px] font-mono bg-slate-950 border border-slate-800 hover:border-violet-500 px-2 py-0.5 rounded-full text-slate-400 hover:text-white transition"
                              >
                                + {f.name}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Arama Sonuçları */}
                      {memberSearchQuery.trim() !== '' && (
                        <div className="bg-slate-950/80 rounded-xl border border-slate-850 p-1.5 max-h-36 overflow-y-auto space-y-1">
                          {searchingMembers ? (
                            <p className="text-[9px] text-slate-500 italic text-center py-2 animate-pulse font-mono">aranıyor...</p>
                          ) : memberSearchResults.length === 0 ? (
                            <p className="text-[9px] text-slate-500 italic text-center py-2">Eşleşen üye bulunamadı.</p>
                          ) : (
                            memberSearchResults.map((user) => (
                              <div
                                key={user.uid}
                                onClick={() => handleAddDirectMember(user.uid)}
                                className="p-1.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-violet-500/50 rounded-lg cursor-pointer transition flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <img src={user.photoURL} alt="Foto" className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
                                  <div className="truncate">
                                    <h4 className="text-[9px] font-bold text-slate-200 truncate leading-tight">{user.displayName}</h4>
                                    <p className="text-[7.5px] text-slate-500 truncate leading-none mt-0.5">{user.email || 'E-posta gizli'}</p>
                                  </div>
                                </div>
                                <span className="text-[7px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">DAVET ET / EKLE</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gruptan Çık / Grubu Sil */}
                  <div className="border-t border-slate-800/40 pt-2.5 flex justify-end">
                    <button
                      onClick={() => {
                        if (window.confirm("Bu gruptan çıkmak/silmek istediğinizden emin misiniz?")) {
                          handleLeaveOrDelete(grp);
                        }
                      }}
                      className="text-[9px] font-display font-bold text-rose-400 hover:text-rose-300 uppercase flex items-center gap-1 cursor-pointer bg-rose-500/5 border border-rose-500/15 px-3 py-1 rounded-xl"
                    >
                      <Trash className="w-3 h-3" />
                      {grp.creatorId === currentUser.uid ? 'Bu Kapalı Grubu İmha Et' : 'Bu Gruptan Güvenle Çık'}
                    </button>
                  </div>
                </div>
              )}

              {showGroupCreatePost ? (
                <CreatePostPage
                  defaultGroupId={activeGroupId}
                  onSuccess={() => {
                    setShowGroupCreatePost(false);
                    loadGroupPosts(activeGroupId);
                  }}
                  onCancel={() => {
                    setShowGroupCreatePost(false);
                  }}
                />
              ) : (
                /* ANA GÖNDERİ AKIŞI VE GÖNDERİ PAYLAŞMA ALANI */
                <div className={`flex-1 ${isNested ? 'px-0 py-4' : 'p-4'} flex flex-col gap-4`}>
                  
                  {/* Firestore Index Warning Banner */}
                  {indexErrorUrl && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-2xl flex flex-col gap-2 font-sans text-xs animate-fade-in">
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0 animate-pulse" />
                        <div>
                          <p className="font-bold">⚠️ Firestore Dizin Eksikliği Tespit Edildi (Üretim Modu)</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                            Bu kapalı grubun gönderilerinin hızlı ve sıralı çalışabilmesi için Firebase'de bir indeks (dizin) oluşturulmalıdır. 
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

                  {/* GRUP İÇİ AKIŞ (POSTLAR) */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-slate-900 select-none">
                      <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        🔒 KAPALI GRUP AKIŞI ({groupPosts.length})
                      </span>
                    </div>

                    {groupPostsLoading ? (
                      <div className="flex justify-center items-center py-16">
                        <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : groupPosts.length === 0 ? (
                      <div className="p-12 bg-slate-900/10 border border-slate-800/40 rounded-3xl text-center text-xs text-slate-500 italic select-none">
                        Bu grupta henüz oylama paylaşılmamış. İlk oylamayı başlatabilirsiniz!
                      </div>
                    ) : (
                      <>
                        {groupPosts.map((gp) => (
                          <VotingCard
                            key={gp.postId}
                            post={gp}
                            onPostDeleted={() => {
                              setGroupPosts(prev => prev.filter(p => p.postId !== gp.postId));
                            }}
                          />
                        ))}

                        {groupPostsHasMore && (
                          <div className="flex justify-center pt-2 pb-6">
                            <button
                              type="button"
                              onClick={() => loadGroupPosts(activeGroupId, true)}
                              disabled={loadingMoreGroupPosts}
                              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500/10 to-indigo-500/10 hover:from-pink-600 hover:to-indigo-600 border border-pink-500/20 text-pink-300 hover:text-white text-[10px] font-bold tracking-wider uppercase transition-all duration-300 active:scale-95 cursor-pointer flex items-center gap-1.5"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${loadingMoreGroupPosts ? 'animate-spin' : ''}`} />
                              {loadingMoreGroupPosts ? 'Yükleniyor...' : 'Daha Fazla Göster'}
                            </button>
                          </div>
                        )}
                        {!groupPostsHasMore && groupPosts.length > 0 && (
                          <p className="text-center text-[9px] text-slate-600 font-mono py-6 lowercase select-none">
                            tüm kapalı grup oylamalarını inceledin! 🔒
                          </p>
                        )}
                      </>
                    )}
                  </div>

                </div>
              )}

            </div>
          );
        })()
      ) : (
        /* DURUM 2: GRUP SEÇİLMEMİŞSE (GRUP LİSTESİ VE GRUP OLUŞTURMA MODU) */
        <div className="px-4 flex flex-col gap-6 animate-fade-in">
          
          {/* 1. Grup Oluşturma Formu (Buton veya Form görünümü) */}
          <div className="bg-[#18181B] dark:bg-[#12071f]/80 border border-white/5 dark:border-violet-950/45 rounded-3xl p-4 mt-2">
            {!showCreateGroupForm ? (
              <button
                onClick={() => setShowCreateGroupForm(true)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-650 hover:from-violet-500 hover:to-indigo-505 text-white font-bold text-xs font-display py-3 rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/10 uppercase tracking-wider"
              >
                <Sparkles className="w-4 h-4 text-pink-300 animate-pulse" />
                Yeni Kapalı Grup Kur
              </button>
            ) : (
              <div className="animate-scale-up">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-slate-300 font-display uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
                    Yeni Kapalı Grup Kur
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowCreateGroupForm(false)}
                    className="text-[10px] text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer"
                  >
                    Vazgeç
                  </button>
                </div>
                <form onSubmit={handleCreateGroup} className="flex flex-col gap-3">
                  <input
                    required
                    type="text"
                    placeholder="Grup Adı (Örn: Hediye Kararı veya Tasarım Seçimleri)"
                    value={grpName}
                    onChange={(e) => setGrpName(e.target.value)}
                    maxLength={60}
                    className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl p-2.5 outline-none text-slate-200 transition font-medium text-white"
                  />
                  <input
                    type="text"
                    placeholder="Açıklama (Örn: Bu gruptaki oylamalar sadece üyelere açıktır.)"
                    value={grpDesc}
                    onChange={(e) => setGrpDesc(e.target.value)}
                    maxLength={120}
                    className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl p-2.5 outline-none text-slate-200 transition font-medium text-white"
                  />
                  <button
                    type="submit"
                    disabled={!grpName.trim()}
                    className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs font-display py-2.5 rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    Özel Grubu Oluştur
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* 2. Özel Gruplarım Listesi */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 font-display uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-indigo-400" />
                Üyesi Olduğum Kapalı Gruplar
              </h3>
              <button 
                type="button"
                onClick={loadGroupsAndMemberships}
                className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 bg-slate-950 px-2 py-1.5 rounded-xl border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition font-sans"
                title="Grupları Yenile"
              >
                <RefreshCw className="w-3 h-3" />
                Yenile
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-16">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : allGroups.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-800/40 rounded-2xl p-8 text-center text-slate-500 text-xs italic leading-relaxed">
                Henüz üye olduğun hiçbir özel grup bulunmuyor. Yukarıdan bir tane oluşturarak başlayabilirsin!
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {allGroups.map((grp) => (
                  <div 
                    key={grp.groupId}
                    onClick={() => setActiveGroupId(grp.groupId)}
                    className="bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800/70 hover:border-violet-500/60 rounded-2xl p-4 transition duration-300 flex justify-between items-center cursor-pointer transform hover:-translate-y-0.5"
                  >
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-200 uppercase tracking-wide flex items-center gap-1">
                        🔒 {grp.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-light mt-1">{grp.description || 'Açıklama belirtilmemiş'}</p>
                      <span className="text-[8.5px] text-slate-650 font-mono mt-1.5 block">KOD: {grp.groupId}</span>
                    </div>
                    
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900/10 border border-slate-800/40 p-4 rounded-3xl text-center text-[10px] text-slate-500 leading-relaxed font-sans">
            🔒 Özel oluşturduğun grupların ID kodlarını arkadaşlarına göndererek onları ekleyebilir, oylamaları sadece kendi çevrene özel tutabilirsin.
          </div>
        </div>
      )}

    </div>
  );
};
