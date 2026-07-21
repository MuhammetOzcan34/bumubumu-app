/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { ImageInputCompressor } from '../components/ImageInputCompressor';
import { ShieldCheck, Award, Target, HelpCircle, MapPin, Sparkles, AlertCircle, CheckCircle, Users, Database, RefreshCw } from 'lucide-react';

export const AdminPanelPage: React.FC = () => {
  const { currentUser, userData, profileData } = useAuth();
  
  // Form State'leri (Sponsorlu Karşılaştırma Sorusu)
  const [title, setTitle] = useState('');
  const [optionALabel, setOptionALabel] = useState('Bu');
  const [optionBLabel, setOptionBLabel] = useState('Şu');
  const [optionAUrl, setOptionAUrl] = useState('');
  const [optionBUrl, setOptionBUrl] = useState('');
  
  // Reklam & Kampanya Hedefleme State'leri
  const [targetLocation, setTargetLocation] = useState('İstanbul');
  const [targetGender, setTargetGender] = useState('Tüm Cinsiyetler');
  const [targetAgeMin, setTargetAgeMin] = useState(18);
  const [targetAgeMax, setTargetAgeMax] = useState(35);
  const [rewardPoints, setRewardPoints] = useState(25); // Oylama başı ödül puanı

  // Geri Bildirimler
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Veri Kurtarma (Restore) State'leri
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<string | null>(null);

  // Türkiye öne çıkan şehirleri
  const cities = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Trabzon", "Diyarbakır", "Eskişehir", "Gaziantep", "Tüm Türkiye"];

  // Sadece Admin Rol Koruma Kilidi (Üst Seviye Güvenlik Bariyeri)
  const isAdmin = userData && userData.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="w-full max-w-lg mx-auto p-6 min-h-[80vh] flex flex-col items-center justify-center text-center font-sans">
        <ShieldCheck className="w-16 h-16 text-rose-500/80 animate-pulse mb-4" />
        <h2 className="text-xl font-black text-rose-400 font-mono uppercase tracking-widest">Grup Yetki Hatası</h2>
        <p className="text-xs text-slate-500 font-mono mt-2 lowercase max-w-xs leading-relaxed">
          buraya sadece rolü 'admin' olan yetkili yöneticiler giriş yapabilir.
        </p>
        <div className="mt-4 p-3 bg-slate-900 border border-slate-800 rounded-xl text-[10px] text-slate-400 font-mono">
          Aktif Kullanıcı Rolü: <span className="font-bold text-yellow-400">{userData?.role || 'Ziyaretçi / Yok'}</span>
        </div>
      </div>
    );
  }

  const handleRestoreData = async () => {
    setRestoring(true);
    setRestoreProgress("Yedek veriler hazırlanıyor...");
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const batch = writeBatch(db);

      // 1. Simüle Kullanıcı Verileri ve Kamuya Açık Profilleri Tanımlayalım
      const usersToSeed = [
        {
          userId: 'user_ahmet_can',
          email: 'ahmet_can@bumu.com',
          role: 'user',
          points: 120,
          birthYear: 1998,
          age: 28,
          gender: 'Erkek'
        },
        {
          userId: 'user_merve_kara',
          email: 'merve_kara@bumu.com',
          role: 'user',
          points: 250,
          birthYear: 2001,
          age: 25,
          gender: 'Kadın'
        },
        {
          userId: 'user_cem_yildiz',
          email: 'cem_yildiz@bumu.com',
          role: 'user',
          points: 180,
          birthYear: 1995,
          age: 31,
          gender: 'Erkek'
        },
        {
          userId: 'user_elif_yilmaz',
          email: 'elif_yilmaz@bumu.com',
          role: 'user',
          points: 340,
          birthYear: 2003,
          age: 23,
          gender: 'Kadın'
        },
        {
          userId: 'user_selin_demir',
          email: 'selin_demir@bumu.com',
          role: 'user',
          points: 420,
          birthYear: 2000,
          age: 26,
          gender: 'Kadın'
        }
      ];

      const profilesToSeed = [
        {
          userId: 'user_ahmet_can',
          displayName: 'Ahmet Can',
          username: 'ahmet_can',
          photoURL: 'https://api.dicebear.com/7.x/adventurer/svg?seed=ahmet_can',
          bio: 'Teknoloji meraklısı, fotoğrafçı ve kahve aşığı. En iyi kararı siz verin!',
          location: 'İstanbul'
        },
        {
          userId: 'user_merve_kara',
          displayName: 'Merve Kara',
          username: 'merve_kara',
          photoURL: 'https://api.dicebear.com/7.x/adventurer/svg?seed=merve_kara',
          bio: 'Gezgin, gurme ve sanat tutkunu. Hayatı karşılaştırmayı seviyorum! ✈️🍕',
          location: 'İzmir'
        },
        {
          userId: 'user_cem_yildiz',
          displayName: 'Cem Yıldız',
          username: 'cem_yildiz',
          photoURL: 'https://api.dicebear.com/7.x/adventurer/svg?seed=cem_yildiz',
          bio: 'Yazılımcı, otomobil tutkunu ve spor sevdalısı. Porsche vs Tesla?',
          location: 'Ankara'
        },
        {
          userId: 'user_elif_yilmaz',
          displayName: 'Elif Yılmaz',
          username: 'elif_yilmaz',
          photoURL: 'https://api.dicebear.com/7.x/adventurer/svg?seed=elif_yilmaz',
          bio: 'Kedi annesi, kitap kurdu ve doğa aşığı. Kararsız kalınca oylatırım! 🐱',
          location: 'Bursa'
        },
        {
          userId: 'user_selin_demir',
          displayName: 'Selin Demir',
          username: 'selin_demir',
          photoURL: 'https://api.dicebear.com/7.x/adventurer/svg?seed=selin_demir',
          bio: 'Tasarımcı, müzik sevdalısı ve pop-kültür takipçisi. Görsel uyum her şeydir.',
          location: 'Antalya'
        }
      ];

      setRestoreProgress("Kullanıcılar ve Profiller veritabanına ekleniyor...");
      usersToSeed.forEach(u => {
        const uRef = doc(db, 'users', u.userId);
        batch.set(uRef, {
          ...u,
          createdAt: new Date()
        });
      });

      profilesToSeed.forEach(p => {
        const pRef = doc(db, 'profiles', p.userId);
        batch.set(pRef, p);
      });

      // 2. Karşılaştırma Gönderileri Tanımlayalım (Resimleri ve İstatistikleri ile Birlikte)
      const postsToSeed = [
        {
          postId: 'post_tech_iphone_vs_samsung',
          creatorId: 'user_ahmet_can',
          creatorName: 'Ahmet Can',
          creatorPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=ahmet_can',
          title: 'Yılın amiral gemisi savaşı: Hangisini tercih edersiniz?',
          optionALabel: 'iPhone 15 Pro Max',
          optionBLabel: 'Samsung S24 Ultra',
          optionAUrl: 'https://images.unsplash.com/photo-1616348436168-de43ad0db179?q=80&w=400',
          optionBUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?q=80&w=400',
          layout: 'side-by-side',
          voteCountA: 245,
          voteCountB: 188,
          totalVotes: 433,
          tags: ['teknoloji', 'telefon', 'iphone', 'samsung'],
          location: 'İstanbul',
          groupId: 'global',
          isSponsored: false,
          status: 'active'
        },
        {
          postId: 'post_food_coffee',
          creatorId: 'user_merve_kara',
          creatorName: 'Merve Kara',
          creatorPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=merve_kara',
          title: 'Güne başlarken ilk kahve tercihiniz hangisi olmalı?',
          optionALabel: 'Sert Filtre Kahve',
          optionBLabel: 'Köpüklü Türk Kahvesi',
          optionAUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=400',
          optionBUrl: 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?q=80&w=400',
          layout: 'side-by-side',
          voteCountA: 312,
          voteCountB: 356,
          totalVotes: 668,
          tags: ['kahve', 'gastronomi', 'sabah', 'keyif'],
          location: 'İzmir',
          groupId: 'global',
          isSponsored: false,
          status: 'active'
        },
        {
          postId: 'post_car_tesla_vs_porsche',
          creatorId: 'user_cem_yildiz',
          creatorName: 'Cem Yıldız',
          creatorPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=cem_yildiz',
          title: 'Hız, teknoloji ve sürüş keyfi: Elektrikli mi, Alman klasiği mi?',
          optionALabel: 'Tesla Model S Plaid',
          optionBLabel: 'Porsche 911 GT3',
          optionAUrl: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?q=80&w=400',
          optionBUrl: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?q=80&w=400',
          layout: 'side-by-side',
          voteCountA: 142,
          voteCountB: 279,
          totalVotes: 421,
          tags: ['araba', 'hız', 'tesla', 'porsche'],
          location: 'Ankara',
          groupId: 'global',
          isSponsored: false,
          status: 'active'
        },
        {
          postId: 'post_pet_cat_vs_dog',
          creatorId: 'user_elif_yilmaz',
          creatorName: 'Elif Yılmaz',
          creatorPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=elif_yilmaz',
          title: 'Ev arkadaşı olarak hangisini daha çok seviyorsunuz?',
          optionALabel: 'Bağımsız Kediler',
          optionBLabel: 'Sadık Köpekler',
          optionAUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=400',
          optionBUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=400',
          layout: 'side-by-side',
          voteCountA: 512,
          voteCountB: 489,
          totalVotes: 1001,
          tags: ['hayvanlar', 'kedi', 'köpek', 'sevimli'],
          location: 'Bursa',
          groupId: 'global',
          isSponsored: false,
          status: 'active'
        },
        {
          postId: 'post_travel_istanbul_vs_izmir',
          creatorId: 'user_selin_demir',
          creatorName: 'Selin Demir',
          creatorPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=selin_demir',
          title: 'Yaşamak veya tatil yapmak için favori Türk şehriniz?',
          optionALabel: 'Tarihi İstanbul',
          optionBLabel: 'Sakin ve Ege İzmir',
          optionAUrl: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?q=80&w=400',
          optionBUrl: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?q=80&w=400',
          layout: 'side-by-side',
          voteCountA: 345,
          voteCountB: 412,
          totalVotes: 757,
          tags: ['gezi', 'tatil', 'istanbul', 'izmir'],
          location: 'Antalya',
          groupId: 'global',
          isSponsored: false,
          status: 'active'
        }
      ];

      setRestoreProgress("Karşılaştırma Gönderileri ve oy istatistikleri senkronize ediliyor...");
      postsToSeed.forEach((p, idx) => {
        const pRef = doc(db, 'posts', p.postId);
        batch.set(pRef, {
          ...p,
          createdAt: new Date(Date.now() - (idx * 2 * 60 * 60 * 1000)) // staggered time
        });
      });

      // 3. Bölünmüş Sol/Sağ Yorumlarını Tanımlayalım (divided Comments)
      const commentsToSeed = [
        // iPhone vs Samsung Comments
        {
          commentId: 'comment_tech_1',
          postId: 'post_tech_iphone_vs_samsung',
          userId: 'user_selin_demir',
          userName: 'Selin Demir',
          userPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=selin_demir',
          votedOption: 'A',
          text: 'Kesinlikle iPhone. iOS ekosistemi, uygulama kalitesi ve uzun ömürlü stabilite her zaman bir adım önde tutuyor.',
          createdAt: new Date()
        },
        {
          commentId: 'comment_tech_2',
          postId: 'post_tech_iphone_vs_samsung',
          userId: 'user_cem_yildiz',
          userName: 'Cem Yıldız',
          userPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=cem_yildiz',
          votedOption: 'B',
          text: 'S24 Ultra özgürlüktür. 100x zoom kamerası ve yapay zeka özellikleri (Circle to Search vb) ile iPhoneu katlıyor.',
          createdAt: new Date()
        },
        {
          commentId: 'comment_tech_3',
          postId: 'post_tech_iphone_vs_samsung',
          userId: 'user_elif_yilmaz',
          userName: 'Elif Yılmaz',
          userPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=elif_yilmaz',
          votedOption: 'A',
          text: 'Titanyum kasa tasarımı ve yeni eylem tuşu ile iPhone 15 Pro serisi elde mükemmel hissettiriyor.',
          createdAt: new Date()
        },
        {
          commentId: 'comment_tech_4',
          postId: 'post_tech_iphone_vs_samsung',
          userId: 'user_merve_kara',
          userName: 'Merve Kara',
          userPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=merve_kara',
          votedOption: 'B',
          text: 'S Pen desteği olması iş hayatında not almayı inanılmaz kolaylaştırıyor. Benim oyum net Samsunga.',
          createdAt: new Date()
        },

        // Coffee Comments
        {
          commentId: 'comment_coffee_1',
          postId: 'post_food_coffee',
          userId: 'user_ahmet_can',
          userName: 'Ahmet Can',
          userPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=ahmet_can',
          votedOption: 'A',
          text: 'Güne kahve kokusuyla uyanmak ve o sert filtre kahve lezzetiyle zihnimi açmak paha biçilemez.',
          createdAt: new Date()
        },
        {
          commentId: 'comment_coffee_2',
          postId: 'post_food_coffee',
          userId: 'user_selin_demir',
          userName: 'Selin Demir',
          userPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=selin_demir',
          votedOption: 'B',
          text: 'Bol köpüklü taze çekilmiş bir Türk kahvesinin yanındaki çikolata ve geleneksel tadı hiçbir filtreye değişmem.',
          createdAt: new Date()
        },

        // Car Comments
        {
          commentId: 'comment_car_1',
          postId: 'post_car_tesla_vs_porsche',
          userId: 'user_ahmet_can',
          userName: 'Ahmet Can',
          userPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=ahmet_can',
          votedOption: 'A',
          text: '0-100 hızlanması ve o sessiz teknolojik sürüş deneyimi için Tesla Plaid kesinlikle geleceğin arabası.',
          createdAt: new Date()
        },
        {
          commentId: 'comment_car_2',
          postId: 'post_car_tesla_vs_porsche',
          userId: 'user_elif_yilmaz',
          userName: 'Elif Yılmaz',
          userPhoto: 'https://api.dicebear.com/7.x/adventurer/svg?seed=elif_yilmaz',
          votedOption: 'B',
          text: 'Arabayı araba yapan o motor sesidir! Porsche 911 GT3ün ruhu var, Tesla ise tekerlekli bir tabletten farksız.',
          createdAt: new Date()
        }
      ];

      setRestoreProgress("Yorumlar ve bölünmüş düşünceler sisteme bağlanıyor...");
      commentsToSeed.forEach(c => {
        const cRef = doc(db, 'posts', c.postId, 'comments', c.commentId);
        batch.set(cRef, c);
      });

      // 4. Hashtag ve Trend Sayacı Tanımlayalım (Tags / Hashtags)
      const tagsToSeed = [
        { tag: 'teknoloji', count: 184 },
        { tag: 'kahve', count: 215 },
        { tag: 'araba', count: 96 },
        { tag: 'hayvanlar', count: 320 },
        { tag: 'gezi', count: 147 },
        { tag: 'istanbul', count: 250 },
        { tag: 'izmir', count: 212 }
      ];

      setRestoreProgress("Gündem popülerliği ve hashtagler indeksleniyor...");
      tagsToSeed.forEach(t => {
        const tRef = doc(db, 'tags', t.tag);
        batch.set(tRef, {
          tag: t.tag,
          count: t.count,
          updatedAt: new Date()
        });
      });

      // 5. Global Sistem İstatistiklerini ve Trend Listelerini Oluşturalım (system_stats/global_trends)
      const statsRef = doc(db, 'system_stats', 'global_trends');
      batch.set(statsRef, {
        trends: [
          { tag: 'hayvanlar', count: 320, score: 9.8 },
          { tag: 'istanbul', count: 250, score: 8.5 },
          { tag: 'kahve', count: 215, score: 7.9 },
          { tag: 'teknoloji', count: 184, score: 7.2 },
          { tag: 'izmir', count: 212, score: 6.8 }
        ],
        top_all_time: [
          { postId: 'post_pet_cat_vs_dog', title: 'En yakın ev dostunuz olarak hangisini daha çok seviyorsunuz?', totalVotes: 1001 },
          { postId: 'post_travel_istanbul_vs_izmir', title: 'Yaşamak veya tatil yapmak için favori Türk şehriniz?', totalVotes: 757 },
          { postId: 'post_food_coffee', title: 'Güne başlarken ilk kahve tercihiniz hangisi olmalı?', totalVotes: 668 }
        ]
      });

      setRestoreProgress("Bütün işlemler senkronize bir şekilde veritabanına aktarılıyor...");
      await batch.commit();

      setSuccessMsg("Eski gönderiler, örnek profiller, oylama verileri ve bölünmüş yorumlar başarıyla sıfırlama öncesi haline geri yüklendi! Feed ve Gündem akışlarınız artık dolu.");
    } catch (err: any) {
      console.error("Yedek yükleme hatası:", err);
      setErrorMsg("Veri geri yükleme başarısız oldu: " + (err.message || err));
    } finally {
      setRestoring(false);
      setRestoreProgress(null);
    }
  };

  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!title.trim() || !optionAUrl || !optionBUrl) {
      setErrorMsg("Lütfen kampanya karşılaştırma sorusunu girin ve her iki görseli de yükleyin.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const postId = 'sponsored_' + Math.random().toString(36).substring(2, 11);
      
      const batch = writeBatch(db);

      // 1. Sponsorlu Post Dökümanı Oluşturma
      const postRef = doc(db, 'posts', postId);
      const postPayload = {
        postId,
        creatorId: currentUser.uid,
        creatorName: "👑 " + (profileData?.displayName || "Sistem Yöneticisi"),
        creatorPhoto: "https://api.dicebear.com/7.x/identicon/svg?seed=admin_crown",
        title: title.trim(),
        optionALabel: optionALabel.trim() || 'Bu',
        optionBLabel: optionBLabel.trim() || 'Şu',
        optionAUrl,
        optionBUrl,
        layout: "side-by-side",
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Sponsorlu postlar genellikle 7 gün sürer
        voteCountA: 0,
        voteCountB: 0,
        totalVotes: 0,
        tags: ["sponsor", "kampanya", "ödüllü"],
        location: targetLocation,
        groupId: "global", // Sponsorlu gönderiler tüm akışlarda görülür
        isSponsored: true,
        targetGender,
        targetLocation,
        targetAgeMin: Number(targetAgeMin),
        targetAgeMax: Number(targetAgeMax),
        rewardPoints: Number(rewardPoints),
        status: "active",
        winnerOption: ""
      };

      batch.set(postRef, postPayload);

      // 2. Hashtag katsayılarını her ihtimale karşı artırıyoruz
      const tags = ["sponsor", "kampanya", "ödüllü"];
      tags.forEach(tag => {
        const tagRef = doc(db, 'tags', tag);
        batch.set(tagRef, {
          tag,
          count: increment(1),
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();

      setSuccessMsg("Ödüllü Sponsorlu Kampanyanız başarıyla kuruldu ve radardaki hedeflere ulaştırıldı!");
      setTitle('');
      setOptionALabel('Bu');
      setOptionBLabel('Şu');
      setOptionAUrl('');
      setOptionBUrl('');
    } catch (err) {
      console.error("Kampanya başlatma hatası:", err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `posts`);
      } catch (e) {
        setErrorMsg("Sponsorlu kampanya veritabanı kurallarına takıldı.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-950/40 p-4 min-h-screen text-slate-100 flex flex-col gap-6 font-sans">
      
      {/* Admin Panel Üst Kısım */}
      <div className="text-center mt-2">
        <div className="inline-flex p-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-2">
          <ShieldCheck className="w-8 h-8 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-amber-300 leading-none">REKLAM & SPONSOR PANELİ</h1>
        <p className="text-xs text-slate-500 font-mono mt-2 lowercase">sponsorlu oylama kampanyaları ve hedefleme paneli</p>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs py-3 px-4 rounded-2xl flex items-start gap-2 font-mono">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs py-3 px-4 rounded-2xl flex items-start gap-2 font-mono animate-fade-in">
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleLaunchCampaign} className="flex flex-col gap-5 bg-slate-900/40 p-5 border border-slate-800/60 rounded-3xl">
        
        {/* Soru Girişi */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-400" /> Kampanya Karşılaştırma Sorusu
          </span>
          <textarea
            required
            placeholder="Örn: Sizce yeni çıkardığımız ambalaj tasarımı hangisi olmalı?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={110}
            className="w-full min-h-[65px] text-xs bg-slate-950/70 border border-slate-800 focus:border-indigo-500 rounded-2xl p-3 outline-none text-slate-200 transition font-medium"
          />
        </div>

        {/* HEDEFLEME KRİTERLERİ BAŞLIĞI */}
        <div className="border-t border-slate-800/50 pt-3 space-y-3.5">
          <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
            <Target className="w-4 h-4 text-rose-400" /> Kampanya & Hedef Kitle Kriterleri
          </span>

          <div className="grid grid-cols-2 gap-4">
            {/* Lokasyon Hedefleme */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Kampanya Konumu
              </span>
              <select
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-2.5 outline-none text-slate-200 font-bold"
              >
                {cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Dağıtılacak Oy Başı Ödül Puanı */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-amber-400" /> Oy Başına Ödül Puanı
              </span>
              <input
                required
                type="number"
                min={5}
                max={100}
                value={rewardPoints}
                onChange={(e) => setRewardPoints(Number(e.target.value))}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 p-2 rounded-xl outline-none text-slate-200 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Cinsiyet Hedefleme */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Hedef Cinsiyet
              </span>
              <select
                value={targetGender}
                onChange={(e) => setTargetGender(e.target.value)}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 p-2 rounded-xl outline-none text-slate-200 font-bold cursor-pointer"
              >
                <option value="Tüm Cinsiyetler">Tüm Cinsiyetler</option>
                <option value="Erkek">Erkek</option>
                <option value="Kadın">Kadın</option>
                <option value="Belirtilmemiş">Belirtilmemiş</option>
              </select>
            </div>

            {/* Yaş Aralığı Hedefleme */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Hedef Yaş Aralığı ({targetAgeMin} - {targetAgeMax})</span>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Min"
                  min={13}
                  max={99}
                  value={targetAgeMin}
                  onChange={(e) => setTargetAgeMin(Number(e.target.value))}
                  className="w-1/2 text-xs bg-slate-950 border border-slate-800 p-2 rounded-xl text-center font-bold text-slate-200"
                />
                <span className="text-slate-600 font-bold">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  min={13}
                  max={99}
                  value={targetAgeMax}
                  onChange={(e) => setTargetAgeMax(Number(e.target.value))}
                  className="w-1/2 text-xs bg-slate-950 border border-slate-800 p-2 rounded-xl text-center font-bold text-slate-200"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SPONSOR GÖNDERİ SEÇENEK GÖRSELLERİ */}
        <div className="border-t border-slate-800/50 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* SEÇENEK A */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase">TASARIM A / ÜRÜN A ETİKETİ</span>
              <input
                type="text"
                placeholder="Örn: Klasik Cam Ambalaj"
                value={optionALabel}
                onChange={(e) => setOptionALabel(e.target.value)}
                maxLength={20}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 p-1.5 rounded-xl outline-none text-slate-100 font-bold"
              />
            </div>
            
            <ImageInputCompressor 
              id="sponsor-a" 
              label="Tasarım A Görseli"
              onCompressedImage={(base64) => setOptionAUrl(base64)}
              onClear={() => setOptionAUrl('')}
            />
          </div>

          {/* SEÇENEK B */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase">TASARIM B / ÜRÜN B ETİKETİ</span>
              <input
                type="text"
                placeholder="Örn: Modern Alüminyum Ambalaj"
                value={optionBLabel}
                onChange={(e) => setOptionBLabel(e.target.value)}
                maxLength={20}
                className="w-full text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 p-1.5 rounded-xl outline-none text-slate-100 font-bold"
              />
            </div>

            <ImageInputCompressor 
              id="sponsor-b" 
              label="Tasarım B Görseli"
              onCompressedImage={(base64) => setOptionBUrl(base64)}
              onClear={() => setOptionBUrl('')}
            />
          </div>

        </div>

        {/* Kampanya Tetikleme Butonu */}
        <button
          type="submit"
          disabled={loading || !title.trim() || !optionAUrl || !optionBUrl}
          className="w-full bg-gradient-to-r from-amber-500 via-amber-600 to-indigo-600 hover:opacity-90 text-slate-950 font-black text-xs font-mono tracking-wider py-3.5 rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Sponsorlu Kampanya Dağıtılıyor...</span>
            </div>
          ) : (
            <>
              <Sparkles className="w-4 h-4 animate-bounce" /> ÖDÜLLÜ KAMPANYAYI TETİKLE!
            </>
          )}
        </button>

      </form>

      {/* VERİTABANI YEDEK GERİ YÜKLEME KARTI */}
      <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900/40 to-slate-950/40 border border-indigo-500/10 hover:border-indigo-500/20 transition duration-300 p-6 rounded-3xl flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">Sistem Veri Kurtarma</h3>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase tracking-wider">sıfırlama öncesi verileri geri yükle</p>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Veritabanı sıfırlandığı için feed akışınız boş görünüyor olabilir. Bu araçla eski karşılaştırma gönderilerini, örnek kullanıcı profillerini, bölünmüş yorumları ve oy istatistiklerini tek tıkla geri yükleyebilirsiniz.
        </p>

        {restoreProgress && (
          <div className="bg-indigo-500/5 border border-indigo-500/10 py-2 px-3 rounded-xl flex items-center gap-2 text-[10px] text-indigo-300 font-mono">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>{restoreProgress}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleRestoreData}
          disabled={restoring}
          className="w-full mt-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-slate-100 font-bold text-xs py-3 rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          {restoring ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-100 border-t-transparent rounded-full animate-spin" />
              <span>Geri Yükleniyor...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" /> Eski Verileri Geri Yükle
            </>
          )}
        </button>
      </div>

    </div>
  );
};
