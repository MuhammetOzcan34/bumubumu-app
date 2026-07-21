import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

const cleanUrlForTrend = (url?: string) => {
  if (!url) return "";
  if (url.startsWith("data:")) return ""; // Exclude huge base64 data URLs to avoid Firestore document 1MB limit
  return url;
};

export async function updatePostTrendScore(
  postId: string,
  postTitle: string,
  totalVotes: number,
  commentCount: number,
  tags: string[],
  location?: string,
  photoURL?: string,
  creatorName?: string,
  optionA?: string,
  optionB?: string,
  optionA_votes?: number,
  optionB_votes?: number,
  optionAUrl?: string,
  optionBUrl?: string,
  layout?: "side-by-side" | "stacked"
) {
  try {
    const score = (totalVotes || 0) * 1 + (commentCount || 0) * 3;
    const trendsRef = doc(db, 'system_stats', 'global_trends');

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(trendsRef);
      let trendsList: any[] = [];
      let topAllTime: any[] = [];
      if (snap.exists()) {
        const data = snap.data();
        trendsList = data.trends || [];
        topAllTime = data.top_all_time || [];
      }

      const newTrendItem = {
        postId,
        title: postTitle,
        totalVotes,
        commentCount,
        score,
        tags: tags || [],
        location: location || "",
        photoURL: cleanUrlForTrend(photoURL),
        creatorName: creatorName || "",
        optionA: optionA || "Seçenek A",
        optionB: optionB || "Seçenek B",
        optionALabel: optionA || "Seçenek A",
        optionBLabel: optionB || "Seçenek B",
        optionA_votes: optionA_votes || 0,
        optionB_votes: optionB_votes || 0,
        optionAUrl: cleanUrlForTrend(optionAUrl),
        optionBUrl: cleanUrlForTrend(optionBUrl),
        layout: layout || "side-by-side",
        createdAt: new Date().toISOString()
      };

      // 1. Update trends list (Recent trends)
      const existingIndex = trendsList.findIndex((item: any) => item.postId === postId);
      if (existingIndex > -1) {
        trendsList[existingIndex] = newTrendItem;
      } else {
        trendsList.push(newTrendItem);
      }

      // Sort descending by score
      trendsList.sort((a, b) => b.score - a.score);

      // Keep top 30
      trendsList = trendsList.slice(0, 30);

      // 2. Update top_all_time list (All time top voted/scored)
      const existingAllTimeIndex = topAllTime.findIndex((item: any) => item.postId === postId);
      if (existingAllTimeIndex > -1) {
        // Only update if totalVotes is greater or equal to preserve highest historic values
        if ((newTrendItem.totalVotes || 0) >= (topAllTime[existingAllTimeIndex].totalVotes || 0)) {
          topAllTime[existingAllTimeIndex] = newTrendItem;
        }
      } else {
        topAllTime.push(newTrendItem);
      }

      // Sort descending by totalVotes first, then by score
      topAllTime.sort((a, b) => {
        const votesDiff = (b.totalVotes || 0) - (a.totalVotes || 0);
        if (votesDiff !== 0) return votesDiff;
        return (b.score || 0) - (a.score || 0);
      });

      // Keep top 10
      topAllTime = topAllTime.slice(0, 10);

      transaction.set(trendsRef, { trends: trendsList, top_all_time: topAllTime }, { merge: true });
    });
  } catch (error) {
    console.warn("Trend score update transaction failed:", error);
  }
}

