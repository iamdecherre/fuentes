# iamdecherre

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

`index.json` conserva el catálogo anterior para versiones anteriores de Yomiri.
