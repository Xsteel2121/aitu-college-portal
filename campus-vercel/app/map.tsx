"use client";

import { useState } from "react";
import { ExternalLink, Map as MapIcon } from "lucide-react";

const MAP_URL = "https://yuujiso.github.io/aitumap/";

export default function MapView() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return <section className="aitu-map-view">
    <div className="page-heading map-heading">
      <div><span className="eyebrow">АУДИТОРИИ И КОРПУСА</span><h1>Карта AITU</h1><p>Поиск аудитории, выбор корпуса и этажа</p></div>
      <a href={MAP_URL} target="_blank" rel="noopener noreferrer" className="map-open-link">Открыть отдельно<ExternalLink size={15}/><span className="sr-only"> — в новой вкладке</span></a>
    </div>
    <div className="aitu-map-frame" aria-busy={!loaded && !failed}>
      {!loaded && !failed && <div className="map-loading" role="status"><MapIcon size={28}/><p>Загружаем карту…</p></div>}
      {failed ? <div className="map-loading" role="alert"><MapIcon size={28}/><p>Карту не удалось загрузить.</p><a href={MAP_URL} target="_blank" rel="noopener noreferrer">Открыть карту отдельно<ExternalLink size={15}/></a></div> : <iframe
        src={MAP_URL}
        title="Интерактивная карта AITU: аудитории, корпуса и этажи"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />}
    </div>
    <p className="map-credit">Карта от <a href={MAP_URL} target="_blank" rel="noopener noreferrer">Yuujiso</a>. Поиск и переключение этажей доступны внутри карты.</p>
  </section>;
}
