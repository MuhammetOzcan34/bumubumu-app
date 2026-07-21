import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { updatePostTrendScore } from './trends';

// Cache to prevent duplicate client aggregation calls within a short window
const recentlyAggregated = new Set<string>();

/**
 * Aggregates all sharded counter documents for a post,
 * saves the final values into the parent post document,
 * and deletes the processed shard documents to keep DB clean and reduce read costs.
 */
export async function aggregateAndCleanupShards(postId: string) {
  if (recentlyAggregated.has(postId)) return;
  recentlyAggregated.add(postId);
  
  // Remove from cache after 5 minutes to allow future updates if necessary
  setTimeout(() => recentlyAggregated.delete(postId), 5 * 60 * 1000);

  try {
    const shardsRef = collection(db, 'posts', postId, 'shards');
    const shardsSnap = await getDocs(shardsRef);

    if (shardsSnap.empty) {
      return; // No shards to aggregate
    }

    let shardA = 0;
    let shardB = 0;
    let shardTotal = 0;
    const shardDocRefs: any[] = [];

    shardsSnap.forEach((d) => {
      const data = d.data();
      shardA += data.voteCountA || 0;
      shardB += data.voteCountB || 0;
      shardTotal += data.totalVotes || 0;
      shardDocRefs.push(d.ref);
    });

    const postRef = doc(db, 'posts', postId);
    const batch = writeBatch(db);

    // Update parent post with absolute sums of shards.
    // To ensure consistency, we overwrite with the summed shards.
    batch.update(postRef, {
      voteCountA: shardA,
      voteCountB: shardB,
      totalVotes: shardTotal
    });

    // Clean up and delete each sharded document
    shardDocRefs.forEach((ref) => {
      batch.delete(ref);
    });

    await batch.commit();
    console.log(`[Aggregation] Successfully aggregated and cleaned up ${shardDocRefs.length} shards for post: ${postId}`);

    // Update global trends with the new aggregated scores
    // Fetch latest post data to get exact info for trends (optional, fallback to values)
    // We can also trigger the trend updater with the new totalVotes
  } catch (error) {
    console.warn(`[Aggregation Error] Shard aggregation failed for post ${postId}:`, error);
  }
}
