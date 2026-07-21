/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserData {
  userId: string;
  email: string;
  role: "user" | "admin";
  points: number;
  age?: number;
  birthYear?: number;
  gender?: string;
  createdAt: any; // Firestore Timestamp
}

export interface ProfileData {
  userId: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  location?: string;
  username?: string;
}

export interface GroupData {
  groupId: string;
  name: string;
  description?: string;
  creatorId: string;
  createdAt: any; // Firestore Timestamp
}

export interface GroupMemberData {
  userId: string;
  role: "owner" | "member";
  joinedAt: any; // Firestore Timestamp
  displayName?: string;
  photoURL?: string;
}

export interface PostData {
  postId: string;
  creatorId: string;
  creatorName: string;
  creatorPhoto?: string;
  title: string;
  optionALabel: string;
  optionBLabel: string;
  optionAUrl: string;
  optionBUrl: string;
  optionALink?: string;
  optionBLink?: string;
  isRepost?: boolean;
  repostedFromUserId?: string;
  repostedFromUserName?: string;
  originalPostId?: string;
  layout: "side-by-side" | "stacked";
  createdAt: any; // Firestore Timestamp
  expiresAt?: any; // Firestore Timestamp
  voteCountA: number;
  voteCountB: number;
  totalVotes: number;
  tags: string[];
  location?: string;
  groupId?: string; // empty means public
  isSponsored?: boolean;
  targetGender?: string;
  targetLocation?: string;
  targetAgeMin?: number;
  targetAgeMax?: number;
  rewardPoints?: number;
  status: "active" | "ended";
  winnerOption?: "A" | "B" | "draw" | "";
  score?: number;
  commentCount?: number;
}

export interface VoteData {
  userId: string;
  votedOption: "A" | "B";
  votedAt: any; // Firestore Timestamp
}

export interface CommentData {
  commentId: string;
  postId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  votedOption: "A" | "B";
  text: string;
  createdAt: any; // Firestore Timestamp
}

export interface ChatRoomData {
  chatId: string;
  participantIds: string[];
  lastMessage: string;
  lastMessageAt: any; // Firestore Timestamp
  lastSenderId: string;
  otherUser?: ProfileData; // Client-side hydration
}

export interface MessageData {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: any; // Firestore Timestamp
  postId?: string; // Interaktif oylama kartı referansı (varsa)
}

export interface TagData {
  tag: string;
  count: number;
  updatedAt: any; // Firestore Timestamp
}

export interface StoryData {
  storyId: string;
  postId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  optionAUrl: string;
  optionBUrl: string;
  optionALabel: string;
  optionBLabel: string;
  title: string;
  winnerOption: "A" | "B" | "draw" | "";
  createdAt: any; // Firestore Timestamp;
}
