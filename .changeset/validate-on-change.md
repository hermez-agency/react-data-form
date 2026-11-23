---
"react-data-form": minor
---

Validation pendant la frappe : l'option `validateOnChange` d'un formulaire (ou d'un champ) vaut `true` (pause de 1 s) ou un nombre de millisecondes ; `false` sur un champ l'exclut. Après la pause, seul le champ modifié est validé, avec les champs qui le nomment dans `dependsOn` (nouveau) et qui ont déjà été modifiés ou montrent une erreur. Un champ jamais modifié n'affiche pas d'erreur, et une erreur disparaît dès que le champ redevient valide, sans attendre la pause. Un `validator` peut renvoyer une promesse (« ce nom est-il libre ? ») : elle est attendue, et une réponse arrivée après une frappe plus récente est ignorée. La validation complète à l'envoi ne change pas (elle n'attend pas les validateurs asynchrones). Les violations renvoyées par le serveur à l'envoi restent sous leur champ et s'effacent maintenant dès que ce champ est modifié.
