# iamdecherre

Agregá `https://github.com/iamdecherre/fuentes` en **Yomiri → Fuentes → Agregar repositorio**. El índice ofrece AnimeYT, Katanime y MonosChinos como complementos HTTPS que se instalan individualmente. JKAnime está en el código del servicio y queda fuera del índice público mientras su sitio devuelve HTTP 403 desde el alojamiento.

## Catálogos separados

- Manga: https://raw.githubusercontent.com/iamdecherre/fuentes/main/manga.json
- Anime: https://raw.githubusercontent.com/iamdecherre/fuentes/main/anime.json
- Argentina TV: https://raw.githubusercontent.com/iamdecherre/fuentes/main/argentina-tv.json
- Fútbol: https://raw.githubusercontent.com/iamdecherre/fuentes/main/futbol.json

Cada URL se agrega manualmente en Fuentes. Anime incluye AnimeAV1, JKAnime, AnimeFLV.or.at, AnimeYT, MonosChinos y Katanime. Los cuatro conectores nuevos requieren la versión de desarrollo de Yomiri del 28 de octubre de 2026 o posterior. Catálogos, fichas, episodios y servidores se comprobaron mediante Bridge; la reproducción de video todavía no está verificada. Las candidatas restantes están en `pending-sources.json`, que no es un catálogo instalable. Series y dibujos animados se mantienen separados de anime.

Fuente de extensiones para Yomiri: manga, anime y contenido en vivo.

## Repositorio optimizado

Agregá esta URL en **Yomiri → Fuentes → Repositorios**:

```text
https://raw.githubusercontent.com/iamdecherre/fuentes/main/catalog.json
```

Incluye conectores para MangaDex, LeerCapítulo, Kazoku Den, AnzManga, DB New Hope, Marmota, EnchiladaScan, Olympus, InManga, NovelCool, MANGA Plus, CompartiComics, AnimeAV1 y NowFutbol.

El catálogo usa conectores de Yomiri y perfiles declarativos. No descarga APKs ni ejecuta código remoto. La disponibilidad de cada señal o catálogo depende de su proveedor.

`index.json` conserva CompartiComics y agrega los manifiestos de los complementos HTTPS.

## Servicio independiente de anime y fútbol

El código en [service](service) sirve los manifiestos, catálogos, fichas y
señales directas de AnimeAV1, AnimeFLV, JKAnime, AnimeYT, Katanime, MonosChinos,
AniZone, LACartoons y RBTV+. AniZone y LACartoons tienen restricciones de
reproducción web pendientes.

Para alojarlo en un servicio Node.js 24 con HTTPS:

1. Configurá el directorio de ejecución en `service` y ejecutá `npm ci`.
2. Configurá `PUBLIC_BASE_URL` con el origen HTTPS asignado por el alojamiento,
   `HOST=0.0.0.0` y el puerto que indique el alojamiento.
3. Iniciá con `npm start`.
4. Agregá la URL HTTPS terminada en `/index.json` desde Fuentes en Yomiri.
   El índice lista los manifiestos y cada fuente se instala por separado.

GitHub conserva el código. El alojamiento ejecuta el servicio y responde a las
consultas de catálogo y reproducción.
