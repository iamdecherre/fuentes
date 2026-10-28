# iamdecherre

## Catálogos separados

- Manga: https://raw.githubusercontent.com/iamdecherre/fuentes/main/manga.json
- Anime: https://raw.githubusercontent.com/iamdecherre/fuentes/main/anime.json
- Argentina TV: https://raw.githubusercontent.com/iamdecherre/fuentes/main/argentina-tv.json
- Fútbol: https://raw.githubusercontent.com/iamdecherre/fuentes/main/futbol.json

Cada URL se agrega manualmente en Fuentes. Anime incluye AnimeAV1 y JKAnime; tener un conector no garantiza reproducción verificada en todos los servidores. Las nuevas candidatas y su estado real están en `pending-sources.json`, que no es un catálogo instalable. AnimeFLV.or.at requiere un adaptador propio: el conector existente corresponde a otro dominio. Series y dibujos animados se mantienen separados de anime.

Fuente de extensiones para Yomiri: manga, anime y contenido en vivo.

## Repositorio optimizado

Agregá esta URL en **Yomiri → Fuentes → Repositorios**:

```text
https://raw.githubusercontent.com/iamdecherre/fuentes/main/catalog.json
```

Incluye conectores para MangaDex, LeerCapítulo, Kazoku Den, AnzManga, DB New Hope, Marmota, EnchiladaScan, Olympus, InManga, NovelCool, MANGA Plus, CompartiComics, AnimeAV1 y NowFutbol.

El catálogo usa conectores de Yomiri y perfiles declarativos. No descarga APKs ni ejecuta código remoto. La disponibilidad de cada señal o catálogo depende de su proveedor.

`index.json` conserva el catálogo anterior para versiones anteriores de Yomiri.
