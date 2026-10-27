export interface Member {
  id: number;
  username: string;
  url?: string;
  avatar_normal?: string;
}

export interface NodeInfo {
  id: number;
  name: string;
  title: string;
  title_alternative?: string;
  url?: string;
  topics?: number;
  stars?: number;
  header?: string;
  aliases?: string[];
}

export interface Topic {
  id: number;
  title: string;
  url: string;
  content: string;
  content_rendered: string;
  replies: number;
  created: number;
  last_modified?: number;
  last_touched?: number;
  last_reply_by?: string;
  member?: Member;
  node?: NodeInfo;
}

export interface Reply {
  id: number;
  content: string;
  content_rendered: string;
  created: number;
  member?: Member;
}

export interface Notification {
  id: number;
  member_id: number;
  for_member_id: number;
  text: string;
  payload?: string;
  payload_rendered?: string;
  created: number;
  member?: Member;
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages?: number;
}
