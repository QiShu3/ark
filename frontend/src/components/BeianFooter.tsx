const MIIT_BEIAN_URL = 'https://beian.miit.gov.cn/';
const ICP_BEIAN_NUMBER = '粤ICP备2026047635号';

export default function BeianFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-2 z-20 px-4 text-center text-[10px] text-[var(--ark-text-muted)] opacity-45 transition-opacity hover:opacity-90">
      <div className="pointer-events-none mx-auto flex w-fit max-w-full items-center justify-center rounded-full border ark-border bg-[var(--ark-overlay)] px-3 py-1.5 backdrop-blur-md">
        <a
          href={MIIT_BEIAN_URL}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto transition hover:text-[var(--ark-text)]"
        >
          {ICP_BEIAN_NUMBER}
        </a>
      </div>
    </footer>
  );
}
