/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, getDocs, getDoc, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { LayoutGrid, MapPin, Sparkles, AlertCircle, CheckCircle, X, ChevronRight, ChevronLeft, Image as ImageIcon, Check, Eye, Sliders } from 'lucide-react';
import { GroupData } from '../types';

interface CreatePostPageProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  defaultGroupId?: string;
}

export const CreatePostPage: React.FC<CreatePostPageProps> = ({ onSuccess, onCancel, defaultGroupId }) => {
  const { currentUser, profileData } = useAuth();
  
  // Adım Durumu: 1 = Medya Seçimi, 2 = Paylaşım Detayları
  const [step, setStep] = useState<1 | 2>(1);
  const [activeAdjustOption, setActiveAdjustOption] = useState<'A' | 'B' | null>(null);
  
  // Form State'leri
  const [title, setTitle] = useState('');
  const [optionALabel, setOptionALabel] = useState('A');
  const [optionBLabel, setOptionBLabel] = useState('B');
  const [optionAUrl, setOptionAUrl] = useState('');
  const [optionBUrl, setOptionBUrl] = useState('');
  const [optionALink, setOptionALink] = useState('');
  const [optionBLink, setOptionBLink] = useState('');
  const [layout, setLayout] = useState<"side-by-side" | "stacked">("side-by-side");
  const [selectedGroupId, setSelectedGroupId] = useState(defaultGroupId || 'global');

  useEffect(() => {
    if (defaultGroupId) {
      setSelectedGroupId(defaultGroupId);
    }
  }, [defaultGroupId]);
  const [userGroups, setUserGroups] = useState<GroupData[]>([]);
  const [location, setLocation] = useState('İstanbul');

  // Link ile Görsel Getirme (Otomatik) State'leri
  const [linkA, setLinkA] = useState('');
  const [linkB, setLinkB] = useState('');
  const [fetchingA, setFetchingA] = useState(false);
  const [fetchingB, setFetchingB] = useState(false);
  const [errorLinkA, setErrorLinkA] = useState<string | null>(null);
  const [errorLinkB, setErrorLinkB] = useState<string | null>(null);

  // Görsel Görünüm / Kırpma / Ortalama Ayarları (Instagram/WhatsApp tarzı)
  const [originalAUrl, setOriginalAUrl] = useState<string | null>(null);
  const [originalBUrl, setOriginalBUrl] = useState<string | null>(null);
  const [zoomA, setZoomA] = useState<number>(1.0);
  const [posXA, setPosXA] = useState<number>(50); // 0 - 100%
  const [posYA, setPosYA] = useState<number>(50); // 0 - 100%
  const [bgTypeA, setBgTypeA] = useState<'solid' | 'blur'>('blur');
  const [bgColorA, setBgColorA] = useState<string>('#FFFFFF');
  
  const [zoomB, setZoomB] = useState<number>(1.0);
  const [posXB, setPosXB] = useState<number>(50);
  const [posYB, setPosYB] = useState<number>(50);
  const [bgTypeB, setBgTypeB] = useState<'solid' | 'blur'>('blur');
  const [bgColorB, setBgColorB] = useState<string>('#FFFFFF');

  // Dosya Yükleme State'leri
  const [compressingA, setCompressingA] = useState(false);
  const [compressingB, setCompressingB] = useState(false);
  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Geri Bildirimler
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showOptionalLinksPanel, setShowOptionalLinksPanel] = useState(false);

  useEffect(() => {
    if (profileData?.location) {
      setLocation(profileData.location);
    } else {
      setLocation('İstanbul');
    }
  }, [profileData]);

  // Kullanıcının üyesi olduğu özel grupları çekiyoruz
  useEffect(() => {
    if (!currentUser) return;
    const fetchUserGroups = async () => {
      try {
        const groupsRef = collection(db, 'groups');
        const querySnap = await getDocs(groupsRef);
        
        const myGroups: GroupData[] = [];
        for (const docSnap of querySnap.docs) {
          const mSnap = await getDoc(doc(db, 'groups', docSnap.id, 'members', currentUser.uid));
          if (mSnap.exists()) {
            myGroups.push({ groupId: docSnap.id, ...docSnap.data() } as GroupData);
          }
        }
        setUserGroups(myGroups);
      } catch (err) {
        console.error("Grup listeleme hatası:", err);
      }
    };
    fetchUserGroups();
  }, [currentUser]);

  // Görsel Sıkıştırma ve Base64'e Çevirme Mantığı (Manuel Yükleme)
  const handleImageUpload = (file: File, option: 'A' | 'B') => {
    const setCompressing = option === 'A' ? setCompressingA : setCompressingB;
    const setUrl = option === 'A' ? setOptionAUrl : setOptionBUrl;
    const setLink = option === 'A' ? setLinkA : setLinkB;
    const setOptLink = option === 'A' ? setOptionALink : setOptionBLink;
    const setErr = option === 'A' ? setErrorLinkA : setErrorLinkB;

    // Manuel yükleme başladığında o seçeneğe ait linkleri temizliyoruz
    setLink('');
    setOptLink('');
    setErr(null);

    setCompressing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Maksimum kenar boyutu 1200px olacak şekilde oranla küçültelim
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          
          // JPEG kalitesini 0.75 seviyesine getirip sıkıştırıyoruz (ortalama 100-250kb)
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
          setUrl(compressedDataUrl);
          
          if (option === 'A') {
            setOriginalAUrl(compressedDataUrl);
            setZoomA(1.0);
            setPosXA(50);
            setPosYA(50);
          } else {
            setOriginalBUrl(compressedDataUrl);
            setZoomB(1.0);
            setPosXB(50);
            setPosYB(50);
          }
        }
        setCompressing(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Linkten Görsel Çekme Mantığı
  const fetchImageFromLink = async (url: string, option: 'A' | 'B') => {
    const setFetching = option === 'A' ? setFetchingA : setFetchingB;
    const setErrorLink = option === 'A' ? setErrorLinkA : setErrorLinkB;
    const setUrl = option === 'A' ? setOptionAUrl : setOptionBUrl;
    const setOriginalUrl = option === 'A' ? setOriginalAUrl : setOriginalBUrl;
    const setZoom = option === 'A' ? setZoomA : setZoomB;
    const setPosX = option === 'A' ? setPosXA : setPosXB;
    const setPosY = option === 'A' ? setPosYA : setPosYB;
    const setOptionLink = option === 'A' ? setOptionALink : setOptionBLink;

    setFetching(true);
    setErrorLink(null);

    let imgUrl: string | null = null;

    // Eğer girilen link doğrudan bir resim ise öncelikle onu kullanalım
    const isDirectImage = /\.(jpg|jpeg|png|webp|gif)/i.test(url);
    if (isDirectImage) {
      imgUrl = url;
    } else {
      try {
        // Backend'deki Firebase Cloud Function / Express API ucunu (fetchOgImage) çağırıyoruz
        const response = await fetch(`/api/fetchOgImage?url=${encodeURIComponent(url)}`);
        if (response.ok) {
          const data = await response.json();
          if (data?.imageUrl) {
            imgUrl = data.imageUrl;
          }
        }
      } catch (err) {
        console.warn("fetchOgImage API fetch hatası:", err);
      }
    }

    // Logo filtreleme kuralları
    if (imgUrl) {
      const lowerImg = imgUrl.toLowerCase();
      if (lowerImg.includes('logo') || lowerImg.includes('favicon') || lowerImg.includes('brand') || lowerImg.endsWith('.ico')) {
        imgUrl = null;
      }
    }

    if (imgUrl) {
      // images.weserv.nl tüneli ile sarmalayarak Cloudflare/CORS korumalı resimleri proxy üzerinden yüklüyoruz
      let resolvedUrl = imgUrl;
      if (resolvedUrl.startsWith('//')) {
        resolvedUrl = 'https:' + resolvedUrl;
      } else if (resolvedUrl.startsWith('/') && !resolvedUrl.startsWith('//')) {
        try {
          const urlObj = new URL(url);
          resolvedUrl = urlObj.origin + resolvedUrl;
        } catch (e) {}
      }

      const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(resolvedUrl)}`;

      setUrl(proxiedUrl);
      setOriginalUrl(proxiedUrl);
      setZoom(1.0);
      setPosX(50);
      setPosY(50);
      setOptionLink(url.trim());
    } else {
      console.warn("Ürün görseli otomatik çözülemedi. Manuel yükleme aktif.");
    }
    setFetching(false);
  };

  const handleLinkChange = (val: string, option: 'A' | 'B') => {
    const setLink = option === 'A' ? setLinkA : setLinkB;
    const setOptionLink = option === 'A' ? setOptionALink : setOptionBLink;
    setLink(val);

    if (!val.trim()) {
      const setUrl = option === 'A' ? setOptionAUrl : setOptionBUrl;
      const setOriginalUrl = option === 'A' ? setOriginalAUrl : setOriginalBUrl;
      setUrl('');
      setOriginalUrl(null);
      setOptionLink('');
      const setErrorLink = option === 'A' ? setErrorLinkA : setErrorLinkB;
      setErrorLink(null);
      return;
    }

    try {
      const parsed = new URL(val);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        fetchImageFromLink(val, option);
      }
    } catch (e) {
      // Tam bir URL olana kadar bekliyoruz
    }
  };

  // Mouse / Touch Gesture Controls for Image Alignment (Instagram Style)
  const isDraggingA = useRef(false);
  const isDraggingB = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 50, posY: 50 });
  const initialDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1.0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, option: 'A' | 'B') => {
    const url = option === 'A' ? optionAUrl : optionBUrl;
    if (!url || activeAdjustOption !== option) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    
    if (option === 'A') {
      isDraggingA.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY, posX: posXA, posY: posYA };
    } else {
      isDraggingB.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY, posX: posXB, posY: posYB };
    }
    
    e.stopPropagation();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>, option: 'A' | 'B') => {
    const isDrag = option === 'A' ? isDraggingA.current : isDraggingB.current;
    if (!isDrag) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    const currentZoom = option === 'A' ? zoomA : zoomB;
    // Higher zoom means slower, more precise dragging
    const sensitivity = 0.5 / currentZoom; 

    let newPosX = dragStartRef.current.posX - (deltaX / rect.width) * 100 * sensitivity;
    let newPosY = dragStartRef.current.posY - (deltaY / rect.height) * 100 * sensitivity;

    newPosX = Math.max(0, Math.min(100, newPosX));
    newPosY = Math.max(0, Math.min(100, newPosY));

    if (option === 'A') {
      setPosXA(Math.round(newPosX));
      setPosYA(Math.round(newPosY));
    } else {
      setPosXB(Math.round(newPosX));
      setPosYB(Math.round(newPosY));
    }

    e.stopPropagation();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>, option: 'A' | 'B') => {
    if (option === 'A') {
      isDraggingA.current = false;
    } else {
      isDraggingB.current = false;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    e.stopPropagation();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>, option: 'A' | 'B') => {
    const url = option === 'A' ? optionAUrl : optionBUrl;
    if (!url || activeAdjustOption !== option) return;

    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      initialDistanceRef.current = dist;
      initialZoomRef.current = option === 'A' ? zoomA : zoomB;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>, option: 'A' | 'B') => {
    const url = option === 'A' ? optionAUrl : optionBUrl;
    if (!url || activeAdjustOption !== option) return;

    if (e.touches.length === 2 && initialDistanceRef.current !== null) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      const factor = dist / initialDistanceRef.current;
      
      let newZoom = initialZoomRef.current * factor;
      newZoom = Math.max(0.1, Math.min(2.5, newZoom));
      
      if (option === 'A') {
        setZoomA(newZoom);
      } else {
        setZoomB(newZoom);
      }
    }
  };

  const handleTouchEnd = () => {
    initialDistanceRef.current = null;
  };

  const parseHashtags = (text: string) => {
    const regex = /#\w+/g;
    const matches = text.match(regex);
    if (!matches) return [];
    return Array.from(new Set(matches.map(tag => tag.toLowerCase().replace('#', ''))));
  };

  const processImageWithAdjustments = (
    originalUrl: string, 
    zoom: number, 
    posX: number, 
    posY: number,
    bgType: 'solid' | 'blur',
    bgColor: string
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      // Set crossOrigin to anonymous to prevent canvas tainting from cross-origin image requests (like images.weserv.nl)
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          // 9:16 oranında yüksek kaliteli çıktı üretiyoruz
          canvas.width = 540;
          canvas.height = 960;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(originalUrl);
            return;
          }
          
          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // LAYER 1: Background Fill
          if (bgType === 'solid') {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            ctx.save();
            try {
              ctx.filter = 'blur(40px) brightness(0.65)';
            } catch (e) {
              // Fail-safe for older browsers that don't support ctx.filter
            }
            
            // Draw image covering the canvas (object-cover style)
            const imgAspect = img.width / img.height;
            const canvasAspect = canvas.width / canvas.height;
            let drawW, drawH, drawX, drawY;
            
            if (imgAspect > canvasAspect) {
              drawH = canvas.height;
              drawW = canvas.height * imgAspect;
              drawX = (canvas.width - drawW) / 2;
              drawY = 0;
            } else {
              drawW = canvas.width;
              drawH = canvas.width / imgAspect;
              drawX = 0;
              drawY = (canvas.height - drawH) / 2;
            }
            
            // Draw background image with slight bleed/padding to avoid white borders from blur filter
            ctx.drawImage(img, drawX - 40, drawY - 40, drawW + 80, drawH + 80);
            ctx.restore();
            
            // Draw a subtle overlay to make background dark/neutral if needed
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          
          // LAYER 2: Actual Image with Scale & Position (Scale-around-origin effect)
          ctx.save();
          
          const Ox = canvas.width * (posX / 100);
          const Oy = canvas.height * (posY / 100);
          
          ctx.translate(Ox, Oy);
          ctx.scale(zoom, zoom);
          ctx.translate(-Ox, -Oy);
          
          const imgAspectRatio = img.width / img.height;
          const canvasAspectRatio = canvas.width / canvas.height;
          let renderWidth, renderHeight;
          
          if (imgAspectRatio > canvasAspectRatio) {
            renderWidth = canvas.width;
            renderHeight = canvas.width / imgAspectRatio;
          } else {
            renderHeight = canvas.height;
            renderWidth = canvas.height * imgAspectRatio;
          }
          
          const dx = (canvas.width - renderWidth) / 2;
          const dy = (canvas.height - renderHeight) / 2;
          
          ctx.drawImage(img, dx, dy, renderWidth, renderHeight);
          ctx.restore();
          
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (e) {
          console.error("processImageWithAdjustments canvas export error, falling back to original URL:", e);
          resolve(originalUrl);
        }
      };
      img.onerror = () => {
        resolve(originalUrl);
      };
      img.src = originalUrl;
    });
  };

  const handleCreatePost = async () => {
    if (!currentUser) return;
    if (!title.trim() || !optionAUrl || !optionBUrl) {
      setErrorMsg("Lütfen karşılaştırma sorunuzu girin ve her iki görseli de yükleyin.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Görsel görünüm / hizalama ve yakınlaştırma ayarlarını canvas ile nihai görsel haline getiriyoruz
      const processedA = await processImageWithAdjustments(originalAUrl || optionAUrl, zoomA, posXA, posYA, bgTypeA, bgColorA);
      const processedB = await processImageWithAdjustments(originalBUrl || optionBUrl, zoomB, posXB, posYB, bgTypeB, bgColorB);

      const postId = 'post_' + Math.random().toString(36).substring(2, 11);
      const hashtags = parseHashtags(title);
      
      const batch = writeBatch(db);

      // Yeni gönderi dökümanı
      const postRef = doc(db, 'posts', postId);
      const postPayload = {
        postId,
        creatorId: currentUser.uid,
        creatorName: profileData?.displayName || currentUser.email?.split('@')[0] || "BumuBumu Üyesi",
        creatorPhoto: profileData?.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`,
        title: title.trim(),
        optionALabel: optionALabel.trim() || 'A',
        optionBLabel: optionBLabel.trim() || 'B',
        optionAUrl: processedA,
        optionBUrl: processedB,
        optionALink: optionALink.trim(),
        optionBLink: optionBLink.trim(),
        layout,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        voteCountA: 0,
        voteCountB: 0,
        totalVotes: 0,
        tags: hashtags,
        location,
        groupId: selectedGroupId || "global",
        status: "active",
        winnerOption: ""
      };
      
      batch.set(postRef, postPayload);

      // Hashtag katsayılarını artırma
      hashtags.forEach(tag => {
        const tagRef = doc(db, 'tags', tag);
        batch.set(tagRef, {
          tag,
          count: increment(1),
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();

      setSuccessMsg("Harika! Karşılaştırma gönderin başarıyla paylaşıldı.");
      handleResetForm();
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1200);
      }
    } catch (err) {
      console.error("Gönderi oluşturma hatası:", err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `posts`);
      } catch (e: any) {
        setErrorMsg("Üzgünüz, gönderi paylaşma kural ihlaline veya yetersiz izne takıldı.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetForm = () => {
    setTitle('');
    setOptionALabel('A');
    setOptionBLabel('B');
    setOptionAUrl('');
    setOptionBUrl('');
    setOriginalAUrl(null);
    setOriginalBUrl(null);
    setOptionALink('');
    setOptionBLink('');
    setLinkA('');
    setLinkB('');
    setErrorLinkA(null);
    setErrorLinkB(null);
    setSelectedGroupId('global');
    setStep(1);
    setActiveAdjustOption(null);
  };

  const canGoNext = optionAUrl !== '' && optionBUrl !== '';
  const isFormValid = canGoNext && title.trim().length > 0;

  const QUICK_TAGS = ['moda', 'stil', 'hangisi', 'teknoloji', 'dekorasyon', 'makyaj', 'trend', 'ayakkabi', 'parfum'];

  const handleQuickTagClick = (tag: string) => {
    const tagStr = `#${tag}`;
    if (!title.includes(tagStr)) {
      setTitle(prev => {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} ${tagStr}` : tagStr;
      });
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-950 min-h-screen text-slate-100 flex flex-col font-sans select-none pb-20">
      
      {/* INSTAGRAM STYLE SLICK HEADER */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition duration-150 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Medya
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="text-xs font-bold text-slate-400 hover:text-white transition duration-150 cursor-pointer"
              >
                Vazgeç
              </button>
            )}
            <button
              type="button"
              onClick={handleResetForm}
              className="text-xs font-bold text-slate-500 hover:text-rose-400 transition duration-150 cursor-pointer"
            >
              Temizle
            </button>
          </div>
        )}

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono">
            {step === 1 ? '1 / 2' : '2 / 2'}
          </span>
          <span className="text-xs font-black tracking-wider text-slate-100 uppercase">
            {step === 1 ? 'MEDYA SEÇİMİ' : 'PAYLAŞIM DETAYLARI'}
          </span>
        </div>

        {step === 1 ? (
          <button
            type="button"
            onClick={() => { if (canGoNext) setStep(2); }}
            disabled={!canGoNext}
            className={`text-xs font-bold flex items-center gap-0.5 transition duration-200 cursor-pointer ${canGoNext ? 'text-pink-500 hover:text-pink-400' : 'text-slate-600 cursor-not-allowed'}`}
          >
            İleri <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCreatePost}
            disabled={loading || !isFormValid}
            className={`text-xs font-black flex items-center gap-1.5 transition duration-200 cursor-pointer px-3 py-1.5 rounded-full ${isFormValid ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-lg shadow-pink-600/20 active:scale-95' : 'text-slate-600 bg-white/5 cursor-not-allowed'}`}
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>Paylaş <Check className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </div>

      {/* ERROR/SUCCESS FEEDBACKS */}
      <div className="px-4 pt-3 flex flex-col gap-2">
        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] py-2.5 px-3.5 rounded-2xl flex items-start gap-2 animate-scale-up font-mono">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] py-2.5 px-3.5 rounded-2xl flex items-start gap-2 animate-scale-up font-mono">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* STEP 1: MEDIA SELECTION */}
      {step === 1 && (
        <div className="px-4 py-3 flex flex-col gap-4 animate-scale-up">
          
          {/* LAYOUT CHOICE HEADER */}
          <div className="flex items-center justify-between bg-slate-900/30 border border-white/5 p-2 px-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-pink-500" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">GÖRSEL YERLEŞİMİ</span>
            </div>
            <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-white/5">
              <button
                type="button"
                onClick={() => setLayout("side-by-side")}
                className={`px-3 py-1.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${layout === 'side-by-side' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                YAN YANA
              </button>
              <button
                type="button"
                onClick={() => setLayout("stacked")}
                className={`px-3 py-1.5 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${layout === 'stacked' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                ALT ALTA
              </button>
            </div>
          </div>

          {/* DUAL INTERACTIVE IMAGE CARDS (INSTAGRAM CREATIVE ENGINE) */}
          <div className="flex flex-col gap-3">
            <div className={`w-full grid gap-3 rounded-3xl overflow-hidden border border-white/5 bg-[#0a0a0c] shadow-2xl p-3 ${layout === 'side-by-side' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              
              {/* OPTION A (LEFT) CONTAINER */}
              <div className="flex flex-col gap-2 w-full">
                <div 
                  onClick={() => !compressingA && !optionAUrl && fileInputARef.current?.click()}
                  onPointerDown={(e) => handlePointerDown(e, 'A')}
                  onPointerMove={(e) => handlePointerMove(e, 'A')}
                  onPointerUp={(e) => handlePointerUp(e, 'A')}
                  onPointerCancel={(e) => handlePointerUp(e, 'A')}
                  onTouchStart={(e) => handleTouchStart(e, 'A')}
                  onTouchMove={(e) => handleTouchMove(e, 'A')}
                  onTouchEnd={handleTouchEnd}
                  className={`relative group aspect-[9/16] ${layout === 'side-by-side' ? 'w-full' : 'w-full max-w-[300px] mx-auto'} bg-slate-900/10 hover:bg-slate-900/30 transition-all duration-300 rounded-2xl overflow-hidden border ${optionAUrl ? 'border-pink-500/20' : 'border-slate-800/80 hover:border-pink-500/40'} flex flex-col items-center justify-center p-3 text-center cursor-pointer select-none touch-none`}
                >
                  <input
                    type="file"
                    ref={fileInputARef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'A');
                    }}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {compressingA ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[9px] font-bold text-slate-400 font-mono">Sıkıştırılıyor...</span>
                    </div>
                  ) : optionAUrl ? (
                    <>
                      {/* SMART BACKGROUND FILL LAYER */}
                      {bgTypeA === 'solid' ? (
                        <div 
                          className="absolute inset-0 w-full h-full transition-colors duration-200" 
                          style={{ backgroundColor: bgColorA }} 
                        />
                      ) : (
                        <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none">
                          <img 
                            src={originalAUrl || optionAUrl} 
                            className="w-full h-full object-cover scale-110 blur-xl opacity-60 brightness-[0.6] select-none pointer-events-none" 
                            alt="Blur bg A"
                          />
                        </div>
                      )}
                      <img 
                        src={originalAUrl || optionAUrl} 
                        alt="Option A" 
                        style={{
                          transform: `scale(${zoomA})`,
                          transformOrigin: `${posXA}% ${posYA}%`
                        }}
                        className="absolute inset-0 w-full h-full object-contain transition-none pointer-events-none select-none" 
                      />
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputARef.current?.click();
                        }}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-10"
                      >
                        <span className="text-[10px] font-bold text-white bg-slate-950/80 px-2.5 py-1.5 rounded-full border border-white/10 uppercase">Görseli Değiştir</span>
                      </div>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOptionAUrl('');
                          setOriginalAUrl(null);
                          setLinkA('');
                          setOptionALink('');
                          setErrorLinkA(null);
                          if (activeAdjustOption === 'A') setActiveAdjustOption(null);
                          if (fileInputARef.current) fileInputARef.current.value = '';
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-rose-600/90 text-white rounded-full transition hover:scale-110 shadow-lg cursor-pointer z-20"
                      >
                        <X className="w-3 h-3" />
                      </button>

                      <div className="absolute bottom-2 left-2 flex gap-1 z-20">
                        <div className="bg-pink-600 text-[8px] font-black text-white px-2 py-0.5 rounded-md uppercase tracking-wider">
                          A SEÇENEĞİ
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveAdjustOption(activeAdjustOption === 'A' ? null : 'A');
                          }}
                          className={`p-1 rounded-md text-white transition duration-150 cursor-pointer flex items-center gap-1 text-[8px] ${activeAdjustOption === 'A' ? 'bg-pink-500' : 'bg-slate-950/80 hover:bg-pink-500'}`}
                        >
                          <Sliders className="w-2.5 h-2.5" /> {activeAdjustOption === 'A' ? 'Ayarlanıyor' : 'Hizala'}
                        </button>
                      </div>

                      {activeAdjustOption === 'A' && (
                        <div className="absolute top-2 left-2 bg-pink-500/90 text-white text-[8px] font-bold px-2 py-1 rounded-full animate-pulse z-20 pointer-events-none">
                          Dokunarak / Kaydırarak Ayarla 📲
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-between h-full w-full py-4 select-none">
                      <div className="my-auto flex flex-col items-center gap-2">
                        <div className="p-3 bg-slate-950/60 rounded-full border border-white/5 text-pink-500">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-200 uppercase tracking-wider">GÖRSEL A SEÇ</span>
                        <span className="text-[8px] text-slate-500 font-mono">Cihazdan yüklemek için dokun</span>
                      </div>

                      {/* INTEGRATED LINK INPUT FOR OPTION A */}
                      <div className="w-full px-1 z-10 mt-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1.5 focus-within:border-pink-500/50 transition">
                          <span className="text-[10px] mr-1">🔗</span>
                          <input
                            type="url"
                            placeholder="Veya web linki yapıştır..."
                            value={linkA}
                            onChange={(e) => handleLinkChange(e.target.value, 'A')}
                            className="w-full bg-transparent text-[9px] text-slate-200 placeholder-slate-600 outline-none font-sans"
                          />
                          {fetchingA && (
                            <div className="w-3.5 h-3.5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin shrink-0 ml-1" />
                          )}
                        </div>
                        {errorLinkA && (
                          <span className="text-[8px] text-rose-400 mt-1 pl-1 block text-left font-mono">{errorLinkA}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* OPTION B (RIGHT) CONTAINER */}
              <div className="flex flex-col gap-2 w-full">
                <div 
                  onClick={() => !compressingB && !optionBUrl && fileInputBRef.current?.click()}
                  onPointerDown={(e) => handlePointerDown(e, 'B')}
                  onPointerMove={(e) => handlePointerMove(e, 'B')}
                  onPointerUp={(e) => handlePointerUp(e, 'B')}
                  onPointerCancel={(e) => handlePointerUp(e, 'B')}
                  onTouchStart={(e) => handleTouchStart(e, 'B')}
                  onTouchMove={(e) => handleTouchMove(e, 'B')}
                  onTouchEnd={handleTouchEnd}
                  className={`relative group aspect-[9/16] ${layout === 'side-by-side' ? 'w-full' : 'w-full max-w-[300px] mx-auto'} bg-slate-900/10 hover:bg-slate-900/30 transition-all duration-300 rounded-2xl overflow-hidden border ${optionBUrl ? 'border-pink-500/20' : 'border-slate-800/80 hover:border-pink-500/40'} flex flex-col items-center justify-center p-3 text-center cursor-pointer select-none touch-none`}
                >
                  <input
                    type="file"
                    ref={fileInputBRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'B');
                    }}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {compressingB ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[9px] font-bold text-slate-400 font-mono">Sıkıştırılıyor...</span>
                    </div>
                  ) : optionBUrl ? (
                    <>
                      {/* SMART BACKGROUND FILL LAYER */}
                      {bgTypeB === 'solid' ? (
                        <div 
                          className="absolute inset-0 w-full h-full transition-colors duration-200" 
                          style={{ backgroundColor: bgColorB }} 
                        />
                      ) : (
                        <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none">
                          <img 
                            src={originalBUrl || optionBUrl} 
                            className="w-full h-full object-cover scale-110 blur-xl opacity-60 brightness-[0.6] select-none pointer-events-none" 
                            alt="Blur bg B"
                          />
                        </div>
                      )}
                      <img 
                        src={originalBUrl || optionBUrl} 
                        alt="Option B" 
                        style={{
                          transform: `scale(${zoomB})`,
                          transformOrigin: `${posXB}% ${posYB}%`
                        }}
                        className="absolute inset-0 w-full h-full object-contain transition-none pointer-events-none select-none" 
                      />
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputBRef.current?.click();
                        }}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-10"
                      >
                        <span className="text-[10px] font-bold text-white bg-slate-950/80 px-2.5 py-1.5 rounded-full border border-white/10 uppercase">Görseli Değiştir</span>
                      </div>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOptionBUrl('');
                          setOriginalBUrl(null);
                          setLinkB('');
                          setOptionBLink('');
                          setErrorLinkB(null);
                          if (activeAdjustOption === 'B') setActiveAdjustOption(null);
                          if (fileInputBRef.current) fileInputBRef.current.value = '';
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-rose-600/90 text-white rounded-full transition hover:scale-110 shadow-lg cursor-pointer z-20"
                      >
                        <X className="w-3 h-3" />
                      </button>

                      <div className="absolute bottom-2 left-2 flex gap-1 z-20">
                        <div className="bg-pink-600 text-[8px] font-black text-white px-2 py-0.5 rounded-md uppercase tracking-wider">
                          B SEÇENEĞİ
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveAdjustOption(activeAdjustOption === 'B' ? null : 'B');
                          }}
                          className={`p-1 rounded-md text-white transition duration-150 cursor-pointer flex items-center gap-1 text-[8px] ${activeAdjustOption === 'B' ? 'bg-pink-500' : 'bg-slate-950/80 hover:bg-pink-500'}`}
                        >
                          <Sliders className="w-2.5 h-2.5" /> {activeAdjustOption === 'B' ? 'Ayarlanıyor' : 'Hizala'}
                        </button>
                      </div>

                      {activeAdjustOption === 'B' && (
                        <div className="absolute top-2 left-2 bg-pink-500/90 text-white text-[8px] font-bold px-2 py-1 rounded-full animate-pulse z-20 pointer-events-none">
                          Dokunarak / Kaydırarak Ayarla 📲
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-between h-full w-full py-4 select-none">
                      <div className="my-auto flex flex-col items-center gap-2">
                        <div className="p-3 bg-slate-950/60 rounded-full border border-white/5 text-pink-500">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-black text-slate-200 uppercase tracking-wider">GÖRSEL B SEÇ</span>
                        <span className="text-[8px] text-slate-500 font-mono">Cihazdan yüklemek için dokun</span>
                      </div>

                      {/* INTEGRATED LINK INPUT FOR OPTION B */}
                      <div className="w-full px-1 z-10 mt-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1.5 focus-within:border-pink-500/50 transition">
                          <span className="text-[10px] mr-1">🔗</span>
                          <input
                            type="url"
                            placeholder="Veya web linki yapıştır..."
                            value={linkB}
                            onChange={(e) => handleLinkChange(e.target.value, 'B')}
                            className="w-full bg-transparent text-[9px] text-slate-200 placeholder-slate-600 outline-none font-sans"
                          />
                          {fetchingB && (
                            <div className="w-3.5 h-3.5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin shrink-0 ml-1" />
                          )}
                        </div>
                        {errorLinkB && (
                          <span className="text-[8px] text-rose-400 mt-1 pl-1 block text-left font-mono">{errorLinkB}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* DYNAMIC COMPACT ADJUSTMENT COLLAPSIBLE PANEL */}
          {activeAdjustOption && (
            <div className="bg-slate-900/60 border border-white/5 p-4 rounded-3xl flex flex-col gap-3 animate-scale-up">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-[10px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" /> 
                  {activeAdjustOption === 'A' ? 'A SEÇENEĞİ GÖRSEL AYARLARI' : 'B SEÇENEĞİ GÖRSEL AYARLARI'}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveAdjustOption(null)}
                  className="text-[10px] font-mono font-bold text-slate-400 hover:text-white px-2 py-0.5 bg-slate-950/50 rounded-lg"
                >
                  Tamam
                </button>
              </div>

              {activeAdjustOption === 'A' ? (
                <div className="flex flex-col gap-3">
                  {/* Akıllı Arka Plan Dolgusu Panel */}
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 flex flex-col gap-2">
                    <span className="text-[8px] font-black text-slate-400 tracking-widest uppercase">Akıllı Arka Plan Dolgusu</span>
                    <div className="flex gap-1.5 p-1 bg-slate-950 rounded-xl border border-white/5 w-fit">
                      <button
                        type="button"
                        onClick={() => setBgTypeA('blur')}
                        className={`px-3 py-1 text-[8px] font-bold rounded-lg transition-all ${bgTypeA === 'blur' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Bulanık Arka Plan
                      </button>
                      <button
                        type="button"
                        onClick={() => setBgTypeA('solid')}
                        className={`px-3 py-1 text-[8px] font-bold rounded-lg transition-all ${bgTypeA === 'solid' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Düz Renk Arka Plan
                      </button>
                    </div>
                    
                    {bgTypeA === 'solid' && (
                      <div className="flex flex-wrap items-center gap-2 mt-1 bg-slate-900/40 p-2 rounded-xl">
                        {[
                          { name: 'Beyaz', value: '#FFFFFF' },
                          { name: 'Siyah', value: '#000000' },
                          { name: 'Açık Gri', value: '#F3F4F6' },
                          { name: 'Koyu Slate', value: '#1E293B' },
                          { name: 'Bej/Krem', value: '#FAFaf9' },
                          { name: 'Gül Kurusu', value: '#FCE7F3' },
                          { name: 'Pastel Mavi', value: '#F0F9FF' },
                        ].map((color) => (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => setBgColorA(color.value)}
                            title={color.name}
                            style={{ backgroundColor: color.value }}
                            className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer hover:scale-110 ${bgColorA === color.value ? 'border-pink-500 scale-110' : 'border-white/10'}`}
                          />
                        ))}
                        <div className="relative flex items-center justify-center w-5 h-5 rounded-full overflow-hidden border border-white/20 cursor-pointer hover:scale-110 shrink-0">
                          <input 
                            type="color" 
                            value={bgColorA} 
                            onChange={(e) => setBgColorA(e.target.value)}
                            className="absolute inset-0 w-8 h-8 -translate-x-1.5 -translate-y-1.5 cursor-pointer p-0 bg-transparent border-0 opacity-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Zoom A */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                      <span>Sığdır / Yakınlaştır (Zoom)</span>
                      <span className="text-pink-400 font-bold">{zoomA.toFixed(2)}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="2.5" 
                      step="0.05"
                      value={zoomA} 
                      onChange={(e) => setZoomA(parseFloat(e.target.value))}
                      className="w-full accent-pink-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Dikey Konum Y */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                      <span>Dikey Konum (Y)</span>
                      <span className="text-pink-400 font-bold">{posYA}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="1"
                      value={posYA} 
                      onChange={(e) => setPosYA(parseInt(e.target.value))}
                      className="w-full accent-pink-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Yatay Konum X */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                      <span>Yatay Konum (X)</span>
                      <span className="text-pink-400 font-bold">{posXA}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="1"
                      value={posXA} 
                      onChange={(e) => setPosXA(parseInt(e.target.value))}
                      className="w-full accent-pink-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Akıllı Arka Plan Dolgusu Panel B */}
                  <div className="bg-slate-950/40 p-3 rounded-2xl border border-white/5 flex flex-col gap-2">
                    <span className="text-[8px] font-black text-slate-400 tracking-widest uppercase">Akıllı Arka Plan Dolgusu</span>
                    <div className="flex gap-1.5 p-1 bg-slate-950 rounded-xl border border-white/5 w-fit">
                      <button
                        type="button"
                        onClick={() => setBgTypeB('blur')}
                        className={`px-3 py-1 text-[8px] font-bold rounded-lg transition-all ${bgTypeB === 'blur' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Bulanık Arka Plan
                      </button>
                      <button
                        type="button"
                        onClick={() => setBgTypeB('solid')}
                        className={`px-3 py-1 text-[8px] font-bold rounded-lg transition-all ${bgTypeB === 'solid' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Düz Renk Arka Plan
                      </button>
                    </div>
                    
                    {bgTypeB === 'solid' && (
                      <div className="flex flex-wrap items-center gap-2 mt-1 bg-slate-900/40 p-2 rounded-xl">
                        {[
                          { name: 'Beyaz', value: '#FFFFFF' },
                          { name: 'Siyah', value: '#000000' },
                          { name: 'Açık Gri', value: '#F3F4F6' },
                          { name: 'Koyu Slate', value: '#1E293B' },
                          { name: 'Bej/Krem', value: '#FAFaf9' },
                          { name: 'Gül Kurusu', value: '#FCE7F3' },
                          { name: 'Pastel Mavi', value: '#F0F9FF' },
                        ].map((color) => (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => setBgColorB(color.value)}
                            title={color.name}
                            style={{ backgroundColor: color.value }}
                            className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer hover:scale-110 ${bgColorB === color.value ? 'border-pink-500 scale-110' : 'border-white/10'}`}
                          />
                        ))}
                        <div className="relative flex items-center justify-center w-5 h-5 rounded-full overflow-hidden border border-white/20 cursor-pointer hover:scale-110 shrink-0">
                          <input 
                            type="color" 
                            value={bgColorB} 
                            onChange={(e) => setBgColorB(e.target.value)}
                            className="absolute inset-0 w-8 h-8 -translate-x-1.5 -translate-y-1.5 cursor-pointer p-0 bg-transparent border-0 opacity-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Zoom B */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                      <span>Sığdır / Yakınlaştır (Zoom)</span>
                      <span className="text-pink-400 font-bold">{zoomB.toFixed(2)}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="2.5" 
                      step="0.05"
                      value={zoomB} 
                      onChange={(e) => setZoomB(parseFloat(e.target.value))}
                      className="w-full accent-pink-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Dikey Konum Y */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                      <span>Dikey Konum (Y)</span>
                      <span className="text-pink-400 font-bold">{posYB}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="1"
                      value={posYB} 
                      onChange={(e) => setPosYB(parseInt(e.target.value))}
                      className="w-full accent-pink-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Yatay Konum X */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                      <span>Yatay Konum (X)</span>
                      <span className="text-pink-400 font-bold">{posXB}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="1"
                      value={posXB} 
                      onChange={(e) => setPosXB(parseInt(e.target.value))}
                      className="w-full accent-pink-500 h-1 bg-slate-950 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* NEXT TRIGGER BUTTON */}
          <button
            type="button"
            onClick={() => { if (canGoNext) setStep(2); }}
            disabled={!canGoNext}
            className={`w-full py-4 rounded-2xl text-xs font-black tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${canGoNext ? 'bg-gradient-to-r from-pink-600 via-fuchsia-600 to-indigo-600 text-white shadow-lg shadow-pink-600/10 hover:brightness-110 active:scale-[0.98]' : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            <span>Detayları ve Açıklamayı Yaz</span> <ChevronRight className="w-4 h-4" />
          </button>

        </div>
      )}

      {/* STEP 2: SHARING DETAILS */}
      {step === 2 && (
        <div className="px-4 py-3 flex flex-col gap-4 animate-scale-up">
          
          {/* CAPTION & MINI PREVIEW */}
          <div className="flex gap-3 bg-[#0a0a0c] p-3 border border-white/5 rounded-3xl shadow-xl">
            {/* Split Thumbnail */}
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 relative shrink-0 flex">
              <div className="w-1/2 h-full overflow-hidden">
                <img src={optionAUrl || undefined} alt="A-mini" className="w-full h-full object-cover" />
              </div>
              <div className="w-1/2 h-full overflow-hidden border-l border-black/50">
                <img src={optionBUrl || undefined} alt="B-mini" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Title Textarea */}
            <div className="flex-1 flex flex-col justify-between">
              <textarea
                required
                placeholder="Açıklama ve karşılaştırma sorusu yazın... #moda #stil #hangisi"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
                className="w-full min-h-[44px] text-xs bg-transparent border-none focus:ring-0 outline-none text-slate-100 placeholder-slate-600 leading-relaxed font-sans resize-none p-0"
              />
              <div className="flex justify-between items-center text-[8px] font-mono text-slate-600 pt-1">
                <span># kullanarak etiket ekleyin</span>
                <span>{140 - title.length} karakter</span>
              </div>
            </div>
          </div>

          {/* INSTAGRAM QUICK HASHTAG SUGGESTIONS */}
          <div className="flex flex-col gap-2">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">Hızlı Popüler Etiketler</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleQuickTagClick(tag)}
                  className="px-2.5 py-1 text-[10px] font-medium bg-slate-900 border border-white/5 hover:border-pink-500/40 text-slate-300 hover:text-white rounded-full transition active:scale-95 cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>

          {/* REDIRECT LINKS SECTION */}
          {(!linkA.trim() || !linkB.trim()) && (
            <div className="flex flex-col gap-3 bg-slate-900/30 border border-white/5 rounded-3xl p-4 transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Yönlendirme Linkleri (Opsiyonel)</span>
                <button
                  type="button"
                  onClick={() => setShowOptionalLinksPanel(!showOptionalLinksPanel)}
                  className="text-[9px] font-bold font-mono text-pink-500 hover:text-pink-400 flex items-center gap-1 bg-pink-500/10 px-2.5 py-1 rounded-full border border-pink-500/20 active:scale-95 transition cursor-pointer"
                >
                  {showOptionalLinksPanel ? 'Gizle ⬆️' : 'Link Ekle ⬇️'}
                </button>
              </div>

              {showOptionalLinksPanel && (
                <div className="flex flex-col gap-3 pt-2 border-t border-white/5 animate-slide-down">
                  {!linkA.trim() && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] text-slate-500 font-mono">SOL SEÇENEK (A) YÖNLENDİRME LİNKİ</span>
                      <input
                        type="url"
                        placeholder="https://example.com/sol-urun"
                        value={optionALink}
                        onChange={(e) => setOptionALink(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800/80 focus:border-pink-500/50 rounded-xl px-3 py-2 outline-none text-slate-100 font-mono transition duration-200"
                      />
                    </div>
                  )}
                  {!linkB.trim() && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] text-slate-500 font-mono">SAĞ SEÇENEK (B) YÖNLENDİRME LİNKİ</span>
                      <input
                        type="url"
                        placeholder="https://example.com/sag-urun"
                        value={optionBLink}
                        onChange={(e) => setOptionBLink(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800/80 focus:border-pink-500/50 rounded-xl px-3 py-2 outline-none text-slate-100 font-mono transition duration-200"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-white/5 font-mono text-[9px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-pink-500" />
                  <span>Mevcut Konumun:</span>
                </div>
                <span className="font-extrabold text-slate-200 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">📍 {location}</span>
              </div>
            </div>
          )}

          {/* ACTIVE PREVIEW PRE-SHARE */}
          <div className="bg-[#0a0a0c] border border-white/5 rounded-3xl overflow-hidden p-3.5 flex flex-col gap-2.5 shadow-2xl">
            <span className="text-[8px] font-mono font-black text-pink-500 uppercase tracking-widest flex items-center gap-1">
              <Eye className="w-3 h-3 animate-pulse" /> ÖNİZLEME
            </span>

            <p className="text-xs font-bold text-white leading-relaxed font-sans px-0.5">
              {title.trim() === '' ? 'Karşılaştırma Başlığı ve Soru Buraya Gelecek... #etiket' : title}
            </p>

            <div className={`w-full grid gap-[1.5px] rounded-2xl overflow-hidden border border-white/10 bg-black ${layout === 'side-by-side' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="relative aspect-square bg-[#101012] overflow-hidden">
                <img src={optionAUrl || undefined} alt="A-pre" className="w-full h-full object-cover" />
              </div>
              <div className="relative aspect-square bg-[#101012] overflow-hidden">
                <img src={optionBUrl || undefined} alt="B-pre" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          {/* PUBLISH TRIGGER */}
          <button
            type="button"
            onClick={handleCreatePost}
            disabled={loading || !isFormValid}
            className={`w-full h-14 rounded-2xl text-xs font-black tracking-wider uppercase transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${isFormValid ? 'bg-gradient-to-r from-pink-600 via-fuchsia-600 to-indigo-600 text-white shadow-lg shadow-pink-600/20 hover:brightness-110 active:scale-[0.98]' : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>Karşılaştırmayı Yayınla <Check className="w-4 h-4" /></>
            )}
          </button>

        </div>
      )}

    </div>
  );
};
