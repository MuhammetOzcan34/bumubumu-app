/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { CommentData } from '../types';
import { useAuth } from '../context/AuthContext';
import { Send, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import { updatePostTrendScore } from '../lib/trends';
import { useCreatorProfile } from '../hooks/useCreatorProfile';

const CommentItem: React.FC<{ comment: CommentData }> = ({ comment }) => {
  const { photoURL, displayName } = useCreatorProfile(comment.userId, comment.userPhoto, comment.userName);
  return (
    <div className="bg-[#202024]/40 border border-white/5 rounded-xl p-2.5 relative">
      <div className="flex items-center gap-2 mb-1 min-w-0">
        <img 
          src={photoURL} 
          alt="Profil" 
          className="w-4.5 h-4.5 rounded-full object-cover bg-[#0A0A0C] flex-shrink-0"
        />
        <span className="text-[10px] font-bold text-gray-300 truncate font-display flex-1">{displayName}</span>
      </div>
      <p className="text-[11px] sm:text-xs text-gray-300 leading-relaxed font-sans break-words">{comment.text}</p>
    </div>
  );
};

interface DividedCommentsProps {
  postId: string;
  hasVoted: boolean;
  userVotedOption: "A" | "B" | null;
  isCreator?: boolean;
  postCreatorId?: string;
  postTitle?: string;
  totalVotes?: number;
  tags?: string[];
  location?: string;
  photoURL?: string;
  creatorName?: string;
  optionA?: string;
  optionB?: string;
  optionA_votes?: number;
  optionB_votes?: number;
  optionAUrl?: string;
  optionBUrl?: string;
  layout?: "side-by-side" | "stacked";
}

export const DividedComments: React.FC<DividedCommentsProps> = ({
  postId,
  hasVoted,
  userVotedOption,
  isCreator = false,
  postCreatorId,
  postTitle,
  totalVotes = 0,
  tags = [],
  location = "",
  photoURL = "",
  creatorName = "",
  optionA = "Seçenek A",
  optionB = "Seçenek B",
  optionA_votes = 0,
  optionB_votes = 0,
  optionAUrl = "",
  optionBUrl = "",
  layout = "side-by-side" as "side-by-side" | "stacked"
}) => {
  const { currentUser, profileData } = useAuth();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Yorumları bir kere yükleme (onSnapshot yerine getDocs - Instagram usulü!)
  useEffect(() => {
    if (!currentUser) {
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));

    getDocs(q).then((snapshot) => {
      const fetched: CommentData[] = [];
      snapshot.forEach((doc) => {
        fetched.push({
          commentId: doc.id,
          ...doc.data()
        } as CommentData);
      });
      setComments(fetched);
      setLoading(false);
    }).catch((error) => {
      console.error("Yorum çekme hatası:", error);
      try {
        handleFirestoreError(error, OperationType.GET, `posts/${postId}/comments`);
      } catch (e: any) {
        setErrorMsg("Yorumlar yüklenirken yetkilendirme hatası oluştu veya kota doldu.");
      }
      setLoading(false);
    });
  }, [postId, currentUser]);

  const [ownerSelectedSide, setOwnerSelectedSide] = useState<'A' | 'B'>('A');

  // Yorum Gönderme (Yerel durum güncellemeli)
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !commentText.trim()) return;

    const finalVotedOption = userVotedOption || (isCreator ? ownerSelectedSide : null);
    if (!finalVotedOption) {
      setErrorMsg("Yorum yapmak için önce oy vermelisiniz veya taraf seçmelisiniz!");
      return;
    }

    const enteredCommentText = commentText.trim();
    setCommentText('');

    try {
      setErrorMsg(null);
      const commentsRef = collection(db, 'posts', postId, 'comments');
      const commentDocRef = doc(commentsRef);
      const commentId = commentDocRef.id;
      
      const authorName = profileData?.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || "Üye";
      const authorPhoto = profileData?.photoURL || currentUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`;

      const newComment = {
        commentId,
        postId,
        userId: currentUser.uid,
        userName: authorName,
        userPhoto: authorPhoto,
        votedOption: finalVotedOption, // Kullanıcının bizzat oy verdiği veya seçtiği tarafa yorum eklenir
        text: enteredCommentText,
        createdAt: serverTimestamp()
      };

      // Yerel yorum listesini hemen güncelle (Optimistic update)
      const localNewComment: CommentData = {
        commentId,
        postId,
        userId: currentUser.uid,
        userName: authorName,
        userPhoto: authorPhoto,
        votedOption: finalVotedOption,
        text: enteredCommentText,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any
      };
      setComments(prev => [localNewComment, ...prev]);

      await setDoc(commentDocRef, newComment);

      // Yazma anında puanlama (Score-on-Write) güncellemesi
      updatePostTrendScore(
        postId,
        postTitle || "",
        totalVotes,
        comments.length + 1,
        tags,
        location,
        photoURL,
        creatorName,
        optionA,
        optionB,
        optionA_votes,
        optionB_votes,
        optionAUrl,
        optionBUrl,
        layout
      );

      // Gönderi sahibine bildirim gönder (kendi kendine değilse)
      if (postCreatorId && currentUser.uid !== postCreatorId) {
        try {
          const notifId = `${currentUser.uid}_comment_${commentId}`;
          const notifDocRef = doc(db, 'notifications', notifId);
          await setDoc(notifDocRef, {
            notificationId: notifId,
            recipientId: postCreatorId,
            senderId: currentUser.uid,
            senderName: authorName,
            senderPhoto: authorPhoto,
            type: 'comment',
            postId: postId,
            postTitle: postTitle || '',
            commentText: enteredCommentText,
            read: false,
            createdAt: serverTimestamp()
          });
        } catch (err) {
          console.error("Yorum bildirimi oluşturma hatası:", err);
        }
      }
    } catch (err: any) {
      console.error("Yorum ekleme hatası:", err);
      setErrorMsg("Yorum göndermek için yetkiniz yok.");
    }
  };

  const leftComments = comments.filter(c => c.votedOption === 'A');
  const rightComments = comments.filter(c => c.votedOption === 'B');

  return (
    <div className="w-full mt-4 bg-black/20 border border-white/5 rounded-2xl p-4 font-sans text-gray-100 flex flex-col gap-4">
      
      <div className="flex items-center justify-between pb-2 border-b border-white/5 select-none">
        <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-display">
          <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
          <span>Toplam Yorum: <strong>{comments.length}</strong></span>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 font-display">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* İkiye Bölünmüş Yorum Alanı */}
      <div className="grid grid-cols-2 gap-3 min-h-[160px]">
        {/* SOL Seçenek Yorumları */}
        <div className="flex flex-col gap-2.5 border-r border-white/5 pr-3">
          <div className="flex items-center gap-1 bg-orange-600/10 px-2 py-1 rounded border border-orange-500/20 self-start">
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
            <span className="text-[9px] font-display font-semibold text-orange-400 uppercase tracking-wide">Bu Taraf Yorumları</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[250px] scrollbar-thin">
            {leftComments.length === 0 ? (
              <p className="text-[10px] text-gray-500 font-sans italic my-4">Burada henüz kimse konuşmadı.</p>
            ) : (
              leftComments.map((comment) => (
                <CommentItem key={comment.commentId} comment={comment} />
              ))
            )}
          </div>
        </div>

        {/* SAĞ Seçenek Yorumları */}
        <div className="flex flex-col gap-2.5 pl-1">
          <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded border border-white/10 self-start">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
            <span className="text-[9px] font-display font-semibold text-gray-400 uppercase tracking-wide">Bu Taraf Yorumları</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[250px] scrollbar-thin">
            {rightComments.length === 0 ? (
              <p className="text-[10px] text-gray-500 font-sans italic my-4">Burada henüz kimse konuşmadı.</p>
            ) : (
              rightComments.map((comment) => (
                <CommentItem key={comment.commentId} comment={comment} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Yorum Yazma Formu */}
      {currentUser ? (
        (hasVoted || isCreator) ? (
          <form onSubmit={handleSubmitComment} className="flex flex-col gap-2 mt-2 pt-2 border-t border-white/5">
            {isCreator && !hasVoted && (
              <div className="flex items-center gap-2 pb-1 select-none">
                <span className="text-[10px] font-display text-gray-500 uppercase tracking-widest">Yorum Tarafım:</span>
                <button
                  type="button"
                  onClick={() => setOwnerSelectedSide('A')}
                  className={`px-3 py-1 rounded-xl text-[10px] font-display font-bold border transition ${ownerSelectedSide === 'A' ? 'bg-orange-650 border-orange-500/50 text-white' : 'bg-[#0A0A0C]/50 border-white/5 text-gray-500'}`}
                >
                  ◀ Sol Taraf
                </button>
                <button
                  type="button"
                  onClick={() => setOwnerSelectedSide('B')}
                  className={`px-3 py-1 rounded-xl text-[10px] font-display font-bold border transition ${ownerSelectedSide === 'B' ? 'bg-slate-200 border-white text-black' : 'bg-[#0A0A0C]/50 border-white/5 text-gray-500'}`}
                >
                  Sağ Taraf ▶
                </button>
              </div>
            )}
            <div className="flex gap-2.5">
              <img 
                src={profileData?.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`} 
                alt="Profil" 
                className="w-8 h-8 rounded-full border border-white/10 object-cover bg-neutral-900"
              />
              <div className="flex-1 relative flex items-center">
                <input
                  type="text"
                  placeholder="Bu taraf için yorumunuzu yazın..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={250}
                  className="w-full text-xs bg-[#0A0A0C] border border-white/10 focus:border-orange-500 rounded-xl py-2 pl-3 pr-10 outline-none text-gray-100 transition placeholder-gray-550 font-sans"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim()}
                  className="absolute right-2 p-1 text-gray-400 hover:text-orange-500 transition cursor-pointer disabled:opacity-30"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="bg-[#0A0A0C] rounded-xl p-3 text-center border border-white/5 mt-2">
            <p className="text-xs font-display text-gray-400 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              Bölünmüş kürsüde konuşmak için oylamaya katılmanız gerekir!
            </p>
          </div>
        )
      ) : (
        <div className="bg-[#0A0A0C] rounded-xl p-3 text-center border border-white/5 mt-2">
          <p className="text-xs text-gray-400 font-display">
            Yorumları görmek ve tartışmak için lütfen üye girişi yapın.
          </p>
        </div>
      )}

    </div>
  );
};
