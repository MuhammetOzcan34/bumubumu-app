/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { PostData, TagData } from '../types';
import { checkAndSeedDatabase } from '../lib/seeding';
import { useAuth } from '../context/AuthContext';
import { VotingCard } from '../components/VotingCard';
import { MapPin, TrendingUp, Search, Sparkles, Clock, Compass, X, Check, RefreshCw, BadgeAlert } from 'lucide-react';

const locationSuggestionsList = [
  "Türkiye Geneli",
  "İstanbul, Türkiye",
  "Kadıköy, İstanbul",
  "Beşiktaş, İstanbul",
  "Şişli, İstanbul",
  "Üsküdar, İstanbul",
  "Ankara, Türkiye",
  "Çankaya, Ankara",
  "Keçiören, Ankara",
  "İzmir, Türkiye",
  "Konak, İzmir",
  "Karşıyaka, İzmir",
  "Bursa, Türkiye",
  "Antalya, Türkiye",
  "Adana, Türkiye",
  "Trabzon, Türkiye",
  "Diyarbakır, Türkiye",
  "Eskişehir, Türkiye",
  "Gaziantep, Türkiye",
  "Samsun, Türkiye",
  "Muğla, Türkiye",
  "Bodrum, Muğla"
];

export const AgendaPage: React.FC = () => {
  const { currentUser, profileData, loading: authLoading } = useAuth();
  
  // Konum seçimi: varsayılan olarak ülke geneli seçili gelir
  const [selectedLocation, setSelectedLocation] = useState('Türkiye Geneli');
  const [locationInput, setLocationInput] = useState('Türkiye Geneli');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  
  // Kelime ve Hashtag Arama
  const [keywordSearch, setKeywordSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  const [allPostsPool, setAllPostsPool] = useState<PostData[]>([]);
  const [posts, setPosts] = useState<PostData[]>([]);
  const [indexErrorUrl, setIndexErrorUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  // Instagram-style incremental loading
  const [visibleCount, setVisibleCount] = useState(5);
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0);

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
      setForceRefreshTrigger(prev => prev + 1);
    } else {
      setPullY(0);
    }
  };

  useEffect(() => {
    setVisibleCount(5);
  }, [selectedLocation, selectedTag, keywordSearch, forceRefreshTrigger]);

  // Infinite Scroll Observer using IntersectionObserver
  const loaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentLoader = loaderRef.current;
    if (!currentLoader) return;

    const observer = new IntersectionObserver((entries) => {
      const target = entries[0];
      if (target.isIntersecting) {
        setVisibleCount(prev => prev + 5);
      }
    }, {
      rootMargin: '300px', // seamless load before fully reaching the end
      threshold: 0.1
    });

    observer.observe(currentLoader);
    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [posts]);

  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Bulunduğu ili profileData'dan çekme (varsayılan ülke geneli olarak ayarlandığından başlangıçta onu koruyoruz)
  useEffect(() => {
    setSelectedLocation('Türkiye Geneli');
    setLocationInput('Türkiye Geneli');
  }, []);

  // Click outside to close standard autocomplete suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowLocationSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Son 24 Saat ve Arama İçin Etiket Hesaplamaları (Gelişmiş Gerçek Zamanlı Analiz)
  const { top24hTags, allTimeTagsMap } = React.useMemo(() => {
    const twentyFourHoursAgoMs = Date.now() - 24 * 60 * 60 * 1000;
    
    // Son 24 saatteki paylaşımları filtrele
    const posts24h = allPostsPool.filter(post => {
      const createMs = post.createdAt?.seconds ? post.createdAt.seconds * 1000 : Date.now();
      return createMs >= twentyFourHoursAgoMs;
    });

    const tagVotesMap24h: { [tag: string]: number } = {};
    posts24h.forEach(post => {
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach(t => {
          const cleanTag = t.trim().toLowerCase().replace('#', '');
          if (cleanTag) {
            // Son 24 saatte paylaşılan bu etiketin aldığı toplam oy miktarını ekle
            tagVotesMap24h[cleanTag] = (tagVotesMap24h[cleanTag] || 0) + (post.totalVotes || 0);
          }
        });
      }
    });

    // En çok oylanan 5 etiket sırası
    const top24hTags = Object.entries(tagVotesMap24h)
      .map(([tag, votes]) => ({ tag, votes: votes as number }))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 5);

    // Tüm zamanların etiketleri (arama için otomatik sıralama tabanlı havuz)
    const allTimeTagsMap: { [tag: string]: number } = {};
    allPostsPool.forEach(post => {
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach(t => {
          const cleanTag = t.trim().toLowerCase().replace('#', '');
          if (cleanTag) {
            allTimeTagsMap[cleanTag] = (allTimeTagsMap[cleanTag] || 0) + (post.totalVotes || 0);
          }
        });
      }
    });

    return { top24hTags, allTimeTagsMap };
  }, [allPostsPool]);

  // Arama kısmında yazarken dinamik olarak en çok oy alanları sıralayıp göster
  const activeTagsToDisplay = React.useMemo(() => {
    const searchQuery = keywordSearch.trim().toLowerCase().replace('#', '');
    
    if (searchQuery.length > 0) {
      return Object.entries(allTimeTagsMap)
        .map(([tag, votes]) => ({ tag, votes: votes as number }))
        .filter(item => item.tag.startsWith(searchQuery))
        .sort((a, b) => b.votes - a.votes)
        .slice(0, 10);
    } else {
      return top24hTags;
    }
  }, [keywordSearch, top24hTags, allTimeTagsMap]);

  // 2. 12 Saatlik Kısıtlı Karşılaştırmaları Çekme (Değilse popüler olanlar fallback)
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const fetchAgendaPosts = async () => {
      setLoading(true);
      setIsUsingFallback(false);
      try {
        // Auto-seed if database is empty
        await checkAndSeedDatabase();

        // 1. Fetch latest 50 posts directly from 'posts' collection to make sure newly created posts appear immediately
        const postsRef = collection(db, 'posts');
        const latestQ = query(postsRef, where('groupId', '==', 'global'), orderBy('createdAt', 'desc'), limit(50));
        let latestPosts: PostData[] = [];
        try {
          const latestSnap = await getDocs(latestQ);
          latestSnap.forEach(d => {
            latestPosts.push({ postId: d.id, ...d.data() } as PostData);
          });
        } catch (postErr: any) {
          console.warn("AgendaPage primary query failed, initiating resilient fallback:", postErr);
          
          const isIndexError = postErr.code === 'failed-precondition' || 
                               postErr.message?.toLowerCase().includes('index') ||
                               postErr.toString().toLowerCase().includes('index');
          if (isIndexError) {
            const matchUrl = postErr.message?.match(/https:\/\/console\.firebase\.google\.com[^\s']+/);
            if (matchUrl && matchUrl[0]) {
              setIndexErrorUrl(matchUrl[0]);
            } else {
              setIndexErrorUrl("https://console.firebase.google.com");
            }
          }

          // LEVEL 1 FALLBACK: Remove orderBy but keep groupId filter
          try {
            const fallbackQ = query(postsRef, where('groupId', '==', 'global'), limit(80));
            const latestSnap = await getDocs(fallbackQ);
            latestSnap.forEach(d => {
              latestPosts.push({ postId: d.id, ...d.data() } as PostData);
            });
          } catch (fallbackErr: any) {
            console.warn("AgendaPage Level 1 fallback failed, trying Level 2 ultra-resilient fallback (unfiltered query):", fallbackErr);
            
            // LEVEL 2 FALLBACK: Absolutely no filters or order to bypass index & security mapping errors
            try {
              const ultraFallbackQ = query(postsRef, limit(100));
              const latestSnap = await getDocs(ultraFallbackQ);
              latestSnap.forEach(d => {
                const data = d.data() as PostData;
                // Client-side filtering: Only keep global posts
                if (!data.groupId || data.groupId === 'global') {
                  latestPosts.push({ postId: d.id, ...data });
                }
              });
            } catch (ultraErr) {
              console.error("All resilient fallback queries failed in AgendaPage:", ultraErr);
            }
          }

          // Client side sort of whatever latest posts we managed to pull
          latestPosts.sort((a, b) => {
            const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
            const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
            return timeB - timeA;
          });
        }

        // 2. Fetch trends from system_stats
        const trendsDocRef = doc(db, 'system_stats', 'global_trends');
        const snap = await getDoc(trendsDocRef);
        
        let trends: PostData[] = [];
        let topAllTime: PostData[] = [];
        if (snap.exists()) {
          const data = snap.data();
          trends = data.trends || [];
          topAllTime = data.top_all_time || [];
        }

        // --- DELETED POST CHECK FOR TRENDS ---
        const latestPostIds = new Set(latestPosts.map(p => p.postId));
        const extraPostIds = Array.from(new Set([
          ...trends.map(p => p.postId),
          ...topAllTime.map(p => p.postId)
        ])).filter(id => id && !latestPostIds.has(id)) as string[];

        const extraPostsMap = new Map<string, PostData>();
        if (extraPostIds.length > 0) {
          try {
            const fetchPromises = extraPostIds.map(async (id) => {
              try {
                const docSnap = await getDoc(doc(db, 'posts', id));
                if (docSnap.exists()) {
                  return { id, data: docSnap.data(), exists: true };
                }
              } catch (err) {
                // Ignore individual permission or fetching errors (e.g., if belongs to private group)
              }
              return { id, exists: false };
            });
            const results = await Promise.all(fetchPromises);
            results.forEach(res => {
              if (res.exists && res.data) {
                extraPostsMap.set(res.id, { postId: res.id, ...res.data } as PostData);
              }
            });
          } catch (e) {
            console.warn("Error verifying trending post existence:", e);
          }
        }

        trends = trends
          .map(p => {
            if (!p.postId) return null;
            if (latestPostIds.has(p.postId)) {
              const latest = latestPosts.find(lp => p.postId === lp.postId);
              return latest ? { ...p, ...latest } : p;
            }
            if (extraPostsMap.has(p.postId)) {
              const extra = extraPostsMap.get(p.postId);
              return extra ? { ...p, ...extra } : p;
            }
            return null;
          })
          .filter(Boolean) as PostData[];

        topAllTime = topAllTime
          .map(p => {
            if (!p.postId) return null;
            if (latestPostIds.has(p.postId)) {
              const latest = latestPosts.find(lp => p.postId === lp.postId);
              return latest ? { ...p, ...latest } : p;
            }
            if (extraPostsMap.has(p.postId)) {
              const extra = extraPostsMap.get(p.postId);
              return extra ? { ...p, ...extra } : p;
            }
            return null;
          })
          .filter(Boolean) as PostData[];
        // -------------------------------------

        // 3. Merge latest posts and trends (latest posts take priority for fresher data)
        const mergedMap = new Map<string, PostData>();
        
        // Add trends first
        trends.forEach(p => {
          if (p.postId) mergedMap.set(p.postId, p);
        });
        topAllTime.forEach(p => {
          if (p.postId) mergedMap.set(p.postId, p);
        });
        // Add latest posts (overwrite or add new)
        latestPosts.forEach(p => {
          if (p.postId) {
            const existing = mergedMap.get(p.postId);
            if (existing) {
              mergedMap.set(p.postId, {
                ...existing,
                ...p,
                score: (p.totalVotes || 0) * 1 + (existing.commentCount || 0) * 3
              });
            } else {
              mergedMap.set(p.postId, {
                ...p,
                score: (p.totalVotes || 0) * 1
              });
            }
          }
        });

        const targetList = Array.from(mergedMap.values());
        setIsUsingFallback(false);
        setAllPostsPool(targetList);

        let list = targetList.filter(data => {
          const isGlobal = !data.groupId || data.groupId === "global";
          const isLocationMatch = 
            !selectedLocation || 
            selectedLocation === "Türkiye Geneli" || 
            selectedLocation.trim() === "" ||
            (data.location && data.location.toLowerCase().includes(selectedLocation.toLowerCase()));

          return isGlobal && isLocationMatch;
        });

        // Sort: score/totalVotes descending first, then createdAt descending
        list.sort((a, b) => {
          const scoreA = (a as any).score || (a.totalVotes || 0);
          const scoreB = (b as any).score || (b.totalVotes || 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          
          const timeA = a.createdAt?.seconds ? a.createdAt.seconds : 0;
          const timeB = b.createdAt?.seconds ? b.createdAt.seconds : 0;
          return timeB - timeA;
        });

        setPosts(list);
      } catch (err) {
        console.error("Radar gönderi çekim hatası:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAgendaPosts();
  }, [selectedLocation, forceRefreshTrigger, currentUser, authLoading]);

  // Kelime araması ve trend etiketi filtreleme (client-side)
  const filteredPosts = posts.filter(p => {
    // 1. Tag eşleşmesi
    const matchesTag = selectedTag 
      ? (p.tags && p.tags.includes(selectedTag))
      : true;

    // 2. Kelime eşleşmesi (başlık veya etiketler)
    const matchesKeyword = keywordSearch.trim() === ""
      ? true
      : p.title.toLowerCase().includes(keywordSearch.toLowerCase()) || 
        (p.tags && p.tags.some(t => t.toLowerCase().includes(keywordSearch.toLowerCase())));

    return matchesTag && matchesKeyword;
  });

  // Filtrelenmiş öneriler
  const filteredSuggestions = locationSuggestionsList.filter(loc => 
    loc.toLowerCase().includes(locationInput.toLowerCase())
  );

  return (
    <div 
      className="w-full max-w-lg mx-auto bg-slate-950/40 px-0 py-4 min-h-screen text-slate-100 flex flex-col gap-4 font-sans relative pb-12 touch-pan-y"
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

      {/* Gündem Üst Bölüm */}

      {/* ULTRA-MINIMAL TWITTER-LIKE GENEL ARAMA VE BÖLGESEL RAPORLAR */}
      <div className="mx-4 flex flex-col gap-2 bg-[#18181B] dark:bg-[#12071f]/80 border border-white/5 dark:border-violet-950/45 rounded-2xl p-2.5 shadow-md">
        <div className="grid grid-cols-2 gap-2">
          {/* 1. KELİME ARAMA */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={keywordSearch}
              onChange={(e) => setKeywordSearch(e.target.value)}
              placeholder="Ara (kelime, #)..."
              className="w-full pl-7.5 pr-6 py-2 bg-slate-950/60 border border-slate-800/60 focus:border-indigo-500/80 rounded-xl text-[11px] font-display text-slate-100 placeholder-slate-500 outline-none transition-all"
            />
            {keywordSearch && (
              <button
                onClick={() => setKeywordSearch('')}
                className="absolute right-2 top-2 p-0.5 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 2. DİNAMİK KONUM ARAMA */}
          <div className="relative" ref={autocompleteRef}>
            <MapPin className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-rose-500" />
            <input
              type="text"
              value={locationInput}
              onChange={(e) => {
                setLocationInput(e.target.value);
                setShowLocationSuggestions(true);
              }}
              onFocus={() => setShowLocationSuggestions(true)}
              placeholder="📍 Konum filtrele..."
              className="w-full pl-7.5 pr-6 py-2 bg-slate-950/60 border border-slate-800/60 focus:border-rose-500/80 rounded-xl text-[11px] font-display text-slate-200 outline-none transition-all"
            />
            {locationInput && (
              <button
                onClick={() => {
                  setLocationInput('');
                  setSelectedLocation('Türkiye Geneli');
                }}
                className="absolute right-2 top-2 p-0.5 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Autocomplete Dropdown List */}
            {showLocationSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-slate-950 border border-slate-800/90 rounded-xl shadow-2xl z-50 py-1 scrollbar-thin">
                {filteredSuggestions.map((suggestion) => (
                  <div
                    key={suggestion}
                    onClick={() => {
                      setSelectedLocation(suggestion);
                      setLocationInput(suggestion);
                      setShowLocationSuggestions(false);
                      setSelectedTag(null); // Sıfırla
                    }}
                    className="flex items-center justify-between px-3 py-1.5 text-[10px] font-display text-slate-300 hover:bg-slate-900 cursor-pointer transition-colors"
                  >
                    <span>📍 {suggestion}</span>
                    {selectedLocation === suggestion && (
                      <Check className="w-3 h-3 text-rose-500" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Aktif Etiket / Konum özet rozetleri */}
        {(selectedTag || keywordSearch) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-900/60 dark:border-violet-950/20 pt-1.5 select-none">
            {selectedTag && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-display border border-violet-500/20">
                #{selectedTag}
                <button onClick={() => setSelectedTag(null)} className="hover:text-rose-400 ml-0.5">×</button>
              </span>
            )}
            {keywordSearch && (
              <span className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-display border border-indigo-500/20">
                Ara: {keywordSearch}
                <button onClick={() => setKeywordSearch('')} className="hover:text-rose-400 ml-0.5">×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* TREND ETİKETLER (SON 24 SAAT / ARAMA SONUÇLARI) */}
      <div className="mx-4 flex flex-col gap-2 bg-slate-900/10 border border-slate-800/30 rounded-2xl p-3">
        <span className="text-[10px] font-display font-bold text-slate-500 flex items-center gap-1.5 uppercase pl-1">
          <TrendingUp className="w-4 h-4 text-violet-400 animate-pulse" /> 
          {keywordSearch.trim() ? "TOP DİNAMİK ARAMA ETİKETLERİ" : "TOP Trend Etiketler (Son 24 Saat)"}
        </span>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedTag(null)}
            className={`text-[10px] font-bold font-display px-2.5 py-1 rounded-full border transition-all cursor-pointer ${selectedTag === null ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border-indigo-500 text-white shadow' : 'bg-slate-900 text-slate-400 border-slate-800'}`}
          >
            #Hepsi
          </button>
          {activeTagsToDisplay.map((t) => (
            <button
              key={t.tag}
              onClick={() => setSelectedTag(selectedTag === t.tag ? null : t.tag)}
              className={`text-[10px] font-bold font-display px-2.5 py-1 rounded-full border transition-all cursor-pointer ${selectedTag === t.tag ? 'bg-gradient-to-r from-violet-600 to-indigo-600 border-indigo-500 text-white shadow' : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'}`}
            >
              #{t.tag} <span className="opacity-45 text-[8px]">({t.votes} oy)</span>
            </button>
          ))}
        </div>
      </div>

      {/* GÖNDERİ LİSTELEME AKIŞI */}
      <div className="flex flex-col gap-4 mt-1 pb-16">
        <div className="flex flex-col gap-1 px-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" /> {isUsingFallback ? 'TÜM ZAMANLARIN EN ÇOK OYLANANLARI' : 'SON 12 SAATİN EN ÇOK OYLANANLARI'}
            </span>
            <span className="text-[9px] text-indigo-400 font-sans lowercase">toplama göre sıralı</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-24">
            <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="mx-4 bg-slate-900/10 border border-slate-800/40 rounded-3xl p-10 text-center flex flex-col items-center gap-3">
            <Compass className="w-10 h-10 text-slate-755 animate-pulse" />
            <h3 className="text-sm font-semibold text-slate-400">Aradığınız Kriterde Karşılaştırma Yok</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-sans max-w-xs lowercase">
              son 12 saat içinde {selectedLocation} bölgesine ait veya bu başlıkta oy alan aktif gönderi yok. '+' butonuna tıkla ve ilk oylamayı sen başlat!
            </p>
          </div>
        ) : (
          <>
            {filteredPosts.slice(0, visibleCount).map((post) => (
              <VotingCard 
                key={post.postId} 
                post={{ ...post, layout: "side-by-side" }} 
                onPostDeleted={() => {
                  setPosts(prev => prev.filter(p => p.postId !== post.postId));
                }}
              />
            ))}

            {filteredPosts.length > visibleCount && (
              <div ref={loaderRef} className="flex justify-center py-8 select-none">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono lowercase">
                  <RefreshCw className="w-4 h-4 animate-spin-slow text-indigo-400" />
                  yükleniyor...
                </div>
              </div>
            )}
            {filteredPosts.length <= visibleCount && filteredPosts.length > 0 && (
              <p className="text-center text-[10px] text-slate-600 font-mono py-6 lowercase select-none">
                tüm radar oylamalarını inceledin! 🧭
              </p>
            )}
          </>
        )}
      </div>

    </div>
  );
};
