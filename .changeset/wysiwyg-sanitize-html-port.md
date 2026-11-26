---
"react-data-form": minor
---

Sécurité (XSS) : le Wysiwyg nettoie aussi la valeur qu'il émet, en plus de la valeur initiale, du HTML collé et de l'affichage en lecture (`WysiwygReader`). Les balises `<script>`, les attributs `on*` et les liens `javascript:` n'arrivent donc plus dans les données du formulaire. Le nettoyage passe par un nouveau port optionnel `sanitizeHtml` de `configurePorts` : une fonction le remplace (DOMPurify, par exemple), `false` le désactive. Conséquence visible : les classes de style que l'éditeur ajoute aux liens et aux images ne figurent plus dans la valeur émise.
