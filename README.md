# Fuentes para Yomiri

- [Estable](https://raw.githubusercontent.com/iamdecherre/fuentes/prueba-manga-yomiri/index.json) contiene únicamente fuentes comprobadas en la versión actual. Por ahora está vacío.
- [Pruebas](https://raw.githubusercontent.com/iamdecherre/fuentes/prueba-manga-yomiri/testing.json) contiene las candidatas y RBTV+. Que aparezcan en el catálogo no garantiza la reproducción o lectura.

Pegá la URL elegida en **Fuentes → Repositorios** e instalá manualmente el complemento que quieras probar.

Para agregar un complemento, poné su URL HTTPS de manifiesto en `addons` de `testing.json`. Los perfiles declarativos de manga van en `sources`. Mové la entrada al índice estable solo después de comprobar el catálogo y la reproducción o lectura desde Yomiri.

Prioridad de pruebas: fútbol primero y anime después. Quedan por migrar AnimeAV1, AnimeFLV.or.at y JKAnime a manifiestos externos antes de incorporarlos.
