/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FeedPage } from './pages/FeedPage';
import { CreatePostPage } from './pages/CreatePostPage';
import { GroupsPage } from './pages/GroupsPage';
import { AgendaPage } from './pages/AgendaPage';
import { DmPage } from './pages/DmPage';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { ProfilePage } from './pages/ProfilePage';
import { VotingCard } from './components/VotingCard';
import { BumuLogo } from './components/BumuLogo';
import { db } from './lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { PostData } from './types';
import { 
  Compass, Flame, Users, PlusCircle, MessageSquare, ShieldAlert,
  User, Sparkles, Moon, Sun, Monitor, AlertCircle, RefreshCw, Key, HelpCircle, Bell
} from 'lucide-react';
import { NotificationsCenter } from './components/NotificationsCenter';

export const BrandLogoComponent: React.FC<{ size?: 'sm' | 'md' | 'lg', active?: boolean, className?: string }> = ({ size = 'md', active = false, className = '' }) => {
  const sizeMap: { [key: string]: 'xs' | 'sm' | 'md' | 'lg' | 'xl' } = {
    sm: 'xs',
    md: 'sm',
    lg: 'lg'
  };

  return (
    <BumuLogo 
      size={sizeMap[size] || 'sm'} 
      className={`shadow-md hover:scale-105 active:scale-95 transition-transform duration-200 cursor-pointer ${active ? 'ring-2 ring-pink-500 ring-offset-2 ring-offset-[#0A0A0C]' : ''} ${className}`} 
    />
  );
};

