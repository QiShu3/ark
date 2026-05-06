import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WordMetaPanel from './WordMetaPanel';

describe('WordMetaPanel', () => {
  it('renders sentences before phrases', () => {
    render(
      <WordMetaPanel
        detail={{
          id: 'word-1',
          deck_id: 'deck-1',
          word: 'prosperity',
          us_pronunciation: null,
          uk_pronunciation: null,
          translations: [{ pos: 'n', translation: '繁荣' }],
          phrases: [{ phrase: 'common prosperity', translation: '共同繁荣' }],
          sentences: [{ sentence: 'A time of economic prosperity.', translation: '一个经济繁荣的时期。' }],
        }}
      />,
    );

    const headings = screen.getAllByRole('heading', { level: 3 }).map((element) => element.textContent);

    expect(headings).toEqual(['释义', '例句', '短语']);
  });
});
