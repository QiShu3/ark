import type { ReactNode } from 'react';
import type { SubAppHomeMetric } from '../components/SubAppHomeTemplate';

export interface ContentBankState {
  type: 'article_set' | 'word_deck';
  selected: string | null;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
}

export interface FocusWorkAdapter {
  contentBank: ContentBankState;
  metrics: SubAppHomeMetric[];
  assetContent: ReactNode | null;
}
