---
type: Fixed
---
**«No se pudo comprobar» desde una versión RC (app de escritorio):** en «Últimas» el actualizador buscaba `rc.yml`, que las releases no publican (solo `latest*.yml`), y daba 404. Ahora usa siempre `latest*.yml` de la etiqueta elegida y desde una RC sin versión más nueva sale «Estás al día».
