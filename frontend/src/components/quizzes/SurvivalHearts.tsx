const HEART = "M12 20.5s-7.6-4.6-9.9-9.4C.6 7.8 2.6 4 6.4 4c2.2 0 3.9 1.2 5.6 3.1C13.7 5.2 15.4 4 17.6 4c3.8 0 5.8 3.8 4.3 7.1-2.3 4.8-9.9 9.4-9.9 9.4z";

type Props = {
  lives: number;
  maxLives: number;
  // Index of the heart that was just lost, which plays the losing animation.
  losing?: number | null;
};

// Hearts fill from the left: `lives` full, the rest empty. Both numbers come from the server.
export default function SurvivalHearts({ lives, maxLives, losing = null }: Props) {
  const total = Number.isSafeInteger(maxLives) && maxLives > 0 ? maxLives : 0;
  return <div className="survival-hearts" role="img" aria-label={`${lives} of ${total} ${total === 1 ? "life" : "lives"} left`}>
    {Array.from({ length: total }, (_, index) => {
      const state = index < lives ? "full" : index === losing ? "losing" : "empty";
      return <svg key={index} className={`survival-heart survival-heart-${state}`} viewBox="0 0 24 24" width="28" height="28"
        aria-hidden="true" focusable="false"><path d={HEART} /></svg>;
    })}
  </div>;
}