function AppContent() {
  const { currentUser, userData, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const sessionStartTime = useRef<number>(Date.now());
  
  // Canlı Sunucu Otomatik Yönlendirme (Redirect) Mantığı
  useEffect(() => {
    const hostname = window.location.hostname;
    const isDevOrPreview = 
      hostname === 'localhost' || 
      hostname === '127.0.0.1' || 
      hostname.startsWith('ais-dev-') || 
      hostname.startsWith('ais-pre-');
      
    if (!isDevOrPreview && hostname !== 'bumubumu-service-865374160634.europe-west1.run.app') {
      const targetUrl = "https://bumubumu-service-865374160634.europe-west1.run.app" + window.location.pathname + window.location.search;
      window.location.href = targetUrl;
    }
  }, []);

  // Görünüm / Sayfa Yönetimi
  const [activeView, setActiveView] = useState<'feed' | 'agenda' | 'create' | 'groups' | 'dm' | 'admin' | 'profile'>('feed');
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  
  // Global Navigasyon Dinleyicisi
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.view) {
        setActiveView(customEvent.detail.view);
      }
    };
    window.addEventListener('navigate', handleNavigation);
    return () => window.removeEventListener('navigate', handleNavigation);
  }, []);
  
  // Bildirim Merkezi State'leri
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Okunmamış bildirim sayısı yükleyici ve Canlı PWA Bildirim Entegrasyonu
  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      if ('clearAppBadge' in navigator) {
        navigator.clearAppBadge().catch(() => {});
      }
      return;
    }

    const cacheKey = `bumu_unread_count_${currentUser.uid}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setUnreadCount(Number(cached));
    }

    // Gerçek zamanlı bildirim dinleyicisi (onSnapshot)
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.size;
      setUnreadCount(count);
      localStorage.setItem(cacheKey, String(count));

      // 1. App Badging API Entegrasyonu (Simge Rozeti)
      const isBadgingEnabled = localStorage.getItem('bumubumu_badge_enabled') !== 'false';
      if (isBadgingEnabled && 'setAppBadge' in navigator) {
        if (count > 0) {
          navigator.setAppBadge(count).catch(err => console.warn("Badge set error:", err));
        } else {
          navigator.clearAppBadge().catch(err => console.warn("Badge clear error:", err));
        }
      }

      // 2. Canlı PWA Bildirimleri Gönderme
      // Sadece sayfa yüklendikten sonra gelen yeni (okunmamış) bildirimleri tespit et
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const createdAt = data.createdAt;
          let isNew = false;
          
          if (createdAt) {
            const timestampMs = createdAt.seconds ? createdAt.seconds * 1000 : createdAt;
            // 5 saniyelik toleransla session başlangıcından sonrasını kontrol et
            isNew = timestampMs > sessionStartTime.current - 5000;
          } else {
            // Firestore iyimser yazma durumunda createdAt henüz gelmemiş olabilir, yeni kabul et
            isNew = true;
          }

          if (isNew && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            let title = 'BumuBumu';
            let body = '';

            if (data.type === 'follow') {
              title = 'Yeni Takipçi! 👋';
              body = `${data.senderName} seni takip etmeye başladı.`;
            } else if (data.type === 'vote') {
              title = 'Yeni Oy Kullanıldı! 🗳️';
              body = `${data.senderName} gönderine oy verdi: "${data.postTitle || 'İkili Karşılaştırma'}"`;
            } else if (data.type === 'comment') {
              title = 'Yeni Yorum Yapıldı! 💬';
              body = `${data.senderName} gönderine yazdı: "${data.commentText || ''}"`;
            } else if (data.type === 'message') {
              title = 'Yeni Mesaj! ✉️';
              body = `${data.senderName}: ${data.messageText || 'sana bir mesaj yazdı.'}`;
            }

            if (body) {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then((registration) => {
                  registration.showNotification(title, {
                    body: body,
                    icon: '/logo_v5.png',
                    badge: '/logo_v5.png',
                    vibrate: [200, 100, 200],
                    tag: change.doc.id,
                    data: { url: '/' }
                  } as any);
                });
              } else if (typeof Notification !== 'undefined') {
                new Notification(title, {
                  body: body,
                  icon: '/logo_v5.png'
                });
              }
            }
          }
        }
      });
    }, (error) => {
      console.warn("Gerçek zamanlı bildirim sayısı alınamadı:", error);
    });

    const triggerManualCountFetch = async () => {
      try {
        const snapshot = await getDocs(q);
        setUnreadCount(snapshot.size);
        localStorage.setItem(cacheKey, String(snapshot.size));
      } catch (err) {}
    };

    // Diğer bileşenler bildirim durumunu el ile değiştirdiğinde tetiklenir
    window.addEventListener('notification-read-updated', triggerManualCountFetch);
    return () => {
      unsubscribe();
      window.removeEventListener('notification-read-updated', triggerManualCountFetch);
    };
  }, [currentUser]);

  // Tema State'i (Karanlık/Aydınlık MOD)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // En üst seviye HTML elementini tema durumuna göre sınıflarla güncelle
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Sayfa geçişlerinde ekranı en üste kaydır
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeView]);

  // Deep Link State (Arkadaşına Sor Entegrasyonu)
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null);
  const [deepLinkPost, setDeepLinkPost] = useState<PostData | null>(null);
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);

  // Giriş/Üyelik Modu seçimi
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Derin link çözümleme kontrolü
  useEffect(() => {
    const checkDeepLink = async () => {
      // url path incelemesi (örn: /gonderi/post_123) veya query param incelemesi (?gonderi=post_123)
      const pathname = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      
      let pId = searchParams.get('gonderi');
      
      if (!pId && pathname.includes('/gonderi/')) {
        pId = pathname.split('/gonderi/')[1];
      }

      if (pId) {
        setDeepLinkId(pId);
        setDeepLinkLoading(true);
        try {
          const docSnap = await getDoc(doc(db, 'posts', pId));
          if (docSnap.exists()) {
            setDeepLinkPost({ postId: docSnap.id, ...docSnap.data() } as PostData);
          }
        } catch (err) {
          console.error("Deep link döküman çekim hatası:", err);
        } finally {
          setDeepLinkLoading(false);
        }
      }
    };
    
    checkDeepLink();
  }, []);

  // E-posta ile giriş
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!authEmail || !authPass) return;

    try {
      if (authMode === 'signin') {
        await signInWithEmail(authEmail, authPass);
      } else {
        if (!authName.trim()) {
          setAuthError("Lütfen adınızı girin.");
          return;
        }
        await signUpWithEmail(authEmail, authPass, authName);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('auth/configuration-not-found')) {
        setAuthError("Firebase Email/Password sağlayıcısı aktif edilmemiş olabilir. Lütfen Google Girişi deneyiniz.");
      } else {
        setAuthError("Kimlik doğrulama başarısız. Lütfen bilgilerinizi kontrol ediniz.");
      }
    }
  };

  // Tanıtım Seçeneğiyle Giriş (Ortak demo kullanımı için)
  const handleDemoLogin = async () => {
    setAuthError(null);
    try {
      await signInWithEmail("demo@bumu.com", "bumudemo123");
    } catch (err: any) {
      console.error("Tanıtım girişi hatası:", err);
      setAuthError(err.message || "Kimlik doğrulama başarısız.");
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-slate-950 flex flex-col justify-center items-center font-sans">
        <BrandLogoComponent size="lg" className="animate-bounce mb-3" />
        <h2 className="text-sm font-extrabold text-slate-300 font-display tracking-widest animate-pulse">BU? HAZIRLANIYOR...</h2>
      </div>
    );
  }

  // Deep Link Görünümü (Arkadaşına Sor Deep Link Açılış Ekranı)
  if (deepLinkId) {
    return (
      <div className={`w-full min-h-screen font-sans ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-zinc-50 text-slate-900'} p-4 flex flex-col gap-4 max-w-lg mx-auto`}>
        <div className="flex justify-between items-center py-2 border-b border-slate-800/40 select-none">
          <div className="flex items-center gap-1.5">
            <BrandLogoComponent size="md" />
            <h1 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-amber-300 font-display">BU? DAVETİ</h1>
          </div>
          
          <button 
            onClick={() => {
              setDeepLinkId(null);
              setDeepLinkPost(null);
              // reset url in browser silently
              window.history.pushState({}, '', '/');
            }}
            className="text-xs font-display px-3 py-1 bg-slate-900 border border-slate-800 text-slate-200 rounded-lg cursor-pointer transition hover:bg-slate-800"
          >
            Ana Akışa Git
          </button>
        </div>

        {deepLinkLoading ? (
          <div className="flex justify-center items-center py-32">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : deepLinkPost ? (
          <div className="space-y-4">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-display rounded-2xl flex items-start gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0 animate-pulse" />
              <span>Bir arkadaşınız, bu ikili karşılaşmada oylarınızı ve görüşlerinizi öğrenmek için sizi Bu?'a çağırdı! Oy vererek dahil olabilirsiniz.</span>
            </div>
            
            <VotingCard 
              post={deepLinkPost} 
              onPostDeleted={() => setDeepLinkPost(null)}
            />
          </div>
        ) : (
          <div className="bg-slate-900/10 border border-slate-800/40 rounded-3xl p-12 text-center text-slate-500 font-display text-xs">
            Aradığınız Bu? davet linki geçersiz veya kaldırılmış olabilir.
          </div>
        )}
      </div>
    );
  }

  // Ziyaretçiler sadece feed ve radar/gündem sayfasını inceleyebilir.
  const requiresAuthView = activeView === 'create' || activeView === 'groups' || activeView === 'dm' || activeView === 'admin' || activeView === 'profile';
  const showLoginOverlay = requiresAuthView && !currentUser;

  return (
    <div className={`w-full min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} transition-colors duration-300 flex flex-col font-sans select-none pb-12`}>
      
      {/* ÜST BARAJER / HEADER */}
      <header className={`sticky top-0 z-40 px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3 border-b backdrop-blur-md flex items-center justify-between ${theme === 'dark' ? 'bg-slate-950/80 border-slate-900/60' : 'bg-white/80 border-slate-200/60'}`}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveView('feed')}>
          <BrandLogoComponent size="sm" />
          <h1 className="text-md font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-violet-500 via-indigo-400 to-amber-500 font-display">
            Bu mu?
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Admin Kısayol Rozeti (Sadece Adminlere görünür) */}
          {currentUser && userData?.role === 'admin' && (
            <button
              onClick={() => setActiveView('admin')}
              id="header-admin-btn"
              className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-mono font-black tracking-widest uppercase rounded-full bg-violet-600 hover:bg-violet-500 text-white cursor-pointer"
            >
              👑 ADMİN
            </button>
          )}

          {/* Bildirimler Butonu (Sadece Giriş Yapmış Kullanıcılar İçin) */}
          {currentUser && (
            <button
              onClick={() => setIsNotificationsOpen(true)}
              id="header-notifications-btn"
              className="p-1.5 rounded-full transition cursor-pointer bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-pink-500 relative flex items-center justify-center"
              title="Bildirimler"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#E1306C] text-[8px] font-mono font-bold text-white rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )}

          {/* Tema Değiştirici Buton */}
          <button
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            id="theme-toggler"
            className="p-1.5 rounded-full transition cursor-pointer bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-amber-400"
            title="Temayı Değiştir"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ANA İÇERİK EKRANI */}
      <main className="flex-1 w-full max-w-lg mx-auto">
        {showLoginOverlay ? (
          /* ÜYE OLMASI GEREKEN DETAYLARDA GÖSTERİLEN GİRİŞ PLATFORMU */
          <div className="p-4 flex flex-col gap-5 mt-4 min-h-[70vh] justify-center">
            
            <div className="text-center">
              <Key className="w-10 h-10 text-indigo-400 mx-auto animate-bounce mb-3" />
              <h2 className="text-lg font-black uppercase tracking-wide">ETKİLEŞİME GEÇİN</h2>
              <p className="text-xs text-slate-500 font-mono mt-1 leading-normal lowercase max-w-xs mx-auto">
                gönderi oluşturmak, özel grup kurmak, oylara katılmak veya anlık DM göndermek için üye olun veya giriş yapın
              </p>
            </div>

            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono rounded-2xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3.5 bg-slate-900/40 p-5 rounded-3xl border border-slate-800/60">
              
              {/* Tanıtım / Demo Giriş Seçeneği */}
              <div className="p-3.5 bg-violet-600/10 border border-violet-500/20 rounded-2xl flex flex-col gap-2 shadow-inner mb-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-violet-400 font-display">
                  <Sparkles className="w-4 h-4 animate-pulse text-[#E1306C]" />
                  <span>Sistemi En Hızlı Şekilde Deneyin</span>
                </div>
                <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                  Hesap açmakla uğraşmadan tüm özellikleri (Karşılaştırma Yapma, Özel Gruplar, Anlık DM, Bildirimler vb.) görmek için ortak tanıtım hesabıyla anında giriş yapabilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  id="demo-auth-btn"
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 hover:brightness-110 text-white font-display font-black text-[10px] tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5 uppercase shadow-lg shadow-pink-600/10"
                >
                  ⚡ TANITIM HESABI İLE TEK TIKLA GİRİŞ
                </button>
                <div className="text-[9px] text-slate-500 font-mono text-center bg-black/20 p-1 rounded-md">
                  Giriş Bilgileri: <span className="text-violet-300">demo@bumu.com</span> / Şifre: <span className="text-pink-300">bumudemo123</span>
                </div>
              </div>

              <div className="text-center font-mono text-[9px] text-slate-600 py-1 uppercase tracking-widest">— VEYA KENDİ BİLGİLERİNİZLE —</div>

              {authMode === 'signup' && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Görünen Ad</span>
                  <input
                    required
                    type="text"
                    placeholder="Adınız veya Kullanıcı Adınız..."
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 p-2.5 rounded-xl outline-none"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase">E-Posta Adresi</span>
                <input
                  required
                  type="email"
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 p-2.5 rounded-xl outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase">Şifre</span>
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 p-2.5 rounded-xl outline-none"
                />
              </div>

              <button
                type="submit"
                id="email-auth-submit"
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs tracking-wider cursor-pointer transition shadow-md"
              >
                {authMode === 'signin' ? 'E-POSTA İLE GİRİŞ YAP' : 'E-POSTA İLE ÜYE OL'}
              </button>

              <div className="text-center font-mono text-[10px] text-slate-500 py-0.5">VEYA</div>

              {/* Google Giriş Butonu */}
              <button
                type="button"
                onClick={signInWithGoogle}
                id="google-auth-btn"
                className="w-full py-3 rounded-xl bg-slate-950 hover:bg-slate-900 text-slate-300 font-bold border border-slate-800 text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
              >
                <span className="text-sm">🔑</span> Google Hesabı ile Giriş Yap
              </button>

              <div className="text-center mt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(prev => prev === 'signin' ? 'signup' : 'signin');
                    setAuthError(null);
                  }}
                  className="text-[10px] font-mono font-bold text-violet-400 hover:underline cursor-pointer"
                >
                  {authMode === 'signin' ? 'Yeni hesap oluştur (Üye Ol)' : 'Hesabınız var mı? Giriş Yapın'}
                </button>
              </div>

            </form>
          </div>
        ) : (
          /* Normal Sayfalar */
          <>
            {activeView === 'feed' && (
              <FeedPage 
                highlightPostId={highlightPostId} 
                onClearHighlight={() => setHighlightPostId(null)} 
              />
            )}
            {activeView === 'agenda' && <AgendaPage />}
            {activeView === 'create' && <CreatePostPage onSuccess={() => setActiveView('feed')} />}
            {activeView === 'groups' && <GroupsPage />}
            {activeView === 'dm' && <DmPage />}
            {activeView === 'admin' && <AdminPanelPage />}
            {activeView === 'profile' && <ProfilePage />}
          </>
        )}
      </main>

      {/* MOBİL ÖNCELİKLİ BULLETPROOF TAB GEZİNME BARUTU */}
      <nav className={`fixed bottom-0 left-0 right-0 z-40 border-t ${theme === 'dark' ? 'bg-slate-950/95 border-slate-900/80 text-slate-400' : 'bg-white/95 border-slate-200 text-slate-500'} flex items-center justify-around pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] max-w-lg mx-auto shadow-2xl`}>
        
        <button
          onClick={() => setActiveView('feed')}
          id="nav-feed-btn"
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-all duration-200 ${activeView === 'feed' ? 'text-pink-500 scale-105' : 'text-slate-400 hover:text-slate-205'}`}
        >
          <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm font-black transition-all duration-200 ${activeView === 'feed' ? 'bg-gradient-to-tr from-[#E1306C] via-[#C13584] to-[#833AB4] text-white border-transparent shadow-[0_4px_12px_rgba(193,53,132,0.3)]' : 'bg-transparent border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-300'}`}>
            ?
          </div>
          <span className="text-[8px] font-display font-semibold uppercase">Keşfet</span>
        </button>

        <button
          onClick={() => setActiveView('agenda')}
          id="nav-agenda-btn"
          className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer ${activeView === 'agenda' ? 'text-violet-500' : 'hover:text-slate-200'}`}
        >
          <Compass className="w-5.2 h-5.2" />
          <span className="text-[8px] font-display font-semibold uppercase">Radar</span>
        </button>

        <button
          onClick={() => setActiveView('create')}
          id="nav-create-btn"
          className="flex flex-col items-center justify-center text-indigo-400 hover:text-indigo-300 cursor-pointer transform hover:scale-105 active:scale-95 transition"
        >
          <PlusCircle className="w-8 h-8 text-violet-600 fill-violet-950" />
        </button>

        <button
          onClick={() => setActiveView('dm')}
          id="nav-dm-btn"
          className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer relative ${activeView === 'dm' ? 'text-violet-500' : 'hover:text-slate-200'}`}
        >
          <MessageSquare className="w-5.2 h-5.2" />
          <span className="text-[8px] font-display font-semibold uppercase">DM</span>
        </button>

        <button
          onClick={() => setActiveView('profile')}
          id="nav-profile-btn"
          className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer ${activeView === 'profile' ? 'text-violet-500' : 'hover:text-slate-200'}`}
        >
          <User className="w-5.2 h-5.2" />
          <span className="text-[8px] font-display font-semibold uppercase">Profil</span>
        </button>

      </nav>
      
      {/* REAL-TIME BİLDİRİMLER MERKEZİ SLIDEOVER PANELİ */}
      <NotificationsCenter 
        isOpen={isNotificationsOpen} 
        onClose={() => setIsNotificationsOpen(false)} 
        onNavigateToPost={(postId) => {
          setHighlightPostId(postId);
          setActiveView('feed');
          setIsNotificationsOpen(false);
        }}
      />
      
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
