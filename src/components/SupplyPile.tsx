import './SupplyPile.css';

interface Props {
  count: number;
  color: 'blue' | 'red';
  owner: string;
  compact?: boolean;
}

/** A public facedown stack: the count is visible, but every troop identity stays hidden. */
export default function SupplyPile({ count, color, owner, compact = false }: Props) {
  return <span
    className={`supply-pile supply-pile--${color} ${compact ? 'supply-pile--compact' : ''} ${count === 0 ? 'is-empty' : ''}`}
    aria-label={`${owner} 병정 더미 ${count}장 남음`}
    title={`${owner} 병정 더미 · ${count}장 남음`}
  >
    <span className="supply-pile-cards" aria-hidden="true"><i /><i /><i /></span>
    <span className="supply-pile-copy"><small>병정 더미</small><strong>{count}</strong></span>
  </span>;
}
