import ERCReviewFocusWork from '../../components/ERC/ERCReviewFocusWork';

export default function ERCReview() {
  return (
    <div className="fixed inset-x-1 bottom-1 top-[7.5rem] z-10 overflow-y-auto rounded-[28px] px-6 pb-10 pt-6" style={{ clipPath: "inset(10px round 28px)" }}>
      <ERCReviewFocusWork />
    </div>
  );
}
