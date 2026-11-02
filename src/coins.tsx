const GOLD = "https://wow.zamimg.com/images/icons/money-gold.gif";
const SILVER = "https://wow.zamimg.com/images/icons/money-silver.gif";
const COPPER = "https://wow.zamimg.com/images/icons/money-copper.gif";

const FONT = 16;
const ICON = 11;

function Denom({
  amount,
  tone,
  src,
}: {
  amount: number;
  tone: "g" | "s" | "c";
  src: string;
}) {
  return (
    <span
      className={`aa-coin aa-coin-${tone}`}
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        paddingRight: ICON + 3,
        paddingBottom: 1,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 1px",
        backgroundSize: `${ICON}px ${ICON}px`,
        lineHeight: 1,
      }}
    >
      {amount}
    </span>
  );
}

export function Coins({ copper }: { copper: number }) {
  const value = Math.trunc(Number(copper) || 0);
  const negative = value < 0;
  const abs = Math.abs(value);
  const gold = Math.floor(abs / 10000);
  const silver = Math.floor((abs % 10000) / 100);
  const copperLeft = abs % 100;
  return (
    <span
      className="aa-coins"
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        gap: 5,
        whiteSpace: "nowrap",
        fontSize: FONT,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.15,
      }}
    >
      {negative ? <span className="aa-coin-sign">−</span> : null}
      {gold ? <Denom amount={gold} tone="g" src={GOLD} /> : null}
      {silver || gold ? <Denom amount={silver} tone="s" src={SILVER} /> : null}
      <Denom amount={copperLeft} tone="c" src={COPPER} />
    </span>
  );
}
