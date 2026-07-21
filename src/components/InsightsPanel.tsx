/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { UserCheck, Award, BarChart2, CheckCircle2 } from 'lucide-react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface InsightsPanelProps {
  voteCountA: number;
  voteCountB: number;
  totalVotes: number;
  labelA: string;
  labelB: string;
  isSponsored?: boolean;
  rewardPoints?: number;
  postId?: string;
  isAdmin?: boolean;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({
  voteCountA,
  voteCountB,
  totalVotes,
  labelA,
  labelB,
  isSponsored = false,
  rewardPoints = 0,
  postId,
  isAdmin = false
}) => {
  // Stat simülasyonu (oylayan profillerinden veya sabit oranlama yardımıyla çekilen şık grafikler)
  const percentA = totalVotes > 0 ? Math.round((voteCountA / totalVotes) * 100) : 50;
  const percentB = totalVotes > 0 ? (100 - percentA) : 50;

  // Gerçek zamanlı analiz state'leri
  const [realStats, setRealStats] = useState<{
    malePct: number;
    femalePct: number;
    pA: number;
    pB: number;
    pC: number;
    totalValid: number;
  } | null>(null);
  const [loadingRealStats, setLoadingRealStats] = useState(false);

  useEffect(() => {
    if (!postId || !isAdmin) return;

    const fetchRealVoterDemographics = async () => {
      setLoadingRealStats(true);
      try {
        const votesRef = collection(db, 'posts', postId, 'votes');
        const votesSnap = await getDocs(votesRef);
        const voteDocs = votesSnap.docs.map(d => d.data());

        if (voteDocs.length === 0) {
          setRealStats({ malePct: 0, femalePct: 0, pA: 0, pB: 0, pC: 0, totalValid: 0 });
          setLoadingRealStats(false);
          return;
        }

        // Oylayan kişilerin benzersiz ID'leri
        const userIds = Array.from(new Set(voteDocs.map(v => v.userId).filter(Boolean)));
        
        // Her bir kullanıcının bilgilerini Firestore 'users' koleksiyonundan çek
        const userPromises = userIds.map(async (uid) => {
          try {
            const uSnap = await getDoc(doc(db, 'users', uid));
            if (uSnap.exists()) {
              return uSnap.data();
            }
          } catch (e) {
            console.error("Voter detay çekme hatası:", e);
          }
          return null;
        });

        const usersData = (await Promise.all(userPromises)).filter(Boolean);
        
        let maleCount = 0;
        let femaleCount = 0;
        let specifiedGenderCount = 0;

        let age18_24 = 0;
        let age25_34 = 0;
        let age35_Plus = 0;
        let specifiedAgeCount = 0;

        // Local 2026 yılına göre yaşların hesaplanması
        const currentYear = new Date().getFullYear();

        usersData.forEach((u: any) => {
          // Cinsiyet Dağılım Hesabı
          const genderStr = (u.gender || '').trim().toLowerCase();
          if (genderStr === 'erkek') {
            maleCount++;
            specifiedGenderCount++;
          } else if (genderStr === 'kadın') {
            femaleCount++;
            specifiedGenderCount++;
          }

          // Yaş Dağılımı (Doğum Yılından Hesaplayarak)
          let calculatedAge = 0;
          let hasValidAge = false;

          if (u.birthYear) {
            calculatedAge = currentYear - Number(u.birthYear);
            hasValidAge = true;
          } else if (u.age) {
            calculatedAge = Number(u.age);
            hasValidAge = true;
          }

          if (hasValidAge && calculatedAge > 0) {
            specifiedAgeCount++;
            if (calculatedAge >= 18 && calculatedAge <= 24) {
              age18_24++;
            } else if (calculatedAge >= 25 && calculatedAge <= 34) {
              age25_34++;
            } else if (calculatedAge >= 35) {
              age35_Plus++;
            }
          }
        });

        const malePct = specifiedGenderCount > 0 ? Math.round((maleCount / specifiedGenderCount) * 100) : 50;
        const femalePct = specifiedGenderCount > 0 ? (100 - malePct) : 50;

        const pA = specifiedAgeCount > 0 ? Math.round((age18_24 / specifiedAgeCount) * 100) : 33;
        const pB = specifiedAgeCount > 0 ? Math.round((age25_34 / specifiedAgeCount) * 100) : 33;
        const pC = specifiedAgeCount > 0 ? 100 - (pA + pB) : 34;

        setRealStats({ 
          malePct, 
          femalePct, 
          pA, 
          pB, 
          pC,
          totalValid: usersData.length 
        });
      } catch (err) {
        console.error("Gerçek istatistik hesaplama hatası:", err);
      } finally {
        setLoadingRealStats(false);
      }
    };

    fetchRealVoterDemographics();
  }, [postId, isAdmin]);

  // Simüle edilmiş analiz kırılımları (Normal kullanıcılar için)
  const getDemographicsList = (total: number, vA: number, vB: number) => {
    if (total <= 0) {
      return {
        malePct: 50,
        femalePct: 50,
        pA: 33,
        pB: 33,
        pC: 34
      };
    }

    const ratio = (vA + 0.5) / (total + 1);
    let mCount = Math.round(total * (0.35 + ratio * 0.3));
    if (mCount < 0) mCount = 0;
    if (mCount > total) mCount = total;

    const malePct = Math.round((mCount / total) * 100);
    const femalePct = 100 - malePct;

    let countA = Math.round(total * 0.35);
    let countB = Math.round(total * 0.45);
    if (countA + countB > total) {
      countB = total - countA;
    }

    const pA = Math.round((countA / total) * 100);
    const pB = Math.round((countB / total) * 100);
    const pC = 100 - (pA + pB);

    return {
      malePct,
      femalePct,
      pA,
      pB,
      pC
    };
  };

  const demo = getDemographicsList(totalVotes, voteCountA, voteCountB);

  // Eğer admin ise ve veriler yüklendiyse gerçek verileri kullan, yoksa simülasyona dön
  const useRealStats = isAdmin && realStats !== null;
  const malePercent = useRealStats ? realStats!.malePct : demo.malePct;
  const femalePercent = useRealStats ? realStats!.femalePct : demo.femalePct;

  const ageGroups = [
    { label: '18-24 Yaş', percent: useRealStats ? realStats!.pA : demo.pA },
    { label: '25-34 Yaş', percent: useRealStats ? realStats!.pB : demo.pB },
    { label: '35+ Yaş', percent: useRealStats ? realStats!.pC : demo.pC },
  ];

  return (
    <div className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 mt-4 font-sans text-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold text-gray-400 font-display uppercase tracking-wider flex items-center gap-1.5">
          <UserCheck className="w-4 h-4 text-orange-500" />
          Kitle Seçim İçgörüsü {isAdmin && <span className="text-[9px] text-indigo-400 border border-indigo-500/35 bg-indigo-500/10 px-2 py-0.5 rounded-full uppercase tracking-widest ml-1 animate-pulse font-mono font-bold">Yönetici Analizi</span>}
        </h4>
        {isSponsored && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-[10px] font-display font-bold border border-orange-500/20">
            <Award className="w-3 h-3 animate-pulse" /> +{rewardPoints} Karma Puanı
          </span>
        )}
      </div>

      {loadingRealStats && isAdmin ? (
        <div className="py-8 flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-mono lowercase text-gray-400">oy kullananların doğum yılı analiz ediliyor...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Karşılaştırma Sonuç Çubukları */}
          <div className="bg-[#202024]/40 border border-white/5 rounded-xl p-3">
            <span className="text-xs text-gray-400 font-medium font-display">Seçenek Dağılımı</span>
            <div className="space-y-3 mt-2">
              <div>
                <div className="flex justify-between text-xs font-medium text-gray-300 mb-1">
                  <span className="font-display">{labelA || 'Sol Seçenek'}</span>
                  <span className="font-display text-orange-500 font-bold">{percentA}% ({voteCountA} oy)</span>
                </div>
                <div className="w-full bg-neutral-900 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-orange-600 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${percentA}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-gray-300 mb-1">
                  <span className="font-display">{labelB || 'Sağ Seçenek'}</span>
                  <span className="font-display text-gray-400 font-bold">{percentB}% ({voteCountB} oy)</span>
                </div>
                <div className="w-full bg-neutral-900 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-white/40 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${percentB}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Demografi: Cinsiyet ve Yaş Kırılımı */}
          <div className="bg-[#202024]/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium font-display">Cinsiyet ve Yaş Eğilimleri</span>
              {useRealStats && (
                <span className="text-[8px] font-mono text-emerald-400 flex items-center gap-0.5 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> {realStats?.totalValid} Gerçek Veri
                </span>
              )}
            </div>
            
            <div className="mt-2 space-y-2.5">
              {/* Cinsiyet Çubuğu */}
              <div>
                <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                  <span className="font-sans">Cinsiyet</span>
                  <span className="font-sans text-gray-200">{malePercent}% Erkek / {femalePercent}% Kadın</span>
                </div>
                <div className="w-full h-1.5 flex rounded-full overflow-hidden bg-neutral-900">
                  <div className="bg-orange-600 h-full" style={{ width: `${malePercent}%` }} />
                  <div className="bg-white/30 h-full" style={{ width: `${femalePercent}%` }} />
                </div>
              </div>

              {/* Yaş Grupları */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {ageGroups.map((group, idx) => (
                  <div key={idx} className="bg-black/20 border border-white/5 rounded-lg p-1.5 text-center">
                    <span className="block text-[8px] text-gray-550 font-display uppercase">{group.label}</span>
                    <span className="text-sm font-bold text-orange-500 font-display mt-0.5 block">{group.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
