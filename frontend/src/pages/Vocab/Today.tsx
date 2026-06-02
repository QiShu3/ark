import VocabTodayFocusWork from '../../components/Vocab/VocabTodayFocusWork';

export default function VocabToday() {
  return (
    <div className="fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-8 pb-10 pt-6" style={{ clipPath: "inset(10px round 28px)" }}>
      <VocabTodayFocusWork />
    </div>
  );
}
