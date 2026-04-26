const MIIT_BEIAN_URL = 'https://beian.miit.gov.cn/';
const ICP_BEIAN_NUMBER = '粤ICP备2026047635号';

export default function BeianFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-4 z-20 px-4 text-center text-xs text-white/65">
      <div className="pointer-events-none mx-auto flex w-fit max-w-full items-center justify-center rounded-full border border-white/12 bg-black/30 px-4 py-2 backdrop-blur-md">
        <a
          href={MIIT_BEIAN_URL}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto transition hover:text-white"
        >
          {ICP_BEIAN_NUMBER}
        </a>
      </div>
    </footer>
  );
}
