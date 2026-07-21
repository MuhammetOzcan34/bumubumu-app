import { db } from './firebase';
import { collection, getDocs, limit, query, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

export async function checkAndSeedDatabase(): Promise<boolean> {
  try {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      // Already has data, no need to seed
      return false;
    }

    console.log("Database is empty, auto-seeding realistic profiles and posts...");
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
        optionALink: 'https://www.apple.com/iphone-15-pro/',
        optionBLink: 'https://www.samsung.com/galaxy-s24-ultra/',
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
        optionALink: 'https://tr.wikipedia.org/wiki/Filtre_kahve',
        optionBLink: 'https://tr.wikipedia.org/wiki/T%C3%BCrk_kahvesi',
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
        optionALink: 'https://www.tesla.com/models',
        optionBLink: 'https://www.porsche.com/international/models/911/911-gt3-models/911-gt3/',
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
        optionALink: 'https://tr.wikipedia.org/wiki/Kedi',
        optionBLink: 'https://tr.wikipedia.org/wiki/K%C3%B6pek',
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
        optionALink: 'https://www.istanbul.com/',
        optionBLink: 'https://www.visitizmir.org/',
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

    postsToSeed.forEach((p, idx) => {
      const pRef = doc(db, 'posts', p.postId);
      batch.set(pRef, {
        ...p,
        createdAt: new Date(Date.now() - (idx * 2 * 60 * 60 * 1000))
      });
    });

    // 3. Bölünmüş Sol/Sağ Yorumlarını Tanımlayalım (divided Comments)
    const commentsToSeed = [
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
        text: 'S24 Ultra özgürlüktür. 100x zoom kamerası ve yapay zeka özellikleri ile iPhoneu katlıyor.',
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
      }
    ];

    commentsToSeed.forEach(c => {
      const cRef = doc(db, 'posts', c.postId, 'comments', c.commentId);
      batch.set(cRef, c);
    });

    const tagsToSeed = [
      { tag: 'teknoloji', count: 184 },
      { tag: 'kahve', count: 215 },
      { tag: 'araba', count: 96 },
      { tag: 'hayvanlar', count: 320 },
      { tag: 'gezi', count: 147 },
      { tag: 'istanbul', count: 250 },
      { tag: 'izmir', count: 212 }
    ];

    tagsToSeed.forEach(t => {
      const tRef = doc(db, 'tags', t.tag);
      batch.set(tRef, {
        tag: t.tag,
        count: t.count,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

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

    await batch.commit();
    console.log("Auto-seeding database completed successfully!");
    return true;
  } catch (err) {
    console.error("Auto seeding database failed:", err);
    return false;
  }
}
