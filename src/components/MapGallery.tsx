import Board from './Board';
import { GAME_MAPS } from '../../shared/map';

/** Every field laid out side by side with its roads, so the maps can be compared at a glance. */
export default function MapGallery() {
  return <div className="map-gallery">
    {GAME_MAPS.map((map, index) => <div key={map.id} className="map-card" data-map-id={map.id}>
      <div className="map-card-thumb"><Board preview previewMapId={map.id} /></div>
      <div className="map-card-text"><strong><span className={`map-guide-number theme-${map.theme}`}>{String(index + 1).padStart(2, '0')}</span>{map.name}<b>승리 조건 · 훈장 {map.medalTarget}개</b></strong><small>{map.description}</small><em>{map.specialDescription}</em></div>
    </div>)}
  </div>;
}
