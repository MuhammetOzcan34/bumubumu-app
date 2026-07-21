import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, writeBatch, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Bell, X, Check, CheckCheck, MessageSquare, UserCheck, UserPlus, Trash2, Sparkles, Inbox, Trophy } from 'lucide-react';

interface NotificationItem {
  notificationId: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  type: 'follow' | 'vote' | 'comment' | 'message';
  postId?: string;
  postTitle?: string;
  votedOption?: 'A' | 'B';
  commentText?: string;
  read: boolean;
  createdAt: any;
}

interface NotificationsCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToPost?: (postId: string) => void;
}

export const NotificationsCenter: React.FC<NotificationsCenterProps> = ({ isOpen, onClose, onNavigateToPost }) => {
  const { currentUser, userData } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Bildirimleri bir kere çek (onSnapshot yerine - Instagram usulü!)
  useEffect(() => {
    if (!currentUser || !isOpen) return;

    setLoading(true);
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(40)
    );

    getDocs(q).then((snapshot) => {
      const fetched: NotificationItem[] = [];
      snapshot.forEach((doc) => {
        fetched.push({ notificationId: doc.id, ...doc.data() } as NotificationItem);
      });
      setNotifications(fetched);
      setLoading(false);
    }).catch((error) => {
      console.error("Bildirimler dinlenirken hata:", error);
      setLoading(false);
    });
  }, [currentUser, isOpen]);

  // 2. Takip edilen kullanıcıların ID listesini bir kere çek (onSnapshot yerine - Instagram usulü!)
  useEffect(() => {
    if (!currentUser || !isOpen) return;

    const q = query(collection(db, 'follows'), where('followerId', '==', currentUser.uid));
    getDocs(q).then((snapshot) => {
      const ids: string[] = [];
      snapshot.forEach((doc) => {
        ids.push(doc.data().followingId);
      });
      setFollowingIds(ids);
    }).catch((error) => {
      console.error("Takip verileri dinlenirken hata:", error);
    });
  }, [currentUser, isOpen]);

  // 3. Tekil bildirimi okundu işaretle (Yerel durum güncellemeli)
  const handleMarkAsRead = async (notification: NotificationItem) => {
    try {
      // Yerel durumu hemen güncelle (Optimistic update)
      setNotifications(prev => prev.map(n => n.notificationId === notification.notificationId ? { ...n, read: true } : n));
      
      // Global bildirim sayısını güncellemek için event fırlat
      window.dispatchEvent(new CustomEvent('notification-read-updated'));

      const notifRef = doc(db, 'notifications', notification.notificationId);
      await updateDoc(notifRef, { read: true });

      if (notification.postId && onNavigateToPost) {
        onNavigateToPost(notification.postId);
      }
    } catch (err) {
      console.error("Bildirim güncellenemedi:", err);
    }
  };

  // 4. Tüm bildirimleri okundu işaretle (Yerel durum güncellemeli)
  const handleMarkAllRead = async () => {
    const unreadNotifs = notifications.filter(n => !n.read);
    if (unreadNotifs.length === 0) return;

    try {
      // Yerel durumu hemen güncelle (Optimistic update)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      
      // Global bildirim sayısını güncellemek için event fırlat
      window.dispatchEvent(new CustomEvent('notification-read-updated'));

      const batch = writeBatch(db);
      unreadNotifs.forEach(n => {
        const ref = doc(db, 'notifications', n.notificationId);
        batch.update(ref, { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Bildirimler toplu güncellenemedi:", err);
    }
  };

  // 5. Bildirimi sil / kaldır (Yerel durum güncellemeli)
  const handleDeleteNotification = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    try {
      // Yerel durumu hemen güncelle (Optimistic update)
      setNotifications(prev => prev.filter(n => n.notificationId !== notifId));
      
      // Global bildirim sayısını güncellemek için event fırlat
      window.dispatchEvent(new CustomEvent('notification-read-updated'));

      const notifRef = doc(db, 'notifications', notifId);
      await deleteDoc(notifRef);
    } catch (err) {
      console.error("Bildirim silinemedi:", err);
    }
  };

  // 6. Geri Takip Et / Takibi Bırak işlemi (Yerel durum güncellemeli)
  const handleFollowToggle = async (e: React.MouseEvent, targetUserId: string, targetName: string, targetPhoto: string) => {
    e.stopPropagation();
    if (!currentUser) return;

    const isFollowing = followingIds.includes(targetUserId);
    const followId = `${currentUser.uid}_${targetUserId}`;
    const followDocRef = doc(db, 'follows', followId);

    // Yerel durumu hemen güncelle (Optimistic update)
    if (isFollowing) {
      setFollowingIds(prev => prev.filter(id => id !== targetUserId));
    } else {
      setFollowingIds(prev => [...prev, targetUserId]);
    }

    try {
      if (isFollowing) {
        await deleteDoc(followDocRef);
        // Takip silindiği için takip bildirimini de kaldır
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
          followingName: targetName,
          followingPhoto: targetPhoto,
          createdAt: serverTimestamp()
        });

        // Yeni takip bildirimini karşı tarafa ekle
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
        } catch (err) {}
      }
    } catch (err) {
      console.error("Takip tetiklenirken hata oluştu:", err);
      // Hata durumunda yerel durumu geri al
      if (isFollowing) {
        setFollowingIds(prev => [...prev, targetUserId]);
      } else {
        setFollowingIds(prev => prev.filter(id => id !== targetUserId));
      }
    }
  };

  // Zaman Formatlayıcı Yardımcı Fonksiyon
  const formatTime = (createdAt: any) => {
    if (!createdAt) return 'Az önce';
    const postTime = createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date();
    const diffMs = new Date().getTime() - postTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} sa önce`;
    return `${diffDays} gün önce`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none" id="notifications-overlay">
      {/* Arka Plan Filtresi */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        {/* Yan Menü (Slide-over) Gövdesi */}
        <div className="w-screen max-w-md bg-[#0F0A18] border-l border-white/5 shadow-2xl flex flex-col h-full animate-fade-in relative z-10">
          
          {/* Header */}
          <div className="px-4 pt-[calc(16px+env(safe-area-inset-top))] pb-4 border-b border-white/5 flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-pink-600/10 border border-pink-500/20 flex items-center justify-center">
                <Bell className="w-4 h-4 text-[#E1306C]" />
              </div>
              <h2 className="text-sm font-black tracking-wide font-display text-white">BİLDİRİMLER</h2>
            </div>
            
            <div className="flex items-center gap-2">
              {notifications.some(n => !n.read) && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] bg-[#E1306C]/10 hover:bg-[#E1306C]/20 border border-[#E1306C]/30 text-pink-400 font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer font-sans"
                  title="Tümünü okundu olarak işaretle"
                >
                  <CheckCheck className="w-3   h-3" />
                  Hepsini Oku
                </button>
              )}
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-white/5 border border-white/5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* İçerik */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-6 h-6 border-2 border-[#E1306C] border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">Yükleniyor...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-900/40 border border-slate-800/40 flex items-center justify-center text-slate-600">
                  <Inbox className="w-8 h-8 text-slate-500" />
                </div>
                <div className="max-w-xs">
                  <h3 className="text-xs font-bold text-slate-300 font-display">Bildirim Bulunmuyor</h3>
                  <p className="text-[10px] text-slate-500 font-display mt-1 leading-relaxed">
                    Etkileşimlerin burada görünür. Diğer üyelerin ikili karşılaştırma sorularına katılarak popülariteni artırabilirsin!
                  </p>
                </div>
              </div>
            ) : (
              notifications.map((n) => {
                const isFollowingSender = followingIds.includes(n.senderId);
                
                return (
                  <div
                    key={n.notificationId}
                    onClick={() => handleMarkAsRead(n)}
                    className={`p-3 rounded-2xl border transition duration-300 flex items-start gap-3 cursor-pointer ${
                      n.read 
                        ? 'bg-slate-900/10 border-white/5 opacity-70' 
                        : 'bg-[#1D122D]/60 border-[#E1306C]/20 shadow-[0_2px_12px_rgba(225,48,108,0.05)]'
                    } hover:bg-[#1D122D]/90`}
                  >
                    
                    {/* Gönderen Profil Fotoğrafı */}
                    <div className="relative flex-shrink-0">
                      <img
                        src={n.senderPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${n.senderId}`}
                        alt={n.senderName}
                        className="w-9 h-9 rounded-full border border-white/10 object-cover bg-neutral-900"
                        referrerPolicy="no-referrer"
                      />
                      <div className={`absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full flex items-center justify-center border border-[#0F0A18] ${
                        n.type === 'follow' ? 'bg-pink-600' : n.type === 'vote' ? 'bg-amber-600' : 'bg-violet-600'
                      }`}>
                        {n.type === 'follow' ? (
                          <UserCheck className="w-2.5 h-2.5 text-white" />
                        ) : n.type === 'vote' ? (
                          <Trophy className="w-2.5 h-2.5 text-white" />
                        ) : (
                          <MessageSquare className="w-2.5 h-2.5 text-white" />
                        )}
                      </div>
                    </div>

                    {/* Veriler */}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="text-xs text-gray-200 font-display leading-tight">
                        <span className="font-bold text-pink-300">{n.senderName}</span>
                        {n.type === 'follow' && ' seni takip etmeye başladı.'}
                        {n.type === 'vote' && (
                          <>
                            {' gönderine oy verdi: '}
                            <span className="font-semibold text-gray-400 italic">"{n.postTitle}"</span>
                            <span className="ml-1.5 text-[8px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-extrabold tracking-wider font-mono uppercase inline-block">
                              {n.votedOption === 'A' ? 'A' : 'B'}
                            </span>
                          </>
                        )}
                        {n.type === 'comment' && (
                          <>
                            {' gönderine yorum yaptı: '}
                            <span className="font-semibold text-gray-400 italic">"{n.postTitle}"</span>
                          </>
                        )}
                      </div>

                      {/* Bildirim Detayı Görünümü (Varsa yorum) */}
                      {n.type === 'comment' && n.commentText && (
                        <div className="mt-1.5 p-2 bg-black/45 border border-white/5 rounded-xl text-[10px] text-gray-300 font-display line-clamp-2 italic">
                          <span className="block font-sans text-[8px] font-bold text-indigo-400 uppercase tracking-widest mb-0.5">YORUM</span>
                          "{n.commentText}"
                        </div>
                      )}

                      {/* Zaman ve Hızlı Aksiyonlar */}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] text-gray-500 font-mono">{formatTime(n.createdAt)}</span>
                        
                        <div className="flex items-center gap-1.5">
                          {/* Geri Takip Aksiyonu */}
                          {n.type === 'follow' && (
                            <button
                              onClick={(e) => handleFollowToggle(e, n.senderId, n.senderName, n.senderPhoto)}
                              className={`text-[9px] px-2.5 py-1 rounded-full font-bold uppercase transition duration-250 cursor-pointer ${
                                isFollowingSender
                                  ? 'bg-transparent text-gray-400 border border-white/5 hover:bg-white/5'
                                  : 'bg-gradient-to-r from-pink-600 to-purple-600 hover:brightness-110 text-white font-black'
                              }`}
                            >
                              {isFollowingSender ? 'Takip Ediliyor' : 'Geri Takip Et'}
                            </button>
                          )}

                          {/* Silme Butonu */}
                          <button
                            onClick={(e) => handleDeleteNotification(e, n.notificationId)}
                            className="p-1 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg transition cursor-pointer"
                            title="Yoksay"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Okunmamış İşareti */}
                    {!n.read && (
                      <div className="w-1.5 h-1.5 bg-[#E1306C] rounded-full mt-1.5 flex-shrink-0 animate-ping" />
                    )}

                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bilgisi */}
          <div className="p-3 border-t border-white/5 text-center bg-black/30 select-none">
            <span className="text-[9px] text-slate-500 font-sans tracking-tight">
              ⚡ Bu mu? • Tüm Hakları Saklıdır © 2026
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};
