const GOLD = "https://wow.zamimg.com/images/icons/money-gold.gif";
const SILVER = "https://wow.zamimg.com/images/icons/money-silver.gif";
const COPPER = "https://wow.zamimg.com/images/icons/money-copper.gif";
const ICON = { width: 8, height: 8, imageRendering: "pixelated" as const, display: "inline-block" };

function CoinIcon({ src }: { src: string }) {
  return <img alt="" src={src} width={8} height={8} style={ICON} />;
}

export function Coins({ copper }: { copper: number }) {
  const value = Math.trunc(Number(copper) || 0);
  const negative = value < 0;
  const abs = Math.abs(value);
  const gold = Math.floor(abs / 10000);
  const silver = Math.floor((abs % 10000) / 100);
  const copperLeft = abs % 100;
  return (
    <span className="coins">
      {negative ? <span className="coin-sign">−</span> : null}
      {gold ? <span className="coin"><span className="g">{gold}</span><CoinIcon src={GOLD} /></span> : null}
      {silver || gold ? <span className="coin"><span className="s">{silver}</span><CoinIcon src={SILVER} /></span> : null}
      <span className="coin"><span className="c">{copperLeft}</span><CoinIcon src={COPPER} /></span>
    </span>
  );
}
