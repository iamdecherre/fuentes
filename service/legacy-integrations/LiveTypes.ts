export interface LiveOption { name: string; url: string }
export interface LiveEvent { id: string; title: string; competition: string; startsAt?: string; logo?: string; options: LiveOption[];
  provider?: 'rbtvplus'; home?: {name:string;logo?:string}; away?: {name:string;logo?:string};
  status?: 'live'|'upcoming'|'finished'|'postponed'|'cancelled'|'suspended'; score?: {home:number;away:number}; clock?: string; available?: boolean; updatedAt?: number; stale?: boolean; pageUrl?: string;
}
